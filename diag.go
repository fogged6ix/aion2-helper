// Журнал подсветки: что видит программа (окно игры, снимок, найдена ли карта).
// Пишется в data/overlay-log.txt — по нему видно, почему точки не появляются.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"

	"aion2helper/mapfind"
	"golang.org/x/sys/windows"
)

var (
	pGetWindowTextW = user32.NewProc("GetWindowTextW")
	pGetClassNameW  = user32.NewProc("GetClassNameW")
	logMu           sync.Mutex
	logDir          string
)

func ovLog(format string, a ...interface{}) {
	if logDir == "" {
		return
	}
	logMu.Lock()
	defer logMu.Unlock()
	p := filepath.Join(logDir, "overlay-log.txt")
	if st, err := os.Stat(p); err == nil && st.Size() > 400<<10 {
		os.Rename(p, p+".old")
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s "+format+"\r\n", append([]interface{}{time.Now().Format("15:04:05.000")}, a...)...)
}

func winText(h uintptr) (string, string) {
	var t [256]uint16
	var c [256]uint16
	pGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&t[0])), 256)
	pGetClassNameW.Call(h, uintptr(unsafe.Pointer(&c[0])), 256)
	return windows.UTF16ToString(t[:]), windows.UTF16ToString(c[:])
}

// отладочный снимок: что именно увидела программа (не чаще раза в 20 с)
var lastDebugShot time.Time

func debugShot(g mapfind.Gray, why string) {
	if logDir == "" || time.Since(lastDebugShot) < 20*time.Second {
		return
	}
	lastDebugShot = time.Now()
	small := g
	if g.W > 960 {
		small = mapfind.Resize(g, 960, g.H*960/g.W)
	}
	p := filepath.Join(logDir, "overlay-debug.png")
	if mapfind.SavePNG(p, small) == nil {
		ovLog("сохранил снимок %s (%s)", p, why)
	}
}
