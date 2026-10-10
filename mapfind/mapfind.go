// Package mapfind находит карту мира на снимке экрана игры: какой кусок карты помощника
// виден, в каком масштабе и где. Чистый Go, без Windows — проверяется тестами на любой ОС.
//
// Идея: и снимок, и эталонная карта превращаются в «контуры» (модуль градиента яркости —
// он почти не зависит от оттенков и затемнения тумана войны), потом для набора масштабов
// считается нормированная корреляция с масками (Padfield 2012) через БПФ: она честно
// работает и когда на экране кусок карты, и когда вся карта меньше экрана.
package mapfind

import (
	"bytes"
	_ "embed"
	"image"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"sync"
)

//go:embed mapref.jpg
var refJPG []byte

// MapSize — сторона карты помощника в её пикселях (как в mapdata.js).
const MapSize = 8192.0

// Gray — одноканальное изображение.
type Gray struct {
	W, H int
	P    []float32
}

func NewGray(w, h int) Gray { return Gray{w, h, make([]float32, w*h)} }

// FromBGRA — снимок экрана (32 бита BGRA, строки сверху вниз) в яркость.
func FromBGRA(b []byte, w, h, stride int) Gray {
	g := NewGray(w, h)
	for y := 0; y < h; y++ {
		row := b[y*stride:]
		for x := 0; x < w; x++ {
			i := x * 4
			g.P[y*w+x] = 0.114*float32(row[i]) + 0.587*float32(row[i+1]) + 0.299*float32(row[i+2])
		}
	}
	return g
}

// Resize — усреднение по площади (уменьшение) или билинейная интерполяция (увеличение).
func Resize(s Gray, w, h int) Gray {
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	d := NewGray(w, h)
	fx, fy := float64(s.W)/float64(w), float64(s.H)/float64(h)
	if fx <= 1 && fy <= 1 {
		for y := 0; y < h; y++ {
			sy := (float64(y)+.5)*fy - .5
			y0 := int(math.Floor(sy))
			ty := float32(sy - float64(y0))
			y1 := y0 + 1
			y0, y1 = clampI(y0, s.H), clampI(y1, s.H)
			for x := 0; x < w; x++ {
				sx := (float64(x)+.5)*fx - .5
				x0 := int(math.Floor(sx))
				tx := float32(sx - float64(x0))
				x1 := x0 + 1
				x0, x1 = clampI(x0, s.W), clampI(x1, s.W)
				a := s.P[y0*s.W+x0]*(1-tx) + s.P[y0*s.W+x1]*tx
				b := s.P[y1*s.W+x0]*(1-tx) + s.P[y1*s.W+x1]*tx
				d.P[y*w+x] = a*(1-ty) + b*ty
			}
		}
		return d
	}
	// площадь: по осям раздельно
	tmp := NewGray(w, s.H)
	for y := 0; y < s.H; y++ {
		areaRow(s.P[y*s.W:(y+1)*s.W], tmp.P[y*w:(y+1)*w], fx)
	}
	col := make([]float32, s.H)
	out := make([]float32, h)
	for x := 0; x < w; x++ {
		for y := 0; y < s.H; y++ {
			col[y] = tmp.P[y*w+x]
		}
		areaRow(col, out, fy)
		for y := 0; y < h; y++ {
			d.P[y*w+x] = out[y]
		}
	}
	return d
}

func clampI(v, n int) int {
	if v < 0 {
		return 0
	}
	if v >= n {
		return n - 1
	}
	return v
}

// areaRow: src длины n → dst длины m, каждый dst — среднее отрезка шириной f=n/m
func areaRow(src, dst []float32, f float64) {
	n := len(src)
	if f <= 1 {
		for i := range dst {
			sx := (float64(i)+.5)*f - .5
			x0 := int(math.Floor(sx))
			t := float32(sx - float64(x0))
			dst[i] = src[clampI(x0, n)]*(1-t) + src[clampI(x0+1, n)]*t
		}
		return
	}
	for i := range dst {
		a, b := float64(i)*f, float64(i+1)*f
		ia, ib := int(a), int(math.Ceil(b))
		if ib > n {
			ib = n
		}
		var s, ws float64
		for j := ia; j < ib; j++ {
			w := math.Min(b, float64(j+1)) - math.Max(a, float64(j))
			if w > 0 {
				s += float64(src[j]) * w
				ws += w
			}
		}
		if ws > 0 {
			dst[i] = float32(s / ws)
		}
	}
}

