/* Чтение чата игры: строки, распознанные Windows из выбранной области экрана,
   превращаются в записи журнала — добыча, кинары, убийства боссов. */
(function () {
  const app = () => window.A2App;
  const X = () => window.EXTRA || { items: [], bosses: [] };
  const low = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");
  // типичные ошибки распознавания: латиница вместо кириллицы
  const LAT = { a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", k: "к", m: "м", t: "т", b: "в", h: "н" };
  const fix = (s) => low(s).replace(/[aeopcxykmtbh](?=[а-я])|(?<=[а-я])[aeopcxykmtbh]/g, (c) => LAT[c] || c).replace(/\s+/g, " ").trim();
  const key = (s) => fix(s).replace(/[^а-яa-z0-9]/g, "");

  let seen = new Map();   // строка → когда видели (не считаем повторно)
  let primed = false;     // первую порцию (старый чат) только запоминаем
  let itemIdx = null;
  function items() {
    if (!itemIdx) itemIdx = X().items.map((it, i) => ({ i, name: it[0], hay: key(it[0]) })).filter((x) => x.hay.length >= 4).sort((a, b) => b.hay.length - a.hay.length);
    return itemIdx;
  }
  let bossIdx = null;
  function bosses() {
    if (!bossIdx) {
      const list = [];
      X().bosses.forEach((b) => list.push({ slug: b[0], name: b[1] }));
      if (window.A2Bosses && window.A2Bosses.list) window.A2Bosses.list().forEach((b) => list.push({ slug: b.slug, name: b.name }));
      // ключевое слово — собственное имя: последнее слово («Кашапа», «Ноблуд»), плюс вариант в скобках
      bossIdx = [];
      list.forEach((b) => {
        const alt = /\(([^)]+)\)/.exec(b.name), base = b.name.replace(/\([^)]*\)/g, "").trim().split(/\s+/);
        [base[base.length - 1], alt && alt[1]].filter(Boolean).forEach((w) => { const kw = key(w); if (kw.length >= 4) bossIdx.push({ ...b, kw }); });
      });
    }
    return bossIdx;
  }
  const st = () => app().state;
  function feed(kind, text) {
    const u = st().ui; u.chatFeed = u.chatFeed || [];
    u.chatFeed.push({ at: Date.now(), kind, text }); while (u.chatFeed.length > 40) u.chatFeed.shift();
    document.dispatchEvent(new Event("a2chat"));
  }
  const money = (s) => { const d = String(s).replace(/[^\d]/g, ""); return d ? +d : 0; };

  // разбор одной строки чата → что сделали (для проверки)
  function parse(line, now = Date.now()) {
    const t = fix(line), k = key(line), out = [];
    if (!k || k.length < 4) return out;
    // кинары: «получено 12 345 кинаров», «+12 345 кинар»
    let m = /(\d[\d\s.,']{0,14}\d|\d)\s*кина?р/.exec(t);
    if (m && !/(потрат|трат|заплат|списан|стоимост|цен|купил|покуп|комисс)/.test(t)) {
      const v = money(m[1]);
      if (v > 0 && v < 5e9) out.push({ kind: "kinah", v });
    }
    // убийство босса
    if (/(побежд|повержен|уничтож|убит|победил|сражен|пал(?![а-я]))/.test(t)) {
      const b = bosses().find((b) => k.includes(b.kw));
      if (b) out.push({ kind: "kill", slug: b.slug, name: b.name });
    }
    // добыча: «Вы получили [Плавильный камень] x2», «Получен предмет: …»
    if (/(получ|добыт|подобра|выпал|приобрет)/.test(t) && !out.some((o) => o.kind === "kinah")) {
      const it = items().find((x) => k.includes(x.hay));
      if (it) { const n = /[xх×]\s*(\d{1,3})(?!\d)/.exec(t); out.push({ kind: "loot", item: it.i, name: it.name, n: n ? +n[1] : 1 }); }
    }
    return out;
  }

  // применить: записать в журнал / фарм-сессию
  function apply(ev, now) {
    const S = st();
    if (ev.kind === "kinah") {
      if (S.session) S.session.kinah = (S.session.kinah || 0) + ev.v;
      S.ui.chatKinah = S.ui.chatKinah || {}; const d = new Date(now).toDateString();
      if (S.ui.chatKinah.d !== d) S.ui.chatKinah = { d, v: 0 };
      S.ui.chatKinah.v += ev.v;
      feed("kinah", `+${ev.v.toLocaleString("ru-RU")} кинаров` + (S.session ? " → в фарм-сессию" : ""));
    } else if (ev.kind === "kill") {
      const r = window.A2Brain ? window.A2Brain.command("убил " + ev.name) : null;
      feed("kill", `${ev.name} — убит` + (r ? ", таймер запущен" : ""));
    } else if (ev.kind === "loot") {
      S.loot = S.loot || [];
      // с кого: босс, убитый в последние 3 минуты
      const lk = (S.kills || []).filter((x) => now - x.at < 3 * 60e3).slice(-1)[0];
      for (let i = 0; i < Math.min(ev.n, 20); i++) S.loot.push({ at: now, slug: lk ? lk.slug : null, item: ev.item, src: "chat" });
      feed("loot", `${ev.name}${ev.n > 1 ? " ×" + ev.n : ""}` + (lk ? " (с босса)" : ""));
    }
  }

  // пришли строки из Go
  function lines(arr, now = Date.now()) {
    let n = 0;
    for (const [k, t] of seen) if (now - t > 20 * 60e3) seen.delete(k);
    const fresh = [];
    arr.forEach((l) => { const k = key(l); if (k.length >= 4 && !seen.has(k)) { seen.set(k, now); fresh.push(l); } });
    if (!primed) { primed = true; status("live"); return 0; } // старые строки чата не считаем
    fresh.forEach((l) => parse(l, now).forEach((ev) => { apply(ev, now); n++; }));
    if (n) app().save();
    last = arr.slice(-6);
    document.dispatchEvent(new Event("a2chat"));
    return n;
  }
  let last = [], state = "off", stMsg = "";
  function status(kind, msg) {
    state = kind; stMsg = msg || "";
    if (kind === "err") app().toast("Чтение чата не работает", msg || "");
    if (kind === "ready") app().toast("Читаю чат игры", "Добычу, кинары и убийства боссов буду записывать сам. Распознавание: " + (msg || "Windows") + ".", "ok");
    document.dispatchEvent(new Event("a2chat"));
  }
  function cfg() { const s = app().state.settings; return { on: !!s.chatRead, area: s.chatArea || null }; }
  function sendHost() {
    const c = cfg();
    if (typeof window.hostOverlay !== "function") return;
    const p = { chatOn: c.on && !!c.area };
    if (c.area) p.chat = c.area;
    window.hostOverlay(JSON.stringify(p));
  }
  // выбрали область чата на экране
  function area(a) {
    const s = app().state.settings; s.chatArea = a; s.chatRead = true; primed = false; app().save();
    sendHost(); app().toast("Область чата запомнил", "Теперь помощник сам видит добычу и кинары из чата.", "ok");
    document.dispatchEvent(new Event("a2chat"));
  }
  function select() {
    if (typeof window.hostOverlay !== "function") { app().toast("Работает в программе для Windows", ""); return; }
    window.hostOverlay(JSON.stringify({ selectChat: true }));
  }
  function enable(on) {
    const s = app().state.settings; s.chatRead = !!on; app().save(); primed = false;
    if (on && !s.chatArea) { select(); return; }
    sendHost(); document.dispatchEvent(new Event("a2chat"));
  }
  setTimeout(() => { try { if (app() && app().state) sendHost(); } catch (e) { } }, 400);
  window.A2Chat = { parse, lines, area, select, enable, status, sendHost, get last() { return last; }, get state() { return state; }, _reset() { seen = new Map(); primed = true; } };
})();
