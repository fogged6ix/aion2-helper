// Обновления через GitHub: раз в день смотрим последний выпуск (release) репозитория,
// если версия новее — предлагаем обновиться. Обновление: скачиваем exe рядом с программой,
// текущий файл переименовываем в *.old.exe (Windows это разрешает даже для запущенной программы),
// новый ставим на его место, запускаем и закрываемся. Данные (папка data) не трогаются.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	webview2 "github.com/jchv/go-webview2"
)

var repoRe = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$`)

type relInfo struct {
	Tag   string `json:"tag"`
	Name  string `json:"name"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Size  int64  `json:"size"`
	Date  string `json:"date"`
	Error string `json:"error,omitempty"`
}

func ghClient() *http.Client { return &http.Client{Timeout: 25 * time.Second} }

func latestRelease(repo string) relInfo {
	if !repoRe.MatchString(repo) {
		return relInfo{Error: "неверное имя репозитория (нужно вида «владелец/репозиторий»)"}
	}
	req, _ := http.NewRequest("GET", "https://api.github.com/repos/"+repo+"/releases/latest", nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "AION2Helper/"+appVersion)
	resp, err := ghClient().Do(req)
	if err != nil {
		return relInfo{Error: "нет связи с GitHub: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return relInfo{Error: "в репозитории ещё нет выпусков"}
	}
	if resp.StatusCode != 200 {
		return relInfo{Error: "GitHub ответил " + resp.Status}
	}
	var r struct {
		Tag    string `json:"tag_name"`
		Name   string `json:"name"`
		Body   string `json:"body"`
		Date   string `json:"published_at"`
		Assets []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
			Size int64  `json:"size"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&r); err != nil {
		return relInfo{Error: "не понял ответ GitHub"}
	}
	out := relInfo{Tag: r.Tag, Name: r.Name, Body: r.Body, Date: r.Date}
	for _, a := range r.Assets {
		if strings.EqualFold(filepath.Ext(a.Name), ".exe") {
			out.URL, out.Size = a.URL, a.Size
			break
		}
	}
	if out.URL == "" {
		out.Error = "в выпуске нет файла .exe"
	}
	return out
}

// скачать и поставить новую версию; progress(доля 0..1)
func applyUpdate(url string, size int64, progress func(float64)) (string, error) {
	if !strings.HasPrefix(url, "https://github.com/") && !strings.HasPrefix(url, "https://objects.githubusercontent.com/") {
		return "", errors.New("файл обновления не с GitHub")
	}
	me, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(me)
	tmp := filepath.Join(dir, "AION2Helper.new.exe")
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "AION2Helper/"+appVersion)
	resp, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return "", fmt.Errorf("не скачалось: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("не скачалось: %s", resp.Status)
	}
	f, err := os.Create(tmp)
	if err != nil {
		return "", fmt.Errorf("не могу записать рядом с программой: %v", err)
	}
	var got int64
	buf := make([]byte, 256<<10)
	last := time.Now()
	for {
		n, e := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				os.Remove(tmp)
				return "", werr
			}
			got += int64(n)
			if size > 0 && time.Since(last) > 150*time.Millisecond {
				last = time.Now()
				progress(float64(got) / float64(size))
			}
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			f.Close()
			os.Remove(tmp)
			return "", fmt.Errorf("обрыв при скачивании: %v", e)
		}
	}
	f.Close()
	// проверки: размер и то, что это программа Windows
	if size > 0 && got != size {
		os.Remove(tmp)
		return "", fmt.Errorf("файл скачался не целиком (%d из %d)", got, size)
	}
	hd := make([]byte, 2)
	if fh, err := os.Open(tmp); err == nil {
		fh.Read(hd)
		fh.Close()
	}
	if string(hd) != "MZ" || got < 1<<20 {
		os.Remove(tmp)
		return "", errors.New("скачанный файл не похож на программу")
	}
	old := strings.TrimSuffix(me, filepath.Ext(me)) + ".old.exe"
	os.Remove(old)
	if err := os.Rename(me, old); err != nil {
		os.Remove(tmp)
		return "", fmt.Errorf("не могу заменить программу: %v", err)
	}
	if err := os.Rename(tmp, me); err != nil {
		os.Rename(old, me) // вернуть как было
		return "", fmt.Errorf("не могу поставить новую версию: %v", err)
	}
	return me, nil
}

// запуск новой версии: она дождётся, пока эта закроется
func relaunch(exe string) error {
	cmd := exec.Command(exe, "--wait="+strconv.Itoa(os.Getpid()), "--updated")
	cmd.Dir = filepath.Dir(exe)
	return cmd.Start()
}

// старый файл после обновления больше не нужен
func cleanupOld() {
	me, err := os.Executable()
	if err != nil {
		return
	}
	old := strings.TrimSuffix(me, filepath.Ext(me)) + ".old.exe"
	go func() {
		for i := 0; i < 10; i++ {
			if os.Remove(old) == nil || !fileExists(old) {
				return
			}
			time.Sleep(time.Second)
		}
	}()
	os.Remove(filepath.Join(filepath.Dir(me), "AION2Helper.new.exe"))
}

func bindUpdate(w webview2.WebView, a *win) {
	w.Bind("hostUpdateCheck", func(repo string, id int) bool {
		go func() {
			b, _ := json.Marshal(latestRelease(repo))
			w.Dispatch(func() { w.Eval("window.__a2f&&__a2f(" + strconv.Itoa(id) + "," + string(b) + ")") })
		}()
		return true
	})
	w.Bind("hostUpdateApply", func(url string, size float64) bool {
		go func() {
			say := func(kind string, v interface{}) {
				b, _ := json.Marshal(v)
				w.Dispatch(func() { w.Eval("window.A2Update&&A2Update.event('" + kind + "'," + string(b) + ")") })
			}
			exe, err := applyUpdate(url, int64(size), func(p float64) { say("progress", p) })
			if err != nil {
				say("error", err.Error())
				return
			}
			say("installed", exe)
			time.Sleep(600 * time.Millisecond) // интерфейс успевает сохранить данные
			if err := relaunch(exe); err != nil {
				say("error", "новая версия установлена, но не запустилась — открой программу вручную")
				return
			}
			pPostMessageW.Call(a.hwnd, wmClose, 0, 0)
		}()
		return true
	})
}
