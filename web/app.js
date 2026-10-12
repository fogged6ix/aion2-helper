/* AION 2 · помощник — интерфейс */
(function () {
  const L = window.A2L, C = window.CONTENT;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CHECK_SVG = '<svg viewBox="0 0 12 12"><path d="M2 6.5l2.6 2.5L10 3.5"/></svg>';

  // ---------- мост к окну (Go/WebView2). В браузере — заглушки ----------
  const inHost = typeof window.hostLoad === "function";
  const host = {
    load: () => inHost ? window.hostLoad() : Promise.resolve(safeLS("get")),
    save: (s) => inHost ? window.hostSave(s) : Promise.resolve(safeLS("set", s)),
    mode: (m) => inHost ? window.hostMode(m) : Promise.resolve(),
    fade: (a, ms) => inHost ? window.hostFade(a, ms) : Promise.resolve(),
    drag: () => inHost ? window.hostDrag() : Promise.resolve(),
    min: () => inHost ? window.hostMin() : Promise.resolve(),
    close: () => inHost ? window.hostClose() : Promise.resolve(),
    top: (b) => inHost ? window.hostTop(b) : Promise.resolve(),
    beep: () => inHost ? window.hostBeep() : Promise.resolve(),
    dock: () => inHost ? window.hostDock() : Promise.resolve(),
    info: () => inHost ? window.hostInfo() : Promise.resolve(""),
    has: (n) => typeof window[n] === "function",
    call: (n, ...a) => typeof window[n] === "function" ? window[n](...a) : Promise.resolve(null),
  };
  // сетевые запросы идут через Go (обходит CORS), в браузере — обычный fetch
  const fetchWaits = {}; let fetchSeq = 0;
  window.__a2f = (id, r) => { const f = fetchWaits[id]; delete fetchWaits[id]; if (f) f(r); };
  // opts: {method, headers, body} — для POST (обновление профиля на сайте)
  function netGet(url, opts) {
    if (host.has("hostFetch")) return new Promise((res) => { const id = ++fetchSeq; fetchWaits[id] = res; window.hostFetch(url, JSON.stringify(opts || {}), id); setTimeout(() => { if (fetchWaits[id]) { delete fetchWaits[id]; res({ status: 0, error: "timeout" }); } }, 30000); });
    return fetch(url, opts || undefined).then(async (r) => ({ status: r.status, body: await r.text() })).catch((e) => ({ status: 0, error: String(e) }));
  }
  // вызов функции Go, которая отвечает асинхронно через __a2f(id, результат)
  function hostAsyncT(ms, fn, ...args) {
    return new Promise((res) => {
      if (typeof window[fn] !== "function") { res({ status: 0, error: "нет в браузере" }); return; }
      const id = ++fetchSeq; fetchWaits[id] = res; window[fn](...args, id);
      setTimeout(() => { if (fetchWaits[id]) { delete fetchWaits[id]; res({ status: 0, error: "timeout" }); } }, ms);
    });
  }
  const hostAsync = (fn, ...args) => hostAsyncT(8000, fn, ...args);
  window.A2Net = { get: netGet, call: hostAsync, callT: hostAsyncT };
  function safeLS(op, v) { try { if (op === "get") return localStorage.getItem("a2h") || ""; localStorage.setItem("a2h", v); } catch (e) { } return ""; }

  let st = L.newState();
  let pid = "main";
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => host.save(JSON.stringify(st)), 250); }
  const CL = window.A2CLS;
  const CLS_RU = new Proxy({}, { get: (_, k) => CL.name(k) }), CLS_GEN = new Proxy({}, { get: (_, k) => CL.gen(k) });
  // заготовка до первого запуска: при старте программа сразу просит создать своего персонажа
  const DEFAULT_CHARS = [{ id: "main", name: "Мой персонаж", cls: "ranger", guide: "ranger" }];
  function chars() { if (!Array.isArray(st.chars) || !st.chars.length) st.chars = JSON.parse(JSON.stringify(DEFAULT_CHARS)); return st.chars; }
  const ch = () => chars().find((c) => c.id === pid) || chars()[0];
  const prof = () => C.profiles[ch().cls] || C.profiles[ch().guide] || C.profiles.ranger;
  const pst = () => { const p = L.profile(st, pid); p.checks.mine = p.checks.mine || {}; return p; };
  function lists() {
    const p = pst();
    if (!p.lists) {
      p.lists = { daily: prof().daily.map((t, i) => ({ id: "d" + i, t })), weekly: prof().weekly.map((t, i) => ({ id: "w" + i, t })), mine: [] };
      for (const [k, pre] of [["daily", "d"], ["weekly", "w"]]) for (const key of Object.keys(p.checks[k])) if (/^\d+$/.test(key)) { p.checks[k][pre + key] = p.checks[k][key]; delete p.checks[k][key]; }
    }
    p.lists.mine = p.lists.mine || [];
    return p.lists;
  }
  const uid = () => Math.random().toString(36).slice(2, 9);
  const S = () => st.settings;

  // ---------- кольцо разлома ----------
  let ringSeq = 0;
  function makeRing(el, size) {
    const id = "r" + (++ringSeq), r = size / 2 - 10, c = 2 * Math.PI * r, cx = size / 2;
    let ticks = "";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI - Math.PI / 2, r1 = r + 6, r2 = r + (i % 8 === 0 ? 10 : 8);
      ticks += `<line x1="${cx + r1 * Math.cos(a)}" y1="${cx + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cx + r2 * Math.sin(a)}"/>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3e2b8"/><stop offset=".55" stop-color="#c9a063"/><stop offset="1" stop-color="#8a6a3a"/></linearGradient>
        <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd6a0"/><stop offset="1" stop-color="#e0a15a"/></linearGradient>
      </defs>
      <g class="ticks">${ticks}</g>
      <circle class="track" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${size > 200 ? 7 : 6}"/>
      <circle class="arc" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${size > 200 ? 7 : 6}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${cx} ${cx})" style="stroke:url(#${id}g)"/>
      <circle class="spark" r="${size > 200 ? 6 : 4.5}" cx="${cx}" cy="${cx - r}"/>
    </svg>
    <div class="center"><span class="lbl">до разлома</span><span class="time">--:--</span><span class="at"></span></div>`;
    return { el, r, c, cx, id, arc: $(".arc", el), spark: $(".spark", el), time: $(".time", el), at: $(".at", el) };
  }
  function updateRing(R, ev, now, notifyMin) {
    const left = ev.at - now, frac = Math.min(1, Math.max(0, 1 - left / ev.period));
    R.arc.style.strokeDashoffset = String(R.c * (1 - frac));
    const a = frac * 2 * Math.PI - Math.PI / 2;
    R.spark.setAttribute("cx", R.cx + R.r * Math.cos(a));
    R.spark.setAttribute("cy", R.cx + R.r * Math.sin(a));
    const s = L.fmtDelta(left);
    R.time.textContent = left < 3600e3 ? s.slice(3) : s.slice(0, 5);
    R.at.textContent = "в " + new Date(ev.at).toTimeString().slice(0, 5);
    const hot = left <= Math.max(notifyMin, 10) * 60e3;
    R.el.classList.toggle("hot", hot);
    R.arc.style.stroke = `url(#${R.id}${hot ? "h" : "g"})`;
  }

  // ---------- чек-лист ----------
  function checkItem(key, cid, text) {
    const on = !!pst().checks[key][cid];
    const li = document.createElement("li");
    li.className = "ck" + (on ? " on" : "");
    li.innerHTML = `<span class="box">${CHECK_SVG}</span><span class="txt">${esc(text)}</span>`;
    li.addEventListener("click", (e) => {
      if (e.target.closest(".grip, .ib, input")) return;
      const v = !pst().checks[key][cid];
      pst().checks[key][cid] = v;
      li.classList.toggle("on", v);
      save();
      refreshCounts();
    });
    return li;
  }
  function count(key) {
    if (key === "roadmap") {
      const rm = prof().roadmap || [];
      return [Object.values(pst().checks.roadmap).filter(Boolean).length, rm.reduce((a, d) => a + d.items.length, 0)];
    }
    const items = lists()[key];
    return [items.filter((x) => pst().checks[key][x.id]).length, items.length];
  }
  function setMeter(el, done, total) {
    el.style.width = (total ? (done / total) * 100 : 0) + "%";
    el.parentElement.classList.toggle("done", total > 0 && done >= total);
  }
  const WTAB = { daily: "Сегодня", weekly: "Неделя", mine: "Мои дела" };
  const wKey = () => WTAB[st.ui.wTab] ? st.ui.wTab : "daily";
  function refreshCounts() {
    const k = wKey(), [d, t] = count(k), [dd, dt] = count("daily");
    $("#w-daytitle").textContent = WTAB[k];
    $("#w-daycount").textContent = `${d} из ${t}`;
    setMeter($("#w-daybar"), d, t);
    renderNext();
    setMeter($("#t-daybar"), dd, dt);
    syncChecks();
    if (st.ui.view === "checks") renderChecksMeta();
  }
  function syncChecks() {
    // держим отметки синхронными между виджетом и полным режимом
    $$(".ck[data-k]").forEach((li) => li.classList.toggle("on", !!pst().checks[li.dataset.k][li.dataset.c]));
  }
  function fillList(ul, key, items, prefix = "") {
    ul.innerHTML = "";
    items.forEach((t, i) => {
      const id = typeof t === "object" ? t.id : prefix + i, text = typeof t === "object" ? t.t : t;
      const li = checkItem(key, id, text);
      li.dataset.k = key; li.dataset.c = id;
      ul.appendChild(li);
    });
    if (!items.length) ul.innerHTML = '<li class="muted empty-li">Список пуст — добавь дела во вкладке «Дела».</li>';
  }
  // редактируемый список: перетаскивание, правка, удаление, добавление
  function editableList(key) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    const ul = document.createElement("ul");
    ul.className = "checklist editable";
    const items = lists()[key];
    const draw = () => {
      ul.innerHTML = "";
      items.forEach((it) => {
        const li = checkItem(key, it.id, it.t);
        li.dataset.k = key; li.dataset.c = it.id; li.draggable = true;
        li.insertAdjacentHTML("afterbegin", '<span class="grip" title="Перетащи, чтобы поменять порядок"><svg class="ic sm"><use href="#i-grip"/></svg></span>');
        li.insertAdjacentHTML("beforeend", '<button class="ib e" title="Переименовать"><svg class="ic sm"><use href="#i-edit"/></svg></button><button class="ib x" title="Удалить"><svg class="ic sm"><use href="#i-close"/></svg></button>');
        $(".e", li).onclick = (ev) => { ev.stopPropagation(); startEdit(li, it); };
        $(".txt", li).ondblclick = (ev) => { ev.stopPropagation(); startEdit(li, it); };
        $(".x", li).onclick = (ev) => {
          ev.stopPropagation(); items.splice(items.indexOf(it), 1); delete pst().checks[key][it.id];
          li.classList.add("removing"); setTimeout(() => { save(); draw(); refreshCounts(); renderWidget(); }, 180);
        };
        li.addEventListener("dragstart", (ev) => { li.classList.add("dragging"); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", it.id); });
        li.addEventListener("dragend", () => {
          li.classList.remove("dragging");
          const order = $$("li[data-c]", ul).map((x) => x.dataset.c);
          items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
          save(); renderWidget(); if (key === "daily") renderToday();
        });
        ul.appendChild(li);
      });
      if (!items.length) ul.innerHTML = '<li class="muted empty-li">Пока пусто. Впиши первое дело ниже.</li>';
    };
    ul.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      const drag = $(".dragging", ul); if (!drag) return;
      const after = $$("li[data-c]:not(.dragging)", ul).find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      after ? ul.insertBefore(drag, after) : ul.appendChild(drag);
    });
    function startEdit(li, it) {
      const t = $(".txt", li), inp = document.createElement("input");
      inp.className = "inline-edit"; inp.value = it.t; t.replaceWith(inp); inp.focus(); inp.select();
      li.draggable = false;
      const done = (ok) => { if (ok && inp.value.trim()) it.t = inp.value.trim(); save(); draw(); renderWidget(); if (key === "daily") renderToday(); };
      inp.onclick = (e) => e.stopPropagation();
      inp.onkeydown = (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); };
      inp.onblur = () => done(true);
    }
    draw();
    const form = document.createElement("form");
    form.className = "add-row";
    form.innerHTML = `<input placeholder="${key === "mine" ? "Например: собрать 5 питомцев типа Fera" : "Новое дело…"}" maxlength="140"><button class="btn primary" type="submit"><svg class="ic sm"><use href="#i-plus"/></svg>Добавить</button>`;
    form.onsubmit = (e) => {
      e.preventDefault(); const v = $("input", form).value.trim(); if (!v) return;
      items.push({ id: uid(), t: v }); $("input", form).value = ""; save(); draw(); refreshCounts(); renderWidget(); if (key === "daily") renderToday();
      const last = ul.lastElementChild; last && last.classList.add("added");
    };
    wrap.append(ul, form);
    if (key !== "mine") {
      const reset = document.createElement("button");
      reset.className = "btn ghost small-btn"; reset.type = "button"; reset.textContent = "Вернуть стандартный список";
      reset.onclick = () => {
        if (!confirm("Заменить список стандартным? Твои правки в этом списке пропадут.")) return;
        lists()[key] = (key === "daily" ? prof().daily : prof().weekly).map((t, i) => ({ id: (key === "daily" ? "d" : "w") + i, t }));
        pst().checks[key] = {}; save(); renderChecks(); renderWidget(); renderToday();
      };
      wrap.appendChild(reset);
    }
    return wrap;
  }

  // ---------- виджет ----------
  let wRing;
  function renderNext() {
    const k = wKey(), items = lists()[k], left = items.filter((x) => !pst().checks[k][x.id]), box = $("#w-next");
    if (!items.length) { box.className = "w-next nodrag done"; box.innerHTML = `<span>Список пуст</span>`; box.onclick = null; return; }
    if (!left.length) { box.className = "w-next nodrag done"; box.innerHTML = `<span>✓ Всё сделано</span>`; box.onclick = null; return; }
    const it = left[0];
    box.className = "w-next nodrag"; box.title = "Отметить сделанным";
    box.innerHTML = `<span class="box"></span><span>${esc(it.t)}</span><small>ещё ${left.length}</small>`;
    box.onclick = () => { pst().checks[k][it.id] = true; save(); syncChecks(); refreshCounts(); };
  }
  function renderWidget() {
    $("#w-profile span").textContent = ch().name;
    const k = wKey();
    fillList($("#w-daylist"), k, lists()[k]);
    $$("#w-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
    $(".w-day").classList.toggle("open", st.ui.dayOpen === true);
    refreshCounts();
  }

  // ---------- полный режим ----------
  const TITLES = { today: "Сегодня", checks: "Дела", progress: "Прогресс и бои", map: "Карта Альтгарда", bosses: "Боссы и добыча", ai: "Помощник", calc: "Билд и калькулятор", build: "Гайд и макросы", pantheon: "Пантеон", settings: "Настройки" };
  const viewTitle = (v) => v === "build" ? T("Гайд и макросы") + " · " + CL.name(ch().cls) : v === "calc" ? T("Билд и калькулятор") + " · " + ch().name : TITLES[v];
  function showView(v) {
    st.ui.view = v;
    $$(".nav").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    $$(".view").forEach((s) => s.classList.toggle("on", s.id === "v-" + v));
    $("#view-title").textContent = viewTitle(v);
    if (v === "map" && window.A2Map) window.A2Map.show();
    if (v === "calc") mountCalc();
    if (v === "progress") renderProgress();
    if (v === "bosses" && window.A2Bosses) window.A2Bosses.render();
    if (v === "ai" && window.A2AI) window.A2AI.render();
    if (v === "pantheon" && window.A2Pantheon) window.A2Pantheon.render($("#pantheon-root"));
    if (v === "build") renderBuild();
    // «Дела» живут внутри «Сегодня»: подсвечиваем его в меню
    if (v === "checks") $$('.nav[data-view="today"]').forEach((b) => b.classList.add("on"));
    save();
  }
  let tRing;
  function renderToday() {
    fillList($("#t-daily"), "daily", lists().daily);
    renderOdyle();
    renderGoal();
  }
  function renderOdyle() {
    const box = $("#t-odyle"), o = pst().odyle, now = Date.now();
    const v = L.odyleNow(o, now), full = L.odyleFullAt(o, now);
    box.innerHTML = `
      <div class="big">${v == null ? "—" : v}<small> / 560</small></div>
      <div class="meter wide"><i style="width:${v == null ? 0 : v / 5.6}%"></i></div>
      <div class="muted">${v == null ? "Введи текущий запас — посчитаю, когда упрётся в потолок." :
        v >= 560 ? '<span style="color:var(--ember)">Потолок: прирост сгорает. Потрать в экспедициях.</span>' :
        "Потолок через " + L.fmtDelta(full - now) + " — " + L.fmtLocal(full)}</div>
      <div class="row"><input id="od-in" type="number" min="0" max="560" placeholder="${v ?? 300}"><button class="btn" id="od-set">Обновить</button></div>`;
    $("#od-set").onclick = () => {
      const n = parseInt($("#od-in").value, 10);
      if (isNaN(n)) return;
      pst().odyle = { value: Math.max(0, Math.min(560, n)), at: Date.now() };
      save(); renderOdyle(); renderWidgetFoot();
    };
    renderWidgetFoot();
  }
  function renderWidgetFoot() {
    const o = pst().odyle, now = Date.now(), v = L.odyleNow(o, now);
    const gs = lastGS();
    const nt = L.nextThreshold(gs || 0, C.common.thresholds);
    $("#w-odyle").innerHTML = `<span>Одила <b class="${v >= 560 ? "warn" : ""}">${v == null ? "—" : v}</b> / 560</span>` +
      `<span>GS <b>${gs || "—"}</b>${nt ? " → " + nt.gs : ""}</span>` +
      `<span class="w-time" title="Местное время"><b id="w-time">${new Date().toTimeString().slice(0, 5)}</b></span>`;
  }
  function lastGS() {
    const h = pst().history.filter((x) => x.gs);
    return h.length ? h[h.length - 1].gs : prof().gs_start || 0;
  }
  function renderGoal() {
    const gs = lastGS(), goal = prof().gs_goal || 1600, nt = L.nextThreshold(gs || 0, C.common.thresholds);
    const start = prof().gs_start || (pst().history.find((x) => x.gs) || {}).gs || gs;
    const pct = gs >= goal ? 100 : Math.max(0, ((gs - start) / Math.max(1, goal - start)) * 100);
    $("#t-goal").innerHTML = `<div class="goal"><div class="big">${gs || "—"} <small class="muted" style="font:15px var(--ui)">из ${goal}</small></div>
      <div class="meter wide ${gs >= goal ? "done" : ""}"><i style="width:${gs ? pct : 0}%"></i></div>
      <p>${gs ? (nt ? `Следующий порог — <b style="color:var(--ink)">${nt.gs}</b>: ${esc(nt.name)}.` : "Все пороги взяты.") : "Запиши текущий GS на вкладке «Прогресс»."}</p></div>`;
  }

  // Дела
  function renderChecks() {
    const k = st.ui.checksTab || "daily";
    $$("#checks-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
    const body = $("#checks-body");
    body.innerHTML = "";
    if (k === "roadmap") {
      const todayIdx = roadmapToday();
      (prof().roadmap || []).forEach((d, di) => {
        const card = document.createElement("div");
        card.className = "panel day" + (di === todayIdx ? " today-day" : "");
        const done = d.items.filter((_, i) => pst().checks.roadmap[di + "." + i]).length;
        card.innerHTML = `<header><b>${esc(d.day)}</b><span>${esc(d.goal)}</span><span class="meter"><i></i></span></header><ul class="checklist"></ul>`;
        fillList($("ul", card), "roadmap", d.items, di + ".");
        setMeter($(".meter i", card), done, d.items.length);
        $$(".ck", card).forEach((li) => li.addEventListener("click", () => {
          const n = d.items.filter((_, i) => pst().checks.roadmap[di + "." + i]).length;
          setMeter($(".meter i", card), n, d.items.length);
        }));
        body.appendChild(card);
      });
    } else {
      body.appendChild(editableList(k));
    }
    renderChecksMeta();
  }
  function roadmapToday() {
    const d = new Date(), names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const tag = names[d.getDay()] + " " + d.getDate() + " ";
    return (prof().roadmap || []).findIndex((x) => x.day.startsWith(tag));
  }
  function renderChecksMeta() {
    const k = st.ui.checksTab || "daily", [d, t] = count(k), s = S(), off = +s.serverOffset, now = Date.now();
    let extra = "";
    if (k === "daily") extra = " · сбросятся сами " + L.fmtLocal(L.nextDaily(now, off, s.dailyReset));
    if (k === "weekly") extra = " · сбросятся сами " + L.fmtLocal(L.nextWeekly(now, off, [+s.weeklyDay], s.weeklyTime));
    if (k === "mine") extra = " · сами не сбрасываются";
    $("#checks-meta").textContent = `Готово ${d} из ${t}${extra}`;
  }

  // Прогресс
  function renderProgress() {
    const h = pst().history, gs = lastGS(), th = C.common.thresholds.slice().sort((a, b) => a.gs - b.gs);
    const nt = L.nextThreshold(gs || 0, th);
    $("#gs-now").textContent = gs ? `сейчас ${gs}` : "";
    $("#ladder").innerHTML = th.map((t) => `<li class="${gs >= t.gs ? "got" : nt && nt.gs === t.gs ? "next" : ""}"><b>${t.gs}</b>${esc(t.name)}</li>`).join("");
    const hist = $("#hist");
    hist.innerHTML = h.length ? "" : '<p class="muted">Пока пусто. Записывай GS раз в день — увидишь, какие вечера дали больше всего.</p>';
    h.slice().reverse().forEach((e, ri) => {
      const i = h.length - 1 - ri;
      const r = document.createElement("div");
      r.className = "r";
      r.innerHTML = `<span class="muted">${esc(e.ts)}</span><b>${e.gs ?? ""}</b>
        <span>${e.crystals != null ? "кристаллы " + e.crystals : ""}</span><span>${e.shards != null ? "осколки " + e.shards : ""}</span><span>${e.kinah != null ? e.kinah + " тыс. кин." : ""}</span>
        <button class="ib x" title="Удалить запись"><svg class="ic sm"><use href="#i-close"/></svg></button>
        ${e.note ? `<span class="note">${esc(e.note)}</span>` : ""}`;
      $(".x", r).onclick = () => { h.splice(i, 1); save(); renderProgress(); renderGoal(); renderWidgetFoot(); };
      hist.appendChild(r);
    });
    drawChart();
  }
  function drawChart() {
    const box = $("#chart"), W = box.clientWidth || 700, Hh = box.clientHeight || 270;
    const pts = pst().history.filter((x) => x.gs);
    const goal = prof().gs_goal || 1600;
    if (!pts.length) {
      box.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}"><text class="empty" x="${W / 2}" y="${Hh / 2}" text-anchor="middle">Здесь появится линия роста — добавь первую запись слева</text></svg>`;
      return;
    }
    const vals = pts.map((p) => p.gs), lo = Math.floor((Math.min(...vals, goal) - 60) / 100) * 100, hi = Math.ceil((Math.max(...vals, goal) + 60) / 100) * 100;
    const Lm = 46, R = W - 14, T = 12, B = Hh - 26;
    const X = (i) => pts.length === 1 ? (Lm + R) / 2 : Lm + (i * (R - Lm)) / (pts.length - 1);
    const Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
    const step = (hi - lo) / 100 > 8 ? 200 : 100;
    let grid = "";
    for (let v = lo; v <= hi; v += step) grid += `<line x1="${Lm}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${Lm - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    let th = "";
    C.common.thresholds.forEach((t) => { if (t.gs > lo && t.gs < hi && t.gs !== goal) th += `<line class="th-line" x1="${Lm}" x2="${R}" y1="${Y(t.gs)}" y2="${Y(t.gs)}"/><text class="th-text" x="${R}" y="${Y(t.gs) - 5}" text-anchor="end">${t.gs}</text>`; });
    const line = pts.map((p, i) => `${X(i)},${Y(p.gs)}`).join(" ");
    const area = `${X(0)},${B} ${line} ${X(pts.length - 1)},${B}`;
    const labels = pts.map((p, i) => (pts.length <= 8 || i % Math.ceil(pts.length / 8) === 0) ? `<text x="${X(i)}" y="${Hh - 6}" text-anchor="middle">${esc(p.ts.slice(8, 10) + "." + p.ts.slice(5, 7))}</text>` : "").join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}">
      <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a063" stop-opacity=".35"/><stop offset="1" stop-color="#c9a063" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${grid}${labels}</g>${th}
      <line class="goal-line" x1="${Lm}" x2="${R}" y1="${Y(goal)}" y2="${Y(goal)}"/><text class="goal-text" x="${Lm + 6}" y="${Y(goal) - 6}">цель ${goal}</text>
      ${pts.length > 1 ? `<polygon class="area" points="${area}"/>` : ""}
      <polyline class="line draw" points="${line}"/>
      ${pts.map((p, i) => `<circle class="pt" cx="${X(i)}" cy="${Y(p.gs)}" r="4"><title>${p.gs}</title></circle>`).join("")}
    </svg>`;
    const pl = $(".line", box), len = pl.getTotalLength ? pl.getTotalLength() : 1000;
    pl.style.strokeDasharray = len; pl.style.setProperty("--len", len);
  }
  $("#prog-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, rec = {};
    for (const k of ["gs", "crystals", "shards", "kinah"]) {
      const raw = f[k].value.replace(/\s/g, "").replace(",", ".");
      if (raw) { const n = Number(raw); if (isNaN(n)) { toast("Не число", `Поле «${f[k].previousSibling.textContent.trim()}»: ${raw}`); return; } rec[k] = n; }
    }
    if (f.note.value.trim()) rec.note = f.note.value.trim();
    if (!Object.keys(rec).length) { f.gs.focus(); return; }
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    rec.ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    pst().history.push(rec);
    f.reset(); save(); renderProgress(); renderGoal(); renderWidgetFoot();
    if (rec.gs) toast("Записано", `GS ${rec.gs}`, "ok");
  });

  // Билд
  // Гайд и макросы: подробный гайд (metabot.gg) + данные топ-игроков + макросы
  function guideSections() {
    const lang = window.A2I18n && A2I18n.lang === "en" ? "en" : "ru", cls = ch().cls;
    const G2 = (window.GUIDE2 && GUIDE2[cls] && GUIDE2[cls][lang]) || null, CM = (window.GUIDE2 && GUIDE2._common && GUIDE2._common[lang]) || null;
    const old = prof().build || [], byT = (t) => (old.find((x) => x.title === t) || {}).text || "";
    const pills = (arr, sep) => `<div class="pills">${arr.map((x, i) => `<span class="pill">${sep ? `<b>${i + 1}</b>` : ""}${esc(x)}</span>`).join(sep ? `<i class="sep">›</i>` : "")}</div>`;
    const secs = [];
    if (G2) {
      secs.push({ id: "sum", title: "Кратко о классе", html: `<p class="lead">${esc(G2.intro)}</p>` +
        (G2.core.length ? `<h4>${T("Основные умения")}</h4>${pills(G2.core)}` : "") +
        (G2.stats.length ? `<h4>${T("Приоритет характеристик")}</h4>${pills(G2.stats, true)}` : "") + prose(byT(T("Билд"))) });
      secs.push({ id: "play", title: "Как играть", html: `<ol class="steps">${G2.steps.map((x) => `<li><b>${esc(x.t)}</b><p>${esc(x.b)}</p></li>`).join("")}</ol>` +
        (G2.tip ? `<div class="callout">${esc(G2.tip)}</div>` : "") + prose(byT(T("Как играть"))) });
      const best = (st.combat && st.combat.best) || 0;
      secs.push({ id: "macro", title: "Макросы", html: `<div class="macros">${G2.macros.map((m, mi) => `<section class="macro"><header><h4>${esc(m.name)}</h4><button class="btn sm" data-copy="${mi}">${T("Копировать")}</button></header><p class="muted small">${esc(m.when)}</p><ol>${m.skills.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>`).join("")}</div>` +
        (best ? `<p class="muted small">${T("Твой лучший DPS по счётчику:")} <b>${best.toLocaleString("ru-RU")}</b>. ${T("Сравни бой до и после смены макроса.")}</p>` : "") +
        (CM ? `<h4>${T("Как устроены макросы в AION 2")}</h4><ul>${CM.macroRules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""), macros: G2.macros });
      secs.push({ id: "stig", title: "Стигмы", html: `<h4>${T("Порядок открытия слотов (22 · 27 · 32 · 37 ур.)")}</h4>${pills(G2.stigmas, true)}` +
        (G2.pvp ? `<p><b>${T("Замены для PvP:")}</b> ${esc(G2.pvp)}</p>` : "") + prose(byT(T("Стигмы"))) });
      secs.push({ id: "dv", title: "Дэванион и камень", html: `<h4>${T("Дэванион")}</h4><p>${esc(G2.dv)}</p>` + prose(byT(T("Дэванион"))) +
        (G2.theo ? `<h4>${T("Божественный камень (Theostone)")}</h4><p>${esc(G2.theo)}</p>` : "") +
        (CM && CM.theo.length ? `<table class="tbl"><tr><th>${T("Классы")}</th><th>${T("Для PvE")}</th><th>${T("Почему")}</th></tr>${CM.theo.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</table>` : "") });
      secs.push({ id: "stats", title: "Характеристики", html: prose(byT(T("Характеристики"))) });
      secs.push({ id: "skills", title: "Умения у топ-игроков", html: prose(byT(T("Умения"))) });
      secs.push({ id: "weap", title: "Оружие", html: prose(byT(T("Оружие"))) });
      if (CM) secs.push({ id: "gear", title: "Снаряжение: что дальше", html: `<p class="lead">${esc(CM.gear.intro)}</p><ol class="steps">${CM.gear.steps.map((x) => `<li><b>${esc(x.t)}</b><p>${esc(x.b)}</p></li>`).join("")}</ol>` +
        (CM.gear.avoid ? `<div class="callout"><b>${T("Не тратьте материалы на:")}</b> ${esc(CM.gear.avoid)}</div>` : "") });
    } else old.forEach((x, i) => secs.push({ id: "o" + i, title: x.title, html: prose(x.text) }));
    return { secs, src: CM ? CM.src : "" };
  }
  function renderBuild() {
    const { secs, src } = guideSections(), tabs = $("#build-tabs");
    const cur = Math.min(st.ui.buildTab || 0, secs.length - 1);
    tabs.innerHTML = `<span class="toc-h">Содержание</span>` + secs.map((s, i) => `<button data-i="${i}" class="${i === cur ? "on" : ""}"><b>${i + 1}</b>${esc(T(s.title))}</button>`).join("");
    $$("button", tabs).forEach((b) => b.onclick = () => { st.ui.buildTab = +b.dataset.i; save(); renderBuild(); });
    const art = $("#build-text");
    art.classList.remove("swap"); void art.offsetWidth; art.classList.add("swap");
    const sec = secs[cur];
    art.innerHTML = `<p class="kicker">${esc(CL.name(ch().cls))} · ${esc(T("гайд"))}</p><h2>${esc(T(sec.title))}</h2>` + sec.html +
      `<p class="src muted small">${esc(T("Источник"))}: ${esc(src || "metabot.gg")}. ${esc(T("Свои цифры проверяй в калькуляторе."))}</p>`;
    $$("[data-copy]", art).forEach((b) => b.onclick = () => {
      const m = sec.macros[+b.dataset.copy], text = m.name + ": " + m.skills.map((x, i) => `${i + 1}. ${x}`).join("  ");
      try { navigator.clipboard.writeText(text); } catch (e) { }
      toast("Скопировано", m.name, "ok");
    });
  }
  function prose(text) {
    let html = "", list = null;
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) { close(); continue; }
      let m;
      if ((m = /^[•\-]\s*(.*)$/.exec(line))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${esc(m[1])}</li>`; continue; }
      if ((m = /^(\d+)\.\s+(.*)$/.exec(line))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${esc(m[2])}</li>`; continue; }
      close();
      if (/:$/.test(line) && line.length < 70) html += `<h4>${esc(line.slice(0, -1))}</h4>`;
      else html += `<p>${esc(line)}</p>`;
    }
    close();
    return html;
  }

  // Настройки
  function renderSettings() {
    const f = $("#set-form"), s = S();
    for (const el of f.elements) {
      if (!el.name || !(el.name in s)) continue;
      if (el.type === "checkbox") el.checked = !!s[el.name]; else el.value = s[el.name];
    }
  }
  $("#set-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, s = S(), next = {};
    for (const el of f.elements) {
      if (!el.name || !(el.name in s)) continue;
      next[el.name] = el.type === "checkbox" ? el.checked : el.type === "number" || el.type === "range" || el.name === "weeklyDay" ? Number(el.value) : el.value.trim();
    }
    try { L.hhmm(next.dailyReset); L.hhmm(next.weeklyTime); if (next.playStart) L.hhmm(next.playStart); } catch (err) { toast("Проверь время", "Формат ЧЧ:ММ, например 06:00"); return; }
    Object.assign(s, next);
    host.top(!!s.topmost);
    applyHostSettings(true);
    host.call("hostAutostart", $("#set-autostart").checked);
    notified.clear();
    save(); tick(true); renderChecksMeta();
    toast("Сохранено", "Расписание и окно обновлены.", "ok");
  });
  // поле горячей клавиши: ловим сочетание
  $$(".hk").forEach((inp) => inp.addEventListener("keydown", (e) => {
    e.preventDefault();
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape") { inp.value = ""; return; }
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    let k = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : /^F\d+$/.test(e.key) ? e.key :
      ({ Space: "Space", Backquote: "`", Home: "Home", End: "End", Insert: "Insert", PageUp: "PageUp", PageDown: "PageDown", Tab: "Tab" })[e.code];
    if (!k) return;
    const mods = [e.ctrlKey && "Ctrl", e.shiftKey && "Shift", e.altKey && "Alt"].filter(Boolean);
    if (!mods.length && !/^F\d+$/.test(k)) { toast("Нужен модификатор", "Например Ctrl+Shift+" + k); return; }
    inp.value = mods.concat(k).join("+");
  }));
  async function applyHostSettings(report) {
    const s = S();
    if (!host.has("hostHotkey")) return;
    const bad = [];
    if (!(await window.hostHotkey(1, s.hotkeyToggle || ""))) bad.push(s.hotkeyToggle);
    if (!(await window.hostHotkey(2, s.hotkeyClick || ""))) bad.push(s.hotkeyClick);
    if (!(await window.hostHotkey(3, s.hotkeyOverlay || ""))) bad.push(s.hotkeyOverlay);
    if (!(await window.hostHotkey(4, s.hotkeyAdjust || ""))) bad.push(s.hotkeyAdjust);
    if (!(await window.hostHotkey(5, s.hotkeyTaken || ""))) bad.push(s.hotkeyTaken);
    if (window.A2Overlay) window.A2Overlay.send({});
    host.call("hostTray", !!s.tray);
    $("#ghost-key").textContent = s.hotkeyClick || "через трей";
    if (bad.length && report) toast("Сочетание занято", bad.join(", ") + " уже использует другая программа — выбери другое.");
  }
  // резервные копии и перенос
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function restoreFrom(raw, label) {
    let obj; try { obj = JSON.parse(raw); } catch (e) { toast("Не тот файл", "Это не сохранение помощника."); return; }
    if (!obj || typeof obj !== "object" || !obj.settings) { toast("Не тот файл", "Это не сохранение помощника."); return; }
    if (!confirm("Заменить текущие данные содержимым «" + label + "»? Текущее состояние уйдёт в резервную копию сегодняшнего дня.")) return;
    host.save(JSON.stringify(st));
    st = L.normalize(obj); chars();
    pid = chars().some((c) => c.id === S().profile) ? S().profile : chars()[0].id;
    save(); renderAll(); toast("Восстановлено", label, "ok");
  }
  async function shareOut(name, content, title) {
    if (host.has("hostExport")) { const p = await window.hostExport(name, content); if (p) { toast(title, "Файл: " + p, "ok"); host.call("hostReveal", p); return; } }
    download(name + ".json", content);
  }
  $("#bk-export").onclick = () => { const copy = JSON.parse(JSON.stringify(st)); if (copy.ai) delete copy.ai.key; shareOut("Полная копия " + new Date().toISOString().slice(0, 10), JSON.stringify(copy, null, 1), "Копия сохранена (без ключа API)"); };
  $("#bk-share").onclick = () => {
    const ai = Object.assign({}, st.ai || {}); delete ai.key;
    shareOut("Настройки помощника", JSON.stringify({ type: "aion2helper-settings", v: 1, settings: Object.assign({}, S(), { profile: undefined }), ui: { wMini: st.ui.wMini, wTab: st.ui.wTab, map: { on: (st.ui.map || {}).on } }, ai }, null, 1), "Настройки сохранены");
  };
  $("#bk-sfile").onchange = (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    f.text().then((t) => {
      let o; try { o = JSON.parse(t); } catch (err) { toast("Не тот файл", "Это не настройки помощника."); return; }
      if (!o || o.type !== "aion2helper-settings") { if (o && o.type === "aion2helper-build") toast("Это билд", "Билды загружаются в «Калькулятор» — кнопка со стрелкой вверх."); else toast("Не тот файл", "Это не настройки помощника."); return; }
      const keepProfile = S().profile; Object.assign(S(), o.settings || {}); S().profile = keepProfile;
      if (o.ui) { st.ui.wMini = o.ui.wMini; st.ui.wTab = o.ui.wTab; if (o.ui.map && o.ui.map.on) { st.ui.map = st.ui.map || {}; st.ui.map.on = o.ui.map.on; } }
      if (o.ai) { const key = (st.ai || {}).key; st.ai = Object.assign({}, st.ai || {}, o.ai); if (key) st.ai.key = key; }
      save(); renderAll(); applyHostSettings(false); toast("Настройки загружены", f.name, "ok");
    });
  };
  $("#bk-file").onchange = (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => restoreFrom(t, f.name)); e.target.value = ""; };
  $("#bk-open").onclick = () => host.call("hostOpenData");
  $("#bk-restore").onclick = async () => { const n = $("#bk-list").value; if (!n) return; const t = await host.call("hostReadBackup", n); if (t) restoreFrom(t, n); };
  async function renderBackups() {
    const l = (await host.call("hostBackups")) || [];
    $("#bk-list").innerHTML = l.length ? l.map((n) => `<option>${esc(n)}</option>`).join("") : "<option value=''>Пока нет копий</option>";
    $("#bk-open").hidden = !host.has("hostOpenData");
    if (host.has("hostAutostartGet")) $("#set-autostart").checked = !!(await window.hostAutostartGet());
    else $("#set-autostart").closest("label").hidden = true;
  }
  $("#test-notify").onclick = () => notify("Разлом через 5 минут", "Так выглядит напоминание.");

  // ---------- профили ----------
  function renderProfiles() {
    $("#profiles").innerHTML = chars().map((c) =>
      `<div class="pf ${c.id === pid ? "on" : ""}"><button class="pf-main" data-p="${c.id}"><img src="${CL.icon(c.cls)}" alt=""><span><b>${esc(c.name)}</b><small>${CLS_RU[c.cls]}</small></span></button>
        <button class="ib pf-edit" data-e="${c.id}" title="Изменить или удалить"><svg class="ic sm"><use href="#i-edit"/></svg></button></div>`).join("") +
      `<button class="pf-add" id="pf-add"><svg class="ic sm"><use href="#i-plus"/></svg>Новый персонаж</button>`;
    $$(".pf-main").forEach((b) => b.onclick = () => switchProfile(b.dataset.p));
    $$(".pf-edit").forEach((b) => b.onclick = () => openCharModal(b.dataset.e));
    $("#pf-add").onclick = () => openCharModal(null);
  }
  function switchProfile(k, quiet) {
    pid = k; S().profile = k;
    L.applyResets(st, pid, Date.now());
    save(); renderAll();
    if (!quiet) toast(ch().name, CLS_RU[ch().cls] + " выбран.", "ok");
  }
  $("#w-profile").onclick = () => {
    const ids = chars().map((c) => c.id);
    switchProfile(ids[(ids.indexOf(pid) + 1) % ids.length]);
  };
  // окно «персонаж»
  let editingChar = null, firstRun = false;
  function openCharModal(id) {
    editingChar = id;
    const f = $("#char-form"), c = id ? chars().find((x) => x.id === id) : null;
    $("#char-title").textContent = c ? "Персонаж" : "Новый персонаж";
    $("#char-ok").textContent = c ? "Сохранить" : "Создать";
    f.name.value = c ? c.name : "";
    $("#cls-pick").innerHTML = CL.list.map((k) => `<label class="cls"><input type="radio" name="cls" value="${k.id}"><img src="${CL.icon(k.id)}" alt=""><span>${esc(CL.name(k.id))}<small>${esc(k.role[window.A2I18n && A2I18n.lang === "en" ? 1 : 0])}</small></span></label>`).join("");
    $$('input[name="cls"]', f).forEach((r) => { r.checked = r.value === (c ? c.cls : "ranger"); r.disabled = !!c; });
    $("#char-del").hidden = !c || chars().length < 2;
    $("#modal").hidden = false; requestAnimationFrame(() => $("#modal").classList.add("open"));
    setTimeout(() => f.name.focus(), 50);
  }
  function closeModal() { firstRun = false; $("#char-cancel").textContent = "Отмена"; $("#modal").classList.remove("open"); setTimeout(() => $("#modal").hidden = true, 200); }
  $("#char-cancel").onclick = closeModal;
  $("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal") closeModal(); });
  $("#char-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(), cls = ($('input[name="cls"]:checked', f) || {}).value || "ranger";
    if (!name) return;
    if (editingChar) { chars().find((x) => x.id === editingChar).name = name; save(); renderAll(); closeModal(); return; }
    const c = { id: "c" + uid(), name, cls, guide: cls };
    if (firstRun) { st.chars = [c]; st.profiles = {}; } // первый запуск у нового игрока: стартовые персонажи не нужны
    else chars().push(c); closeModal(); switchProfile(c.id, true);
    toast("Персонаж создан", `${name} · ${CLS_RU[cls]}. Чтобы советы были точными, открой «Калькулятор» → «Импорт из игры».`, "ok");
  };
  $("#char-del").onclick = () => {
    const c = chars().find((x) => x.id === editingChar); if (!c) return;
    if (!confirm(`Удалить персонажа «${c.name}» вместе с его делами, прогрессом и расчётами?`)) return;
    st.chars = chars().filter((x) => x.id !== c.id); delete st.profiles[c.id];
    closeModal(); switchProfile(chars()[0].id, true);
  };
  function mountCalc() { if (window.A2Calc && mode === "full") window.A2Calc.mount($("#calc-root"), st, pst(), ch(), save); }

  function renderAll() {
    renderProfiles(); renderWidget(); renderToday(); renderChecks(); renderBuild(); renderSettings(); renderBackups();
    if (st.ui.view === "progress") renderProgress();
    $("#view-title").textContent = viewTitle(st.ui.view);
    if (st.ui.view === "calc") mountCalc();
    if (st.ui.view === "bosses" && window.A2Bosses) window.A2Bosses.render();
    if (st.ui.view === "ai" && window.A2AI) window.A2AI.render();
  }

  // ---------- таймеры ----------
  const notified = new Set();
  function eventRow(e, now, nm) {
    const left = e.at - now;
    return `<li class="${left <= nm * 60e3 ? "soon" : ""}" title="${esc(e.hint)}"><span class="n">${esc(e.name)}</span><span class="d">${L.fmtDelta(left)}</span></li>`;
  }
  let lastResetCheck = 0;
  function tick(force) {
    const now = Date.now(), s = S(), nm = +s.notifyMin || 0;
    const evs = L.events(now, s).concat(window.A2Bosses ? window.A2Bosses.events(now) : []).sort((a, b) => a.at - b.at), rift = evs.find((e) => e.id === "rift");
    if (window.A2Bosses) window.A2Bosses.tick(now);
    if (mode === "compact") {
      updateRing(wRing, rift, now, nm);
      renderCaps(evs, rift, now, nm);
      $("#w-events").innerHTML = evs.filter((e) => e.id !== "rift").slice(1, 4).map((e) => eventRow(e, now, nm)).join("");
      const wt = $("#w-time"); if (wt) wt.textContent = new Date(now).toTimeString().slice(0, 5);
      if (st.ui.wMini) {
        const nx = evs.find((e) => e.id !== "rift"), [d, t] = count("daily"), rl = rift.at - now;
        const f = (ms) => { const x = L.fmtDelta(ms); return ms < 3600e3 ? x.slice(3) : x.slice(0, 5); };
        $("#w-pill").innerHTML = `<b class="clk">${new Date(now).toTimeString().slice(0, 5)}</b> · Разлом <b class="${rl <= Math.max(nm, 10) * 60e3 ? "hot" : ""}">${f(rl)}</b>` + (nx ? ` · ${esc(nx.name)} <b class="${nx.at - now <= nm * 60e3 ? "hot" : ""}">${f(nx.at - now)}</b>` : "") ;
      }
    } else {
      updateRing(tRing, rift, now, nm);
      $("#t-rift-when").textContent = L.fmtLocal(rift.at);
      $("#t-rift-hint").textContent = rift.hint;
      $("#t-events").innerHTML = evs.filter((e) => e.id !== "rift").map((e) => eventRow(e, now, nm)).join("");
      const d = new Date(now);
      $("#clock").textContent = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" }) + ", " + d.toTimeString().slice(0, 5);
    }
    if (nm > 0) for (const e of evs) {
      const key = e.id + ":" + e.at, left = e.at - now;
      if (e.boss && !s.bossNotify) continue;
      if (left <= nm * 60e3 && left > 0 && !notified.has(key)) {
        notified.add(key);
        if (!force) notify(e.long + " через " + Math.max(1, Math.round(left / 60e3)) + " мин", e.hint);
      }
    }
    remind(now, s);
    if (now - lastResetCheck > 20e3 || force) {
      lastResetCheck = now;
      const done = L.applyResets(st, pid, now);
      if (done.length) {
        save(); renderWidget(); renderToday(); renderChecks();
        toast(done.includes("weekly") ? "Новая неделя" : "Новый день", "Отметки сброшены — можно начинать заново.", "ok");
      }
      if (st.ui.view === "today") { renderWidgetFoot(); }
    }
  }
  // ---------- капсулы виджета: разлом, урон (или Одила), ближайшее событие ----------
  // «живые цифры»: изменившиеся знаки коротко прокручиваются
  function liveNum(el, text) {
    if (!el) return;
    const old = el.dataset.v || "";
    if (old === text) return;
    el.dataset.v = text;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.innerHTML = [...text].map((c, i) => `<span class="${!reduce && old && old[i] !== c && /\d/.test(c) ? "roll" : ""}">${esc(c)}</span>`).join("");
  }
  const shortDelta = (ms) => { const x = L.fmtDelta(ms); return ms < 3600e3 ? x.slice(3) : x.slice(0, 5); };
  function renderCaps(evs, rift, now, nm) {
    const box = $("#w-caps"); if (!box) return;
    if (!box.firstChild) box.innerHTML = [0, 1, 2].map((i) => `<div class="cap" data-i="${i}"><span class="cap-l"></span><b class="cap-v"></b><span class="cap-s"></span></div>`).join("");
    const caps = $$(".cap", box), next = evs.find((e) => e.id !== "rift");
    const set = (i, l, v, sub, cls) => { const c = caps[i]; c.className = "cap " + (cls || ""); $(".cap-l", c).textContent = T(l); liveNum($(".cap-v", c), v); $(".cap-s", c).textContent = sub || ""; };
    const rl = rift.at - now;
    set(0, "Разлом", shortDelta(rl), "в " + new Date(rift.at).toTimeString().slice(0, 5), rl <= 5 * 60e3 ? "hot glow" : rl <= Math.max(nm, 10) * 60e3 ? "hot" : "");
    const C = window.A2Combat, Lv = C && S().combatRead ? C.live() : null;
    if (Lv) set(1, "DPS", Math.round(Lv.dps).toLocaleString("ru-RU"), Lv.live ? fmtSec(Lv.sec) : T("последний бой"), Lv.live ? "live" : "");
    else { const o = L.odyleNow(pst().odyle, now); set(1, "Одила", o == null ? "—" : String(o), "/ 560", o >= 560 ? "hot" : ""); }
    if (next) set(2, next.name, shortDelta(next.at - now), "", next.at - now <= nm * 60e3 ? "hot" : "");
    else set(2, "События", "—", "");
  }
  // умные напоминания: план к началу игры и несделанное перед сбросом дня (раз в день каждое)
  function pendingDaily() { try { return lists().daily.filter((x) => !pst().checks.daily[x.id]).map((x) => String(x.t || x.name || x.id).split(/ — | – |: |\(/)[0].trim().slice(0, 42)); } catch (e) { return []; } }
  function remind(now, s) {
    const d = new Date(now), today = d.toDateString(), r = st.ui.remind = st.ui.remind || {};
    if (s.playStart && /^\d{1,2}:\d{2}$/.test(s.playStart) && r.play !== today) {
      const [h, m] = s.playStart.split(":").map(Number), at = new Date(d); at.setHours(h, m, 0, 0);
      if (now >= at.getTime() && now - at.getTime() < 30 * 60e3) {
        r.play = today; save();
        const left = pendingDaily(), evs = L.events(now, s).concat(window.A2Bosses ? window.A2Bosses.events(now) : []).sort((a, b) => a.at - b.at).slice(0, 2);
        notify("План на вечер", (left.length ? `Не сделано: ${left.slice(0, 4).join(", ")}${left.length > 4 ? ` и ещё ${left.length - 4}` : ""}. ` : "Дела дня закрыты. ") + evs.map((e) => `${e.name} через ${L.fmtDelta(e.at - now).replace(/^00:/, "")}`).join(", "));
      }
    }
    if (s.remindReset) {
      const rs = L.events(now, s).find((e) => e.id === "daily");
      if (rs) {
        const left = rs.at - now, key = new Date(rs.at).toDateString();
        if (left <= 30 * 60e3 && left > 60e3 && r.reset !== key) {
          const pend = pendingDaily();
          r.reset = key; save();
          if (pend.length) notify("Скоро сброс дня — не сделано " + pend.length, pend.slice(0, 5).join(", ") + (pend.length > 5 ? "…" : ""));
        }
      }
    }
  }
  function notify(title, text) {
    toast(title, text);
    if (S().winNotify) host.call("hostNotify", title, text || "");
    if (S().sound) host.beep();
    if (mode === "compact") {
      host.fade(1, 120);
      document.body.classList.remove("alerting"); void document.body.offsetWidth; document.body.classList.add("alerting");
      setTimeout(() => document.body.classList.remove("alerting"), 5200);
    }
  }
  function toast(title, text, kind) {
    const t = document.createElement("div");
    t.className = "toast";
    if (kind === "ok") t.style.borderLeftColor = "var(--verdant)";
    t.innerHTML = `<b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}`;
    $("#toasts").appendChild(t);
    const kill = () => { t.classList.add("out"); setTimeout(() => t.remove(), 320); };
    t.onclick = kill;
    setTimeout(kill, kind === "ok" ? 2600 : 12000);
  }
  window.A2Toast = toast;

  // ---------- режимы окна, прозрачность, перетаскивание ----------
  let mode = "compact";
  async function setMode(m, first) {
    if (!first) { document.body.classList.add("switching"); await sleep(170); }
    mode = m;
    await host.mode(m);
    document.body.classList.toggle("m-compact", m === "compact");
    lastFit = ""; if (m === "compact") fitWindow();
    document.body.classList.toggle("m-full", m === "full");
    document.body.classList.remove("switching");
    host.fade(1, 0);
    if (m === "full") { showView(st.ui.view || "today"); }
    tick(true);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let fadeT = 0;
  document.addEventListener("mouseout", (e) => {
    if (e.relatedTarget || mode !== "compact" || !S().autoFade) return;
    clearTimeout(fadeT);
    fadeT = setTimeout(() => host.fade(+S().idleOpacity || .55, 450), 900);
  });
  document.addEventListener("mouseover", () => {
    clearTimeout(fadeT);
    if (mode === "compact") host.fade(1, 140);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const d = e.target.closest(".drag");
    if (d && !e.target.closest(".nodrag, button, input, select, a")) { e.preventDefault(); host.drag(); }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "full") setMode("full");
    else if (a === "widget") setMode("compact");
    else if (a === "min") host.min();
    else if (a === "close") { host.save(JSON.stringify(st)).then(() => host.close()); }
    else if (a === "dock") { host.dock(); lastFit = ""; fitWindow(); }
  });
  $$(".nav").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
  $$("#checks-tabs button").forEach((b) => b.addEventListener("click", () => { st.ui.checksTab = b.dataset.k; save(); renderChecks(); }));
  $("#w-dayhead").addEventListener("click", () => {
    st.ui.dayOpen = !$(".w-day").classList.toggle("open") ? false : true;
    save(); fitWindow();
  });
  $$("#w-tabs button").forEach((b) => b.addEventListener("click", () => { st.ui.wTab = b.dataset.k; save(); renderWidget(); }));
  // полоска: виджет сворачивается до одной строки
  function setMini(v) { st.ui.wMini = !!v; document.body.classList.toggle("w-mini", !!v); save(); tick(true); fitWindow(); }
  $("#w-fold").addEventListener("click", () => setMini(!st.ui.wMini));
  $("#w-bar").addEventListener("dblclick", (e) => { if (!e.target.closest("button")) setMini(!st.ui.wMini); });
  // размер окна-виджета подстраивается под содержимое (и под всплывающие сообщения)
  const W_WIDTH = 284;
  let fitRaf = 0, lastFit = "";
  function fitWindow() {
    cancelAnimationFrame(fitRaf);
    fitRaf = requestAnimationFrame(() => {
      if (mode !== "compact") return;
      const wh = Math.ceil($("#widget").getBoundingClientRect().height);
      document.body.style.setProperty("--wh", wh + "px");
      const th = $("#toasts").children.length ? Math.ceil($("#toasts").getBoundingClientRect().height) + 6 : 0;
      const key = wh + ":" + th + ":" + !!st.ui.wMini; if (key === lastFit) return; lastFit = key;
      host.call("hostSize", st.ui.wMini ? 330 : W_WIDTH, wh + th);
    });
  }
  if (window.ResizeObserver) { const ro = new ResizeObserver(fitWindow); ro.observe($("#widget")); ro.observe($("#toasts")); }
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && /^Digit[1-9]$/.test(e.code) && mode === "full") {
      const navs = $$(".nav"), i = +e.code.slice(5) - 1;
      if (navs[i]) { e.preventDefault(); showView(navs[i].dataset.view); }
      return;
    }
    if (e.ctrlKey && (e.code === "KeyK")) { e.preventDefault(); if (!window.A2AI) return; if (mode === "full" && st.ui.view !== "ai") window.A2AI.toggleFloat(); else window.A2AI.open(); return; }
    if (e.ctrlKey && (e.key === "f" || e.key === "а" || e.code === "KeyF")) {
      e.preventDefault();
      if (mode === "compact") { setMode("full").then(() => { showView("map"); $("#map-q").focus(); }); }
      else { showView("map"); setTimeout(() => $("#map-q").focus(), 50); }
    }
  });
  window.addEventListener("resize", () => { if (st.ui.view === "progress" && mode === "full") drawChart(); });

  // ---------- запуск ----------
  async function boot() {
    let raw = "";
    try { raw = await host.load(); } catch (e) { }
    const fresh = !raw;
    try { st = L.normalize(raw ? JSON.parse(raw) : null); } catch (e) { st = L.normalize(null); toast("Сохранение повреждено", "Начинаю с чистого листа, старый файл отложен."); }
    chars();
    pid = chars().some((c) => c.id === S().profile) ? S().profile : chars()[0].id;
    L.applyResets(st, pid, Date.now());
    wRing = makeRing($("#w-ring"), 92);
    document.body.classList.toggle("w-mini", !!st.ui.wMini);
    tRing = makeRing($("#t-ring"), 248);
    renderAll();
    host.top(!!S().topmost);
    applyHostSettings(false);
    host.info().then((p) => { if (p) { $("#data-path").textContent = "Данные хранятся: " + p; $("#data-path").onclick = () => host.call("hostOpenData"); $("#data-path").style.cursor = "pointer"; } });
    await setMode("full", true); // при запуске — всегда главное окно; виджет появляется сам, когда открыта игра
    save();
    document.body.classList.remove("booting");
    if (fresh) {
      st.ui.seenVer = "4.1";
      setTimeout(async () => {
        if (mode !== "full") await setMode("full");
        firstRun = true; openCharModal(null);
        $("#char-title").textContent = "Добро пожаловать! Кто твой персонаж?";
        $("#char-cancel").textContent = "Пропустить";
      }, 400);
    } else if (st.ui.seenVer !== "4.1") {
      st.ui.seenVer = "4.1";
      if (st.ui.overlay) st.ui.overlay.on = true; // автоподсветка включена по умолчанию
      if (S().ovFollow) S().ovFollow = false;
      save();
      setTimeout(() => toast("Помощник обновлён до 4.1", "Открой карту в игре — помощник сам найдёт её на экране и поставит точки (по умолчанию слои с карты помощника; «подсвети кубы» — только кубы). Наведи мышь на точку и Ctrl+Shift+C — «взято». «Подсвети маршрут по боссам» — линия с номерами прямо на карте игры. Настройки → «Чтение чата игры»: добыча и кинары записываются сами."), 1200);
    }
    if (window.A2Overlay) window.A2Overlay.boot();
    setInterval(tick, 1000);
  }
  document.addEventListener("a2save", save);
  // ---------- мини-виджет: вопрос помощнику и голос ----------
  let ansTimer = 0;
  function wAnswer(r, q) {
    const box = $("#w-ans"); if (!box || !r) return;
    const md = window.A2AI ? window.A2AI.md(r.md) : esc(r.md);
    box.innerHTML = `<button class="ib x" title="Закрыть">×</button><div class="w-ans-q">${esc(q)}</div><div class="w-ans-t">${md}</div>` +
      `<div class="w-ans-a">${(r.acts || []).map((a, i) => `<button class="btn sm" data-i="${i}">${esc(a.label)}</button>`).join("")}<button class="btn sm ghost" data-more>В чат</button></div>`;
    box.hidden = false;
    box.querySelector(".x").onclick = () => { box.hidden = true; };
    box.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => window.A2AI.runAct(r.acts[+b.dataset.i].a, b));
    box.querySelector("[data-more]").onclick = () => { box.hidden = true; window.A2AI.open(); };
    clearTimeout(ansTimer);
    const arm = () => { clearTimeout(ansTimer); ansTimer = setTimeout(() => { if (!box.matches(":hover")) box.hidden = true; else arm(); }, r.md.length > 300 ? 45e3 : 20e3); };
    arm();
  }
  function wAsk(q) {
    q = String(q || "").trim(); if (!q || !window.A2AI) return;
    const r = window.A2AI.quick(q);
    wAnswer(r, q);
  }
  $("#w-ask").addEventListener("submit", (e) => { e.preventDefault(); const i = $("#w-q"); const q = i.value; i.value = ""; wAsk(q); });
  $("#w-q").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.target.value = ""; $("#w-ans").hidden = true; e.target.blur(); } });
  // голос: встроенное распознавание, если оно есть; иначе — диктовка Windows (Win+H) прямо в поле
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function winDictation() {
    const i = $("#w-q"); i.focus();
    toast("Скажи голосом через диктовку Windows", "Поле уже в фокусе — нажми Win+H, говори, потом Enter. Встроенный в окно браузер не умеет распознавать речь сам.");
  }
  $("#w-mic").onclick = () => {
    if (listening && rec) { rec.stop(); return; }
    if (!SR || st.ui.noSR) return winDictation();
    try {
      rec = new SR(); rec.lang = "ru-RU"; rec.interimResults = true; rec.maxAlternatives = 1;
      let finalT = "", got = false;
      rec.onresult = (ev) => { got = true; let t = ""; for (const r of ev.results) t += r[0].transcript; $("#w-q").value = t; if (ev.results[ev.results.length - 1].isFinal) finalT = t; };
      rec.onerror = (ev) => { listening = false; $("#w-mic").classList.remove("on"); if (/network|not-allowed|service-not-allowed|audio-capture/.test(ev.error)) { if (ev.error !== "not-allowed") { st.ui.noSR = true; save(); } winDictation(); } };
      rec.onend = () => { listening = false; $("#w-mic").classList.remove("on"); if (finalT || (got && $("#w-q").value)) { const q = finalT || $("#w-q").value; $("#w-q").value = ""; wAsk(q); } };
      rec.start(); listening = true; $("#w-mic").classList.add("on");
    } catch (e) { winDictation(); }
  };
  // подсветка: кнопки в настройках и на карте
  const ovBtn = () => { const b = $("#ov-toggle"); if (b && window.A2Overlay) b.textContent = window.A2Overlay.on ? "Выключить подсветку" : "Включить подсветку"; const m = $("#map-ov"); if (m && window.A2Overlay) m.classList.toggle("on", window.A2Overlay.on); };
  $("#ov-toggle").onclick = () => { const O = window.A2Overlay; if (!O) return; if (O.on) O.hide(); else O.show([], "слои карты"); ovBtn(); };
  $("#ov-adjust").onclick = () => { window.A2Overlay && window.A2Overlay.adjust(); ovBtn(); };
  $("#ov-snap").onclick = () => window.A2Overlay && window.A2Overlay.snap(5);
  $("#ov-reset").onclick = () => { if (window.A2Overlay) { window.A2Overlay.reset(); toast("Выравнивание сброшено", "", "ok"); } };
  $("#map-ov").onclick = () => { const O = window.A2Overlay; if (!O) return; if (O.on && !O.layers.length) { O.hide(); } else { O.show(O.currentMapLayers(), "слои карты"); } ovBtn(); };
  document.addEventListener("a2overlay", ovBtn);
  // галочки в мини-виджете: метки поверх игры и подсказки при наведении
  function wOpts() {
    const O = window.A2Overlay, a = $("#w-ov-on"), b = $("#w-ov-tips"); if (!a || !b) return;
    a.checked = !!(O && O.on); b.checked = S().ovTips !== false; b.disabled = !a.checked;
  }
  $("#w-ov-on").onchange = (e) => { const O = window.A2Overlay; if (!O) return; if (e.target.checked) O.show(O.layers.length ? O.layers : [], ""); else O.hide(); wOpts(); };
  $("#w-ov-tips").onchange = (e) => { S().ovTips = e.target.checked; save(); if (window.A2Overlay) window.A2Overlay.send({}); toast(e.target.checked ? "Подсказки включены" : "Подсказки выключены", e.target.checked ? "Задержи курсор на значке — покажу, что это." : "Значки остаются, карточки при наведении не появятся.", "ok"); };
  document.addEventListener("a2overlay", wOpts);
  // обновления
  // язык интерфейса: хранится в настройках (переживает переустановку) и в localStorage окна
  {
    const I = window.A2I18n, sel = $("#lang-sel");
    if (I && sel) {
      sel.value = I.lang;
      sel.addEventListener("change", () => { S().lang = sel.value; clearTimeout(saveT); host.save(JSON.stringify(st)); setTimeout(() => I.set(sel.value), 150); });
      const want = S().lang;
      let canStore = false;
      try { localStorage.setItem("a2lang_t", "1"); canStore = localStorage.getItem("a2lang_t") === "1"; } catch (e) { }
      if (!want) { S().lang = I.lang; save(); }
      else if ((want === "ru" || want === "en") && want !== I.lang && canStore && !sessionStorage.getItem("a2lang_sync")) {
        try { sessionStorage.setItem("a2lang_sync", "1"); } catch (e) { }
        I.set(want);
      }
    }
  }
  function updUI() { const s = S(); $("#upd-repo").value = s.updateRepo || (window.A2Update ? window.A2Update.repo() : ""); $("#upd-auto").checked = s.updateCheck !== false; }
  $("#upd-repo").addEventListener("change", (e) => { S().updateRepo = e.target.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, ""); save(); });
  $("#upd-auto").onchange = (e) => { S().updateCheck = e.target.checked; save(); };
  $("#upd-check").onclick = () => window.A2Update && window.A2Update.check(true);
  setTimeout(updUI, 700);
  // какие слои показывать поверх игры — галочками прямо в виджете
  function wLayers() {
    const box = $("#w-layers"), D = window.MAPDATA, O = window.A2Overlay; if (!box || !D || !O) return;
    const on = new Set(!O.on ? [] : O.layers.length ? O.layers : O.currentMapLayers());
    const SHORT = { bosses: "Боссы", named: "Именные", dungeons: "Подземелья", sealed: "Запечатан.", teleports: "Телепорты", cubes: "Кубы", cubespots: "Места кубов", traces: "Следы", monoliths: "Монолиты", rifts: "Разломы", merchants: "Торговцы", storage: "Склад" };
    const item = (l) => `<label style="--c:${l.color}" title="${esc(l.name)}"><input type="checkbox" data-l="${l.id}" ${on.has(l.id) ? "checked" : ""}><i></i><span>${esc(SHORT[l.id] || l.name)}</span></label>`;
    const main = D.layers.filter((l) => l.group === "main"), gather = D.layers.filter((l) => l.group !== "main");
    box.innerHTML = `<div class="wl-grid">${main.map(item).join("")}</div>` +
      (gather.length ? `<div class="wl-sub">Сбор</div><div class="wl-grid">${gather.map(item).join("")}</div>` : "") +
      `<div class="wl-row"><button type="button" class="btn sm ghost" data-all="1">Все</button><button type="button" class="btn sm ghost" data-all="0">Ничего</button><button type="button" class="btn sm ghost" data-all="map">Как на карте</button></div>`;
  }
  function applyLayers(ids) {
    const O = window.A2Overlay; if (!O) return;
    if (!ids.length) { O.hide(); wOpts(); wLayers(); return; }
    O.show(ids, window.A2Overlay.names(ids).split(", ").slice(0, 3).join(", ") + (ids.length > 3 ? "…" : ""));
    wOpts();
  }
  $("#w-lay-btn").onclick = () => { const b = $("#w-layers"); b.hidden = !b.hidden; $("#w-lay-btn").classList.toggle("open", !b.hidden); if (!b.hidden) wLayers(); };
  $("#w-layers").addEventListener("change", () => applyLayers($$("#w-layers input[data-l]:checked").map((x) => x.dataset.l)));
  $("#w-layers").addEventListener("click", (e) => {
    const b = e.target.closest("[data-all]"); if (!b) return;
    const D = window.MAPDATA, O = window.A2Overlay;
    if (b.dataset.all === "map") { O.show([], "слои карты"); wLayers(); wOpts(); return; }
    applyLayers(b.dataset.all === "1" ? D.layers.map((l) => l.id) : []); wLayers();
  });
  document.addEventListener("a2overlay", () => { if (!$("#w-layers").hidden) wLayers(); });
  setTimeout(wOpts, 600);
  // чтение чата
  function chatBox() {
    const C = window.A2Chat, box = $("#chat-box"); if (!C || !box) return;
    const s = S(), on = !!s.chatRead;
    $("#chat-on").checked = on;
    const stTxt = !s.chatArea ? "Окно чата не указано — нажми «Указать окно чата» и обведи его мышью поверх игры." :
      !on ? "Выключено." : C.state === "err" ? "Ошибка распознавания — см. уведомление." : C.state === "live" || C.state === "ready" ? "Работает." : "Включится, когда игра будет на переднем плане.";
    const fd = (st.ui.chatFeed || []).slice(-6).reverse();
    const ck = st.ui.chatKinah && st.ui.chatKinah.d === new Date().toDateString() ? st.ui.chatKinah.v : 0;
    box.innerHTML = `<p class="muted">${esc(stTxt)}${ck ? ` · из чата сегодня: <b>${ck.toLocaleString("ru-RU")}</b> кинаров` : ""}</p>` +
      (fd.length ? `<ul class="chat-feed">${fd.map((f) => `<li class="k-${f.kind}"><span>${new Date(f.at).toTimeString().slice(0, 5)}</span>${esc(f.text)}</li>`).join("")}</ul>` : "") +
      (C.last.length ? `<details><summary>Что распознано последним</summary><pre>${esc(C.last.join("\n"))}</pre></details>` : "");
  }
  $("#chat-on").onchange = (e) => { window.A2Chat && window.A2Chat.enable(e.target.checked); chatBox(); };
  $("#chat-area").onclick = () => window.A2Chat && window.A2Chat.select();
  document.addEventListener("a2chat", chatBox);
  setTimeout(chatBox, 500);
  // ---------- счётчик урона и пинг ----------
  const fmtN = (v) => Math.round(v).toLocaleString("ru-RU");
  const fmtBig = (v) => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(".", ",") + " млн" : v >= 1e4 ? Math.round(v / 1e3) + " тыс." : fmtN(v);
  const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  function combatUI() {
    const C = window.A2Combat; if (!C) return;
    const s = S(), on = !!s.combatRead, L = C.live(), fights = C.fights();
    // виджет
    const w = $("#w-dps");
    if (w) {
      w.hidden = !on || !L;
      if (L) w.innerHTML = `<b class="${L.live ? "live" : ""}">${fmtN(L.dps)}</b><span>DPS</span><span class="muted">${fmtSec(L.sec)} · ${fmtBig(L.dmg)}${L.live ? "" : " · последний бой"}</span>`;
    }
    // «Сегодня»
    const t = $("#t-combat");
    if (t) {
      t.hidden = !on && !fights.length;
      const rows = fights.slice(-6).reverse().map((f) => `<tr><td>${new Date(f.at).toTimeString().slice(0, 5)}</td><td><b>${fmtN(f.dps)}</b></td><td>${fmtSec(f.sec)}</td><td>${fmtBig(f.dmg)}</td><td>${fmtN(f.max)}</td><td class="muted">${esc((f.top || []).slice(0, 2).map((x) => x[0]).filter((x) => x !== "—").join(", "))}</td></tr>`).join("");
      t.innerHTML = `<h3>Урон (DPS)</h3>` + (L && L.live ? `<p class="dps-live"><b>${fmtN(L.dps)}</b> DPS · ${fmtSec(L.sec)} · ${fmtBig(L.dmg)} урона · макс. удар ${fmtN(L.max)}</p>` : "") +
        (rows ? `<table class="dps-tbl"><tr><th>Начало</th><th>DPS</th><th>Время</th><th>Урон</th><th>Макс. удар</th><th>Лучшие умения</th></tr>${rows}</table>` : `<p class="muted">${on ? "Бей монстра — бои появятся здесь." : "Счётчик выключен (Настройки → Счётчик урона)."}</p>`);
    }
    // «Прогресс и бои»: вся история
    const pc = $("#p-combat");
    if (pc) pc.innerHTML = fights.length ? `<h3 class="mt">${T("Бои (счётчик урона)")}</h3><table class="dps-tbl"><tr><th>Начало</th><th>DPS</th><th>Время</th><th>Урон</th><th>Макс. удар</th><th>Лучшие умения</th></tr>${fights.slice().reverse().map((f) => `<tr><td>${new Date(f.at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${new Date(f.at).toTimeString().slice(0, 5)}</td><td><b>${fmtN(f.dps)}</b></td><td>${fmtSec(f.sec)}</td><td>${fmtBig(f.dmg)}</td><td>${fmtN(f.max)}</td><td class="muted">${esc((f.top || []).slice(0, 2).map((x) => x[0]).filter((x) => x !== "—").join(", "))}</td></tr>`).join("")}</table>` : "";
    // настройки
    const box = $("#combat-box"); if (!box) return;
    $("#combat-on").checked = on;
    const stTxt = !s.combatArea ? "Журнал боя не указан — нажми «Указать журнал боя» и обведи его мышью поверх игры." :
      !on ? "Выключено." : C.state === "err" ? "Ошибка распознавания — см. уведомление." : C.state === "live" || C.state === "ready" ? "Работает." : "Включится, когда игра будет на переднем плане.";
    box.innerHTML = `<p class="muted">${esc(stTxt)}${fights.length ? ` · боёв записано: <b>${fights.length}</b>` : ""}</p>` +
      (C.last.length ? `<details><summary>Что распознано последним</summary><pre>${esc(C.last.join("\n"))}</pre></details>` : "");
  }
  $("#combat-on").onchange = (e) => { window.A2Combat && window.A2Combat.enable(e.target.checked); combatUI(); };
  $("#combat-area").onclick = () => window.A2Combat && window.A2Combat.select();
  $("#combat-reset").onclick = () => { if (confirm("Удалить записанные бои?")) window.A2Combat && window.A2Combat.reset(); };
  document.addEventListener("a2combat", combatUI);
  setTimeout(combatUI, 500);
  function pingUI() {
    const P = window.A2Ping, el = $("#w-ping"); if (!P || !el) return;
    const r = P.last, on = S().pingOn !== false;
    el.hidden = !on || !r || r.state === "nogame";
    if (!r) return;
    const ms = r.state === "ok" ? Math.round(r.ms) : null;
    el.className = "w-ping nodrag " + (ms == null ? "bad" : ms < 60 ? "good" : ms < 120 ? "mid" : "bad");
    el.textContent = ms != null ? ms + " мс" : r.state === "noconn" ? "нет связи" : "—";
    el.title = ms != null ? `Пинг до сервера игры ${r.ip}:${r.port} (${r.method === "icmp" ? "ICMP" : "TCP"}), среднее ${Math.round(r.avg)} мс` : "Пинг до сервера игры: " + (r.state === "noconn" ? "не нашёл соединения игры с сервером" : "сервер не ответил");
  }
  // настройки: какие соединения игры видны и какое мерить
  function pingBox() {
    const box = $("#ping-box"), P = window.A2Ping; if (!box || !P) return;
    const r = P.last, pin = S().pingPin || "";
    if (!r || r.state === "nogame") { box.innerHTML = `<p class="muted">${T("Игра не запущена — список соединений появится, когда она откроется.")}</p>`; return; }
    const list = r.conns || [];
    box.innerHTML = `<p class="muted">${T("Соединения игры с серверами. Помощник сам выбирает игровое (не веб-порт); если цифра не совпадает с пингом в игре — закрепи другое.")}</p>` +
      `<ul class="ping-list">${list.map((c) => `<li class="${r.ip + ":" + r.port === c.addr ? "on" : ""}"><code>${esc(c.addr)}</code><b>${c.ms != null ? Math.round(c.ms) + " мс" : "—"}</b><span class="muted small">${c.method === "tcp" ? "TCP" : c.method === "icmp" ? "ICMP" : ""}</span><button type="button" class="btn sm ${pin === c.addr ? "primary" : "ghost"}" data-pin="${esc(c.addr)}">${pin === c.addr ? T("Закреплено") : T("Мерить это")}</button></li>`).join("")}</ul>` +
      (pin ? `<button type="button" class="link-btn" id="ping-auto">${T("Вернуть автовыбор")}</button>` : "");
    $$("[data-pin]", box).forEach((b) => b.onclick = () => { S().pingPin = b.dataset.pin; save(); sendPin(); pingBox(); });
    const au = $("#ping-auto", box); if (au) au.onclick = () => { S().pingPin = ""; save(); sendPin(); pingBox(); };
  }
  const sendPin = () => { if (typeof window.hostOverlay === "function") window.hostOverlay(JSON.stringify({ pingPin: S().pingPin || "" })); };
  setTimeout(sendPin, 650);
  document.addEventListener("a2ping", pingUI);
  document.addEventListener("a2ping", () => { if (st.ui.view === "settings" && mode === "full") pingBox(); });
  $("#ping-on").addEventListener("change", (e) => { S().pingOn = e.target.checked; save(); window.A2Ping && window.A2Ping.send(e.target.checked); pingUI(); });
  setTimeout(() => { if (window.A2Ping && S().pingOn !== false) window.A2Ping.send(true); }, 700);

  // события из Go: трей, горячие клавиши
  function hostEvent(kind, v) {
    if (kind === "compact") setMode("compact");
    else if (kind === "full") setMode("full");
    else if (kind === "click") { document.body.classList.toggle("ghost", !!v); $("#ghost-badge").hidden = !v; toast(v ? "Сквозные клики включены" : "Сквозные клики выключены", v ? "Окно не мешает игре. Выключить: " + (S().hotkeyClick || "меню в трее") : ""); }
    else if (kind === "top") { S().topmost = !!v; save(); renderSettings(); }
    else if (kind === "quit") host.save(JSON.stringify(st));
  }
  // игру запустили или развернули — переходим в виджет (вызывает Go)
  function gameEvent(kind) { if (kind === "show" && mode !== "compact") setMode("compact"); }
  { const b = $("#t-all-checks"); if (b) b.onclick = () => showView("checks"); }
  window.A2App = { get state() { return st; }, get pid() { return pid; }, get ch() { return ch(); }, setMode, showView, toast, hostEvent, notify, save, net: netGet, renderAll, gameEvent };
  boot();
})();
