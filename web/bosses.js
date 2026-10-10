/* Полевые боссы Альтгарда: таймеры возрождения, свои таймеры, поиск «где падает» */
(function () {
  const X = window.EXTRA || { bosses: [], mobs: [], items: [] };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = () => window.A2App;
  const L = window.A2L;
  // Возрождение считается от убийства. Значения — по гайдам для глобальной версии (половина корейских таймеров); поправь, если в игре иначе.
  const DEF_MIN = { "melted-danar": 30, "predator-garsan": 120, "silent-dartan": 180, "soul-ruler-kashapa": 360, "high-commander-lagta": 360, "immortal-gartua": 360 };
  const defMin = (slug) => DEF_MIN[slug] || 120;
  const GR = { C: ["Обычн.", "#c9c3d6"], R: ["Редк.", "#5fd08a"], L: ["Легенд.", "#5aa8ff"], U: ["Уник.", "#ff9a3c"], E: ["Эпич.", "#e05cff"], S: ["Особ.", "#38e0d0"] };
  const mobBySlug = {}; X.mobs.forEach((m) => mobBySlug[m[0]] = m);

  function store() { const st = app().state; st.bossT = st.bossT || {}; st.timers = st.timers || []; return st; }
  function bt(slug) { const s = store().bossT; return s[slug] = s[slug] || {}; }
  function respawnAt(slug) { const b = store().bossT[slug]; if (!b || !b.killed) return null; return b.killed + (b.every || defMin(slug)) * 60e3; }

  // события для общего списка (виджет, уведомления)
  function events(now) {
    const out = [];
    X.bosses.forEach(([slug, name, lv, zone]) => {
      const at = respawnAt(slug); if (!at || at < now - 15 * 60e3) return;
      out.push({ id: "boss:" + slug, name: name.split(" ").slice(-1)[0], long: name + " (" + lv + ")", hint: "Полевой босс · " + zone + ". Таймер от твоей отметки «убит».", at, period: 0, boss: true });
    });
    store().timers.forEach((t) => {
      const at = timerAt(t, now); if (!at) return;
      out.push({ id: "tm:" + t.id, name: t.name, long: t.name, hint: "Свой таймер", at, period: 0 });
    });
    return out;
  }
  function timerAt(t, now) {
    if (t.kind === "daily") { try { const [h, m] = t.time.split(":").map(Number); const d = new Date(now); d.setHours(h, m, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime(); } catch (e) { return null; } }
    if (!t.start) return null;
    const per = (t.min || 60) * 60e3;
    if (!t.repeat) return t.start + per > now - 60e3 ? t.start + per : null;
    const n = Math.ceil((now - t.start) / per); return t.start + Math.max(1, n) * per;
  }

  // ---------- отрисовка ----------
  let root = null;
  function render() {
    root = $("#bosses-root"); if (!root) return;
    const st = store(), now = Date.now();
    const rows = X.bosses.map((b) => ({ b, at: respawnAt(b[0]) }))
      .sort((x, y) => (x.at ? 0 : 1) - (y.at ? 0 : 1) || (x.at || 0) - (y.at || 0) || x.b[2] - y.b[2]);
    root.innerHTML = `
      <div class="boss-cols">
        <div class="panel boss-panel">
          <div class="res-head"><h3>Полевые боссы Альтгарда</h3><span class="muted small">Нажми «Убит», когда босс упал, — появится обратный отсчёт.</span></div>
          <ul class="boss-list">${rows.map(({ b, at }) => card(b, at, now)).join("")}</ul>
          <p class="muted small">Время возрождения по умолчанию — из гайдов для глобальной версии (считается от убийства). Если в игре другое — поменяй минуты у босса, программа запомнит. Данные о боссах и добыче — metabot.gg.</p>
        </div>
        <div class="stack-col">
          <div class="panel">
            <h3>Где падает предмет</h3>
            <div class="drop-q"><svg class="ic sm"><use href="#i-search"/></svg><input id="drop-q" placeholder="Например: плавильный камень, перчатки спектра, картина" autocomplete="off"></div>
            <div id="drop-res" class="drop-res"><p class="muted small">Ищет по добыче ${X.mobs.length} видов монстров Альтгарда (ур. 25+) и полевых боссов.</p></div>
          </div>
          <div class="panel">
            <div class="res-head"><h3>Свои таймеры</h3></div>
            <ul class="tm-list">${st.timers.map((t) => timerRow(t, now)).join("") || '<li class="muted small">Например: «Куб в Лесу Маэллан — каждые 30 мин» или «Гильдия — каждый день в 20:00».</li>'}</ul>
            <form class="tm-form" id="tm-form">
              <input name="name" placeholder="Название" maxlength="40" required>
              <select name="kind"><option value="once">через N мин</option><option value="repeat">каждые N мин</option><option value="daily">каждый день в</option></select>
              <input name="val" placeholder="30" required>
              <button class="btn primary" type="submit"><svg class="ic sm"><use href="#i-plus"/></svg></button>
            </form>
          </div>
        </div>
      </div>`;
    bind();
  }
  function fmtLeft(ms) { if (ms <= 0) return "уже"; return L.fmtDelta(ms); }
  function card(b, at, now) {
    const [slug, name, lv, zone, cat] = b, t = store().bossT[slug] || {};
    const every = t.every || defMin(slug);
    const left = at ? at - now : null, ready = at && left <= 0;
    const m = mobBySlug[slug], top = m ? m[6].filter((r) => { const it = X.items[r[0]]; return it && r[1] >= 1 && r[1] < 100 && /U|E|L|R/.test(it[1]) && !/Сундук|Камень духа/.test(it[0]); }).slice(0, 4) : [];
    return `<li class="boss ${ready ? "ready" : at ? "wait" : ""} ${lv >= 48 ? "big" : ""}" data-s="${slug}">
      <div class="b-main">
        <b>${esc(name)}</b><small>${lv} ур. · ${esc(zone)}</small>
        ${top.length ? `<span class="b-drop">${top.map((r) => `<i style="color:${(GR[X.items[r[0]][1]] || GR.C)[1]}">${esc(X.items[r[0]][0])} ${r[1].toString().replace(".", ",")}%</i>`).join("")}</span>` : ""}
      </div>
      <div class="b-time">${at ? (ready ? '<b class="ok">должен быть</b>' : `<b>${fmtLeft(left)}</b>`) + `<small>${ready ? "с " : "в "}${new Date(at).toTimeString().slice(0, 5)}</small>` : '<small class="muted">нет отметки</small>'}</div>
      <div class="b-act">
        <button class="btn sm primary" data-kill>Убит</button>
        ${at ? '<button class="btn sm ghost" data-m5 title="Убит на 5 минут раньше">−5 мин</button><button class="ib" data-clr title="Сбросить отметку"><svg class="ic sm"><use href="#i-close"/></svg></button>' : ""}
        <label class="b-every" title="Минут до возрождения после убийства"><input type="number" min="1" max="2880" value="${every}" data-every>мин</label>
        ${cat ? `<button class="ib" data-map="${cat}" title="Показать на карте"><svg class="ic sm"><use href="#i-map"/></svg></button>` : ""}
      </div></li>`;
  }
  function timerRow(t, now) {
    const at = timerAt(t, now);
    const what = t.kind === "daily" ? `каждый день в ${esc(t.time)}` : t.repeat ? `каждые ${t.min} мин` : `${t.min} мин`;
    return `<li data-t="${t.id}"><span><b>${esc(t.name)}</b><small>${what}</small></span><span class="tm-left">${at ? fmtLeft(at - now) : "—"}</span>
      ${t.kind !== "daily" ? '<button class="btn sm ghost" data-restart title="Запустить заново с этой минуты">заново</button>' : ""}<button class="ib" data-del title="Удалить"><svg class="ic sm"><use href="#i-close"/></svg></button></li>`;
  }
  function bind() {
    const save = () => app().save();
    $$(".boss", root).forEach((li) => {
      const slug = li.dataset.s, t = store().bossT[slug] || {};
      $("[data-kill]", li).onclick = () => { bt(slug).killed = Date.now(); save(); render(); app().toast(li.querySelector("b").textContent, "Отмечен. Напомню перед возрождением.", "ok"); };
      const m5 = $("[data-m5]", li); if (m5) m5.onclick = () => { t.killed -= 5 * 60e3; save(); render(); };
      const clr = $("[data-clr]", li); if (clr) clr.onclick = () => { delete t.killed; save(); render(); };
      $("[data-every]", li).onchange = (e) => { const v = Math.max(1, Math.min(2880, +e.target.value || defMin(slug))); const b = bt(slug); if (v === defMin(slug)) delete b.every; else b.every = v; save(); render(); };
      const mp = $("[data-map]", li); if (mp) mp.onclick = () => showOnMap(mp.dataset.map);
    });
    const f = $("#tm-form", root);
    f.onsubmit = (e) => {
      e.preventDefault();
      const name = f.name.value.trim(), kind = f.kind.value, val = f.val.value.trim();
      if (!name) return;
      const t = { id: Math.random().toString(36).slice(2, 8), name };
      if (kind === "daily") { if (!/^\d{1,2}:\d{2}$/.test(val)) { app().toast("Время", "Формат ЧЧ:ММ, например 20:00"); return; } t.kind = "daily"; t.time = val.padStart(5, "0"); }
      else { const n = +val.replace(",", "."); if (!(n > 0)) { app().toast("Минуты", "Укажи число минут"); return; } t.min = Math.round(n); t.repeat = kind === "repeat"; t.start = Date.now(); }
      store().timers.push(t); save(); render();
    };
    $$(".tm-list li[data-t]", root).forEach((li) => {
      const t = store().timers.find((x) => x.id === li.dataset.t);
      $("[data-del]", li).onclick = () => { store().timers = store().timers.filter((x) => x !== t); save(); render(); };
      const rs = $("[data-restart]", li); if (rs) rs.onclick = () => { t.start = Date.now(); save(); render(); };
    });
    const q = $("#drop-q", root);
    q.oninput = () => dropSearch(q.value);
  }
  function showOnMap(cat) {
    const go = () => { app().showView("map"); setTimeout(() => window.A2Map && window.A2Map.focusCat(cat), 120); };
    if (!document.body.classList.contains("m-full")) app().setMode("full").then(go); else go();
  }

  // ---------- поиск добычи ----------
  const itemIdx = X.items.map((it, i) => ({ i, name: it[0], g: it[1], hay: it[0].toLowerCase().replace(/ё/g, "е") }));
  const sources = {}; X.mobs.forEach((m) => m[6].forEach(([it, ch]) => (sources[it] = sources[it] || []).push([m, ch])));
  function findItems(q) {
    q = q.trim().toLowerCase().replace(/ё/g, "е"); if (q.length < 2) return [];
    const w = q.split(/\s+/);
    return itemIdx.filter((x) => w.every((y) => x.hay.includes(y)) && sources[x.i]).sort((a, b) => (a.hay.startsWith(q) ? 0 : 1) - (b.hay.startsWith(q) ? 0 : 1) || a.name.length - b.name.length).slice(0, 8);
  }
  function sourceList(i, limit = 8) {
    return (sources[i] || []).slice().sort((a, b) => b[1] - a[1]).slice(0, limit);
  }
  function dropSearch(q) {
    const box = $("#drop-res", root), res = findItems(q);
    if (!q.trim()) { box.innerHTML = `<p class="muted small">Ищет по добыче ${X.mobs.length} видов монстров Альтгарда (ур. 25+) и полевых боссов.</p>`; return; }
    if (!res.length) { box.innerHTML = '<p class="muted small">Такой добычи у монстров Альтгарда нет. Возможно, предмет из подземелий, сундуков или крафта.</p>'; return; }
    box.innerHTML = res.map((x) => `<div class="drop-it"><b style="color:${(GR[x.g] || GR.C)[1]}">${esc(x.name)}</b>
      <ul>${sourceList(x.i).map(([m, ch]) => `<li><span>${esc(m[1])} <small>${m[2]} ур. · ${esc((m[4] || []).slice(0, 2).join(", "))}</small></span><b>${String(ch).replace(".", ",")}%</b><small class="k90">${kills90(ch)}</small>${m[5] ? `<button class="ib" data-map="${m[5]}" title="Показать на карте"><svg class="ic sm"><use href="#i-map"/></svg></button>` : ""}</li>`).join("")}</ul></div>`).join("");
    $$("[data-map]", box).forEach((b) => b.onclick = () => showOnMap(b.dataset.map));
  }
  function kills90(ch) { if (ch >= 100) return "1 убийство"; const n = Math.ceil(Math.log(0.1) / Math.log(1 - ch / 100)); return "90% за " + n.toLocaleString("ru-RU"); }

  // обновление каждую секунду, пока открыт экран
  let lastSec = 0;
  function tick(now) {
    if (!root || !document.body.classList.contains("m-full") || app().state.ui.view !== "bosses") return;
    if (now - lastSec < 1000) return; lastSec = now;
    $$(".boss", root).forEach((li) => {
      const at = respawnAt(li.dataset.s); if (!at) return;
      const left = at - now, el = $(".b-time b", li);
      if (left <= 0 && !li.classList.contains("ready")) { render(); return; }
      if (el && left > 0) el.textContent = fmtLeft(left);
    });
    $$(".tm-list li[data-t]", root).forEach((li) => { const t = store().timers.find((x) => x.id === li.dataset.t); const at = t && timerAt(t, now); const el = $(".tm-left", li); if (el) el.textContent = at ? fmtLeft(at - now) : "—"; });
  }

  window.A2Bosses = { render, events, respawnAt, tick, findItems, sourceList, kills90, showOnMap, timerAt };
})();
