// Подсветка поверх игры: прозрачное окно поверх монитора с игрой, на нём — точки с карты помощника
// (кубы, руда, боссы…). Окно ничего не трогает в игре: клики проходят насквозь, ввод в игру не посылается.
// Чтобы точки совпали с картой игры, один раз «выравниваешь» подсветку: тащишь мышью и крутишь колесо.
package main

import (
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	"aion2helper/mapfind"

	"golang.org/x/sys/windows"
)

var (
	gdi32                     = windows.NewLazySystemDLL("gdi32.dll")
	pCreateCompatibleDC       = gdi32.NewProc("CreateCompatibleDC")
	pCreateDIBSection         = gdi32.NewProc("CreateDIBSection")
	pSelectObject             = gdi32.NewProc("SelectObject")
	pDeleteObject             = gdi32.NewProc("DeleteObject")
	pDeleteDC                 = gdi32.NewProc("DeleteDC")
	pCreateFontW              = gdi32.NewProc("CreateFontW")
	pSetBkMode                = gdi32.NewProc("SetBkMode")
	pSetTextColor             = gdi32.NewProc("SetTextColor")
	pTextOutW                 = gdi32.NewProc("TextOutW")
	pGetTextExtentPoint32W    = gdi32.NewProc("GetTextExtentPoint32W")
	pGdiFlush                 = gdi32.NewProc("GdiFlush")
	pRegisterClassExW         = user32.NewProc("RegisterClassExW")
	pCreateWindowExW          = user32.NewProc("CreateWindowExW")
	pDefWindowProcW           = user32.NewProc("DefWindowProcW")
	pUpdateLayeredWindow      = user32.NewProc("UpdateLayeredWindow")
	pGetForegroundWindow      = user32.NewProc("GetForegroundWindow")
	pSetTimer                 = user32.NewProc("SetTimer")
	pKillTimer                = user32.NewProc("KillTimer")
	pGetAsyncKeyState         = user32.NewProc("GetAsyncKeyState")
	pSetCapture               = user32.NewProc("SetCapture")
	pGetDC                    = user32.NewProc("GetDC")
	pReleaseDC                = user32.NewProc("ReleaseDC")
	pLoadCursorW              = user32.NewProc("LoadCursorW")
	pIsWindow                 = user32.NewProc("IsWindow")
	pWindowFromPoint          = user32.NewProc("WindowFromPoint")
	pGetAncestor              = user32.NewProc("GetAncestor")
	pSetWinEventHook          = user32.NewProc("SetWinEventHook")
	pStretchBlt               = gdi32.NewProc("StretchBlt")
	pSetStretchBltMode        = gdi32.NewProc("SetStretchBltMode")
	pSetBrushOrgEx            = gdi32.NewProc("SetBrushOrgEx")
	pGetClientRect            = user32.NewProc("GetClientRect")
	pClientToScreen           = user32.NewProc("ClientToScreen")
	pBitBlt                   = gdi32.NewProc("BitBlt")
	pSetWindowDisplayAffinity = user32.NewProc("SetWindowDisplayAffinity")
	pGetCurrentProcessId      = kernel32.NewProc("GetCurrentProcessId")
	ovClassName, _            = windows.UTF16PtrFromString("A2HOverlay")
	theOverlay                *overlay
)

const (
	wmTimer       = 0x0113
	wmMouseMove   = 0x0200
	wmLButtonDown = 0x0201
	wmRButtonDown = 0x0204
	wmMouseWheel  = 0x020A
	wmKeyDown     = 0x0100
	wmSetCursor   = 0x0020
	wmNCHitTest   = 0x0084
	wsExTopmost   = 0x00000008
	wsExToolWin   = 0x00000080
	wsExNoAct     = 0x08000000
	ulwAlpha      = 0x2
	hotkeyOverlay = 3
	hotkeyAdjust  = 4
	hotkeyTaken   = 5
	wmAuto        = 0x8000 + 20 // WM_APP+20: результат поиска карты
)

type ovPt struct {
	X, Y  float64
	Col   uint32 // 0xRRGGBB
	Shape string
	Label string
	Big   bool
	ID    string
}

type ovCalib struct{ S, Tx, Ty float64 }

type overlay struct {
	a            *win
	hwnd         uintptr
	on           bool // включена пользователем
	shown        bool
	adjust       bool
	follow       bool   // показывать вместе с картой игры (клавиша карты)
	mode         string // auto — сам находит карту на экране; key — по клавише карты; always — всегда
	autoSeen     bool   // автоопределение: карта сейчас на экране
	autoMiss     int
	watching     bool
	mu           sync.Mutex
	gameFg       bool
	excl         rect // окно помощника — не смотреть туда
	hint         *mapfind.Transform
	res          mapfind.Transform
	resOK        bool
	capBlack     bool
	routes       [][][2]float64
	capBlackSaid bool
	ulwErrSaid   bool
	gameH        uintptr
	mx, my       int32
	rcur         ovCalib
	icons        map[string]*sprite
	recheck      bool
	tip          tipWin
	tipFont      uintptr
	tipFontB     uintptr
	tipFontT     uintptr
	hoverPos     point
	hoverAt      time.Time
	seenMT       bool // autoSeen для фоновых потоков
	dragOn       bool
	dragEnded    bool
	dragGain     float64
	pendX, pendY float64
	accX, accY   float64
	shiftPosted  bool
	tipsOff      bool
	gameRect     rect
	selecting    bool
	selectFor    string // чья область выбирается: A2Chat (чат) или A2Combat (журнал боя)
	pick         int    // выравнивание по двум точкам: выбранная статуя
	pairs        [][4]float64
	downX        int32
	downY        int32
	moved        bool
	mapKey       uintptr
	mapOpen      bool
	keyWasDown   bool
	escWasDown   bool
	title        string
	pts, ref     []ovPt
	calib        map[string]ovCalib
	cur          ovCalib
	saved        ovCalib
	mon          rect
	target       uintptr // окно игры
	dragging     bool
	lx, ly       int32
	myPid        uint32
	bits         uintptr
	dib, mdc     uintptr
	bw, bh       int32
	font, fontB  uintptr
}

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSm     uintptr
}

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type blendFunc struct{ Op, Flags, Alpha, Format byte }
type sizeT struct{ CX, CY int32 }

func newOverlay(a *win) *overlay {
	o := &overlay{a: a, calib: map[string]ovCalib{}, mapKey: 'M', mode: "auto", pick: -1}
	pid, _, _ := pGetCurrentProcessId.Call()
	o.myPid = uint32(pid)
	hinst, _, _ := pGetModuleHandleW.Call(0)
	cur, _, _ := pLoadCursorW.Call(0, 32646) // IDC_SIZEALL
	wc := wndClassEx{WndProc: windows.NewCallback(o.proc), Instance: hinst, ClassName: ovClassName, Cursor: cur}
	wc.Size = uint32(unsafe.Sizeof(wc))
	pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	title, _ := windows.UTF16PtrFromString("AION 2 · подсветка")
	o.hwnd, _, _ = pCreateWindowExW.Call(wsExLayered|wsExTransp|wsExTopmost|wsExToolWin|wsExNoAct,
		uintptr(unsafe.Pointer(ovClassName)), uintptr(unsafe.Pointer(title)), wsPopup, 0, 0, 10, 10, 0, 0, hinst, 0)
	face, _ := windows.UTF16PtrFromString("Segoe UI")
	o.font, _, _ = pCreateFontW.Call(uintptr(negI(15)), 0, 0, 0, 600, 0, 0, 0, 1, 0, 0, 4, 0, uintptr(unsafe.Pointer(face)))
	o.fontB, _, _ = pCreateFontW.Call(uintptr(negI(19)), 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 4, 0, uintptr(unsafe.Pointer(face)))
	pSetTimer.Call(o.hwnd, 1, 400, 0)
	pSetWindowDisplayAffinity.Call(o.hwnd, 0x11) // WDA_EXCLUDEFROMCAPTURE: подсветка не попадает в снимки
	// мгновенно узнаём о переключении окон и сворачивании (только уведомления Windows, без внедрения в игру)
	cb := windows.NewCallback(func(hook, ev, hwnd, idObj, idChild, thread, t uintptr) uintptr {
		if o.on {
			o.tick()
		}
		return 0
	})
	pSetWinEventHook.Call(3, 3, 0, cb, 0, 0, 0)       // EVENT_SYSTEM_FOREGROUND
	pSetWinEventHook.Call(0x16, 0x17, 0, cb, 0, 0, 0) // свернули / развернули
	o.dragGain = 1
	o.initTip()
	pSetTimer.Call(o.hwnd, timerHover, 40, 0)
	theOverlay = o
	return o
}

