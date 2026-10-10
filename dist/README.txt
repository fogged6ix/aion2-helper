AION 2 Helper — portable folder
==============================

Run AION2Helper.exe. Everything the app remembers is stored right here, in the data folder.
You can move the folder anywhere (another drive, a USB stick) — the data goes with it.

Language: Settings → Language (English / Русский). The window reloads.
The built-in assistant (no AI) answers in Russian; Claude and Ollama answer in the interface language.

If Windows blocks the launch
----------------------------
The app has no paid code-signing certificate, so Windows is cautious with files from the internet.
• Blue "Windows protected your PC" window → "More info" → "Run anyway".
• Better, once before extracting: right-click the downloaded AION2Helper.zip → Properties →
  tick "Unblock" at the bottom → OK. Then extract — launches are no longer blocked.
• If your antivirus removed the exe, add the folder to exclusions. Source code: github.com/fogged6ix/aion2-helper

What is where
-------------
AION2Helper.exe          — the app (UI, map and game data are inside the file)
data\settings.json       — settings and window layout
data\timers.json         — boss timers and your reminders
data\journal.json        — boss kills, loot and farm sessions
data\secrets.json        — Claude API key (if you entered one). NEVER SHARE IT
data\characters\<Name>\  — per-character folder (tasks, GS history, calculator build, chat)
data\backups\            — full backups for the last 14 days (restore: Settings)
exports\                 — files from the "Share…" buttons

Overlay over the game map
-------------------------
• Nothing to set up: open the map in game and the helper finds it on screen (from a screenshot,
  like screen recorders do) and places the points. Drag or zoom the map — the points follow.
• Hover a point for an info card. Ctrl+Shift+C over a point marks it "taken".
• The game must be in windowed or borderless-window mode (in fullscreen the screenshot is black).
• If the map isn't found automatically: Ctrl+Shift+N → click a turquoise teleport statue, then the same
  statue on the game map, twice → Enter.
• Overlay on/off: Ctrl+Shift+M. Nothing is sent to the game; clicks pass through.

Updates
-------
Once a day the app checks GitHub (fogged6ix/aion2-helper) for a new release and offers a one-click update.
Your data folder is not touched.

On first start the app asks for your character's name and class (all 8 classes are supported).
To move to another PC, copy the whole folder.
