// Пинг до сервера игры. Берём соединения процесса игры из таблицы TCP Windows (как «Монитор ресурсов»),
// находим адрес игрового сервера и замеряем задержку: ICMP-эхо, а если сервер его не отвечает —
// время установки TCP-соединения с тем же адресом. В саму игру ничего не посылается.
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"sort"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modIphlp                = windows.NewLazySystemDLL("iphlpapi.dll")
	pGetExtendedTcpTable    = modIphlp.NewProc("GetExtendedTcpTable")
	pIcmpCreateFile         = modIphlp.NewProc("IcmpCreateFile")
	pIcmpSendEcho           = modIphlp.NewProc("IcmpSendEcho")
	pIcmpCloseHandle        = modIphlp.NewProc("IcmpCloseHandle")
	pGetWindowThreadProcess = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowThreadProcessId")
	pFindWindowGame         = windows.NewLazySystemDLL("user32.dll").NewProc("FindWindowW")
)

type pingWorker struct {
	mu      sync.Mutex
	pin     string // закреплённое соединение «ip:порт» (выбрал игрок)
	on      bool
	running bool
	ov      *overlay
}

var pinger = &pingWorker{}

func (p *pingWorker) isOn() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.on
}

func (p *pingWorker) enable(o *overlay, on bool) {
	p.mu.Lock()
	p.on, p.ov = on, o
	start := on && !p.running
	if start {
		p.running = true
	}
	p.mu.Unlock()
	if start {
		go p.loop()
	}
}

type tcpConn struct {
	ip   net.IP
	port int
}

// соединения TCP (IPv4) процесса pid в состоянии «установлено»
func tcpConnsOf(pid uint32) []tcpConn {
	var size uint32
	pGetExtendedTcpTable.Call(0, uintptr(unsafe.Pointer(&size)), 0, 2, 5, 0) // AF_INET, TCP_TABLE_OWNER_PID_ALL
	if size == 0 {
		return nil
	}
	buf := make([]byte, size+1024)
	size = uint32(len(buf))
	r, _, _ := pGetExtendedTcpTable.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)), 0, 2, 5, 0)
	if r != 0 {
		return nil
	}
	n := binary.LittleEndian.Uint32(buf[0:4])
	var out []tcpConn
	for i := uint32(0); i < n; i++ {
		o := 4 + i*24
		if int(o+24) > len(buf) {
			break
		}
		state := binary.LittleEndian.Uint32(buf[o:])
		rip := net.IPv4(buf[o+12], buf[o+13], buf[o+14], buf[o+15])
		rport := int(buf[o+16])<<8 | int(buf[o+17])
		owner := binary.LittleEndian.Uint32(buf[o+20:])
		if owner != pid || state != 5 || rip.IsLoopback() || rip.IsUnspecified() {
			continue
		}
		out = append(out, tcpConn{rip, rport})
	}
	return out
}

// игровой сервер: не веб-порты (80/443), иначе любой
func pickServer(cs []tcpConn) (tcpConn, bool) {
	if len(cs) == 0 {
		return tcpConn{}, false
	}
	sort.SliceStable(cs, func(i, j int) bool {
		wi := cs[i].port == 443 || cs[i].port == 80
		wj := cs[j].port == 443 || cs[j].port == 80
		return !wi && wj
	})
	return cs[0], true
}

func icmpPing(ip net.IP, timeout time.Duration) (time.Duration, bool) {
	h, _, _ := pIcmpCreateFile.Call()
	if h == 0 || h == ^uintptr(0) {
		return 0, false
	}
	defer pIcmpCloseHandle.Call(h)
	v4 := ip.To4()
	addr := uint32(v4[0]) | uint32(v4[1])<<8 | uint32(v4[2])<<16 | uint32(v4[3])<<24
	data := []byte("AION2Helper")
	reply := make([]byte, 28+len(data)+64)
	n, _, _ := pIcmpSendEcho.Call(h, uintptr(addr), uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)), 0,
		uintptr(unsafe.Pointer(&reply[0])), uintptr(len(reply)), uintptr(timeout.Milliseconds()))
	if n == 0 {
		return 0, false
	}
	if binary.LittleEndian.Uint32(reply[4:8]) != 0 { // IP_SUCCESS
		return 0, false
	}
	rtt := binary.LittleEndian.Uint32(reply[8:12])
	return time.Duration(rtt) * time.Millisecond, true
}

func tcpPing(c tcpConn, timeout time.Duration) (time.Duration, bool) {
	t0 := time.Now()
	conn, err := net.DialTimeout("tcp4", fmt.Sprintf("%s:%d", c.ip, c.port), timeout)
	if err != nil {
		return 0, false
	}
	d := time.Since(t0)
	conn.Close()
	return d, true
}

