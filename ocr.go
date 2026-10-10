// Чтение чата игры: раз в пару секунд снимаем выбранную область экрана (окно чата) и отдаём её
// встроенному в Windows распознаванию текста (Windows.Media.Ocr) через фоновый PowerShell.
// Новые строки уходят в интерфейс — там помощник записывает добычу, кинары и убийства боссов.
// В игру ничего не посылается: только снимок экрана, как у программ записи видео.
package main

import (
	"bufio"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"aion2helper/mapfind"
)

const ocrScript = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + `1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $null = $task.Wait(-1); $task.Result }
  $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ru'))
  if (-not $eng) { $eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if (-not $eng) { [Console]::Out.WriteLine('{"err":"no-ocr"}'); [Console]::Out.Flush(); exit }
  [Console]::Out.WriteLine('{"ready":"' + $eng.RecognizerLanguage.LanguageTag + '"}'); [Console]::Out.Flush()
} catch { [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ err = 'init: ' + $_.Exception.Message })); [Console]::Out.Flush(); exit }
while (($p = [Console]::In.ReadLine()) -ne $null) {
  try {
    $f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
    $s = Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $d = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $b = Await ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $r = Await ($eng.RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
    $lines = @($r.Lines | ForEach-Object { $_.Text })
    $s.Dispose()
    [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ lines = $lines })); [Console]::Out.Flush()
  } catch { [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ err = $_.Exception.Message })); [Console]::Out.Flush() }
}
`

type ocrWorker struct {
	name    string        // имя файла снимка и объекта в интерфейсе
	js      string        // объект интерфейса: A2Chat / A2Combat
	every   time.Duration // пауза между снимками
	mu      sync.Mutex
	on      bool
	running bool
	area    []float64 // доля экрана: x, y, w, h
	ov      *overlay
	cmd     *exec.Cmd
	in      io.WriteCloser
	out     *bufio.Reader
	dir     string
	lang    string
}

var (
	chatOCR   = &ocrWorker{name: "chat", js: "A2Chat", every: 1500 * time.Millisecond}
	combatOCR = &ocrWorker{name: "combat", js: "A2Combat", every: 500 * time.Millisecond}
	sheetOCR  = &ocrWorker{name: "sheet", js: "A2Sheet"}
)

func (c *ocrWorker) setArea(a []float64) {
	c.mu.Lock()
	c.area = append([]float64(nil), a...)
	c.mu.Unlock()
}

func (c *ocrWorker) enable(o *overlay, on bool) {
	c.mu.Lock()
	c.on, c.ov = on, o
	start := on && !c.running
	if start {
		c.running = true
	}
	c.mu.Unlock()
	if start {
		go c.loop()
	}
}

func (c *ocrWorker) isOn() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.on
}

func (c *ocrWorker) say(js string) {
	if c.ov != nil {
		a := c.ov.a
		a.w.Dispatch(func() { a.w.Eval(js) })
	}
}

func (c *ocrWorker) startPS() bool {
	if c.cmd != nil {
		return true
	}
	dir := filepath.Join(os.TempDir(), "AION2Helper-ocr-"+c.name)
	os.MkdirAll(dir, 0o755)
	c.dir = dir
	sp := filepath.Join(dir, "ocr.ps1")
	// UTF-8 с BOM, чтобы PowerShell 5 прочитал кириллицу в скрипте
	os.WriteFile(sp, append([]byte{0xEF, 0xBB, 0xBF}, []byte(ocrScript)...), 0o644)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", sp)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	in, err := cmd.StdinPipe()
	if err != nil {
		return false
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return false
	}
	if cmd.Start() != nil {
		return false
	}
	c.cmd, c.in, c.out = cmd, in, bufio.NewReaderSize(out, 1<<16)
	line, err := c.readLine(25 * time.Second)
	if err != nil || !strings.Contains(line, "ready") {
		msg := "не запустилось распознавание текста Windows"
		if strings.Contains(line, "no-ocr") {
			msg = "в Windows не установлен пакет распознавания текста для русского языка (Параметры → Время и язык → Язык → Русский → Дополнительно → Оптическое распознавание)"
		}
		b, _ := json.Marshal(msg)
		c.say("window." + c.js + " && " + c.js + ".status('err'," + string(b) + ")")
		c.stopPS()
		return false
	}
	var r struct{ Ready string }
	json.Unmarshal([]byte(line), &r)
	c.lang = r.Ready
	b, _ := json.Marshal(r.Ready)
	c.say("window." + c.js + " && " + c.js + ".status('ready'," + string(b) + ")")
	return true
}

func (c *ocrWorker) stopPS() {
	if c.cmd != nil {
		c.in.Close()
		c.cmd.Process.Kill()
		c.cmd.Wait()
		c.cmd = nil
	}
}

