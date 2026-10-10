// Поверх игры: горячие клавиши, сквозные клики, значок в трее, уведомления Windows,
// автозапуск, резервные копии и сетевые запросы к metabot.gg для импорта персонажа.
package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	pCallWindowProcW  = user32.NewProc("CallWindowProcW")
	pRegisterHotKey   = user32.NewProc("RegisterHotKey")
	pUnregisterHotKey = user32.NewProc("UnregisterHotKey")
	pIsWindowVisible  = user32.NewProc("IsWindowVisible")
	pCreatePopupMenu  = user32.NewProc("CreatePopupMenu")
	pAppendMenuW      = user32.NewProc("AppendMenuW")
	pTrackPopupMenu   = user32.NewProc("TrackPopupMenu")
	pDestroyMenu      = user32.NewProc("DestroyMenu")
	pGetCursorPos     = user32.NewProc("GetCursorPos")
	pLoadImageW       = user32.NewProc("LoadImageW")
	shell32           = windows.NewLazySystemDLL("shell32.dll")
	pShellNotifyIconW = shell32.NewProc("Shell_NotifyIconW")
	pShellExecuteW    = shell32.NewProc("ShellExecuteW")
	kernel32          = windows.NewLazySystemDLL("kernel32.dll")
	pGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
)

const (
	wmHotkey     = 0x0312
	wmTray       = 0x8000 + 10 // WM_APP+10
	wmLButtonUp  = 0x0202
	wmRButtonUp  = 0x0205
	wmLButtonDbl = 0x0203
	wmDestroyMsg = 0x0002
	wsExTransp   = 0x00000020
	swHide       = 0
	swShowNoAct  = 4
	swShow       = 5
	modAlt       = 0x1
	modCtrl      = 0x2
	modShift     = 0x4
	modWin       = 0x8
	modNoRepeat  = 0x4000
	nimAdd       = 0
	nimModify    = 1
	nimDelete    = 2
	nifMessage   = 0x1
	nifIcon      = 0x2
	nifTip       = 0x4
	nifInfo      = 0x10
	niifUser     = 0x4
	mfString     = 0x0
	mfChecked    = 0x8
	mfSeparator  = 0x800
	tpmReturnCmd = 0x100
	tpmRightBtn  = 0x2
	hotkeyToggle = 1
	hotkeyClick  = 2
)

type notifyIconData struct {
	CbSize           uint32
	HWnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	HIcon            uintptr
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	UVersion         uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
	GuidItem         windows.GUID
	HBalloonIcon     uintptr
}

type point struct{ X, Y int32 }

var (
	theApp   *win
	origProc uintptr
	trayData notifyIconData
	trayOn   bool
)

func utf16Copy(dst []uint16, s string) {
	u, _ := windows.UTF16FromString(s)
	if len(u) > len(dst) {
		u = u[:len(dst)]
		u[len(u)-1] = 0
	}
	copy(dst, u)
}

// ---------- подмена оконной процедуры: горячие клавиши и трей ----------
func installSubclass(a *win) {
	theApp = a
	cb := windows.NewCallback(func(hwnd, msg, wp, lp uintptr) uintptr {
		switch msg {
		case wmHotkey:
			if wp == hotkeyToggle {
				a.toggleVisible()
			} else if wp == hotkeyClick {
				a.setClickThrough(!a.clickThrough)
				a.w.Eval("window.A2App && A2App.hostEvent('click', " + boolJS(a.clickThrough) + ")")
			} else if wp == hotkeyOverlay && theOverlay != nil {
				theOverlay.toggle()
			} else if wp == hotkeyTaken && theOverlay != nil {
				theOverlay.markTaken()
			} else if wp == hotkeyAdjust && theOverlay != nil {
				if theOverlay.adjust {
					theOverlay.endAdjust(true)
				} else {
					theOverlay.startAdjust()
					a.w.Eval("window.A2Overlay && A2Overlay.hostState(true,true)")
				}
			}
			return 0
		case wmTray:
			switch lp & 0xffff {
			case wmLButtonUp, wmLButtonDbl:
				a.showWindow()
			case wmRButtonUp:
				a.trayMenu()
			}
			return 0
		case wmDestroyMsg:
			removeTray()
		}
		r, _, _ := pCallWindowProcW.Call(origProc, hwnd, msg, wp, lp)
		return r
	})
	origProc, _, _ = pSetWindowLongPtrW.Call(a.hwnd, ^uintptr(3), cb) // GWLP_WNDPROC = -4
}

