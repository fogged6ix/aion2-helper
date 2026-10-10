package mapfind

// Поиск по особым точкам: углы FAST + двоичные описания BRIEF на нескольких масштабах.
// Совпадения точек снимка и карты → RANSAC подбирает масштаб и сдвиг (поворота у карты нет).

import (
	"math"
	"math/bits"
	"runtime/debug"
	"sort"
	"sync"
)

type kp struct {
	X, Y  float64 // в пикселях исходника (экран) или карты
	Lvl   float64 // сколько исходных пикселей в пикселе уровня
	Score float32
	D     [4]uint64
}

// пары точек BRIEF (фиксированные)
var briefPairs = func() [256][4]int8 {
	var p [256][4]int8
	st := uint64(0x9E3779B97F4A7C15)
	rnd := func() float64 { // xorshift → (0,1)
		st ^= st << 13
		st ^= st >> 7
		st ^= st << 17
		return (float64(st>>11) + .5) / float64(1<<53)
	}
	gauss := func() int8 {
		for {
			u, v := rnd(), rnd()
			z := math.Sqrt(-2*math.Log(u)) * math.Cos(2*math.Pi*v) * 31 / 5
			if z >= -13 && z <= 13 {
				return int8(math.Round(z))
			}
		}
	}
	for i := range p {
		p[i] = [4]int8{gauss(), gauss(), gauss(), gauss()}
	}
	return p
}()

var fastCircle = [16][2]int{{0, -3}, {1, -3}, {2, -2}, {3, -1}, {3, 0}, {3, 1}, {2, 2}, {1, 3}, {0, 3}, {-1, 3}, {-2, 2}, {-3, 1}, {-3, 0}, {-3, -1}, {-2, -2}, {-1, -3}}

// boxBlur — размытие окном (2r+1)
func boxBlur(g Gray, r int) Gray {
	w, h := g.W, g.H
	t := NewGray(w, h)
	d := NewGray(w, h)
	n := float32(2*r + 1)
	for y := 0; y < h; y++ {
		row := g.P[y*w : (y+1)*w]
		var s float32
		for x := -r - 1; x < r; x++ {
			s += row[clampI(x, w)]
		}
		for x := 0; x < w; x++ {
			s += row[clampI(x+r, w)] - row[clampI(x-r-1, w)]
			t.P[y*w+x] = s / n
		}
	}
	for x := 0; x < w; x++ {
		var s float32
		for y := -r - 1; y < r; y++ {
			s += t.P[clampI(y, h)*w+x]
		}
		for y := 0; y < h; y++ {
			s += t.P[clampI(y+r, h)*w+x] - t.P[clampI(y-r-1, h)*w+x]
			d.P[y*w+x] = s / n
		}
	}
	return d
}

