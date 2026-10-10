// ИИ-помощник: потоковые ответы от локальной модели (Ollama) или Claude API.
// Запросы идут из Go: нет проблем с CORS, ключ API не попадает в чужие страницы.
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	webview2 "github.com/jchv/go-webview2"
)

type aiMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type aiReq struct {
	Provider string  `json:"provider"` // "ollama" | "claude"
	URL      string  `json:"url"`      // адрес Ollama
	Model    string  `json:"model"`
	Key      string  `json:"key"`
	System   string  `json:"system"`
	Messages []aiMsg `json:"messages"`
	NumCtx   int     `json:"numCtx"`
	Think    *bool   `json:"think,omitempty"`
}

var (
	aiCancels sync.Map
	aiClient  = &http.Client{Timeout: 0}
)

func aiSend(w webview2.WebView, id int, text string, done bool, errText string) {
	js := "window.__a2ai&&__a2ai(" + strconv.Itoa(id) + "," + jsStr(text) + "," + boolJS(done) + "," + jsStr(errText) + ")"
	w.Dispatch(func() { w.Eval(js) })
}

func ollamaBase(raw string) (string, error) {
	if raw == "" {
		raw = "http://127.0.0.1:11434"
	}
	u, err := url.Parse(strings.TrimRight(raw, "/"))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", fmt.Errorf("неверный адрес Ollama: %s", raw)
	}
	return u.Scheme + "://" + u.Host, nil
}

func aiModels(raw string) string {
	base, err := ollamaBase(raw)
	if err != nil {
		b, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(b)
	}
	c := &http.Client{Timeout: 4 * time.Second}
	resp, err := c.Get(base + "/api/tags")
	if err != nil {
		b, _ := json.Marshal(map[string]string{"error": "Ollama не отвечает на " + base + ". Запусти Ollama (значок в трее) и нажми «Проверить»."})
		return string(b)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return string(body)
}

func runAI(w webview2.WebView, raw string, id int) {
	var r aiReq
	if err := json.Unmarshal([]byte(raw), &r); err != nil {
		aiSend(w, id, "", true, "внутренняя ошибка запроса")
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	aiCancels.Store(id, cancel)
	defer func() { cancel(); aiCancels.Delete(id) }()
	var err error
	if r.Provider == "claude" {
		err = runClaude(ctx, w, id, r)
	} else {
		err = runOllama(ctx, w, id, r)
	}
	if ctx.Err() != nil {
		aiSend(w, id, "", true, "")
		return
	}
	if err != nil {
		aiSend(w, id, "", true, err.Error())
		return
	}
	aiSend(w, id, "", true, "")
}

func runOllama(ctx context.Context, w webview2.WebView, id int, r aiReq) error {
	base, err := ollamaBase(r.URL)
	if err != nil {
		return err
	}
	msgs := append([]aiMsg{{Role: "system", Content: r.System}}, r.Messages...)
	body := map[string]interface{}{"model": r.Model, "messages": msgs, "stream": true, "keep_alive": "15m"}
	if r.NumCtx > 0 {
		body["options"] = map[string]interface{}{"num_ctx": r.NumCtx, "temperature": 0.4}
	}
	if r.Think != nil {
		body["think"] = *r.Think
	}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/chat", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := aiClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("Ollama не отвечает (%s). Запусти Ollama и попробуй снова", base)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		eb, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var e struct{ Error string }
		json.Unmarshal(eb, &e)
		if e.Error == "" {
			e.Error = strings.TrimSpace(string(eb))
		}
		if strings.Contains(e.Error, "not found") {
			return fmt.Errorf("модель «%s» не установлена. Выполни в терминале: ollama pull %s", r.Model, r.Model)
		}
		return fmt.Errorf("Ollama: %s", e.Error)
	}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 1<<20), 1<<22)
	for sc.Scan() {
		var ch struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done  bool   `json:"done"`
			Error string `json:"error"`
		}
		if json.Unmarshal(sc.Bytes(), &ch) != nil {
			continue
		}
		if ch.Error != "" {
			return fmt.Errorf("Ollama: %s", ch.Error)
		}
		if ch.Message.Content != "" {
			aiSend(w, id, ch.Message.Content, false, "")
		}
		if ch.Done {
			break
		}
	}
	return nil
}

func runClaude(ctx context.Context, w webview2.WebView, id int, r aiReq) error {
	if strings.TrimSpace(r.Key) == "" {
		return fmt.Errorf("нет ключа Claude API — вставь его в настройках помощника")
	}
	model := r.Model
	if model == "" {
		model = "claude-sonnet-5-5"
	}
	body := map[string]interface{}{"model": model, "max_tokens": 2048, "system": r.System, "messages": r.Messages, "stream": true}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", strings.TrimSpace(r.Key))
	req.Header.Set("anthropic-version", "2023-06-01")
	resp, err := aiClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("нет связи с api.anthropic.com: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		eb, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var e struct {
			Error struct{ Message string } `json:"error"`
		}
		json.Unmarshal(eb, &e)
		msg := e.Error.Message
		if msg == "" {
			msg = strings.TrimSpace(string(eb))
		}
		if resp.StatusCode == 401 {
			return fmt.Errorf("ключ Claude API не подошёл (401) — проверь его в настройках")
		}
		return fmt.Errorf("Claude API %d: %s", resp.StatusCode, msg)
	}
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 1<<20), 1<<22)
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		var ev struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
			Error struct{ Message string } `json:"error"`
		}
		if json.Unmarshal([]byte(strings.TrimSpace(line[5:])), &ev) != nil {
			continue
		}
		switch ev.Type {
		case "content_block_delta":
			if ev.Delta.Text != "" {
				aiSend(w, id, ev.Delta.Text, false, "")
			}
		case "error":
			return fmt.Errorf("Claude API: %s", ev.Error.Message)
		case "message_stop":
			return nil
		}
	}
	return nil
}

func bindAI(w webview2.WebView) {
	w.Bind("hostAI", func(raw string, id int) bool { go runAI(w, raw, id); return true })
	w.Bind("hostAIStop", func(id int) bool {
		if c, ok := aiCancels.Load(id); ok {
			c.(context.CancelFunc)()
		}
		return true
	})
	// список моделей Ollama — асинхронно, ответ через тот же __a2f, что и сетевые запросы
	w.Bind("hostAIModels", func(u string, id int) bool {
		go func() {
			res := aiModels(u)
			var probe struct{ Error string }
			json.Unmarshal([]byte(res), &probe)
			var out []byte
			if probe.Error != "" {
				out, _ = json.Marshal(map[string]interface{}{"status": 0, "error": probe.Error})
			} else {
				out, _ = json.Marshal(map[string]interface{}{"status": 200, "body": res})
			}
			w.Dispatch(func() { w.Eval("window.__a2f&&__a2f(" + strconv.Itoa(id) + "," + string(out) + ")") })
		}()
		return true
	})
}