func boolJS(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func (a *win) toggleVisible() {
	vis, _, _ := pIsWindowVisible.Call(a.hwnd)
	ic, _, _ := pIsIconic.Call(a.hwnd)
	if vis != 0 && ic == 0 {
		pShowWindow.Call(a.hwnd, swHide)
	} else {
		a.showWindow()
	}
}

func (a *win) showWindow() {
	ic, _, _ := pIsIconic.Call(a.hwnd)
	if ic != 0 {
		pShowWindow.Call(a.hwnd, swRestore)
	} else {
		pShowWindow.Call(a.hwnd, swShowNoAct)
	}
	pSetWindowPos.Call(a.hwnd, a.zorder(), 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

// Сквозные клики: окно видно, но мышь проходит в игру
func (a *win) setClickThrough(on bool) {
	a.clickThrough = on
	ex, _, _ := pGetWindowLongPtrW.Call(a.hwnd, gwlExStyle)
	if on {
		ex |= wsExTransp | wsExLayered
		a.layered = true
	} else {
		ex &^= wsExTransp
	}
	pSetWindowLongPtrW.Call(a.hwnd, gwlExStyle, ex)
	if on {
		v := a.alpha
		if v > 0.8 {
			v = 0.8
		}
		pSetLayeredWindowAttribute.Call(a.hwnd, 0, uintptr(v*255), lwaAlpha)
		a.alpha = v
	} else {
		a.setAlpha(1)
	}
	pSetWindowPos.Call(a.hwnd, a.zorder(), 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate|swpFrameChanged)
}

// ---------- горячие клавиши ----------
var vkNames = map[string]uintptr{"SPACE": 0x20, "TAB": 0x09, "HOME": 0x24, "END": 0x23, "INSERT": 0x2D, "PAGEUP": 0x21, "PAGEDOWN": 0x22, "`": 0xC0, "~": 0xC0}

func parseHotkey(s string) (uintptr, uintptr, bool) {
	var mods, vk uintptr
	for _, part := range strings.Split(strings.ToUpper(strings.ReplaceAll(s, " ", "")), "+") {
		switch part {
		case "CTRL", "CONTROL":
			mods |= modCtrl
		case "SHIFT":
			mods |= modShift
		case "ALT":
			mods |= modAlt
		case "WIN":
			mods |= modWin
		case "":
		default:
			if v, ok := vkNames[part]; ok {
				vk = v
			} else if len(part) == 1 && ((part[0] >= 'A' && part[0] <= 'Z') || (part[0] >= '0' && part[0] <= '9')) {
				vk = uintptr(part[0])
			} else if len(part) >= 2 && part[0] == 'F' {
				n := 0
				for _, c := range part[1:] {
					if c < '0' || c > '9' {
						return 0, 0, false
					}
					n = n*10 + int(c-'0')
				}
				if n < 1 || n > 24 {
					return 0, 0, false
				}
				vk = uintptr(0x6F + n)
			} else {
				return 0, 0, false
			}
		}
	}
	return mods, vk, vk != 0
}

func (a *win) setHotkey(id uintptr, s string) bool {
	pUnregisterHotKey.Call(a.hwnd, id)
	if strings.TrimSpace(s) == "" {
		return true
	}
	mods, vk, ok := parseHotkey(s)
	if !ok {
		return false
	}
	r, _, _ := pRegisterHotKey.Call(a.hwnd, id, mods|modNoRepeat, vk)
	return r != 0
}

// ---------- трей ----------
func addTray(a *win) {
	if trayOn {
		return
	}
	hinst, _, _ := pGetModuleHandleW.Call(0)
	icon, _, _ := pLoadImageW.Call(hinst, 2, 1, 16, 16, 0)
	trayData = notifyIconData{UID: 1, HWnd: a.hwnd, UFlags: nifMessage | nifIcon | nifTip, UCallbackMessage: wmTray, HIcon: icon}
	trayData.CbSize = uint32(unsafe.Sizeof(trayData))
	utf16Copy(trayData.SzTip[:], appTitle)
	r, _, _ := pShellNotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&trayData)))
	trayOn = r != 0
}

func removeTray() {
	if trayOn {
		pShellNotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(&trayData)))
		trayOn = false
	}
}

// Уведомление Windows (всплывает справа внизу, попадает в центр уведомлений)
func (a *win) notify(title, text string) bool {
	if !trayOn {
		addTray(a)
	}
	if !trayOn {
		return false
	}
	d := trayData
	d.UFlags = nifInfo
	d.DwInfoFlags = niifUser
	utf16Copy(d.SzInfoTitle[:], title)
	utf16Copy(d.SzInfo[:], text)
	r, _, _ := pShellNotifyIconW.Call(nimModify, uintptr(unsafe.Pointer(&d)))
	return r != 0
}