func negI(v int32) int32 { return -v }

func (o *overlay) proc(hwnd, msg, wp, lp uintptr) uintptr {
	switch msg {
	case wmShift:
		o.onShift()
		return 0
	case wmTimer:
		if wp == timerHover {
			o.hoverTick()
			return 0
		}
		if wp == 2 {
			pKillTimer.Call(hwnd, 2)
			if o.shown && (o.cur != o.rcur) {
				o.render()
			}
			return 0
		}
		o.tick()
		return 0
	case wmNCHitTest:
		if o.adjust {
			return 1 // HTCLIENT
		}
	case wmLButtonDown:
		if o.adjust {
			o.dragging = true
			o.moved = false
			o.lx, o.ly = int32(int16(lp&0xffff)), int32(int16((lp>>16)&0xffff))
			o.downX, o.downY = o.lx, o.ly
			pSetCapture.Call(hwnd)
		}
		return 0
	case wmLButtonUp:
		if o.dragging && o.selecting {
			o.dragging = false
			pReleaseCapture.Call()
			if o.moved {
				o.finishSelect()
			}
			return 0
		}
		if o.dragging {
			o.dragging = false
			pReleaseCapture.Call()
			if !o.moved {
				o.clickAlign(float64(o.downX), float64(o.downY))
				o.render()
			}
		}
		return 0
	case wmMouseMove:
		if o.adjust && o.dragging {
			x, y := int32(int16(lp&0xffff)), int32(int16((lp>>16)&0xffff))
			if !o.moved && (x-o.downX)*(x-o.downX)+(y-o.downY)*(y-o.downY) < 25 {
				return 0
			}
			if !o.moved {
				o.moved = true
				o.lx, o.ly = o.downX, o.downY
			}
			if o.selecting {
				o.lx, o.ly = x, y
				o.render()
				return 0
			}
			o.cur.Tx += float64(x - o.lx)
			o.cur.Ty += float64(y - o.ly)
			o.lx, o.ly = x, y
			o.render()
		}
		return 0
	case wmAuto:
		o.onAuto()
		return 0
	case wmMouseWheel:
		if o.adjust && !o.selecting {
			d := float64(int16((wp >> 16) & 0xffff))
			var p point
			pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
			f := math.Pow(1.06, d/120)
			if wp&0x4 != 0 { // Shift — мелкий шаг
				f = math.Pow(1.01, d/120)
			}
			o.zoomAt(float64(p.X-o.mon.L), float64(p.Y-o.mon.T), f)
			o.render()
		}
		return 0
	case wmRButtonDown:
		if o.adjust {
			o.endAdjust(!o.selecting)
		}
		return 0
	case wmKeyDown:
		if o.adjust {
			step := 1.0
			if pk, _, _ := pGetAsyncKeyState.Call(0x10); pk&0x8000 != 0 {
				step = 10
			}
			switch wp {
			case 0x0D: // Enter
				o.endAdjust(!o.selecting)
			case 0x1B: // Esc
				o.endAdjust(false)
			case 0x25:
				o.cur.Tx -= step
			case 0x27:
				o.cur.Tx += step
			case 0x26:
				o.cur.Ty -= step
			case 0x28:
				o.cur.Ty += step
			case 0xBB, 0x6B: // +
				o.zoomAt(float64(o.bw)/2, float64(o.bh)/2, 1.01)
			case 0xBD, 0x6D: // -
				o.zoomAt(float64(o.bw)/2, float64(o.bh)/2, 1/1.01)
			}
			o.render()
		}
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, msg, wp, lp)
	return r
}

func (o *overlay) zoomAt(cx, cy, f float64) {
	// точка карты под курсором остаётся на месте
	o.cur.Tx = cx - (cx-o.cur.Tx)*f
	o.cur.Ty = cy - (cy-o.cur.Ty)*f
	o.cur.S *= f
}

func (o *overlay) isOurs(h uintptr) bool {
	var pid uint32
	pGetWindowThreadProcessId.Call(h, uintptr(unsafe.Pointer(&pid)))
	return pid == o.myPid
}

func keyDown(vk uintptr) bool {
	r, _, _ := pGetAsyncKeyState.Call(vk)
	return r&0x8000 != 0
}

