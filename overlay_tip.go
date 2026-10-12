// Подсказка при наведении на точку поверх игры и плавное движение точек за мышью,
// пока карту тащат. Всё пассивно: читаем только положение курсора и состояние кнопки мыши.
package main

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	wmShift      = 0x8000 + 21 // сдвиг от мыши (перетаскивание карты)
	timerHover   = 3
	hoverDelayMs = 220
)

type tipLine struct {
	T    string `json:"t"`
	C    string `json:"c"`
	B    int    `json:"b"`
	Wrap int    `json:"wrap"`
}

type tipIn struct {
	ID    string    `json:"id"`
	Title string    `json:"title"`
	Color string    `json:"color"`
	Lines []tipLine `json:"lines"`
}

type tipWin struct {
	hwnd           uintptr
	mdc, dib, bits uintptr
	w, h           int32
	shown          bool
	id             string
	ax, ay         int32 // где курсор был, когда показали
}

func hexCol(s string, def uint32) uint32 {
	if v, err := strconv.ParseUint(strings.TrimPrefix(s, "#"), 16, 32); err == nil {
		return uint32(v)
	}
	return def
}

func (o *overlay) initTip() {
	hinst, _, _ := pGetModuleHandleW.Call(0)
	title, _ := windows.UTF16PtrFromString("AION 2 · подсказка")
	o.tip.hwnd, _, _ = pCreateWindowExW.Call(wsExLayered|wsExTransp|wsExTopmost|wsExToolWin|wsExNoAct,
		uintptr(unsafe.Pointer(ovClassName)), uintptr(unsafe.Pointer(title)), wsPopup, 0, 0, 10, 10, 0, 0, hinst, 0)
	pSetWindowDisplayAffinity.Call(o.tip.hwnd, 0x11)
	face, _ := windows.UTF16PtrFromString("Segoe UI")
	o.tipFont, _, _ = pCreateFontW.Call(uintptr(negI(15)), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 4, 0, uintptr(unsafe.Pointer(face)))
	o.tipFontB, _, _ = pCreateFontW.Call(uintptr(negI(15)), 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 4, 0, uintptr(unsafe.Pointer(face)))
	o.tipFontT, _, _ = pCreateFontW.Call(uintptr(negI(18)), 0, 0, 0, 700, 0, 0, 0, 1, 0, 0, 4, 0, uintptr(unsafe.Pointer(face)))
}

func (o *overlay) hideTip() {
	if o.tip.shown {
		pShowWindow.Call(o.tip.hwnd, swHide)
		o.tip.shown = false
	}
	o.tip.id = ""
}

// раз в 40 мс, пока видны точки: курсор замер над точкой — просим у интерфейса описание
func (o *overlay) hoverTick() {
	if !o.shown || o.adjust || o.tipsOff {
		o.hideTip()
		return
	}
	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	if keyDown(1) || keyDown(2) {
		o.hideTip()
		o.hoverAt = time.Time{}
		return
	}
	if p != o.hoverPos {
		o.hoverPos = p
		o.hoverAt = time.Now()
		if o.tip.shown && (abs32i(p.X-o.tip.ax) > 8 || abs32i(p.Y-o.tip.ay) > 8) {
			o.hideTip()
		}
		return
	}
	if o.tip.shown || o.hoverAt.IsZero() || time.Since(o.hoverAt) < hoverDelayMs*time.Millisecond {
		return
	}
	x, y := float64(p.X-o.mon.L), float64(p.Y-o.mon.T)
	if o.inUI(x, y) {
		return
	}
	bi, bd := -1, 0.0
	for i, q := range o.pts {
		if q.ID == "" {
			continue
		}
		sx, sy := o.toScreen(q.X, q.Y)
		r := 11.0
		if sp := o.icons[q.Shape]; sp != nil {
			r = float64(sp.w)/2 + 3
		}
		d := (sx-x)*(sx-x) + (sy-y)*(sy-y)
		if d <= r*r && (bi < 0 || d < bd) {
			bi, bd = i, d
		}
	}
	if bi < 0 {
		o.hoverAt = time.Time{} // не над точкой — ждём следующего движения
		return
	}
	id := o.pts[bi].ID
	o.tip.id, o.tip.ax, o.tip.ay = id, p.X, p.Y
	b, _ := json.Marshal(id)
	o.a.w.Eval("window.A2Overlay && A2Overlay.tip(" + string(b) + ")")
}

func abs32i(v int32) int32 {
	if v < 0 {
		return -v
	}
	return v
}