func (a *win) trayMenu() {
	m, _, _ := pCreatePopupMenu.Call()
	add := func(id uintptr, text string, checked bool) {
		t, _ := windows.UTF16PtrFromString(text)
		f := uintptr(mfString)
		if checked {
			f |= mfChecked
		}
		pAppendMenuW.Call(m, f, id, uintptr(unsafe.Pointer(t)))
	}
	add(1, "Показать", false)
	add(2, "Виджет в углу", false)
	add(3, "Полное окно", false)
	pAppendMenuW.Call(m, mfSeparator, 0, 0)
	add(4, "Сквозные клики", a.clickThrough)
	add(5, "Поверх всех окон", a.topmost)
	pAppendMenuW.Call(m, mfSeparator, 0, 0)
	add(9, "Выход", false)
	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	pSetForegroundWindow.Call(a.hwnd)
	cmd, _, _ := pTrackPopupMenu.Call(m, tpmReturnCmd|tpmRightBtn, uintptr(p.X), uintptr(p.Y), 0, a.hwnd, 0)
	pDestroyMenu.Call(m)
	switch cmd {
	case 1:
		a.showWindow()
	case 2:
		a.showWindow()
		a.w.Eval("window.A2App && A2App.hostEvent('compact')")
	case 3:
		a.showWindow()
		a.w.Eval("window.A2App && A2App.hostEvent('full')")
	case 4:
		a.setClickThrough(!a.clickThrough)
		a.w.Eval("window.A2App && A2App.hostEvent('click', " + boolJS(a.clickThrough) + ")")
	case 5:
		a.topmost = !a.topmost
		pSetWindowPos.Call(a.hwnd, a.zorder(), 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		a.w.Eval("window.A2App && A2App.hostEvent('top', " + boolJS(a.topmost) + ")")
	case 9:
		a.w.Eval("window.A2App && A2App.hostEvent('quit')")
		go func() { time.Sleep(400 * time.Millisecond); pPostMessageW.Call(a.hwnd, wmClose, 0, 0) }()
	}
}

// ---------- автозапуск ----------
const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`

func setAutostart(on bool) bool {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, runKey, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	if !on {
		k.DeleteValue("AION2Helper")
		return true
	}
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	return k.SetStringValue("AION2Helper", `"`+exe+`" --tray`) == nil
}

func autostartOn() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue("AION2Helper")
	return err == nil
}

// ---------- резервные копии ----------
func backupState(dir string, s *storage) {
	full := s.load()
	if len(full) < 10 {
		return
	}
	bd := filepath.Join(dir, "backups")
	os.MkdirAll(bd, 0o755)
	name := filepath.Join(bd, "state-"+time.Now().Format("2006-01-02")+".json")
	if _, err := os.Stat(name); err != nil {
		os.WriteFile(name, []byte(full), 0o644)
	}
	files, _ := filepath.Glob(filepath.Join(bd, "state-*.json"))
	sort.Strings(files)
	for len(files) > 14 {
		os.Remove(files[0])
		files = files[1:]
	}
}

// открыть Проводник с выделенным файлом
func revealFile(p string) {
	verb, _ := windows.UTF16PtrFromString("open")
	exe, _ := windows.UTF16PtrFromString("explorer.exe")
	args, _ := windows.UTF16PtrFromString(`/select,"` + p + `"`)
	pShellExecuteW.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(exe)), uintptr(unsafe.Pointer(args)), 0, swShow)
}

func listBackups(dir string) []string {
	files, _ := filepath.Glob(filepath.Join(dir, "backups", "state-*.json"))
	sort.Sort(sort.Reverse(sort.StringSlice(files)))
	out := []string{}
	for _, f := range files {
		out = append(out, filepath.Base(f))
	}
	return out
}

func readBackup(dir, name string) string {
	if strings.ContainsAny(name, `/\`) || !strings.HasPrefix(name, "state-") {
		return ""
	}
	b, err := os.ReadFile(filepath.Join(dir, "backups", name))
	if err != nil {
		return ""
	}
	return string(b)
}

func openFolder(p string) {
	verb, _ := windows.UTF16PtrFromString("open")
	path, _ := windows.UTF16PtrFromString(p)
	pShellExecuteW.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(path)), 0, 0, swShow)
}

// ---------- сеть: только metabot.gg ----------
var httpClient = &http.Client{Timeout: 25 * time.Second}

type httpResult struct {
	Status int    `json:"status"`
	Body   string `json:"body"`
	Error  string `json:"error,omitempty"`
}

func doHTTP(raw, opts string) string {
	res := httpResult{}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || (u.Host != "metabot.gg" && u.Host != "www.metabot.gg") {
		res.Error = "адрес не разрешён"
		b, _ := json.Marshal(res)
		return string(b)
	}
	var o struct {
		Method  string            `json:"method"`
		Headers map[string]string `json:"headers"`
		Body    string            `json:"body"`
	}
	json.Unmarshal([]byte(safeOpts(opts)), &o)
	method := "GET"
	var body io.Reader
	if o.Method == "POST" {
		method, body = "POST", strings.NewReader(o.Body)
	}
	req, _ := http.NewRequest(method, raw, body)
	for k, v := range o.Headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8")
	req.Header.Set("Accept", "text/html,application/json;q=0.9,*/*;q=0.8")
	resp, err := httpClient.Do(req)
	if err != nil {
		res.Error = err.Error()
	} else {
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		res.Status = resp.StatusCode
		res.Body = string(body)
	}
	b, _ := json.Marshal(res)
	return string(b)
}

var _ = syscall.Errno(0)