// Crop — вырезать прямоугольник (с отсечением).
func Crop(s Gray, x0, y0, w, h int) Gray {
	d := NewGray(w, h)
	for y := 0; y < h; y++ {
		sy := y + y0
		if sy < 0 || sy >= s.H {
			continue
		}
		for x := 0; x < w; x++ {
			sx := x + x0
			if sx >= 0 && sx < s.W {
				d.P[y*w+x] = s.P[sy*s.W+sx]
			}
		}
	}
	return d
}

// Edges — контуры: лёгкое размытие + модуль градиента Собеля, сжатый корнем.
func Edges(g Gray) Gray {
	b := NewGray(g.W, g.H)
	w, h := g.W, g.H
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var s float32
			for dy := -1; dy <= 1; dy++ {
				yy := clampI(y+dy, h)
				for dx := -1; dx <= 1; dx++ {
					k := float32(1)
					if dx == 0 {
						k *= 2
					}
					if dy == 0 {
						k *= 2
					}
					s += k * g.P[yy*w+clampI(x+dx, w)]
				}
			}
			b.P[y*w+x] = s / 16
		}
	}
	e := NewGray(w, h)
	for y := 0; y < h; y++ {
		ym, yp := clampI(y-1, h), clampI(y+1, h)
		for x := 0; x < w; x++ {
			xm, xp := clampI(x-1, w), clampI(x+1, w)
			gx := (b.P[ym*w+xp] + 2*b.P[y*w+xp] + b.P[yp*w+xp]) - (b.P[ym*w+xm] + 2*b.P[y*w+xm] + b.P[yp*w+xm])
			gy := (b.P[yp*w+xm] + 2*b.P[yp*w+x] + b.P[yp*w+xp]) - (b.P[ym*w+xm] + 2*b.P[ym*w+x] + b.P[ym*w+xp])
			e.P[y*w+x] = float32(math.Sqrt(math.Sqrt(float64(gx*gx + gy*gy))))
		}
	}
	return e
}

// ---------- эталон: пирамида карты ----------
type pyramid struct {
	lv  []Gray    // 0 — самый подробный (4096 = карта/2)
	per []float64 // пикселей карты на пиксель уровня
}

var (
	refMu sync.Mutex
	ref   *pyramid
)

func loadRef() *pyramid {
	refMu.Lock()
	defer refMu.Unlock()
	if ref != nil {
		return ref
	}
	func() {
		im, err := jpeg.Decode(bytes.NewReader(refJPG))
		if err != nil {
			return
		}
		b := im.Bounds()
		g := NewGray(b.Dx(), b.Dy())
		if gi, ok := im.(*image.Gray); ok {
			for y := 0; y < g.H; y++ {
				for x := 0; x < g.W; x++ {
					g.P[y*g.W+x] = float32(gi.Pix[y*gi.Stride+x])
				}
			}
		} else {
			for y := 0; y < g.H; y++ {
				for x := 0; x < g.W; x++ {
					r, gg, bb, _ := im.At(b.Min.X+x, b.Min.Y+y).RGBA()
					g.P[y*g.W+x] = float32(0.299*float64(r>>8) + 0.587*float64(gg>>8) + 0.114*float64(bb>>8))
				}
			}
		}
		p := &pyramid{}
		per := MapSize / float64(g.W)
		for g.W >= 128 {
			p.lv = append(p.lv, g)
			p.per = append(p.per, per)
			g = Resize(g, g.W/2, g.H/2)
			per *= 2
		}
		ref = p
	}()
	return ref
}

// RefAt — кусок карты [mx0,my0 .. mx0+mw, my0+mh] (в пикселях карты) в размере w×h
func RefAt(mx0, my0, mw, mh float64, w, h int) Gray {
	p := loadRef()
	if p == nil {
		return NewGray(w, h)
	}
	need := mw / float64(w) // пикселей карты на пиксель результата
	li := 0
	for i := range p.lv {
		if p.per[i] <= need*1.0001 {
			li = i
		}
	}
	src := p.lv[li]
	k := 1 / p.per[li]
	x0, y0 := mx0*k, my0*k
	sw, sh := mw*k, mh*k
	// вырезаем с запасом и масштабируем
	ix, iy := int(math.Floor(x0)), int(math.Floor(y0))
	cw, ch := int(math.Ceil(x0+sw))-ix, int(math.Ceil(y0+sh))-iy
	c := Crop(src, ix, iy, cw, ch)
	// дробный сдвиг игнорируем (меньше пикселя уровня)
	return Resize(c, w, h)
}