// раз в 400 мс (или 60 мс, когда следим за клавишей карты): какое окно игры, тот ли монитор, показывать ли
func (o *overlay) tick() {
	if !o.on && !chatOCR.isOn() && !combatOCR.isOn() && !pinger.isOn() {
		return
	}
	fg, _, _ := pGetForegroundWindow.Call()
	gameActive := false
	if fg != 0 && !o.isOurs(fg) && o.isGame(fg) {
		if fg != o.target {
			o.target = fg
			t, c := winText(fg)
			var wr rect
			pGetWindowRect.Call(fg, uintptr(unsafe.Pointer(&wr)))
			ovLog("активное окно: %q класс %q, место %v, режим %s, вкл %v", t, c, wr, o.mode, o.on)
		}
		ic, _, _ := pIsIconic.Call(fg)
		gameActive = ic == 0
	} else if fg != 0 && o.isOurs(fg) {
		gameActive = o.adjust || o.mode == "always" // окно помощника активно — показываем только в режиме «всегда»
	}
	if o.target != 0 {
		if ok, _, _ := pIsWindow.Call(o.target); ok == 0 {
			o.target = 0
		}
	}
	// клавиша карты: пассивно смотрим состояние клавиш (без хуков и без ввода в игру)
	if o.mode == "key" && fg == o.target && fg != 0 {
		d := keyDown(o.mapKey)
		if d && !o.keyWasDown && !keyDown(0x11) && !keyDown(0x12) {
			o.mapOpen = !o.mapOpen
		}
		o.keyWasDown = d
		e := keyDown(0x1B)
		if e && !o.escWasDown {
			o.mapOpen = false
		}
		o.escWasDown = e
	}
	// игру свернули или переключились в другое окно — карту потом проверим заново
	if !gameActive && o.autoSeen && !o.adjust {
		o.autoSeen = false
		o.mu.Lock()
		o.recheck = true
		o.seenMT = false
		o.mu.Unlock()
		o.hideTip()
	}
	want := o.adjust || o.on && (gameActive && (o.mode == "always" || (o.mode == "key" && o.mapOpen) || (o.mode == "auto" && o.autoSeen)))
	// данные для фонового поиска карты
	o.mu.Lock()
	o.gameFg = fg != 0 && fg == o.target && !o.adjust && o.isGame(fg)
	o.gameRect = rect{}
	if o.target != 0 {
		var cr rect
		pGetClientRect.Call(o.target, uintptr(unsafe.Pointer(&cr)))
		p0 := point{0, 0}
		pClientToScreen.Call(o.target, uintptr(unsafe.Pointer(&p0)))
		r := rect{p0.X, p0.Y, p0.X + cr.R, p0.Y + cr.B}
		// обрезаем по монитору
		if r.L < o.mon.L {
			r.L = o.mon.L
		}
		if r.T < o.mon.T {
			r.T = o.mon.T
		}
		if r.R > o.mon.R {
			r.R = o.mon.R
		}
		if r.B > o.mon.B {
			r.B = o.mon.B
		}
		if r.R-r.L > 200 && r.B-r.T > 150 {
			o.gameRect = r
		}
	}
	o.excl = rect{}
	if v, _, _ := pIsWindowVisible.Call(o.a.hwnd); v != 0 {
		var wr rect
		pGetWindowRect.Call(o.a.hwnd, uintptr(unsafe.Pointer(&wr)))
		// исключаем окно помощника, только если оно действительно видно поверх игры
		cx, cy := (wr.L+wr.R)/2, (wr.T+wr.B)/2
		h, _, _ := pWindowFromPoint.Call(uintptr(uint32(cx)) | uintptr(uint32(cy))<<32)
		if h != 0 {
			root, _, _ := pGetAncestor.Call(h, 2) // GA_ROOT
			if root == o.a.hwnd {
				o.excl = wr
			}
		}
	}
	o.mu.Unlock()
	if o.on && o.mode == "auto" && !o.watching {
		o.watching = true
		go o.watch()
		go o.mouseLoop()
	}
	if o.target != 0 || o.adjust {
		ref := o.target
		if ref == 0 {
			ref = o.a.hwnd
		}
		m, _, _ := pMonitorFromWindow.Call(ref, 2)
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		pGetMonitorInfoW.Call(m, uintptr(unsafe.Pointer(&mi)))
		if mi.Monitor != o.mon {
			o.mon = mi.Monitor
			o.loadCalib()
			o.shown = false
		}
	}
	if want && !o.shown {
		ovLog("показываю подсветку: точек %d, масштаб %.3f, экран %v", len(o.pts), o.cur.S, o.mon)
		o.render()
		pShowWindow.Call(o.hwnd, swShowNoAct)
		pSetWindowPos.Call(o.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
		o.shown = true
	} else if !want && o.shown {
		ovLog("прячу подсветку")
		o.hideTip()
		pShowWindow.Call(o.hwnd, swHide)
		o.shown = false
	}
}

func (o *overlay) key() string {
	return strconv.Itoa(int(o.mon.R-o.mon.L)) + "x" + strconv.Itoa(int(o.mon.B-o.mon.T))
}

func (o *overlay) loadCalib() {
	if c, ok := o.calib[o.key()]; ok && c.S > 0 {
		o.cur = c
		return
	}
	// по умолчанию: вся карта по высоте экрана, по центру
	D := MapBounds
	w, h := float64(o.mon.R-o.mon.L), float64(o.mon.B-o.mon.T)
	s := math.Min(w/(D[2]-D[0]), h/(D[3]-D[1])) * 0.92
	o.cur = ovCalib{S: s, Tx: w/2 - (D[0]+D[2])/2*s, Ty: h/2 - (D[1]+D[3])/2*s}
}

// границы карты помощника (x0,y0,x1,y1) — как в mapdata.js
var MapBounds = [4]float64{1522.26, 1440.66, 6776.64, 7045.54}

// ---------- рисование ----------
// запас вокруг экрана: пока карту тащат, окно с точками просто сдвигается (без перерисовки)
func (o *overlay) margins() (int32, int32) {
	if o.mode == "auto" && !o.adjust {
		return (o.mon.R - o.mon.L) * 2 / 5, (o.mon.B - o.mon.T) * 2 / 5
	}
	return 0, 0
}

func (o *overlay) ensureBuf() {
	o.mx, o.my = o.margins()
	w, h := o.mon.R-o.mon.L+2*o.mx, o.mon.B-o.mon.T+2*o.my
	if w <= 0 || h <= 0 {
		return
	}
	if o.dib != 0 && w == o.bw && h == o.bh {
		return
	}
	if o.dib != 0 {
		pDeleteObject.Call(o.dib)
		pDeleteDC.Call(o.mdc)
	}
	sdc, _, _ := pGetDC.Call(0)
	o.mdc, _, _ = pCreateCompatibleDC.Call(sdc)
	pReleaseDC.Call(0, sdc)
	bi := bitmapInfoHeader{Width: w, Height: -h, Planes: 1, BitCount: 32}
	bi.Size = uint32(unsafe.Sizeof(bi))
	// BITMAPINFO = header + 1 RGBQUAD
	var buf [unsafe.Sizeof(bitmapInfoHeader{}) + 4]byte
	*(*bitmapInfoHeader)(unsafe.Pointer(&buf[0])) = bi
	o.dib, _, _ = pCreateDIBSection.Call(o.mdc, uintptr(unsafe.Pointer(&buf[0])), 0, uintptr(unsafe.Pointer(&o.bits)), 0, 0)
	pSelectObject.Call(o.mdc, o.dib)
	o.bw, o.bh = w, h
}

func (o *overlay) pix() []uint32 {
	return unsafe.Slice((*uint32)(unsafe.Pointer(o.bits)), int(o.bw)*int(o.bh))
}

// смешивание premultiplied ARGB: цвет col (RGB), непрозрачность a 0..1
func blend(p *uint32, col uint32, a float64) {
	if a <= 0 {
		return
	}
	if a > 1 {
		a = 1
	}
	sr, sg, sb := float64((col>>16)&255)*a, float64((col>>8)&255)*a, float64(col&255)*a
	sa := 255 * a
	d := *p
	da, dr, dg, db := float64(d>>24), float64((d>>16)&255), float64((d>>8)&255), float64(d&255)
	k := 1 - a
	r := uint32(sr + dr*k)
	g := uint32(sg + dg*k)
	b := uint32(sb + db*k)
	al := uint32(sa + da*k)
	*p = al<<24 | r<<16 | g<<8 | b
}

// закрашенный круг со сглаживанием
func (o *overlay) disc(cx, cy, r float64, col uint32, a float64) {
	px := o.pix()
	x0, x1 := int(math.Floor(cx-r-1)), int(math.Ceil(cx+r+1))
	y0, y1 := int(math.Floor(cy-r-1)), int(math.Ceil(cy+r+1))
	for y := y0; y <= y1; y++ {
		if y < 0 || y >= int(o.bh) {
			continue
		}
		for x := x0; x <= x1; x++ {
			if x < 0 || x >= int(o.bw) {
				continue
			}
			d := math.Hypot(float64(x)+.5-cx, float64(y)+.5-cy)
			cov := r + .5 - d
			if cov > 0 {
				blend(&px[y*int(o.bw)+x], col, a*math.Min(cov, 1))
			}
		}
	}
}

// кольцо
func (o *overlay) ring(cx, cy, r, w float64, col uint32, a float64) {
	px := o.pix()
	x0, x1 := int(cx-r-w-1), int(cx+r+w+1)
	y0, y1 := int(cy-r-w-1), int(cy+r+w+1)
	for y := y0; y <= y1; y++ {
		if y < 0 || y >= int(o.bh) {
			continue
		}
		for x := x0; x <= x1; x++ {
			if x < 0 || x >= int(o.bw) {
				continue
			}
			d := math.Abs(math.Hypot(float64(x)+.5-cx, float64(y)+.5-cy) - r)
			cov := w/2 + .5 - d
			if cov > 0 {
				blend(&px[y*int(o.bw)+x], col, a*math.Min(cov, 1))
			}
		}
	}
}

func (o *overlay) rectFill(x, y, w, h int, col uint32, a float64) {
	px := o.pix()
	for j := y; j < y+h; j++ {
		if j < 0 || j >= int(o.bh) {
			continue
		}
		for i := x; i < x+w; i++ {
			if i < 0 || i >= int(o.bw) {
				continue
			}
			blend(&px[j*int(o.bw)+i], col, a)
		}
	}
}

// текст: GDI пишет только RGB, альфу чиним сами (на тёмной подложке)
func (o *overlay) text(x, y int, s string, col uint32, big bool, bgA float64) (int, int) {
	u, _ := windows.UTF16FromString(s)
	n := len(u) - 1
	f := o.font
	if big {
		f = o.fontB
	}
	pSelectObject.Call(o.mdc, f)
	var sz sizeT
	pGetTextExtentPoint32W.Call(o.mdc, uintptr(unsafe.Pointer(&u[0])), uintptr(n), uintptr(unsafe.Pointer(&sz)))
	padX, padY := 6, 2
	bx, by, bw, bh := x, y, int(sz.CX)+padX*2, int(sz.CY)+padY*2
	o.rectFill(bx, by, bw, bh, 0x101418, bgA)
	pGdiFlush.Call()
	px := o.pix()
	// запоминаем альфу подложки
	before := make([]uint32, 0, bw*bh)
	for j := by; j < by+bh; j++ {
		for i := bx; i < bx+bw; i++ {
			if i >= 0 && j >= 0 && i < int(o.bw) && j < int(o.bh) {
				before = append(before, px[j*int(o.bw)+i])
			} else {
				before = append(before, 0)
			}
		}
	}
	pSetBkMode.Call(o.mdc, 1) // TRANSPARENT
	pSetTextColor.Call(o.mdc, uintptr(((col&255)<<16)|(col&0xff00)|((col>>16)&255)))
	pTextOutW.Call(o.mdc, uintptr(bx+padX), uintptr(by+padY), uintptr(unsafe.Pointer(&u[0])), uintptr(n))
	pGdiFlush.Call()
	k := 0
	for j := by; j < by+bh; j++ {
		for i := bx; i < bx+bw; i++ {
			if i >= 0 && j >= 0 && i < int(o.bw) && j < int(o.bh) {
				p := &px[j*int(o.bw)+i]
				if *p != before[k] { // пиксель буквы — делаем непрозрачным
					*p |= 0xff000000
				}
			}
			k++
		}
	}
	return bw, bh
}

func (o *overlay) toScreen(x, y float64) (float64, float64) {
	return x*o.cur.S + o.cur.Tx, y*o.cur.S + o.cur.Ty
}

// координаты в буфере рисования (экран + запас)
func (o *overlay) toBuf(x, y float64) (float64, float64) {
	sx, sy := o.toScreen(x, y)
	return sx + float64(o.mx), sy + float64(o.my)
}

func (o *overlay) uiBuf(x, y float64) bool { return o.inUI(x-float64(o.mx), y-float64(o.my)) }

// значок-картинка (premultiplied ARGB)
type sprite struct {
	w, h int
	px   []uint32
}

func (o *overlay) blit(sp *sprite, cx, cy float64) {
	px := o.pix()
	x0, y0 := int(math.Round(cx))-sp.w/2, int(math.Round(cy))-sp.h/2
	bw, bh := int(o.bw), int(o.bh)
	for j := 0; j < sp.h; j++ {
		y := y0 + j
		if y < 0 || y >= bh {
			continue
		}
		for i := 0; i < sp.w; i++ {
			x := x0 + i
			if x < 0 || x >= bw {
				continue
			}
			s := sp.px[j*sp.w+i]
			sa := s >> 24
			if sa == 0 {
				continue
			}
			d := &px[y*bw+x]
			if sa == 255 {
				*d = s
				continue
			}
			k := 255 - sa
			dv := *d
			a := sa + ((dv>>24)*k)/255
			r := ((s >> 16) & 255) + (((dv>>16)&255)*k)/255
			g := ((s >> 8) & 255) + (((dv>>8)&255)*k)/255
			b := (s & 255) + ((dv&255)*k)/255
			*d = a<<24 | r<<16 | g<<8 | b
		}
	}
}

// сдвинуть уже нарисованные точки вслед за картой; если ушли далеко или поменялся масштаб — перерисовать
func (o *overlay) place() {
	if !o.shown || o.adjust || o.mx == 0 {
		o.render()
		return
	}
	if math.Abs(o.cur.S-o.rcur.S) > o.rcur.S*0.0015 {
		o.render()
		return
	}
	dx, dy := o.cur.Tx-o.rcur.Tx, o.cur.Ty-o.rcur.Ty
	if math.Abs(dx) > float64(o.mx)*0.85 || math.Abs(dy) > float64(o.my)*0.85 {
		o.render()
		return
	}
	x, y := int32(math.Round(dx)), int32(math.Round(dy))
	pSetWindowPos.Call(o.hwnd, 0, uintptr(o.mon.L-o.mx+x), uintptr(o.mon.T-o.my+y), 0, 0, swpNoSize|swpNoZOrder|swpNoActivate)
	// когда карту отпустят — перерисуем начисто (точки у краёв и под интерфейсом)
	pSetTimer.Call(o.hwnd, 2, 260, 0)
}

func (o *overlay) render() {
	o.ensureBuf()
	if o.dib == 0 {
		return
	}
	px := o.pix()
	base := uint32(0)
	if o.adjust {
		base = 0x30000000 // лёгкое затемнение, чтобы окно ловило мышь и было видно режим
	}
	for i := range px {
		px[i] = base
	}
	// опорные точки (статуи телепорта) — тусклые; в режиме выравнивания — ярче и с подписями
	for _, p := range o.ref {
		if o.selecting {
			break
		}
		x, y := o.toBuf(p.X, p.Y)
		if o.adjust {
			o.ring(x, y, 6, 2, 0x7fe0d0, .95)
			o.disc(x, y, 2, 0x7fe0d0, .95)
		} else {
			o.ring(x, y, 4, 1.4, 0x7fe0d0, .35)
		}
	}
	if o.adjust && !o.selecting {
		for _, p := range o.ref {
			if p.Label != "" {
				x, y := o.toBuf(p.X, p.Y)
				o.text(int(x)+9, int(y)-10, p.Label, 0x9ff0e4, false, .55)
			}
		}
	}
	// маршруты: линия и номера точек
	for _, rt := range o.routes {
		for i := 1; i < len(rt); i++ {
			x0, y0 := o.toBuf(rt[i-1][0], rt[i-1][1])
			x1, y1 := o.toBuf(rt[i][0], rt[i][1])
			o.line(x0, y0, x1, y1, 4.5, 0x000000, .55)
			o.line(x0, y0, x1, y1, 2.2, 0xffd36b, .95)
		}
	}
	if o.selecting && o.dragging && o.moved {
		x0, y0 := math.Min(float64(o.downX), float64(o.lx)), math.Min(float64(o.downY), float64(o.ly))
		x1, y1 := math.Max(float64(o.downX), float64(o.lx)), math.Max(float64(o.downY), float64(o.ly))
		o.rectFill(int(x0), int(y0), int(x1-x0), int(y1-y0), 0x5aa8ff, .18)
		o.line(x0, y0, x1, y0, 2, 0x7fe0ff, 1)
		o.line(x1, y0, x1, y1, 2, 0x7fe0ff, 1)
		o.line(x1, y1, x0, y1, 2, 0x7fe0ff, 1)
		o.line(x0, y1, x0, y0, 2, 0x7fe0ff, 1)
	}
	if o.adjust && o.pick >= 0 && o.pick < len(o.ref) {
		p := o.ref[o.pick]
		x, y := o.toBuf(p.X, p.Y)
		o.ring(x, y, 14, 3, 0xffd36b, 1)
		o.ring(x, y, 20, 1.5, 0xffd36b, .6)
	}
	labels := len(o.pts) <= 40
	for _, p := range o.pts {
		x, y := o.toBuf(p.X, p.Y)
		if o.uiBuf(x, y) {
			continue
		}
		if sp := o.icons[p.Shape]; sp != nil {
			// мягкая тень под значком — читается на любой карте
			o.disc(x, y+1, float64(sp.w)*0.46, 0x000000, .38)
			o.blit(sp, x, y)
			continue
		}
		r := 6.0
		if p.Big {
			r = 10
		}
		if strings.HasPrefix(p.Shape, "dot") && len(o.pts) > 200 {
			r = 4
		}
		o.disc(x, y, r+2.5, 0x000000, .75)
		o.disc(x, y, r, p.Col, 1)
		o.ring(x, y, r+6, 2, p.Col, .55)
	}
	for _, rt := range o.routes {
		for i := 1; i < len(rt); i++ {
			x, y := o.toBuf(rt[i][0], rt[i][1])
			o.text(int(x)-8, int(y)-30, strconv.Itoa(i), 0xffd36b, true, .85)
		}
	}
	if labels {
		for _, p := range o.pts {
			if p.Label == "" {
				continue
			}
			x, y := o.toBuf(p.X, p.Y)
			if o.uiBuf(x, y) {
				continue
			}
			off := 14
			if sp := o.icons[p.Shape]; sp != nil {
				off = sp.w/2 + 4
			}
			o.text(int(x)+off, int(y)-11, p.Label, 0xffffff, false, .7)
		}
	}
	// плашка сверху (в автоматическом режиме не нужна — точки и так на карте)
	head := o.title
	if o.mx != 0 {
		head = ""
	}
	if o.adjust {
		switch {
		case o.selecting:
			head = "Обведи мышью окно чата игры (там, где строки «Вы получили…») · Esc — отмена"
		case o.pick >= 0:
			head = "Теперь щёлкни по этой же статуе на карте игры"
		case len(o.pairs) == 1:
			head = "Хорошо! Ещё одна: щёлкни по другой бирюзовой статуе подальше, потом по ней на карте игры"
		case len(o.pairs) >= 2:
			head = "Готово — точки совмещены. Enter — сохранить, Esc — отмена (можно поправить мышью)"
		default:
			head = "Выравнивание: щёлкни по бирюзовой статуе, потом по ней же на карте игры (2 раза) · или тащи мышью и крути колесо · Enter — готово · Esc — отмена"
		}
	}
	if head != "" {
		pSelectObject.Call(o.mdc, o.fontB)
		var sz sizeT
		uu, _ := windows.UTF16FromString(head)
		pGetTextExtentPoint32W.Call(o.mdc, uintptr(unsafe.Pointer(&uu[0])), uintptr(len(uu)-1), uintptr(unsafe.Pointer(&sz)))
		hy := 10
		if !o.adjust {
			hy = int(o.bh) - 46 // внизу: сверху у карты игры свои вкладки
		}
		o.text(int(o.bw)/2-int(sz.CX)/2-6, hy, head, 0xffd36b, true, .8)
	}
	// на экран
	sdc, _, _ := pGetDC.Call(0)
	dst := point{o.mon.L - o.mx, o.mon.T - o.my}
	o.rcur = o.cur
	sz := sizeT{o.bw, o.bh}
	src := point{0, 0}
	bf := blendFunc{0, 0, 255, 1} // AC_SRC_ALPHA
	// последний параметр BLENDFUNCTION передаётся указателем
	r, _, e := pUpdateLayeredWindow.Call(o.hwnd, sdc, uintptr(unsafe.Pointer(&dst)), uintptr(unsafe.Pointer(&sz)), o.mdc,
		uintptr(unsafe.Pointer(&src)), 0, uintptr(unsafe.Pointer(&bf)), ulwAlpha)
	if r == 0 && !o.ulwErrSaid {
		o.ulwErrSaid = true
		ovLog("ошибка рисования подсветки: %v (экран %v, буфер %dx%d)", e, o.mon, o.bw, o.bh)
	}
	pReleaseDC.Call(0, sdc)
}

// ---------- управление ----------
func (o *overlay) setOn(on bool) {
	o.on = on
	if !on {
		if o.adjust {
			o.endAdjust(false)
		}
		pShowWindow.Call(o.hwnd, swHide)
		o.shown = false
		return
	}
	if o.mon.R == 0 {
		fg, _, _ := pGetForegroundWindow.Call()
		if fg != 0 && !o.isOurs(fg) {
			o.target = fg
		}
		ref := o.target
		if ref == 0 {
			ref = o.a.hwnd
		}
		m, _, _ := pMonitorFromWindow.Call(ref, 2)
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		pGetMonitorInfoW.Call(m, uintptr(unsafe.Pointer(&mi)))
		o.mon = mi.Monitor
		o.loadCalib()
	}
	o.mapOpen = false
	o.tick()
	if o.shown {
		o.render()
	}
}

func (o *overlay) setMode(m string) {
	if m != "auto" && m != "key" && m != "always" {
		m = "auto"
	}
	o.mode = m
	o.follow = m == "key"
	ms := uintptr(400)
	if o.follow {
		ms = 60
	}
	pSetTimer.Call(o.hwnd, 1, ms, 0)
	if m != "auto" {
		o.autoSeen = false
	}
}

func (o *overlay) startAdjust() {
	if !o.on {
		o.setOn(true)
	}
	o.adjust = true
	o.saved = o.cur
	o.pick = -1
	o.pairs = nil
	ex, _, _ := pGetWindowLongPtrW.Call(o.hwnd, gwlExStyle)
	pSetWindowLongPtrW.Call(o.hwnd, gwlExStyle, (ex&^(wsExTransp|wsExNoAct))|wsExLayered)
	o.render()
	pShowWindow.Call(o.hwnd, swShow)
	o.shown = true
	pSetWindowPos.Call(o.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize)
	pSetForegroundWindow.Call(o.hwnd)
}

func (o *overlay) startSelect() {
	o.selecting = true
	o.startAdjust()
}

func (o *overlay) finishSelect() {
	x0, y0 := math.Min(float64(o.downX), float64(o.lx)), math.Min(float64(o.downY), float64(o.ly))
	x1, y1 := math.Max(float64(o.downX), float64(o.lx)), math.Max(float64(o.downY), float64(o.ly))
	w, h := float64(o.bw), float64(o.bh)
	if x1-x0 > 40 && y1-y0 > 30 && w > 0 && h > 0 {
		b, _ := json.Marshal([]float64{x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h})
		js := o.selectFor
		if js == "" {
			js = "A2Chat"
		}
		o.a.w.Eval("window." + js + " && " + js + ".area(" + string(b) + ")")
	}
	o.endAdjust(false)
}

func (o *overlay) endAdjust(keep bool) {
	if !o.adjust {
		return
	}
	if o.selecting {
		o.selecting = false
		keep = false
	}
	o.adjust = false
	o.dragging = false
	pReleaseCapture.Call()
	if !keep {
		o.cur = o.saved
	} else {
		o.calib[o.key()] = o.cur
		b, _ := json.Marshal(map[string]interface{}{"key": o.key(), "s": o.cur.S, "tx": o.cur.Tx, "ty": o.cur.Ty})
		o.a.w.Eval("window.A2Overlay && A2Overlay.saved(" + string(b) + ")")
	}
	ex, _, _ := pGetWindowLongPtrW.Call(o.hwnd, gwlExStyle)
	pSetWindowLongPtrW.Call(o.hwnd, gwlExStyle, ex|wsExTransp|wsExNoAct|wsExLayered)
	if o.target != 0 {
		pSetForegroundWindow.Call(o.target)
	}
	o.render()
	o.a.w.Eval("window.A2Overlay && A2Overlay.hostState(" + boolJS(o.on) + ",false)")
}

// данные от интерфейса
type ovIn struct {
	On     *bool                `json:"on"`
	Title  *string              `json:"title"`
	Pts    [][]interface{}      `json:"pts"`
	Ref    [][]interface{}      `json:"ref"`
	Calib  map[string][]float64 `json:"calib"`
	Follow *bool                `json:"follow"`
	Mode   string               `json:"mode"`
	Routes [][][]float64        `json:"routes"`
	Tip    *tipIn               `json:"tip"`
	Tips   *bool                `json:"tips"`
	Icons  map[string]struct {
		W, H int
		D    string
	} `json:"icons"`
	MapKey   string    `json:"mapKey"`
	Adjust   *bool     `json:"adjust"`
	Select   bool      `json:"selectChat"`
	Chat     []float64 `json:"chat"`
	ChatOn   *bool     `json:"chatOn"`
	SelectCb bool      `json:"selectCombat"`
	Combat   []float64 `json:"combat"`
	CombatOn *bool     `json:"combatOn"`
	Ping     *bool     `json:"ping"`
	PingPin  *string   `json:"pingPin"`
	Reset    bool      `json:"reset"`
}

func parsePts(in [][]interface{}) []ovPt {
	out := make([]ovPt, 0, len(in))
	for _, r := range in {
		if len(r) < 2 {
			continue
		}
		p := ovPt{Col: 0xffd36b, Shape: "dot"}
		p.X, _ = r[0].(float64)
		p.Y, _ = r[1].(float64)
		if len(r) > 2 {
			if s, ok := r[2].(string); ok {
				if v, err := strconv.ParseUint(strings.TrimPrefix(s, "#"), 16, 32); err == nil {
					p.Col = uint32(v)
				}
			}
		}
		if len(r) > 3 {
			p.Shape, _ = r[3].(string)
		}
		if len(r) > 4 {
			p.Label, _ = r[4].(string)
		}
		if len(r) > 5 {
			p.Big, _ = r[5].(bool)
		}
		if len(r) > 6 {
			p.ID, _ = r[6].(string)
		}
		out = append(out, p)
	}
	return out
}

func (o *overlay) apply(js string) bool {
	var in ovIn
	if json.Unmarshal([]byte(js), &in) != nil {
		return false
	}
	if in.Calib != nil {
		for k, v := range in.Calib {
			if len(v) == 3 && v[0] > 0 {
				o.calib[k] = ovCalib{v[0], v[1], v[2]}
			}
		}
	}
	if in.Tip != nil {
		o.showTip(*in.Tip)
		return o.on
	}
	if in.Tips != nil {
		o.tipsOff = !*in.Tips
		if o.tipsOff {
			o.hideTip()
		}
	}
	if len(in.Icons) > 0 {
		if o.icons == nil {
			o.icons = map[string]*sprite{}
		}
		for k, v := range in.Icons {
			b, err := base64.StdEncoding.DecodeString(v.D)
			if err != nil || len(b) != v.W*v.H*4 || v.W <= 0 || v.W > 256 {
				continue
			}
			sp := &sprite{w: v.W, h: v.H, px: make([]uint32, v.W*v.H)}
			for i := range sp.px {
				sp.px[i] = uint32(b[i*4]) | uint32(b[i*4+1])<<8 | uint32(b[i*4+2])<<16 | uint32(b[i*4+3])<<24
			}
			o.icons[k] = sp
		}
	}
	if in.Pts != nil {
		o.pts = parsePts(in.Pts)
	}
	if in.Ref != nil {
		o.ref = parsePts(in.Ref)
	}
	if in.Title != nil {
		o.title = *in.Title
	}
	if in.MapKey != "" {
		k := strings.ToUpper(in.MapKey)
		if len(k) == 1 && ((k[0] >= 'A' && k[0] <= 'Z') || (k[0] >= '0' && k[0] <= '9')) {
			o.mapKey = uintptr(k[0])
		} else if k == "TAB" {
			o.mapKey = 0x09
		}
	}
	if in.Mode != "" {
		o.setMode(in.Mode)
	} else if in.Follow != nil && *in.Follow {
		o.setMode("key")
	}
	if in.Routes != nil {
		o.routes = nil
		for _, r := range in.Routes {
			var rt [][2]float64
			for _, p := range r {
				if len(p) >= 2 {
					rt = append(rt, [2]float64{p[0], p[1]})
				}
			}
			if len(rt) > 1 {
				o.routes = append(o.routes, rt)
			}
		}
	}
	if in.Reset && o.mon.R != 0 {
		delete(o.calib, o.key())
		o.loadCalib()
	}
	ovLog("от интерфейса: вкл %v, режим %q, точек %d, выравнивание %v", in.On != nil && *in.On, in.Mode, len(in.Pts), in.Adjust != nil)
	if in.On != nil && *in.On != o.on {
		o.setOn(*in.On)
	} else if o.shown {
		if in.Reset || in.Pts != nil || in.Routes != nil || len(in.Icons) > 0 {
			o.render()
		}
	}
	if in.Chat != nil && len(in.Chat) == 4 {
		chatOCR.setArea(in.Chat)
	}
	if in.ChatOn != nil {
		chatOCR.enable(o, *in.ChatOn)
	}
	if in.Combat != nil && len(in.Combat) == 4 {
		combatOCR.setArea(in.Combat)
	}
	if in.CombatOn != nil {
		combatOCR.enable(o, *in.CombatOn)
	}
	if in.PingPin != nil {
		pinger.setPin(*in.PingPin)
	}
	if in.Ping != nil {
		pinger.enable(o, *in.Ping)
	}
	if in.Select || in.SelectCb {
		o.selectFor = "A2Chat"
		if in.SelectCb {
			o.selectFor = "A2Combat"
		}
		o.startSelect()
	}
	if in.Adjust != nil {
		if *in.Adjust {
			o.startAdjust()
		} else {
			o.endAdjust(true)
		}
	}
	return o.on
}

func (o *overlay) toggle() {
	o.setOn(!o.on)
	o.a.w.Eval("window.A2Overlay && A2Overlay.hostState(" + boolJS(o.on) + "," + boolJS(o.adjust) + ")")
}

// линия со сглаживанием (штампуем круги)
func (o *overlay) line(x0, y0, x1, y1, w float64, col uint32, a float64) {
	d := math.Hypot(x1-x0, y1-y0)
	n := int(d/1.5) + 1
	if n > 6000 {
		return
	}
	for i := 0; i <= n; i += 2 {
		t := float64(i) / float64(n)
		o.disc(x0+(x1-x0)*t, y0+(y1-y0)*t, w/2, col, a*.6)
	}
}

// ---------- выравнивание по двум статуям ----------
func (o *overlay) clickAlign(x, y float64) {
	if o.pick < 0 {
		bi, bd := -1, 32.0*32.0
		for i, p := range o.ref {
			sx, sy := o.toScreen(p.X, p.Y)
			if d := (sx-x)*(sx-x) + (sy-y)*(sy-y); d < bd {
				bi, bd = i, d
			}
		}
		o.pick = bi
		return
	}
	p := o.ref[o.pick]
	o.pick = -1
	o.pairs = append(o.pairs, [4]float64{p.X, p.Y, x, y})
	if len(o.pairs) == 1 {
		o.cur.Tx = x - p.X*o.cur.S
		o.cur.Ty = y - p.Y*o.cur.S
		return
	}
	a, b := o.pairs[len(o.pairs)-2], o.pairs[len(o.pairs)-1]
	dm := math.Hypot(a[0]-b[0], a[1]-b[1])
	if dm < 20 {
		return
	}
	s := math.Hypot(a[2]-b[2], a[3]-b[3]) / dm
	if s <= 0 {
		return
	}
	o.cur.S = s
	o.cur.Tx = ((a[2] - a[0]*s) + (b[2] - b[0]*s)) / 2
	o.cur.Ty = ((a[3] - a[1]*s) + (b[3] - b[1]*s)) / 2
}

// ---------- «взято»: точка под курсором ----------
func (o *overlay) markTaken() {
	if !o.shown || len(o.pts) == 0 {
		return
	}
	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	x, y := float64(p.X-o.mon.L), float64(p.Y-o.mon.T)
	bi, bd := -1, 30.0*30.0
	for i, q := range o.pts {
		if q.ID == "" {
			continue
		}
		sx, sy := o.toScreen(q.X, q.Y)
		if d := (sx-x)*(sx-x) + (sy-y)*(sy-y); d < bd {
			bi, bd = i, d
		}
	}
	if bi < 0 {
		pMessageBeep.Call(0x10)
		return
	}
	id := o.pts[bi].ID
	o.pts = append(o.pts[:bi], o.pts[bi+1:]...)
	o.render()
	b, _ := json.Marshal(id)
	o.a.w.Eval("window.A2Overlay && A2Overlay.taken(" + string(b) + ")")
}

// ---------- автоопределение карты на экране ----------
type capBuf struct {
	mdc, dib, bits uintptr
	w, h           int32
}

// grabSmall — снимок окна сразу уменьшенный до w×h (сжимает Windows, это быстро)
func (c *capBuf) grabSmall(r rect, w, h int) (mapfind.Gray, bool) {
	if r.R <= r.L || r.B <= r.T || w <= 0 || h <= 0 {
		return mapfind.Gray{}, false
	}
	if c.dib == 0 || c.w != int32(w) || c.h != int32(h) {
		if c.dib != 0 {
			pDeleteObject.Call(c.dib)
			pDeleteDC.Call(c.mdc)
		}
		sdc, _, _ := pGetDC.Call(0)
		c.mdc, _, _ = pCreateCompatibleDC.Call(sdc)
		pReleaseDC.Call(0, sdc)
		bi := bitmapInfoHeader{Width: int32(w), Height: -int32(h), Planes: 1, BitCount: 32}
		bi.Size = uint32(unsafe.Sizeof(bi))
		var buf [unsafe.Sizeof(bitmapInfoHeader{}) + 4]byte
		*(*bitmapInfoHeader)(unsafe.Pointer(&buf[0])) = bi
		c.dib, _, _ = pCreateDIBSection.Call(c.mdc, uintptr(unsafe.Pointer(&buf[0])), 0, uintptr(unsafe.Pointer(&c.bits)), 0, 0)
		if c.dib == 0 {
			return mapfind.Gray{}, false
		}
		pSelectObject.Call(c.mdc, c.dib)
		pSetStretchBltMode.Call(c.mdc, 4) // HALFTONE — честное усреднение
		pSetBrushOrgEx.Call(c.mdc, 0, 0, 0)
		c.w, c.h = int32(w), int32(h)
	}
	sdc, _, _ := pGetDC.Call(0)
	ok, _, _ := pStretchBlt.Call(c.mdc, 0, 0, uintptr(w), uintptr(h), sdc, uintptr(r.L), uintptr(r.T), uintptr(r.R-r.L), uintptr(r.B-r.T), 0x00CC0020)
	pReleaseDC.Call(0, sdc)
	if ok == 0 {
		return mapfind.Gray{}, false
	}
	pGdiFlush.Call()
	px := unsafe.Slice((*byte)(unsafe.Pointer(c.bits)), w*h*4)
	return mapfind.FromBGRA(px, w, h, w*4), true
}

func (c *capBuf) grab(r rect) (mapfind.Gray, bool) {
	w, h := r.R-r.L, r.B-r.T
	if w <= 0 || h <= 0 {
		return mapfind.Gray{}, false
	}
	if c.dib == 0 || c.w != w || c.h != h {
		if c.dib != 0 {
			pDeleteObject.Call(c.dib)
			pDeleteDC.Call(c.mdc)
		}
		sdc, _, _ := pGetDC.Call(0)
		c.mdc, _, _ = pCreateCompatibleDC.Call(sdc)
		pReleaseDC.Call(0, sdc)
		bi := bitmapInfoHeader{Width: w, Height: -h, Planes: 1, BitCount: 32}
		bi.Size = uint32(unsafe.Sizeof(bi))
		var buf [unsafe.Sizeof(bitmapInfoHeader{}) + 4]byte
		*(*bitmapInfoHeader)(unsafe.Pointer(&buf[0])) = bi
		c.dib, _, _ = pCreateDIBSection.Call(c.mdc, uintptr(unsafe.Pointer(&buf[0])), 0, uintptr(unsafe.Pointer(&c.bits)), 0, 0)
		if c.dib == 0 {
			return mapfind.Gray{}, false
		}
		pSelectObject.Call(c.mdc, c.dib)
		c.w, c.h = w, h
	}
	sdc, _, _ := pGetDC.Call(0)
	ok, _, _ := pBitBlt.Call(c.mdc, 0, 0, uintptr(w), uintptr(h), sdc, uintptr(r.L), uintptr(r.T), 0x00CC0020) // SRCCOPY, без CAPTUREBLT
	pReleaseDC.Call(0, sdc)
	if ok == 0 {
		return mapfind.Gray{}, false
	}
	pGdiFlush.Call()
	px := unsafe.Slice((*byte)(unsafe.Pointer(c.bits)), int(w)*int(h)*4)
	return mapfind.FromBGRA(px, int(w), int(h), int(w)*4), true
}

// снимок для настройки: через delay секунд сохранить экран игры в цветной PNG (в папку exports)
func (o *overlay) snapshot(dir string, delay int) {
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		time.Sleep(time.Duration(delay) * time.Second)
		fg, _, _ := pGetForegroundWindow.Call()
		m, _, _ := pMonitorFromWindow.Call(fg, 2)
		mi := monitorInfo{Size: uint32(unsafe.Sizeof(monitorInfo{}))}
		pGetMonitorInfoW.Call(m, uintptr(unsafe.Pointer(&mi)))
		r := mi.Monitor
		var cb capBuf
		if _, ok := cb.grab(r); !ok {
			return
		}
		w, h := int(cb.w), int(cb.h)
		px := unsafe.Slice((*byte)(unsafe.Pointer(cb.bits)), w*h*4)
		im := image.NewRGBA(image.Rect(0, 0, w, h))
		for i := 0; i < w*h; i++ {
			im.Pix[i*4], im.Pix[i*4+1], im.Pix[i*4+2], im.Pix[i*4+3] = px[i*4+2], px[i*4+1], px[i*4], 255
		}
		os.MkdirAll(dir, 0o755)
		p := filepath.Join(dir, "снимок-экрана-"+time.Now().Format("150405")+".png")
		f, err := os.Create(p)
		if err != nil {
			return
		}
		png.Encode(f, im)
		f.Close()
		b, _ := json.Marshal(p)
		a := o.a
		a.w.Dispatch(func() { a.w.Eval("window.A2Overlay && A2Overlay.snapped(" + string(b) + ")") })
	}()
}