// перенос длинной строки по ширине
func (o *overlay) wrapLine(s string, font uintptr, maxW int) []string {
	pSelectObject.Call(o.tip.mdc, font)
	words := strings.Fields(s)
	var out []string
	cur := ""
	for _, w := range words {
		try := w
		if cur != "" {
			try = cur + " " + w
		}
		if o.textW(try) > maxW && cur != "" {
			out = append(out, cur)
			cur = w
		} else {
			cur = try
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func (o *overlay) textW(s string) int {
	u, _ := windows.UTF16FromString(s)
	var sz sizeT
	pGetTextExtentPoint32W.Call(o.tip.mdc, uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(&sz)))
	return int(sz.CX)
}

func (o *overlay) showTip(t tipIn) {
	if t.ID != o.tip.id || !o.shown {
		return // курсор уже ушёл
	}
	if o.tip.mdc == 0 {
		sdc, _, _ := pGetDC.Call(0)
		o.tip.mdc, _, _ = pCreateCompatibleDC.Call(sdc)
		pReleaseDC.Call(0, sdc)
	}
	type row struct {
		s    string
		col  uint32
		font uintptr
		h    int
	}
	accent := hexCol(t.Color, 0xc9a063)
	rows := []row{{t.Title, accent, o.tipFontT, 24}}
	const maxW = 380
	for _, l := range t.Lines {
		f := o.tipFont
		if l.B != 0 {
			f = o.tipFontB
		}
		parts := []string{l.T}
		if l.Wrap != 0 || o.textWWith(l.T, f) > maxW {
			parts = o.wrapLine(l.T, f, maxW)
		}
		for _, s := range parts {
			rows = append(rows, row{s, hexCol(l.C, 0xece6d6), f, 20})
		}
	}
	w, h := 0, 12
	for _, r := range rows {
		if tw := o.textWWith(r.s, r.font); tw > w {
			w = tw
		}
		h += r.h
	}
	w += 30
	h += 8
	// буфер
	if o.tip.dib == 0 || int(o.tip.w) != w || int(o.tip.h) != h {
		if o.tip.dib != 0 {
			pDeleteObject.Call(o.tip.dib)
		}
		bi := bitmapInfoHeader{Width: int32(w), Height: -int32(h), Planes: 1, BitCount: 32}
		bi.Size = uint32(unsafe.Sizeof(bi))
		var buf [unsafe.Sizeof(bitmapInfoHeader{}) + 4]byte
		*(*bitmapInfoHeader)(unsafe.Pointer(&buf[0])) = bi
		o.tip.dib, _, _ = pCreateDIBSection.Call(o.tip.mdc, uintptr(unsafe.Pointer(&buf[0])), 0, uintptr(unsafe.Pointer(&o.tip.bits)), 0, 0)
		if o.tip.dib == 0 {
			return
		}
		pSelectObject.Call(o.tip.mdc, o.tip.dib)
		o.tip.w, o.tip.h = int32(w), int32(h)
	}
	px := unsafe.Slice((*uint32)(unsafe.Pointer(o.tip.bits)), w*h)
	const rad = 9.0
	inside := func(x, y int) float64 { // покрытие скруглённого прямоугольника
		fx, fy := float64(x)+.5, float64(y)+.5
		cx := math.Max(rad, math.Min(float64(w)-rad, fx))
		cy := math.Max(rad, math.Min(float64(h)-rad, fy))
		d := math.Hypot(fx-cx, fy-cy)
		return math.Max(0, math.Min(1, rad+.5-d))
	}
	bg := uint32(0x0e1613)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			c := bg
			if x < 4 {
				c = accent // цветная полоска слева
			}
			px[y*w+x] = 0xff000000 | c
		}
	}
	// рамка
	for x := 0; x < w; x++ {
		px[x] = 0xff000000 | 0x8a6a3a
		px[(h-1)*w+x] = 0xff000000 | 0x8a6a3a
	}
	for y := 0; y < h; y++ {
		px[y*w+w-1] = 0xff000000 | 0x8a6a3a
	}
	pGdiFlush.Call()
	pSetBkMode.Call(o.tip.mdc, 1)
	yy := 8
	for _, r := range rows {
		pSelectObject.Call(o.tip.mdc, r.font)
		pSetTextColor.Call(o.tip.mdc, uintptr(((r.col&255)<<16)|(r.col&0xff00)|((r.col>>16)&255)))
		u, _ := windows.UTF16FromString(r.s)
		pTextOutW.Call(o.tip.mdc, 16, uintptr(yy), uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1))
		yy += r.h
	}
	pGdiFlush.Call()
	// альфа: GDI её обнуляет — восстанавливаем по форме скруглённой рамки (premultiplied)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			cov := inside(x, y) * 0.96
			v := px[y*w+x] & 0xffffff
			r, g, b := float64((v>>16)&255)*cov, float64((v>>8)&255)*cov, float64(v&255)*cov
			px[y*w+x] = uint32(255*cov)<<24 | uint32(r)<<16 | uint32(g)<<8 | uint32(b)
		}
	}
	// место: справа снизу от курсора, у краёв — с другой стороны
	x0, y0 := o.tip.ax+18, o.tip.ay+20
	if x0+int32(w) > o.mon.R-8 {
		x0 = o.tip.ax - int32(w) - 14
	}
	if y0+int32(h) > o.mon.B-8 {
		y0 = o.tip.ay - int32(h) - 14
	}
	sdc, _, _ := pGetDC.Call(0)
	dst := point{x0, y0}
	sz := sizeT{int32(w), int32(h)}
	src := point{0, 0}
	bf := blendFunc{0, 0, 255, 1}
	pUpdateLayeredWindow.Call(o.tip.hwnd, sdc, uintptr(unsafe.Pointer(&dst)), uintptr(unsafe.Pointer(&sz)), o.tip.mdc,
		uintptr(unsafe.Pointer(&src)), 0, uintptr(unsafe.Pointer(&bf)), ulwAlpha)
	pReleaseDC.Call(0, sdc)
	pShowWindow.Call(o.tip.hwnd, swShowNoAct)
	pSetWindowPos.Call(o.tip.hwnd, hwndTopmost, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
	o.tip.shown = true
}

