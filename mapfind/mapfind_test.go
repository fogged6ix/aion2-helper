package mapfind

import (
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"math"
	"os"
	"testing"
	"time"
)

func loadPNG(t *testing.T, p string) Gray {
	f, err := os.Open(p)
	if err != nil {
		t.Skip(err)
	}
	defer f.Close()
	im, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	b := im.Bounds()
	g := NewGray(b.Dx(), b.Dy())
	rgba, _ := im.(*image.RGBA)
	for y := 0; y < g.H; y++ {
		for x := 0; x < g.W; x++ {
			var r, gg, bb uint32
			if rgba != nil {
				i := y*rgba.Stride + x*4
				r, gg, bb = uint32(rgba.Pix[i]), uint32(rgba.Pix[i+1]), uint32(rgba.Pix[i+2])
			} else {
				r, gg, bb, _ = im.At(x, y).RGBA()
				r, gg, bb = r>>8, gg>>8, bb>>8
			}
			g.P[y*g.W+x] = float32(0.299*float64(r) + 0.587*float64(gg) + 0.114*float64(bb))
		}
	}
	return g
}

func TestSynthetic(t *testing.T) {
	dir := os.Getenv("SYN")
	if dir == "" {
		t.Skip("SYN не задан: папка с синтетическими кадрами (cases.json + PNG)")
	}
	var cases []struct {
		I         int
		S, Tx, Ty float64
	}
	b, err := os.ReadFile(dir + "/cases.json")
	if err != nil {
		t.Skip(err)
	}
	json.Unmarshal(b, &cases)
	t00 := time.Now()
	fmt.Println("db:", Prepare(), time.Since(t00))
	for _, c := range cases {
		g := loadPNG(t, fmt.Sprintf("%s/%d.png", dir, c.I))
		t0 := time.Now()
		r := Find(g, Options{})
		// ошибка в пикселях экрана для точки в центре экрана
		cx, cy := float64(g.W)/2, float64(g.H)/2
		mx, my := (cx-c.Tx)/c.S, (cy-c.Ty)/c.S
		ex, ey := mx*r.S+r.Tx-cx, my*r.S+r.Ty-cy
		t1 := time.Now()
		h := r
		v := Find(g, Options{Hint: &h})
		fmt.Printf("case %d: true s=%.3f got s=%.3f in=%d/%d err=(%.1f,%.1f)px  %v | hint in=%d %v\n", c.I, c.S, r.S, r.Inliers, r.Matches, ex, ey, t1.Sub(t0).Round(time.Millisecond), v.Inliers, time.Since(t1).Round(time.Millisecond))
		if math.Hypot(ex, ey) > 12 {
			t.Errorf("case %d: off by %.1f px", c.I, math.Hypot(ex, ey))
		}
	}
}