// ---------- быстрое преобразование Фурье ----------
type fft2 struct {
	n, m int // ширина, высота (степени двойки)
	twN  []complex128
	twM  []complex128
	revN []int
	revM []int
}

func pow2(v int) int {
	n := 1
	for n < v {
		n <<= 1
	}
	return n
}

var fftCache sync.Map

func getFFT(n, m int) *fft2 {
	k := n*100000 + m
	if f, ok := fftCache.Load(k); ok {
		return f.(*fft2)
	}
	f := &fft2{n: n, m: m, twN: twiddles(n), twM: twiddles(m), revN: bitrev(n), revM: bitrev(m)}
	fftCache.Store(k, f)
	return f
}

func twiddles(n int) []complex128 {
	t := make([]complex128, n/2)
	for i := range t {
		a := -2 * math.Pi * float64(i) / float64(n)
		t[i] = complex(math.Cos(a), math.Sin(a))
	}
	return t
}

func bitrev(n int) []int {
	r := make([]int, n)
	bits := 0
	for 1<<bits < n {
		bits++
	}
	for i := range r {
		v, x := 0, i
		for b := 0; b < bits; b++ {
			v = v<<1 | x&1
			x >>= 1
		}
		r[i] = v
	}
	return r
}

func fft1(a []complex128, tw []complex128, rev []int, inv bool) {
	n := len(a)
	for i, j := range rev {
		if i < j {
			a[i], a[j] = a[j], a[i]
		}
	}
	for size := 2; size <= n; size <<= 1 {
		half, step := size/2, n/size
		for st := 0; st < n; st += size {
			for k := 0; k < half; k++ {
				w := tw[k*step]
				if inv {
					w = complex(real(w), -imag(w))
				}
				u, v := a[st+k], a[st+k+half]*w
				a[st+k], a[st+k+half] = u+v, u-v
			}
		}
	}
}

func (f *fft2) do(a []complex128, inv bool) {
	n, m := f.n, f.m
	for y := 0; y < m; y++ {
		fft1(a[y*n:(y+1)*n], f.twN, f.revN, inv)
	}
	col := make([]complex128, m)
	for x := 0; x < n; x++ {
		for y := 0; y < m; y++ {
			col[y] = a[y*n+x]
		}
		fft1(col, f.twM, f.revM, inv)
		for y := 0; y < m; y++ {
			a[y*n+x] = col[y]
		}
	}
	if inv {
		s := complex(1/float64(n*m), 0)
		for i := range a {
			a[i] *= s
		}
	}
}

func (f *fft2) load(g Gray, mask []float32, pow int) []complex128 {
	a := make([]complex128, f.n*f.m)
	for y := 0; y < g.H; y++ {
		for x := 0; x < g.W; x++ {
			i := y*g.W + x
			mv := float32(1)
			if mask != nil {
				mv = mask[i]
			}
			v := float64(mv)
			switch pow {
			case 1:
				v *= float64(g.P[i])
			case 2:
				v *= float64(g.P[i]) * float64(g.P[i])
			}
			a[y*f.n+x] = complex(v, 0)
		}
	}
	f.do(a, false)
	return a
}

func xcorr(f *fft2, A, B []complex128) []float64 {
	c := make([]complex128, len(A))
	for i := range A {
		b := B[i]
		c[i] = A[i] * complex(real(b), -imag(b))
	}
	f.do(c, true)
	out := make([]float64, len(c))
	for i, v := range c {
		out[i] = real(v)
	}
	return out
}

// Match — результат: смещение эталона R относительно снимка S (пиксель R (0,0) лежит в S (Ox,Oy)).
type Match struct {
	Ox, Oy  int
	Score   float64
	Overlap float64 // доля перекрытия от меньшей картинки
}