func (c *ocrWorker) readLine(timeout time.Duration) (string, error) {
	type res struct {
		s   string
		err error
	}
	ch := make(chan res, 1)
	go func() { s, err := c.out.ReadString('\n'); ch <- res{s, err} }()
	select {
	case r := <-ch:
		return strings.TrimSpace(r.s), r.err
	case <-time.After(timeout):
		c.stopPS()
		return "", io.ErrUnexpectedEOF
	}
}

// подготовка картинки для распознавания: яркость, тёмный текст на светлом, ×2
func ocrImage(g mapfind.Gray) *image.Gray { return ocrImageMax(g, 2) }

// k — во сколько раз увеличить; распознавание Windows принимает стороны не больше 2600 точек
func ocrImageMax(g mapfind.Gray, k float64) *image.Gray {
	// чат игры — светлые буквы на тёмном: инвертируем
	var sum float64
	for _, v := range g.P {
		sum += float64(v)
	}
	invert := sum/float64(len(g.P)) < 128
	if m := 2600 / float64(max(g.W, g.H)); k > m {
		k = m
	}
	w, h := int(float64(g.W)*k), int(float64(g.H)*k)
	big := mapfind.Resize(g, w, h)
	im := image.NewGray(image.Rect(0, 0, w, h))
	for i, v := range big.P {
		if invert {
			v = 255 - v
		}
		if v < 0 {
			v = 0
		} else if v > 255 {
			v = 255
		}
		im.Pix[i] = uint8(v)
	}
	return im
}

func (c *ocrWorker) loop() {
	var cb capBuf
	var prev []float32
	fails := 0
	defer func() {
		c.mu.Lock()
		c.running = false
		c.mu.Unlock()
		c.stopPS()
	}()
	for {
		c.mu.Lock()
		on, area, o := c.on, c.area, c.ov
		c.mu.Unlock()
		if !on || o == nil {
			return
		}
		o.mu.Lock()
		fg, mon := o.gameFg, o.mon
		o.mu.Unlock()
		if !fg || mon.R == 0 || len(area) != 4 {
			time.Sleep(time.Second)
			continue
		}
		W, H := float64(mon.R-mon.L), float64(mon.B-mon.T)
		r := rect{mon.L + int32(area[0]*W), mon.T + int32(area[1]*H), mon.L + int32((area[0]+area[2])*W), mon.T + int32((area[1]+area[3])*H)}
		g, ok := cb.grab(r)
		if !ok {
			time.Sleep(2 * time.Second)
			continue
		}
		// чат не изменился — не распознаём заново
		th := mapfind.Resize(g, 64, 32)
		if prev != nil {
			var d float64
			for i := range th.P {
				d += abs32(th.P[i] - prev[i])
			}
			if d/float64(len(th.P)) < 0.6 {
				time.Sleep(c.every)
				continue
			}
		}
		prev = th.P
		if !c.startPS() {
			if fails++; fails > 2 {
				return
			}
			time.Sleep(10 * time.Second)
			continue
		}
		p := filepath.Join(c.dir, c.name+".png")
		f, err := os.Create(p)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		png.Encode(f, ocrImage(g))
		f.Close()
		if _, err := io.WriteString(c.in, p+"\n"); err != nil {
			c.stopPS()
			continue
		}
		line, err := c.readLine(15 * time.Second)
		if err == nil && strings.HasPrefix(line, "{") {
			var r struct {
				Lines []string `json:"lines"`
			}
			if json.Unmarshal([]byte(line), &r) == nil && len(r.Lines) > 0 {
				b, _ := json.Marshal(r.Lines)
				c.say("window." + c.js + " && " + c.js + ".lines(" + string(b) + ")")
			}
		}
		time.Sleep(c.every)
	}
}

func abs32(v float32) float64 {
	if v < 0 {
		return float64(-v)
	}
	return float64(v)
}

// разовое распознавание прямоугольника экрана (окно персонажа в игре): строки текста или ошибка
func (c *ocrWorker) once(r rect) ([]string, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var cb capBuf
	g, ok := cb.grab(r)
	if !ok {
		return nil, "не получилось сделать снимок экрана"
	}
	if !c.startPS() {
		return nil, "не запустилось распознавание текста Windows"
	}
	p := filepath.Join(c.dir, c.name+".png")
	f, err := os.Create(p)
	if err != nil {
		return nil, err.Error()
	}
	png.Encode(f, ocrImageMax(g, 1.6))
	f.Close()
	if _, err := io.WriteString(c.in, p+"\n"); err != nil {
		c.stopPS()
		return nil, err.Error()
	}
	line, err := c.readLine(30 * time.Second)
	if err != nil {
		return nil, "распознавание не ответило"
	}
	var res struct {
		Lines []string `json:"lines"`
		Err   string   `json:"err"`
	}
	json.Unmarshal([]byte(line), &res)
	return res.Lines, res.Err
}
