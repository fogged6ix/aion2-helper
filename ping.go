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

func (p *pingWorker) loop() {
	defer func() {
		p.mu.Lock()
		p.running = false
		p.mu.Unlock()
	}()
	icmpOK := true // сервер отвечает на ICMP; если нет — переходим на TCP и замеряем реже
	var last tcpConn
	var hist []float64
	for {
		p.mu.Lock()
		on, o := p.on, p.ov
		p.mu.Unlock()
		if !on || o == nil {
			return
		}
		res := map[string]interface{}{}
		pid := p.gamePID()
		wait := 2 * time.Second
		if pid == 0 {
			res["state"] = "nogame"
			hist = nil
			wait = 5 * time.Second
		} else if c, ok := pickServer(tcpConnsOf(pid)); !ok {
			res["state"] = "noconn"
			hist = nil
		} else {
			if !c.ip.Equal(last.ip) || c.port != last.port {
				last, hist, icmpOK = c, nil, true
			}
			var d time.Duration
			var got bool
			method := "icmp"
			if icmpOK {
				d, got = icmpPing(c.ip, time.Second)
				if !got {
					icmpOK = false
				}
			}
			if !got {
				method = "tcp"
				d, got = tcpPing(c, 1500*time.Millisecond)
				wait = 5 * time.Second
			}
			res["ip"], res["port"], res["method"] = c.ip.String(), c.port, method
			if got {
				ms := float64(d.Microseconds()) / 1000
				hist = append(hist, ms)
				if len(hist) > 10 {
					hist = hist[len(hist)-10:]
				}
				var sum float64
				for _, v := range hist {
					sum += v
				}
				res["state"], res["ms"], res["avg"] = "ok", ms, sum/float64(len(hist))
			} else {
				res["state"] = "timeout"
			}
		}
		b, _ := json.Marshal(res)
		a := o.a
		a.w.Dispatch(func() { a.w.Eval("window.A2Ping && A2Ping.update(" + string(b) + ")") })
		time.Sleep(wait)
	}
}
