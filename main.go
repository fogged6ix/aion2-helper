// AION 2 Helper — окно на WebView2. Один exe: интерфейс, карта и тайлы вшиты внутрь.
package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

//go:embed web
var webFS embed.FS

const appTitle = "AION 2 Helper"
const appVersion = "5.0.0"

var (
	user32                     = windows.NewLazySystemDLL("user32.dll")
	pSetWindowLongPtrW         = user32.NewProc("SetWindowLongPtrW")
	pGetWindowLongPtrW         = user32.NewProc("GetWindowLongPtrW")
	pSetWindowPos              = user32.NewProc("SetWindowPos")
	pSetLayeredWindowAttribute = user32.NewProc("SetLayeredWindowAttributes")
	pReleaseCapture            = user32.NewProc("ReleaseCapture")
	pPostMessageW              = user32.NewProc("PostMessageW")
	pShowWindow                = user32.NewProc("ShowWindow")
	pMessageBeep               = user32.NewProc("MessageBeep")
	pMonitorFromWindow         = user32.NewProc("MonitorFromWindow")
	pGetMonitorInfoW           = user32.NewProc("GetMonitorInfoW")
	pGetDpiForWindow           = user32.NewProc("GetDpiForWindow")
	pFindWindowW               = user32.NewProc("FindWindowW")
	pSetForegroundWindow       = user32.NewProc("SetForegroundWindow")
	pIsIconic                  = user32.NewProc("IsIconic")
	pSetProcessDpiAwarenessCtx = user32.NewProc("SetProcessDpiAwarenessContext")
	pMessageBoxW               = user32.NewProc("MessageBoxW")
	pGetWindowRect             = user32.NewProc("GetWindowRect")
	pGetWindowThreadProcessId  = user32.NewProc("GetWindowThreadProcessId")
	dwmapi                     = windows.NewLazySystemDLL("dwmapi.dll")
	pDwmSetWindowAttribute     = dwmapi.NewProc("DwmSetWindowAttribute")
)

const (
	gwlStyle   = ^uintptr(15) // -16
	gwlExStyle = ^uintptr(19) // -20

	wsPopup        = 0x80000000
	wsVisible      = 0x10000000
	wsClipChildren = 0x02000000
	wsMinimizeBox  = 0x00020000
	wsSysMenu      = 0x00080000
	wsExLayered    = 0x00080000
	wsExAppWindow  = 0x00040000

	swpNoSize       = 0x0001
	swpNoMove       = 0x0002
	swpNoZOrder     = 0x0004
	swpNoActivate   = 0x0010
	swpFrameChanged = 0x0020

	hwndTopmost   = ^uintptr(0) // -1
	hwndNoTopmost = ^uintptr(1) // -2
	lwaAlpha      = 0x2
	wmNCLButtonDn = 0x00A1
	wmClose       = 0x0010
	htCaption     = 2
	swMinimize    = 6
	swRestore     = 9
)

type rect struct{ L, T, R, B int32 }
type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

type win struct {
	hwnd         uintptr
	w            webview2.WebView
	mu           sync.Mutex
	alpha        float64
	layered      bool
	fadeGen      int
	mode         string
	topmost      bool
	clickThrough bool
	cw, ch       float64 // размер виджета в CSS-пикселях (подстраивается под содержимое)
	dataDir      string
}

func (a *win) dpiScale() float64 {
	if pGetDpiForWindow.Find() == nil {
		d, _, _ := pGetDpiForWindow.Call(a.hwnd)
		if d > 0 {
			return float64(d) / 96.0
		}
	}
	return 1
}

func (a *win) workArea() rect {
	m, _, _ := pMonitorFromWindow.Call(a.hwnd, 2) // MONITOR_DEFAULTTONEAREST
	mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
	pGetMonitorInfoW.Call(m, uintptr(unsafe.Pointer(&mi)))
	return mi.Work
}

func (a *win) zorder() uintptr {
	if a.topmost {
		return hwndTopmost
	}
	return hwndNoTopmost
}

func (a *win) place(x, y, w, h int32) {
	pSetWindowPos.Call(a.hwnd, a.zorder(), uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate|swpFrameChanged)
}