func (o *overlay) textWWith(s string, font uintptr) int {
	pSelectObject.Call(o.tip.mdc, font)
	return o.textW(s)
}

// ---------- мышь: карту тащат — двигаем точки сразу за курсором ----------
func (o *overlay) mouseLoop() {
	dragging := false
	var last point
	for {
		o.mu.Lock()
		run := o.on && o.mode == "auto" && o.gameFg && o.seenMT
		gain := o.dragGain
		gr, mon := o.gameRect, o.mon
		o.mu.Unlock()
		if !o.watching {
			return
		}
		if !run {
			if dragging {
				dragging = false
				o.mu.Lock()
				o.dragOn, o.dragEnded = false, true
				o.mu.Unlock()
			}
			time.Sleep(60 * time.Millisecond)
			continue
		}
		var p point
		pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
		down := keyDown(1)
		switch {
		case down && !dragging:
			// начали тащить в области карты (не по списку слева и не по кнопкам)
			g := gr
			if g.R <= g.L {
				g = mon
			}
			fx := float64(p.X-g.L) / float64(g.R-g.L)
			fy := float64(p.Y-g.T) / float64(g.B-g.T)
			if fx > 0.19 && fx < 0.94 && fy > 0.09 && fy < 0.98 {
				dragging, last = true, p
				o.mu.Lock()
				o.dragOn = true
				o.mu.Unlock()
			}
		case down && dragging:
			dx, dy := float64(p.X-last.X), float64(p.Y-last.Y)
			last = p
			if dx != 0 || dy != 0 {
				o.mu.Lock()
				o.pendX += dx * gain
				o.pendY += dy * gain
				o.accX += dx
				o.accY += dy
				if o.hint != nil {
					h := *o.hint
					h.Tx += dx * gain
					h.Ty += dy * gain
					o.hint = &h
				}
				post := !o.shiftPosted
				o.shiftPosted = true
				o.mu.Unlock()
				if post {
					pPostMessageW.Call(o.hwnd, wmShift, 0, 0)
				}
			}
		case !down && dragging:
			dragging = false
			o.mu.Lock()
			o.dragOn, o.dragEnded = false, true
			o.mu.Unlock()
		}
		if dragging {
			time.Sleep(3 * time.Millisecond)
		} else {
			time.Sleep(12 * time.Millisecond)
		}
	}
}

// сдвиг от мыши пришёл в поток окна
func (o *overlay) onShift() {
	o.mu.Lock()
	dx, dy := o.pendX, o.pendY
	o.pendX, o.pendY = 0, 0
	o.shiftPosted = false
	o.mu.Unlock()
	if !o.autoSeen || (dx == 0 && dy == 0) {
		return
	}
	o.cur.Tx += dx
	o.cur.Ty += dy
	o.place()
}