func (o *overlay) watch() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	t0 := time.Now()
	n := mapfind.Prepare()
	ovLog("база точек карты: %d за %v", n, time.Since(t0).Round(time.Millisecond))
	var cb, cbs capBuf
	var prevThumb []float32
	var lastT *mapfind.Transform
	var prevSmall mapfind.Gray
	forceFull, moved, still := false, false, 0
	var gainSp, gainSc float64
	misses := 0
	busy := 0
	ovLog("поиск карты запущен")
	defer ovLog("поиск карты остановлен")
	for {
		o.mu.Lock()
		on, mode, fg, mon, excl, hint, gr := o.on, o.mode, o.gameFg, o.mon, o.excl, o.hint, o.gameRect
		if o.recheck && fg {
			o.recheck = false
			forceFull = true
		}
		o.mu.Unlock()
		if !on || mode != "auto" {
			o.mu.Lock()
			o.watching = false
			o.mu.Unlock()
			return
		}
		if !fg || mon.R == 0 {
			prevSmall = mapfind.Gray{}
			time.Sleep(150 * time.Millisecond)
			continue
		}
		// снимаем только окно игры (без рамки), координаты потом переводим в координаты монитора
		if gr.R <= gr.L || gr.B <= gr.T {
			gr = mon
		}
		dx, dy := float64(gr.L-mon.L), float64(gr.T-mon.T)
		// карта найдена — быстро следим за сдвигом по маленьким кадрам (десятки раз в секунду);
		// полный поиск — только если поменялся масштаб, карту закрыли или после остановки (уточнить)
		if hint != nil && !forceFull {
			sw := 480
			sh := int(float64(gr.B-gr.T) * float64(sw) / float64(gr.R-gr.L))
			if sg, ok := cbs.grabSmall(gr, sw, sh); ok {
				cx0, cy0 := int(float64(sw)*0.19), int(float64(sh)*0.09)
				cw, ch := int(float64(sw)*0.94)-cx0, sh-cy0-2
				cur := mapfind.Crop(sg, cx0, cy0, cw, ch)
				if prevSmall.W != cur.W || prevSmall.H != cur.H {
					prevSmall = cur
					time.Sleep(30 * time.Millisecond)
					continue
				}
				ddx, ddy, peak := mapfind.PhaseShift(prevSmall, cur)
				o.mu.Lock()
				dragOn, dragEnded := o.dragOn, o.dragEnded
				ax, ay := o.accX, o.accY
				o.accX, o.accY = 0, 0
				if dragEnded {
					o.dragEnded = false
				}
				o.mu.Unlock()
				if dragOn || dragEnded {
					// карту тащат мышью — точки уже двигает курсор; здесь только сверяем,
					// один ли к одному карта едет за мышью (подстраиваем коэффициент)
					if peak >= 0.18 {
						kk := float64(gr.R-gr.L) / float64(sw)
						px, py := ddx*kk, ddy*kk
						gainSp += px*ax + py*ay
						gainSc += ax*ax + ay*ay
					}
					if dragEnded && gainSc > 900 {
						g := gainSp / gainSc
						if g > 0.3 && g < 3 {
							o.mu.Lock()
							o.dragGain = o.dragGain*0.5 + g*0.5
							ovLog("карта едет за мышью с коэффициентом %.3f (итог %.3f)", g, o.dragGain)
							o.mu.Unlock()
						}
						gainSp, gainSc = 0, 0
					}
					prevSmall = cur
					still, moved = 0, true
					time.Sleep(8 * time.Millisecond)
					continue
				}
				if peak >= 0.18 && math.Abs(ddx) < float64(cw)/3 && math.Abs(ddy) < float64(ch)/3 {
					prevSmall = cur
					if math.Abs(ddx)+math.Abs(ddy) > 0.15 {
						kk := float64(gr.R-gr.L) / float64(sw)
						t := *hint
						t.Tx += ddx * kk
						t.Ty += ddy * kk
						h := t
						o.mu.Lock()
						o.res, o.resOK, o.hint = t, true, &h
						o.mu.Unlock()
						lastT = &h
						pPostMessageW.Call(o.hwnd, wmAuto, 0, 0)
						still, moved = 0, true
						time.Sleep(10 * time.Millisecond)
						continue
					}
					still++
					if moved && still >= 6 { // карту отпустили — уточняем полным поиском
						moved = false
						forceFull = true
					} else {
						time.Sleep(60 * time.Millisecond)
						continue
					}
				} else {
					forceFull = true // масштаб изменился или карту закрыли
				}
			}
		}
		forceFull = false
		prevSmall = mapfind.Gray{}
		g, ok := cb.grab(gr)
		if !ok {
			time.Sleep(time.Second)
			continue
		}
		// чёрный снимок: игра в эксклюзивном полноэкранном режиме
		var sum, sum2 float64
		for i := 0; i < len(g.P); i += 97 {
			v := float64(g.P[i])
			sum += v
			sum2 += v * v
		}
		cnt := float64(len(g.P)/97 + 1)
		black := sum/cnt < 3 && sum2/cnt < 20
		// пока карта не найдена, ищем только на «спокойном» экране: карта игры неподвижна,
		// а в бою картинка всё время меняется — так не тратим процессор во время игры
		th := mapfind.Resize(g, 48, 27)
		static := true
		if hint == nil && prevThumb != nil {
			var d float64
			for i := range th.P {
				d += math.Abs(float64(th.P[i] - prevThumb[i]))
			}
			static = d/float64(len(th.P)) < 4
		}
		prevThumb = th.P
		if hint == nil && !static && !black {
			if busy++; busy%25 == 1 {
				ovLog("экран меняется — жду спокойный кадр (пропущено %d)", busy)
			}
			time.Sleep(450 * time.Millisecond)
			continue
		}
		k := 1.0
		if g.W > 1920 {
			k = float64(g.W) / 1920
			g = mapfind.Resize(g, 1920, int(float64(g.H)/k))
		}
		ex := rect{excl.L - gr.L, excl.T - gr.T, excl.R - gr.L, excl.B - gr.T}
		GW, GH := float64(gr.R-gr.L), float64(gr.B-gr.T)
		opt := mapfind.Options{Mask: func(x, y float64) bool {
			X, Y := x*k, y*k
			// интерфейс карты игры: список слева, полоса сверху, кнопки справа
			if X < GW*0.18 || Y < GH*0.075 || X > GW*0.95 {
				return false
			}
			return !(int32(X) >= ex.L && int32(X) < ex.R && int32(Y) >= ex.T && int32(Y) < ex.B)
		}}
		if hint == nil {
			hint = lastT // карта обычно открывается там же, где была
		}
		if hint != nil {
			h := mapfind.Transform{S: hint.S / k, Tx: (hint.Tx - dx) / k, Ty: (hint.Ty - dy) / k}
			opt.Hint = &h
		}
		var t mapfind.Transform
		t0 := time.Now()
		if !black {
			t = mapfind.Find(g, opt)
			t.S, t.Tx, t.Ty = t.S*k, t.Tx*k+dx, t.Ty*k+dy
		}
		if t.Valid() != (lastT != nil && misses == 0) || !t.Valid() && static {
			ovLog("поиск: окно %v, снимок %dx%d, чёрный %v, спокойный %v, подсказка %v → масштаб %.3f, совпало %d из %d, карта %v, %v",
				gr, g.W, g.H, black, static, hint != nil, t.S, t.Inliers, t.Matches, t.Valid(), time.Since(t0).Round(time.Millisecond))
		}
		if !t.Valid() && static {
			debugShot(g, "карта не найдена")
		}
		o.mu.Lock()
		o.res, o.resOK, o.capBlack = t, t.Valid(), black
		if t.Valid() {
			h := t
			o.hint = &h
			lastT = &h
			misses = 0
		} else {
			forceFull = true // не нашли — следующий раз снова полный поиск, а не слежение
			if misses++; misses >= 3 {
				o.hint = nil // карту закрыли: дальше снова ждём спокойный экран
				forceFull = false
			}
		}
		o.mu.Unlock()
		pPostMessageW.Call(o.hwnd, wmAuto, 0, 0)
		switch {
		case t.Valid():
			time.Sleep(20 * time.Millisecond)
		case forceFull:
			time.Sleep(200 * time.Millisecond) // карта была — быстро перепроверяем
		default:
			time.Sleep(650 * time.Millisecond)
		}
	}
}