// detect — углы FAST-9 с отбором лучших по ячейкам сетки и описания BRIEF
func detect(g Gray, lvl float64, thr float32, cell, perCell int, maxN int) []kp {
	w, h := g.W, g.H
	if w < 40 || h < 40 {
		return nil
	}
	sm := boxBlur(boxBlur(g, 1), 1)
	score := make([]float32, w*h)
	var off [16]int
	for i, c := range fastCircle {
		off[i] = c[1]*w + c[0]
	}
	const B = 16 // отступ от края (описание BRIEF ±13 + круг)
	for y := B; y < h-B; y++ {
		for x := B; x < w-B; x++ {
			i := y*w + x
			p := g.P[i]
			hi, lo := p+thr, p-thr
			// быстрый отсев по 4 точкам
			a, b, c, d := g.P[i+off[0]], g.P[i+off[4]], g.P[i+off[8]], g.P[i+off[12]]
			nb, nd := 0, 0
			for _, v := range [4]float32{a, b, c, d} {
				if v > hi {
					nb++
				} else if v < lo {
					nd++
				}
			}
			if nb < 2 && nd < 2 {
				continue
			}
			var st [16]int8
			for k := 0; k < 16; k++ {
				v := g.P[i+off[k]]
				if v > hi {
					st[k] = 1
				} else if v < lo {
					st[k] = -1
				}
			}
			ok := false
			for _, want := range [2]int8{1, -1} {
				run := 0
				for k := 0; k < 25; k++ {
					if st[k&15] == want {
						run++
						if run >= 9 {
							ok = true
							break
						}
					} else {
						run = 0
					}
				}
				if ok {
					break
				}
			}
			if !ok {
				continue
			}
			var s float32
			for k := 0; k < 16; k++ {
				dv := g.P[i+off[k]] - p
				if dv < 0 {
					dv = -dv
				}
				if dv > thr {
					s += dv - thr
				}
			}
			score[i] = s
		}
	}
	// подавление немаксимумов + лучшие в ячейке
	type c struct {
		i int
		s float32
	}
	cw := (w + cell - 1) / cell
	chh := (h + cell - 1) / cell
	cells := make([][]c, cw*chh)
	for y := B; y < h-B; y++ {
		for x := B; x < w-B; x++ {
			i := y*w + x
			s := score[i]
			if s == 0 {
				continue
			}
			if s < score[i-1] || s < score[i+1] || s < score[i-w] || s < score[i+w] || s < score[i-w-1] || s < score[i-w+1] || s < score[i+w-1] || s < score[i+w+1] {
				continue
			}
			ci := (y/cell)*cw + x/cell
			cells[ci] = append(cells[ci], c{i, s})
		}
	}
	var all []c
	for _, cl := range cells {
		if len(cl) > perCell {
			sort.Slice(cl, func(a, b int) bool { return cl[a].s > cl[b].s })
			cl = cl[:perCell]
		}
		all = append(all, cl...)
	}
	if maxN > 0 && len(all) > maxN {
		sort.Slice(all, func(a, b int) bool { return all[a].s > all[b].s })
		all = all[:maxN]
	}
	out := make([]kp, 0, len(all))
	for _, e := range all {
		x, y := e.i%w, e.i/w
		k := kp{X: (float64(x) + .5) * lvl, Y: (float64(y) + .5) * lvl, Lvl: lvl, Score: e.s}
		for b := 0; b < 256; b++ {
			pp := briefPairs[b]
			if sm.P[(y+int(pp[1]))*w+x+int(pp[0])] < sm.P[(y+int(pp[3]))*w+x+int(pp[2])] {
				k.D[b>>6] |= 1 << uint(b&63)
			}
		}
		out = append(out, k)
	}
	return out
}

func hamming(a, b *[4]uint64) int {
	return bits.OnesCount64(a[0]^b[0]) + bits.OnesCount64(a[1]^b[1]) + bits.OnesCount64(a[2]^b[2]) + bits.OnesCount64(a[3]^b[3])
}

// ---------- база особых точек карты ----------
var (
	dbOnce sync.Once
	db     []kp
)

// MapLevels — сколько пикселей карты в пикселе уровня базы
var MapLevels = []float64{2, 2.83, 4, 5.66, 8, 11.3, 16, 22.6, 32}

func loadDB() []kp {
	dbOnce.Do(func() {
		p := loadRef()
		if p == nil {
			return
		}
		base := p.lv[0]
		var mu sync.Mutex
		var wg sync.WaitGroup
		for _, per := range MapLevels {
			wg.Add(1)
			go func(per float64) {
				defer wg.Done()
				w := int(math.Round(MapSize / per))
				g := base
				if w != base.W {
					// берём ближайший подробный уровень пирамиды
					src := base
					for i := range p.lv {
						if p.lv[i].W >= w {
							src = p.lv[i]
						}
					}
					g = Resize(src, w, w)
				}
				k := detect(g, per, 14, 20, 2, 0)
				mu.Lock()
				db = append(db, k...)
				mu.Unlock()
			}(per)
		}
		wg.Wait()
		sort.Slice(db, func(a, b int) bool { return db[a].Lvl < db[b].Lvl })
		// эталонная картинка больше не нужна — освобождаем ~90 МБ
		refMu.Lock()
		ref = nil
		refMu.Unlock()
		debug.FreeOSMemory()
	})
	return db
}