func (p *pingWorker) gamePID() uint32 {
	var hw uintptr
	if p.ov != nil {
		p.ov.mu.Lock()
		hw = p.ov.target
		p.ov.mu.Unlock()
	}
	if hw == 0 {
		cls, _ := windows.UTF16PtrFromString("UnrealWindow")
		hw, _, _ = pFindWindowGame.Call(uintptr(unsafe.Pointer(cls)), 0)
	}
	if hw == 0 {
		return 0
	}
	var pid uint32
	pGetWindowThreadProcess.Call(hw, uintptr(unsafe.Pointer(&pid)))
	return pid
}

func (p *pingWorker) setPin(addr string) {
	p.mu.Lock()
	p.pin = addr
	p.mu.Unlock()
}

// замер одного соединения: ICMP, если сервер отвечает, иначе время установки TCP-соединения
func measure(c tcpConn, icmpOK map[string]bool) (float64, string, bool) {
	key := c.ip.String()
	if ok, seen := icmpOK[key]; !seen || ok {
		if d, got := icmpPing(c.ip, 800*time.Millisecond); got {
			icmpOK[key] = true
			return float64(d.Microseconds()) / 1000, "icmp", true
		}
		icmpOK[key] = false
	}
	if d, got := tcpPing(c, 1500*time.Millisecond); got {
		return float64(d.Microseconds()) / 1000, "tcp", true
	}
	return 0, "", false
}

func (p *pingWorker) loop() {
	defer func() {
		p.mu.Lock()
		p.running = false
		p.mu.Unlock()
	}()
	icmpOK := map[string]bool{}
	hist := map[string][]float64{}
	n := 0
	for {
		p.mu.Lock()
		on, o, pin := p.on, p.ov, p.pin
		p.mu.Unlock()
		if !on || o == nil {
			return
		}
		res := map[string]interface{}{}
		wait := 2 * time.Second
		pid := p.gamePID()
		if pid == 0 {
			res["state"] = "nogame"
			hist = map[string][]float64{}
			wait = 5 * time.Second
		} else {
			conns := tcpConnsOf(pid)
			// без повторов; сначала не веб-порты, среди них — с большим номером порта
			seen := map[string]bool{}
			var uniq []tcpConn
			for _, c := range conns {
				k := fmt.Sprintf("%s:%d", c.ip, c.port)
				if !seen[k] {
					seen[k] = true
					uniq = append(uniq, c)
				}
			}
			sort.SliceStable(uniq, func(i, j int) bool {
				wi := uniq[i].port == 443 || uniq[i].port == 80
				wj := uniq[j].port == 443 || uniq[j].port == 80
				if wi != wj {
					return !wi
				}
				return uniq[i].port > uniq[j].port
			})
			if len(uniq) > 6 {
				uniq = uniq[:6]
			}
			if len(uniq) == 0 {
				res["state"] = "noconn"
			} else {
				list := []map[string]interface{}{}
				chosen := -1
				for i, c := range uniq {
					k := fmt.Sprintf("%s:%d", c.ip, c.port)
					if pin != "" && k == pin {
						chosen = i
					}
				}
				if chosen < 0 {
					chosen = 0
				}
				for i, c := range uniq {
					k := fmt.Sprintf("%s:%d", c.ip, c.port)
					// выбранное соединение меряем каждый раз, остальные — раз в 4 цикла
					if i != chosen && n%4 != 0 {
						if h := hist[k]; len(h) > 0 {
							list = append(list, map[string]interface{}{"addr": k, "ms": h[len(h)-1]})
						} else {
							list = append(list, map[string]interface{}{"addr": k})
						}
						continue
					}
					ms, method, ok := measure(c, icmpOK)
					item := map[string]interface{}{"addr": k}
					if ok {
						h := append(hist[k], ms)
						if len(h) > 10 {
							h = h[len(h)-10:]
						}
						hist[k] = h
						item["ms"], item["method"] = ms, method
					}
					list = append(list, item)
					if i == chosen {
						res["ip"], res["port"] = c.ip.String(), c.port
						if ok {
							var sum float64
							for _, v := range hist[k] {
								sum += v
							}
							res["state"], res["ms"], res["avg"], res["method"] = "ok", ms, sum/float64(len(hist[k])), method
							if method == "tcp" {
								wait = 4 * time.Second
							}
						} else {
							res["state"] = "timeout"
						}
					}
				}
				res["conns"], res["pinned"] = list, pin != "" && uniq[chosen].port != 0 && fmt.Sprintf("%s:%d", uniq[chosen].ip, uniq[chosen].port) == pin
			}
		}
		n++
		b, _ := json.Marshal(res)
		a := o.a
		a.w.Dispatch(func() { a.w.Eval("window.A2Ping && A2Ping.update(" + string(b) + ")") })
		time.Sleep(wait)
	}
}