// результат поиска пришёл (в потоке окна)
func (o *overlay) onAuto() {
	o.mu.Lock()
	t, ok, black := o.res, o.resOK, o.capBlack
	o.mu.Unlock()
	if black && !o.capBlackSaid {
		o.capBlackSaid = true
		o.a.w.Eval("window.A2Overlay && A2Overlay.autoState('black')")
	}
	if o.mode != "auto" || o.adjust {
		return
	}
	was := o.autoSeen
	if ok {
		o.autoMiss = 0
		moved := math.Abs(t.S-o.cur.S)/math.Max(o.cur.S, 1e-6) > 0.002 || math.Abs(t.Tx-o.cur.Tx) > 0.7 || math.Abs(t.Ty-o.cur.Ty) > 0.7
		o.cur = ovCalib{t.S, t.Tx, t.Ty}
		o.autoSeen = true
		if o.shown && moved {
			o.place()
		}
	} else {
		o.autoMiss++
		if o.autoMiss >= 2 {
			o.autoSeen = false
		}
	}
	if was != o.autoSeen {
		o.mu.Lock()
		o.seenMT = o.autoSeen
		o.mu.Unlock()
		o.tick()
		if o.autoSeen {
			o.render()
		}
		o.a.w.Eval("window.A2Overlay && A2Overlay.autoState(" + boolJS(o.autoSeen) + ")")
	}
}