func (a *win) applyMode(m string) {
	a.mode = m
	s := a.dpiScale()
	wa := a.workArea()
	if m == "full" {
		w, h := int32(1240*s), int32(800*s)
		if mw := wa.R - wa.L - int32(24*s); w > mw {
			w = mw
		}
		if mh := wa.B - wa.T - int32(24*s); h > mh {
			h = mh
		}
		a.place(wa.L+(wa.R-wa.L-w)/2, wa.T+(wa.B-wa.T-h)/2, w, h)
	} else {
		cw, chh := a.cw, a.ch
		if cw <= 0 {
			cw, chh = 284, 330
		}
		w, h := int32(cw*s), int32(chh*s)
		a.place(wa.R-w-int32(14*s), wa.T+int32(14*s), w, h)
	}
}

func (a *win) setLayered(on bool) {
	ex, _, _ := pGetWindowLongPtrW.Call(a.hwnd, gwlExStyle)
	if on {
		ex |= wsExLayered
	} else {
		ex &^= wsExLayered
	}
	pSetWindowLongPtrW.Call(a.hwnd, gwlExStyle, ex)
	a.layered = on
}

func (a *win) setAlpha(v float64) {
	if v >= 0.999 && !a.clickThrough {
		if a.layered {
			pSetLayeredWindowAttribute.Call(a.hwnd, 0, 255, lwaAlpha)
			a.setLayered(false)
		}
		a.alpha = 1
		return
	}
	if !a.layered {
		a.setLayered(true)
	}
	pSetLayeredWindowAttribute.Call(a.hwnd, 0, uintptr(v*255), lwaAlpha)
	a.alpha = v
}

// Плавно меняет прозрачность окна за ms миллисекунд.
func (a *win) fade(target float64, ms int) {
	if target < 0.2 {
		target = 0.2
	}
	if target > 1 {
		target = 1
	}
	a.mu.Lock()
	a.fadeGen++
	gen := a.fadeGen
	from := a.alpha
	a.mu.Unlock()
	if ms <= 0 {
		a.w.Dispatch(func() { a.setAlpha(target) })
		return
	}
	go func() {
		steps := ms / 16
		if steps < 1 {
			steps = 1
		}
		for i := 1; i <= steps; i++ {
			a.mu.Lock()
			stale := gen != a.fadeGen
			a.mu.Unlock()
			if stale {
				return
			}
			t := float64(i) / float64(steps)
			t = t * t * (3 - 2*t) // smoothstep
			v := from + (target-from)*t
			done := make(chan struct{})
			a.w.Dispatch(func() { a.setAlpha(v); close(done) })
			<-done
			time.Sleep(16 * time.Millisecond)
		}
	}()
}

func statePath(dir string) string { return filepath.Join(dir, "state.json") }

func appDirs() (string, string) {
	app := os.Getenv("APPDATA")
	loc := os.Getenv("LOCALAPPDATA")
	if app == "" {
		app, _ = os.UserConfigDir()
	}
	if loc == "" {
		loc = app
	}
	d := filepath.Join(app, "AION2Helper")
	wv := filepath.Join(loc, "AION2Helper", "WebView2")
	os.MkdirAll(d, 0o755)
	os.MkdirAll(wv, 0o755)
	return d, wv
}

func msgBox(text string) {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(appTitle)
	pMessageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x30)
}

func serve() string {
	sub, _ := fs.Sub(webFS, "web")
	mime.AddExtensionType(".webp", "image/webp")
	mime.AddExtensionType(".woff2", "font/woff2")
	mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		msgBox("Не удалось запустить внутренний сервер: " + err.Error())
		os.Exit(1)
	}
	fsrv := http.FileServer(http.FS(sub))
	go http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		fsrv.ServeHTTP(w, r)
	}))
	return "http://" + ln.Addr().String() + "/index.html"
}