// Prepare — заранее построить базу (≈1 с), чтобы первый поиск был быстрым
func Prepare() int { return len(loadDB()) }

// ---------- поиск ----------

// Transform: экран = карта*S + T (в пикселях снимка, переданного в Find).
type Transform struct {
	S, Tx, Ty float64
	Inliers   int
	Matches   int
	Score     float64 // доля совпавших точек
}

// MinInliers — сколько совпавших точек нужно, чтобы считать, что на экране карта.
var MinInliers = 8

func (t Transform) Valid() bool {
	return t.S > 0 && t.Inliers >= MinInliers && (t.Score >= 0.08 || t.Inliers >= 20)
}

// Options — диапазон масштабов (пикселей экрана на пиксель карты), область поиска на экране
type Options struct {
	MinScale, MaxScale float64
	Hint               *Transform
	Mask               func(x, y float64) bool // false — не брать точку (интерфейс игры, свои окна)
}

type match struct {
	sx, sy, mx, my, lvlRatio, sl float64
	dist                         int
}

// ScreenLevels — во сколько раз уменьшается снимок на каждом уровне
var ScreenLevels = []float64{1, 1.41, 2, 2.83, 4, 5.66, 8, 11.3}

func screenPoints(shot Gray, o Options) []kp {
	var out []kp
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, d := range ScreenLevels {
		// уровни, на которых точки снимка вообще можно сопоставить с картой при допустимом масштабе
		if d/o.MinScale < MapLevels[0]/1.6 || d/o.MaxScale > MapLevels[len(MapLevels)-1]*1.6 {
			continue
		}
		wg.Add(1)
		go func(d float64) {
			defer wg.Done()
			g := shot
			if d > 1 {
				g = Resize(shot, int(float64(shot.W)/d), int(float64(shot.H)/d))
			}
			k := detect(g, d, 14, 28, 2, 350)
			if o.Mask != nil {
				f := k[:0]
				for _, p := range k {
					if o.Mask(p.X, p.Y) {
						f = append(f, p)
					}
				}
				k = f
			}
			mu.Lock()
			out = append(out, k...)
			mu.Unlock()
		}(d)
	}
	wg.Wait()
	return out
}

func matchAll(sp []kp, base []kp, o Options, region *[4]float64) []match {
	var ms []match
	var mu sync.Mutex
	var wg sync.WaitGroup
	chunks := 4
	per := (len(sp) + chunks - 1) / chunks
	for c := 0; c < chunks; c++ {
		lo, hi := c*per, (c+1)*per
		if hi > len(sp) {
			hi = len(sp)
		}
		if lo >= hi {
			continue
		}
		wg.Add(1)
		go func(part []kp) {
			defer wg.Done()
			var loc []match
			for i := range part {
				s := &part[i]
				best, second, bi := 999, 999, -1
				for j := range base {
					m := &base[j]
					r := s.Lvl / m.Lvl // = масштаб s, если уровни совпадают
					if r < o.MinScale/1.5 || r > o.MaxScale*1.5 {
						continue
					}
					if region != nil && (m.X < region[0] || m.Y < region[1] || m.X > region[2] || m.Y > region[3]) {
						continue
					}
					d := hamming(&s.D, &m.D)
					if d < best {
						second, best, bi = best, d, j
					} else if d < second {
						second = d
					}
				}
				if bi >= 0 && best <= 70 && float64(best) < 0.85*float64(second) {
					m := &base[bi]
					loc = append(loc, match{s.X, s.Y, m.X, m.Y, s.Lvl / m.Lvl, s.Lvl, best})
				}
			}
			mu.Lock()
			ms = append(ms, loc...)
			mu.Unlock()
		}(sp[lo:hi])
	}
	wg.Wait()
	return ms
}

