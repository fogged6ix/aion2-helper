# AION 2 Helper

A small Windows companion app for **AION 2** (global client). One `.exe`, no installer.
Interface in **English** and **Russian** (Settings → Language).

[Русская версия ниже](#русский)

## Features

- **Today** — rift / reset / boss countdowns, daily and weekly task lists, Odyle energy cap, GS goal.
- **Map of Altgard** — bosses, named monsters, dungeons, rifts, cubes, gathering nodes, teleports, your own markers and routes; search by boss, mob, area or item ("where does it drop").
- **Overlay over the game map** — open the map in game and the helper finds it on screen (screenshot matching, like OBS) and draws the selected layers on top, following drag and zoom. Hover a point for an info card; `Ctrl+Shift+C` marks a point as taken. Nothing is sent to the game and clicks pass through.
- **Bosses & timers** — respawn timers from your "killed" mark, drop tables.
- **Calculator** for all 8 classes — skills, stigmas, Daevanion boards, gear with enchanting and manastones, plans and plan comparison; import your character from the official Armory (via metabot.gg).
- **Guide** for every class from top-player data (metabot.gg).
- **Assistant** — a built-in offline helper (answers in Russian), or connect Claude (API key) or a local Ollama model.
- **Game chat reading** (optional) — Windows OCR on the chat area records loot and kinah into a farm session.
- **Auto-update** from GitHub releases.

### Safe by design

The helper never injects input or hooks into the game. It only takes screenshots of the game window (the same way screen recorders do) and reads the mouse position. The game should run in *windowed* or *borderless window* mode for the overlay.

## Install

Download `AION2Helper.exe` from [Releases](../../releases/latest) and run it. Data is stored in the `data` folder next to the exe. Requires Windows 10/11 with the WebView2 runtime (preinstalled on most systems).

## Build from source

Go 1.24+, any OS (cross-compiles to Windows):

```sh
go install github.com/akavel/rsrc@latest          # once; only to re-create the icon resource
rsrc -manifest app.manifest -ico raw/app.ico -arch amd64 -o rsrc_windows_amd64.syso
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-H windowsgui -s -w" -o AION2Helper.exe .
```

Dependencies are vendored in `third_party/` (go-webview2 with a small patch: the window is created hidden), so the build needs no network.
The UI lives in `web/` and is embedded into the exe. `tools/` contains the scripts that generated the game data from scraped pages (the raw dumps are not included).

To publish an update: bump `appVersion` in `main.go`, push, and publish a GitHub release tagged `vX.Y.Z` — the workflow in `.github/workflows/release.yml` builds `AION2Helper.exe` and attaches it automatically.

## Credits

Game data: [metabot.gg](https://metabot.gg). Map points: allthings.how. Map art © NCSOFT. AION is a trademark of NCSOFT; this is an unofficial fan tool.

---

## Русский

**AION 2 Helper** — помощник для AION 2 (глобальный клиент) под Windows. Один exe, без установки. Интерфейс на русском и английском (Настройки → Язык).

- **Сегодня** — таймеры разломов, сбросов и боссов, ежедневные и недельные дела, энергия Одилы, цель по GS.
- **Карта Альтгарда** — боссы, именные монстры, подземелья, разломы, кубы, ресурсы, телепорты, свои метки и маршруты; поиск «где падает предмет».
- **Подсветка поверх карты игры** — открываешь карту в игре, помощник сам находит её на экране и рисует точки поверх, двигая их вместе с картой. Наведение — карточка с описанием, `Ctrl+Shift+C` — «взято». В игру ничего не отправляется.
- **Боссы и таймеры**, **калькулятор** для всех 8 классов (умения, стигмы, Дэванион, снаряжение, планы, импорт из Armory), **гайды** по каждому классу.
- **Помощник** — встроенный (без интернета) или Claude / Ollama.
- **Чтение чата игры** (по желанию) — добыча и кинары записываются сами.
- **Автообновление** из выпусков на GitHub.

Скачать: [Releases](../../releases/latest) → `AION2Helper.exe`. Данные хранятся в папке `data` рядом с программой.
