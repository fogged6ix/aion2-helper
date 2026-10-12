// Виджет следует за игрой: игру развернули или запустили — показываем виджет (без перехвата фокуса),
// игру свернули или закрыли — прячем виджет. Главное окно (полный режим) игра не трогает.
// Только чтение состояния окна игры (IsIconic/IsWindowVisible), в игру ничего не посылается.
package main

import (
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type gameFollow struct {
	state        int // 0 — игры нет, 1 — свёрнута, 2 — открыта
	hiddenByGame bool
}

func findGameWindow() uintptr {
	cls, _ := windows.UTF16PtrFromString("UnrealWindow")
	hw, _, _ := pFindWindowW.Call(uintptr(unsafe.Pointer(cls)), 0)
	return hw
}

func (a *win) startGameFollow() {
	g := &gameFollow{}
	go func() {
		for range time.Tick(700 * time.Millisecond) {
			a.w.Dispatch(func() { a.followGame(g) })
		}
	}()
}

func (a *win) followGame(g *gameFollow) {
	st := 0
	if hw := findGameWindow(); hw != 0 {
		st = 2
		if ic, _, _ := pIsIconic.Call(hw); ic != 0 {
			st = 1
		} else if v, _, _ := pIsWindowVisible.Call(hw); v == 0 {
			st = 1
		}
	}
	prev := g.state
	g.state = st
	if st == prev {
		return
	}
	switch {
	case st == 2: // игру запустили или развернули
		vis, _, _ := pIsWindowVisible.Call(a.hwnd)
		fg, _, _ := pGetForegroundWindow.Call()
		if g.hiddenByGame || vis == 0 || (a.mode != "compact" && fg != a.hwnd) {
			g.hiddenByGame = false
			a.w.Eval("window.A2App && A2App.gameEvent && A2App.gameEvent('show')")
			a.showWindow()
		}
	case prev == 2 && a.mode == "compact": // свернули или закрыли — прячем виджет
		if v, _, _ := pIsWindowVisible.Call(a.hwnd); v != 0 {
			pShowWindow.Call(a.hwnd, swHide)
			g.hiddenByGame = true
		}
	}
}