func ransac(ms []match, o Options) Transform {
	n := len(ms)
	if n < 3 {
		return Transform{Matches: n}
	}
	st := uint64(88172645463325252)
	rnd := func(k int) int { st ^= st << 13; st ^= st >> 7; st ^= st << 17; return int(st % uint64(k)) }
	best := Transform{Matches: n}
	var bestIn []int
	iters := 600
	for it := 0; it < iters; it++ {
		a, b := rnd(n), rnd(n)
		if a == b {
			continue
		}
		A, Bm := ms[a], ms[b]
		dm := math.Hypot(A.mx-Bm.mx, A.my-Bm.my)
		if dm < 1e-6 {
			continue
		}
		s := math.Hypot(A.sx-Bm.sx, A.sy-Bm.sy) / dm
		if s < o.MinScale || s > o.MaxScale {
			continue
		}
		// направление тоже должно совпасть (карта не поворачивается)
		if (A.sx-Bm.sx)*(A.mx-Bm.mx)+(A.sy-Bm.sy)*(A.my-Bm.my) <= 0 {
			continue
		}
		tx, ty := A.sx-s*A.mx, A.sy-s*A.my
		var in []int
		for i, m := range ms {
			if m.lvlRatio < s/1.7 || m.lvlRatio > s*1.7 {
				continue
			}
			tol := 6 + 2*m.sl
			ex, ey := s*m.mx+tx-m.sx, s*m.my+ty-m.sy
			if ex*ex+ey*ey <= tol*tol {
				in = append(in, i)
			}
		}
		if len(in) > len(bestIn) {
			bestIn = in
			best = Transform{S: s, Tx: tx, Ty: ty, Inliers: len(in), Matches: n}
		}
	}
	if len(bestIn) < 3 {
		return best
	}
	// уточнение наименьшими квадратами: X = s*mx + tx, Y = s*my + ty
	for pass := 0; pass < 2; pass++ {
		var smx, smy, ssx, ssy, smm, sms float64
		k := float64(len(bestIn))
		for _, i := range bestIn {
			m := ms[i]
			smx += m.mx
			smy += m.my
			ssx += m.sx
			ssy += m.sy
			smm += m.mx*m.mx + m.my*m.my
			sms += m.mx*m.sx + m.my*m.sy
		}
		den := smm - (smx*smx+smy*smy)/k
		if den <= 0 {
			break
		}
		s := (sms - (smx*ssx+smy*ssy)/k) / den
		tx, ty := (ssx-s*smx)/k, (ssy-s*smy)/k
		best.S, best.Tx, best.Ty = s, tx, ty
		// пересчёт инлаеров с жёстким допуском
		var in []int
		for i, m := range ms {
			ex, ey := s*m.mx+tx-m.sx, s*m.my+ty-m.sy
			tol := 4 + 1.5*m.sl
			if ex*ex+ey*ey <= tol*tol {
				in = append(in, i)
			}
		}
		if len(in) >= 3 {
			bestIn = in
		}
		best.Inliers = len(bestIn)
	}
	best.Score = float64(best.Inliers) / float64(n)
	return best
}

// Find — найти карту на снимке экрана.
func Find(shot Gray, o Options) Transform {
	if o.MinScale <= 0 {
		o.MinScale = 0.08
	}
	if o.MaxScale <= 0 {
		o.MaxScale = 7
	}
	base := loadDB()
	if len(base) == 0 {
		return Transform{}
	}
	if o.Hint != nil && o.Hint.S > 0 {
		// сначала рядом с прошлым положением: узкий масштаб и только видимая область карты
		h := *o.Hint
		oo := o
		oo.MinScale, oo.MaxScale = h.S/1.35, h.S*1.35
		sp := screenPoints(shot, oo)
		mx0, my0 := -h.Tx/h.S, -h.Ty/h.S
		mw, mh := float64(shot.W)/h.S, float64(shot.H)/h.S
		reg := [4]float64{mx0 - mw*.6, my0 - mh*.6, mx0 + mw*1.6, my0 + mh*1.6}
		t := ransac(matchAll(sp, base, oo, &reg), oo)
		if t.Valid() {
			return t
		}
	}
	sp := screenPoints(shot, o)
	return ransac(matchAll(sp, base, o, nil), o)
}
