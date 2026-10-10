// Сетевые запросы через скрытый WebView2 на странице metabot.gg.
// Встроенный HTTP-клиент Go сайт отклоняет (403, защита от ботов), а настоящий Edge проходит.
package main

import (
	"encoding/json"
	"net/url"
	"strconv"
	"sync"
	"time"

	webview2 "github.com/jchv/go-webview2"
)

type netReq struct {
	id  int
	url string
}

type netHelper struct {
	mu       sync.Mutex
	main     webview2.WebView
	wv       webview2.WebView
	creating bool
	ready    bool
	failed   bool
	queue    []netReq
	dataPath string
}

func allowedURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && (u.Host == "metabot.gg" || u.Host == "www.metabot.gg")
}

func jsStr(s string) string { b, _ := json.Marshal(s); return string(b) }

// вызывается на UI-потоке (из привязки hostFetch)
func (n *netHelper) fetch(raw string, id int) {
	if !allowedURL(raw) {
		n.deliver(id, `{"status":0,"error":"адрес не разрешён"}`)
		return
	}
	n.mu.Lock()
	if n.failed {
		n.mu.Unlock()
		go func() { r := doHTTP(raw); n.main.Dispatch(func() { n.deliver(id, r) }) }()
		return
	}
	if n.ready {
		n.mu.Unlock()
		n.run(netReq{id, raw})
		return
	}
	n.queue = append(n.queue, netReq{id, raw})
	start := !n.creating
	n.creating = true
	n.mu.Unlock()
	if start {
		// создаём не внутри обработчика события WebView2, а с верхнего уровня цикла сообщений
		n.main.Dispatch(n.create)
	}
}

func (n *netHelper) deliver(id int, res string) {
	n.main.Eval("window.__a2f&&__a2f(" + strconv.Itoa(id) + "," + res + ")")
}

func (n *netHelper) run(r netReq) {
	n.wv.Eval(`(async()=>{let r;try{const x=await fetch(` + jsStr(r.url) + `,{credentials:"include",cache:"no-store"});r={status:x.status,body:await x.text()}}catch(e){r={status:0,error:String(e)}}window.chrome.webview.postMessage(JSON.stringify({id:0,method:"__a2res",params:[` + strconv.Itoa(r.id) + `,r]}))})()`)
}

func (n *netHelper) create() {
	wv := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:      n.dataPath,
		WindowOptions: webview2.WindowOptions{Title: "AION2Helper.net", Width: 320, Height: 240, Hidden: true},
	})
	// во время создания вложенный цикл мог «съесть» сигнал очереди Dispatch — подталкиваем её
	defer n.main.Dispatch(func() {})
	if wv == nil {
		n.mu.Lock()
		n.failed, n.creating = true, false
		q := n.queue
		n.queue = nil
		n.mu.Unlock()
		for _, r := range q {
			r := r
			go func() { res := doHTTP(r.url); n.main.Dispatch(func() { n.deliver(r.id, res) }) }()
		}
		return
	}
	n.wv = wv
	wv.Bind("__a2res", func(id int, res json.RawMessage) bool {
		n.deliver(id, string(res))
		return true
	})
	wv.Bind("__a2ready", func() bool {
		n.mu.Lock()
		if n.ready {
			n.mu.Unlock()
			return true
		}
		n.ready, n.creating = true, false
		q := n.queue
		n.queue = nil
		n.mu.Unlock()
		for _, r := range q {
			n.run(r)
		}
		return true
	})
	wv.Navigate("https://metabot.gg/robots.txt")
	// ждём, пока откроется страница сайта; не вышло за 20 с — переходим на запасной путь
	go func() {
		for i := 0; i < 40; i++ {
			time.Sleep(500 * time.Millisecond)
			n.mu.Lock()
			ok := n.ready
			n.mu.Unlock()
			if ok {
				return
			}
			n.main.Dispatch(func() {
				wv.Eval(`if(location.hostname.endsWith("metabot.gg")&&document.readyState!=="loading")window.chrome.webview.postMessage(JSON.stringify({id:0,method:"__a2ready",params:[]}))`)
			})
		}
		n.main.Dispatch(func() {
			n.mu.Lock()
			if n.ready {
				n.mu.Unlock()
				return
			}
			n.failed, n.creating = true, false
			q := n.queue
			n.queue = nil
			n.mu.Unlock()
			for _, r := range q {
				r := r
				go func() { res := doHTTP(r.url); n.main.Dispatch(func() { n.deliver(r.id, res) }) }()
			}
		})
	}()
}