// точка попадает на интерфейс карты игры (список слева, полоса сверху, кнопки справа)
func (o *overlay) inUI(x, y float64) bool {
	if o.adjust || o.mode != "auto" {
		return false
	}
	g := o.gameRect
	if g.R <= g.L {
		g = o.mon
	}
	gx, gy := x-float64(g.L-o.mon.L), y-float64(g.T-o.mon.T)
	w, h := float64(g.R-g.L), float64(g.B-g.T)
	return gx < w*0.17 || gy < h*0.07 || gx > w*0.955 || gx > w || gy > h || gx < 0 || gy < 0
}

// окно игры: AION 2 на Unreal Engine (класс UnrealWindow) или в заголовке есть AION
func (o *overlay) isGame(h uintptr) bool {
	if h == o.gameH {
		return true
	}
	t, c := winText(h)
	if c == "UnrealWindow" || strings.Contains(strings.ToUpper(t), "AION") && !strings.Contains(t, "помощник") && !strings.Contains(t, "Helper") {
		o.gameH = h
		return true
	}
	return false
}

// прямоугольник окна игры на экране (клиентская часть); если игра не найдена — пустой
func (o *overlay) gameClientRect() rect {
	hw, _, _ := pGetForegroundWindow.Call()
	if hw == 0 || !o.isGame(hw) {
		cls, _ := windows.UTF16PtrFromString("UnrealWindow")
		hw, _, _ = pFindWindowW.Call(uintptr(unsafe.Pointer(cls)), 0)
	}
	if hw == 0 {
		return rect{}
	}
	var cr rect
	pGetClientRect.Call(hw, uintptr(unsafe.Pointer(&cr)))
	p0 := point{0, 0}
	pClientToScreen.Call(hw, uintptr(unsafe.Pointer(&p0)))
	return rect{p0.X, p0.Y, p0.X + cr.R, p0.Y + cr.B}
}