func main() {
	// после обновления: ждём, пока старая версия закроется
	for _, x := range os.Args[1:] {
		if strings.HasPrefix(x, "--wait=") {
			if pid, err := strconv.Atoi(strings.TrimPrefix(x, "--wait=")); err == nil && pid > 0 {
				if ph, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid)); err == nil {
					windows.WaitForSingleObject(ph, 20000)
					windows.CloseHandle(ph)
				}
			}
		}
	}
	cleanupOld()
	// один экземпляр: второй запуск просто поднимает уже открытое окно
	name, _ := windows.UTF16PtrFromString("AION2Helper.SingleInstance")
	h, err := windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		t, _ := windows.UTF16PtrFromString(appTitle)
		cls, _ := windows.UTF16PtrFromString("webview")
		hw, _, _ := pFindWindowW.Call(uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(t)))
		if pid := otherExe(hw); hw != 0 && pid != 0 {
			// запущен другой файл (например, старая версия) — закрываем его и занимаем место
			ph, _ := windows.OpenProcess(windows.SYNCHRONIZE, false, pid)
			pPostMessageW.Call(hw, wmClose, 0, 0)
			if ph != 0 {
				windows.WaitForSingleObject(ph, 6000)
				windows.CloseHandle(ph)
			} else {
				time.Sleep(1500 * time.Millisecond)
			}
		} else {
			if hw != 0 {
				if ic, _, _ := pIsIconic.Call(hw); ic != 0 {
					pShowWindow.Call(hw, swRestore)
				}
				pShowWindow.Call(hw, swShowNoAct)
				pSetForegroundWindow.Call(hw)
			}
			return
		}
	}
	defer windows.CloseHandle(h)

	if pSetProcessDpiAwarenessCtx.Find() == nil {
		pSetProcessDpiAwarenessCtx.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
	}

	dataDir, wvDir := appDirs()
	if pd := portableDir(); pd != "" {
		dataDir = pd
	}
	store := &storage{dir: dataDir}
	url := serve()

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     os.Getenv("A2H_DEBUG") == "1",
		AutoFocus: true,
		DataPath:  wvDir,
		WindowOptions: webview2.WindowOptions{
			Title: appTitle, Width: 284, Height: 330, IconId: 2, Center: false,
		},
	})
	if w == nil {
		msgBox("Не найден Microsoft Edge WebView2 Runtime.\n\nУстанови его с сайта Microsoft (Evergreen Runtime) и запусти программу снова:\nhttps://developer.microsoft.com/microsoft-edge/webview2/")
		os.Exit(1)
	}
	defer w.Destroy()

	a := &win{hwnd: uintptr(w.Window()), w: w, alpha: 1, mode: "compact", topmost: true, dataDir: dataDir}

	// окно без рамки, со скруглёнными углами Windows 11
	pSetWindowLongPtrW.Call(a.hwnd, gwlStyle, wsPopup|wsVisible|wsClipChildren|wsMinimizeBox|wsSysMenu)
	ex, _, _ := pGetWindowLongPtrW.Call(a.hwnd, gwlExStyle)
	pSetWindowLongPtrW.Call(a.hwnd, gwlExStyle, ex|wsExAppWindow)
	corner := uint32(2) // DWMWCP_ROUND
	pDwmSetWindowAttribute.Call(a.hwnd, 33, uintptr(unsafe.Pointer(&corner)), 4)
	border := uint32(0x0060313B) // BGR рамки
	pDwmSetWindowAttribute.Call(a.hwnd, 34, uintptr(unsafe.Pointer(&border)), 4)
	dark := uint32(1)
	pDwmSetWindowAttribute.Call(a.hwnd, 20, uintptr(unsafe.Pointer(&dark)), 4)
	a.applyMode("full")

	w.Bind("hostLoad", func() string { return store.load() })
	w.Bind("hostSave", func(s string) bool { return store.save(s) })
	w.Bind("hostMode", func(m string) bool { a.setAlpha(1); a.applyMode(m); return true })
	w.Bind("hostSize", func(cw, chh float64) bool {
		if a.mode != "compact" || cw < 120 || chh < 30 || cw > 2000 || chh > 3000 {
			return false
		}
		a.cw, a.ch = cw, chh
		s := a.dpiScale()
		var r rect
		pGetWindowRect.Call(a.hwnd, uintptr(unsafe.Pointer(&r)))
		nw, nh := int32(cw*s), int32(chh*s)
		wa := a.workArea()
		x, y := r.R-nw, r.T
		if y+nh > wa.B { // не уезжаем за нижний край экрана
			y = wa.B - nh
			if y < wa.T {
				y = wa.T
			}
		}
		if x < wa.L {
			x = wa.L
		}
		a.place(x, y, nw, nh)
		return true
	})
	w.Bind("hostDock", func() bool { a.applyMode("compact"); return true })
	w.Bind("hostFade", func(v float64, ms int) bool { a.fade(v, ms); return true })
	w.Bind("hostDrag", func() bool {
		pReleaseCapture.Call()
		pPostMessageW.Call(a.hwnd, wmNCLButtonDn, htCaption, 0)
		return true
	})
	w.Bind("hostMin", func() bool { pShowWindow.Call(a.hwnd, swMinimize); return true })
	w.Bind("hostClose", func() bool { pPostMessageW.Call(a.hwnd, wmClose, 0, 0); return true })
	w.Bind("hostTop", func(b bool) bool {
		a.topmost = b
		pSetWindowPos.Call(a.hwnd, a.zorder(), 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		return true
	})
	w.Bind("hostBeep", func() bool { pMessageBeep.Call(0x30); return true })
	w.Bind("hostInfo", func() string { return dataDir })
	w.Bind("hostExport", func(name, content string) string { return writeExport(dataDir, name, content) })
	w.Bind("hostReveal", func(p string) bool { revealFile(p); return true })

	w.Bind("hostHotkey", func(id int, s string) bool { return a.setHotkey(uintptr(id), s) })
	w.Bind("hostClickThrough", func(b bool) bool { a.setClickThrough(b); return a.clickThrough })
	w.Bind("hostNotify", func(t, b string) bool { return a.notify(t, b) })
	w.Bind("hostTray", func(b bool) bool {
		if b {
			addTray(a)
		} else {
			removeTray()
		}
		return trayOn
	})
	w.Bind("hostAutostart", func(b bool) bool { setAutostart(b); return autostartOn() })
	w.Bind("hostAutostartGet", func() bool { return autostartOn() })
	w.Bind("hostBackups", func() []string { return listBackups(dataDir) })
	w.Bind("hostReadBackup", func(n string) string { return readBackup(dataDir, n) })
	w.Bind("hostOpenData", func() bool { openFolder(dataDir); return true })
	w.Bind("hostOpenURL", func(u string) bool {
		if strings.HasPrefix(u, "https://") {
			openFolder(u)
		}
		return true
	})
	w.Bind("hostHide", func() bool { pShowWindow.Call(a.hwnd, swHide); return true })
	w.Bind("hostVersion", func() string { return appVersion })
	nh := &netHelper{main: w, dataPath: wvDir}
	bindAI(w)
	bindUpdate(w, a)
	w.Bind("hostFetch", func(u, opts string, id int) bool { nh.fetch(u, opts, id); return true })

	logDir = dataDir
	ov := newOverlay(a)
	w.Bind("hostOverlay", func(js string) bool { return ov.apply(js) })
	// окно персонажа (P) в игре: через delay секунд снимаем окно игры и распознаём текст
	w.Bind("hostSheetOCR", func(delay, id int) bool {
		sheetOCR.ov = ov
		go func() {
			runtime.LockOSThread()
			defer runtime.UnlockOSThread()
			time.Sleep(time.Duration(delay) * time.Second)
			r := ov.gameClientRect()
			res := map[string]interface{}{}
			if r.R-r.L < 200 {
				res["error"] = "nogame"
			} else {
				lines, err := sheetOCR.once(r)
				res["lines"], res["error"] = lines, err
			}
			b, _ := json.Marshal(res)
			w.Dispatch(func() { w.Eval("window.__a2f&&__a2f(" + strconv.Itoa(id) + "," + string(b) + ")") })
		}()
		return true
	})
	w.Bind("hostSnap", func(sec int) bool {
		ov.snapshot(exportDir(dataDir), sec)
		return true
	})
	installSubclass(a)
	addTray(a)
	a.startGameFollow()
	backupState(dataDir, store)
	if hasArg("--tray") {
		pShowWindow.Call(a.hwnd, swHide)
	}

	w.Navigate(url)
	w.Run()
	removeTray()
}

func itoa(i int) string { return strconv.Itoa(i) }

func hasArg(a string) bool {
	for _, x := range os.Args[1:] {
		if x == a {
			return true
		}
	}
	return false
}

// otherExe: окно принадлежит процессу, запущенному из другого файла
func otherExe(hw uintptr) uint32 {
	if hw == 0 {
		return 0
	}
	var pid uint32
	pGetWindowThreadProcessId.Call(hw, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 {
		return 0
	}
	ph, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return 0
	}
	defer windows.CloseHandle(ph)
	buf := make([]uint16, 1024)
	n := uint32(len(buf))
	if windows.QueryFullProcessImageName(ph, 0, &buf[0], &n) != nil {
		return 0
	}
	other := windows.UTF16ToString(buf[:n])
	me, err := os.Executable()
	if err != nil {
		return 0
	}
	if strings.EqualFold(filepath.Clean(other), filepath.Clean(me)) {
		return 0
	}
	return pid
}
