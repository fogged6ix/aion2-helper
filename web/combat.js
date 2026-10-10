/* Счётчик урона (DPS): Windows распознаёт текст из выбранной области экрана — вкладки журнала боя
   в чате игры, — а здесь строки про урон складываются в бои: урон, длительность, DPS, лучшие умения.
   Только снимок экрана: в игру ничего не посылается и сетевой трафик игры не читается. */
(function () {
  const app = () => window.A2App;
  const low = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");
  const LAT = { a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", k: "к", m: "м", t: "т", b: "в", h: "н" };
  const fix = (s) => low(s).replace(/[aeopcxykmtbh](?=[а-я])|(?<=[а-я])[aeopcxykmtbh]/g, (c) => LAT[c] || c).replace(/\s+/g, " ").trim();
  const key = (s) => fix(s).replace(/[^а-яa-z0-9]/g, "");
  const GAP = 6000;          // столько мс без попаданий — бой закончился
  const KEEP = 30;           // сколько последних боёв хранить

  // число из строки: «12 345», «12.345», «12,345»
  const toNum = (s) => { const d = String(s).replace(/[^\d]/g, ""); return d ? +d : 0; };
  const NUM = "(\\d{1,3}(?:[ \\u00a0.,']\\d{3})+|\\d+)";
  const reDmg = [
    new RegExp(NUM + "\\s*(?:ед\\.?\\s*)?(?:урон|ур\\.)"),             // «нанесли 12 345 ед. урона»
    new RegExp("урон[а-я]*\\s*(?:в размере|:)?\\s*" + NUM),             // «урон: 12 345»
    new RegExp(NUM + "\\s*(?:damage|dmg)", "i"),                         // английский клиент
    new RegExp("(?:damage|dmg)[a-z ]*?" + NUM, "i"),
  ];
  const IN = /(вам |вас |вы получ|получает? от|по вам|you take|you received|to you)/;
  const SKIP = /(восстан|исцел|лечени|heal|restor|поглощ|absorb|щит|shield)/;

  // строка журнала боя → попадание или null
  function parse(line) {
    const t = fix(line);
    if (!/(урон|ур\.|damage|dmg)/i.test(t) || SKIP.test(t)) return null;
    let v = 0;
    for (const re of reDmg) { const m = re.exec(t); if (m) { v = toNum(m[1]); break; } }
    if (!v || v > 5e7) return null;
    const skill = (/\[([^\]]{2,40})\]/.exec(line) || /(?:умени[еяю]м?|навык[аом]*|using|with)\s+«?([^,.»]{2,40})/i.exec(line) || [])[1] || "";
    return { v, incoming: IN.test(t + " "), crit: /(крит|critical)/.test(t), skill: skill.trim() };
  }

  // ---------- новые строки между снимками ----------
  // окно журнала показывает последние N строк; находим, где старый снимок стыкуется с новым
  let prev = [];
  function freshLines(arr) {
    const ks = arr.map(key);
    if (!prev.length) { prev = ks; return arr; }
    let best = 0;
    for (let k = Math.min(prev.length, ks.length); k > 0; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) if (prev[prev.length - k + i] !== ks[i]) { ok = false; break; }
      if (ok) { best = k; break; }
    }
    // совсем не стыкуется: возможно, снимок съехал — берём только строки, которых не было в старом снимке
    const out = best ? arr.slice(best) : arr.filter((_, i) => !prev.includes(ks[i]));
    prev = ks;
    return out;
  }

  // ---------- бои ----------
  const st = () => app().state;
  const store = () => { const S = st(); S.combat = S.combat || { fights: [] }; return S.combat; };
  let cur = null, primed = false, last = [];
  function hit(h, now) {
    if (h.incoming) { if (cur) { cur.taken += h.v; cur.lastAt = now; } return; }
    if (!cur || now - cur.lastAt > GAP) { finish(); cur = { start: now, lastAt: now, dmg: 0, hits: 0, crits: 0, max: 0, taken: 0, skills: {} }; }
    cur.dmg += h.v; cur.hits++; cur.lastAt = now;
    if (h.crit) cur.crits++;
    if (h.v > cur.max) cur.max = h.v;
    const sk = h.skill || "—"; cur.skills[sk] = (cur.skills[sk] || 0) + h.v;
  }
  const dur = (f) => Math.max(1, (f.lastAt - f.start) / 1000);
  const dps = (f) => Math.round(f.dmg / dur(f));
  function finish() {
    if (!cur) return;
    const f = cur; cur = null;
    if (f.hits < 2 || f.dmg <= 0) return;
    const C = store();
    C.fights.push({ at: f.start, sec: Math.round(dur(f)), dmg: f.dmg, dps: dps(f), hits: f.hits, crits: f.crits, max: f.max, taken: f.taken,
      top: Object.entries(f.skills).sort((a, b) => b[1] - a[1]).slice(0, 5) });
    while (C.fights.length > KEEP) C.fights.shift();
    if (!C.best || dps(f) > C.best) C.best = dps(f);
    app().save();
    emit();
  }
  function lines(arr, now = Date.now()) {
    last = arr.slice(-6);
    const fresh = freshLines(arr);
    if (!primed) { primed = true; state = "live"; emit(); return 0; } // то, что уже было в журнале, не считаем
    let n = 0;
    fresh.forEach((l) => { const h = parse(l); if (h) { hit(h, now); n++; } });
    if (n) emit();
    return n;
  }
  // бой закончился, если долго нет попаданий
  setInterval(() => { if (cur && Date.now() - cur.lastAt > GAP) finish(); else if (cur) emit(); }, 1000);

  const emit = () => document.dispatchEvent(new Event("a2combat"));
  let state = "off";
  function status(kind, msg) {
    state = kind;
    if (kind === "err") app().toast("Счётчик урона не работает", msg || "");
    if (kind === "ready") app().toast("Считаю урон", "Журнал боя распознаётся встроенным распознаванием Windows.", "ok");
    emit();
  }
  function cfg() { const s = st().settings; return { on: !!s.combatRead, area: s.combatArea || null }; }
  function sendHost() {
    if (typeof window.hostOverlay !== "function") return;
    const c = cfg(), p = { combatOn: c.on && !!c.area };
    if (c.area) p.combat = c.area;
    window.hostOverlay(JSON.stringify(p));
  }
  function area(a) {
    const s = st().settings; s.combatArea = a; s.combatRead = true; primed = false; prev = []; app().save();
    sendHost(); app().toast("Область журнала боя запомнил", "Бей монстра — урон и DPS появятся в виджете.", "ok"); emit();
  }
  function select() {
    if (typeof window.hostOverlay !== "function") { app().toast("Работает в программе для Windows", ""); return; }
    window.hostOverlay(JSON.stringify({ selectCombat: true }));
  }
  function enable(on) {
    const s = st().settings; s.combatRead = !!on; app().save(); primed = false; prev = [];
    if (on && !s.combatArea) { select(); return; }
    if (!on) finish();
    sendHost(); emit();
  }
  function reset() { cur = null; const C = store(); C.fights = []; C.best = 0; app().save(); emit(); }
  // текущий бой (живые цифры) или последний законченный
  function live() {
    if (cur) return { live: true, dmg: cur.dmg, dps: dps(cur), sec: Math.round(dur(cur)), hits: cur.hits, max: cur.max, crits: cur.crits };
    const f = store().fights.slice(-1)[0];
    return f ? Object.assign({ live: false }, f) : null;
  }
  setTimeout(() => { try { if (app() && app().state) sendHost(); } catch (e) { } }, 450);
  window.A2Combat = { parse, lines, area, select, enable, status, reset, live, sendHost, fights: () => store().fights, get last() { return last; }, get state() { return state; },
    _reset() { cur = null; prev = []; primed = true; } };
})();

/* Пинг до сервера игры: приходит из Go раз в пару секунд */
(function () {
  let last = null;
  window.A2Ping = {
    update(r) { last = Object.assign({ at: Date.now() }, r); document.dispatchEvent(new Event("a2ping")); },
    get last() { return last && Date.now() - last.at < 15000 ? last : null; },
    send(on) { if (typeof window.hostOverlay === "function") window.hostOverlay(JSON.stringify({ ping: !!on })); if (!on) { last = null; document.dispatchEvent(new Event("a2ping")); } },
  };
})();