// MaskedNCC — лучшее положение R внутри/поверх S. ms, mr — маски (nil = вся картинка).
// minOverlap — минимальная доля площади меньшей картинки; win — если >0, ищем только |Ox-cx|,|Oy-cy| <= win.
func MaskedNCC(S Gray, ms []float32, R Gray, mr []float32, minOverlap float64, cx, cy, win int) Match {
	f := getFFT(pow2(S.W+R.W), pow2(S.H+R.H))
	sA := f.load(S, ms, 1)
	sA2 := f.load(S, ms, 2)
	sM := f.load(S, ms, 0)
	rB := f.load(R, mr, 1)
	rB2 := f.load(R, mr, 2)
	rM := f.load(R, mr, 0)
	// sum_x A(x) B(x-o) = xcorr(A,B)[o]
	nn := xcorr(f, sM, rM)
	sS := xcorr(f, sA, rM)
	sR := xcorr(f, sM, rB)
	sSS := xcorr(f, sA2, rM)
	sRR := xcorr(f, sM, rB2)
	sSR := xcorr(f, sA, rB)
	areaS, areaR := 0.0, 0.0
	for i := range S.P {
		if ms == nil || ms[i] > 0 {
			areaS++
		}
	}
	for i := range R.P {
		if mr == nil || mr[i] > 0 {
			areaR++
		}
	}
	minA := math.Min(areaS, areaR) * minOverlap
	best := Match{Score: -2}
	for oy := -(R.H - 1); oy < S.H; oy++ {
		if win > 0 && (oy < cy-win || oy > cy+win) {
			continue
		}
		iy := (oy + f.m) % f.m
		for ox := -(R.W - 1); ox < S.W; ox++ {
			if win > 0 && (ox < cx-win || ox > cx+win) {
				continue
			}
			i := iy*f.n + (ox+f.n)%f.n
			n := nn[i]
			if n < minA || n < 16 {
				continue
			}
			vs := sSS[i] - sS[i]*sS[i]/n
			vr := sRR[i] - sR[i]*sR[i]/n
			if vs <= 1e-6 || vr <= 1e-6 {
				continue
			}
			c := (sSR[i] - sS[i]*sR[i]/n) / math.Sqrt(vs*vr)
			if c > best.Score {
				best = Match{ox, oy, c, n / math.Min(areaS, areaR)}
			}
		}
	}
	return best
}

// SavePNG — сохранить снимок (для настройки распознавания)
func SavePNG(path string, g Gray) error {
	im := image.NewGray(image.Rect(0, 0, g.W, g.H))
	for i, v := range g.P {
		if v < 0 {
			v = 0
		} else if v > 255 {
			v = 255
		}
		im.Pix[i] = uint8(v)
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, im)
}

// ---------- быстрое отслеживание сдвига карты между кадрами ----------

// PhaseShift — на сколько пикселей сдвинулась картинка b относительно a (фазовая корреляция).
// peak — уверенность (≈0.1 и выше — сдвиг найден надёжно; около 0.02 — картинки разные).
func PhaseShift(a, b Gray) (dx, dy, peak float64) {
	n, m := pow2(a.W), pow2(a.H)
	f := getFFT(n, m)
	win := func(g Gray) []complex128 {
		out := make([]complex128, n*m)
		var mean float64
		for _, v := range g.P {
			mean += float64(v)
		}
		mean /= float64(len(g.P))
		for y := 0; y < g.H; y++ {
			wy := 0.5 - 0.5*math.Cos(2*math.Pi*(float64(y)+.5)/float64(g.H))
			for x := 0; x < g.W; x++ {
				wx := 0.5 - 0.5*math.Cos(2*math.Pi*(float64(x)+.5)/float64(g.W))
				out[y*n+x] = complex((float64(g.P[y*g.W+x])-mean)*wx*wy, 0)
			}
		}
		f.do(out, false)
		return out
	}
	A, B := win(a), win(b)
	c := make([]complex128, n*m)
	for i := range A {
		v := B[i] * complex(real(A[i]), -imag(A[i]))
		mag := math.Hypot(real(v), imag(v))
		if mag > 1e-9 {
			c[i] = v / complex(mag, 0)
		}
	}
	f.do(c, true)
	bi, bv := 0, -1.0
	for i, v := range c {
		if r := real(v); r > bv {
			bi, bv = i, r
		}
	}
	px, py := bi%n, bi/n
	at := func(x, y int) float64 { return real(c[((y+m)%m)*n+(x+n)%n]) }
	// субпиксель: парабола по соседям
	sub := func(l, c0, r float64) float64 {
		d := l - 2*c0 + r
		if math.Abs(d) < 1e-12 {
			return 0
		}
		return 0.5 * (l - r) / d
	}
	fx := float64(px) + sub(at(px-1, py), bv, at(px+1, py))
	fy := float64(py) + sub(at(px, py-1), bv, at(px, py+1))
	if fx > float64(n)/2 {
		fx -= float64(n)
	}
	if fy > float64(m)/2 {
		fy -= float64(m)
	}
	return fx, fy, bv
}
