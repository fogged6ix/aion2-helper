/* ИИ-помощник по билдам и игре: локальная модель (Ollama) или Claude API */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = () => window.A2App;
  const DEF = { provider: "builtin", url: "http://127.0.0.1:11434", model: "", numCtx: 16384, key: "", claudeModel: "claude-sonnet-5-5", useChar: true, useGuide: true, useKb: true };
  const CLAUDE_MODELS = [["claude-sonnet-5-5", "Claude Sonnet 5.5 — лучший баланс"], ["claude-haiku-5-5", "Claude Haiku 5.5 — быстрее и дешевле"], ["claude-opus-5-5", "Claude Opus 5.5 — самый умный"]];
  const QUICK = () => {
    const CD = window.CALCDATA, ch = app().ch, sk = CD && CD.classes[ch.cls] ? (CD.classes[ch.cls].skills.find((s) => s.kind === "stigma") || {}).name : "";
    return ["Как быстрее поднять GS?", "Сколько стоит заточить оружие до +15?", "У меня 3 млн кинаров — что точить?", sk ? `Что даёт ${sk}?` : "Проверь мои стигмы",
      "Когда респ Кашапы?", "Хочу 1300 GS — хватит ли без риска?", "Что делать сегодня вечером на 2 часа?", "Где выбить плавильный камень эксперта?",
      "Что лучше точить: перчатки или оружие?", "У меня 2 млн кинаров и 50 кристаллов — с чего начать?", "Убил Кашапу 10 минут назад", "Одила 320", "Сделал кошмары и поставки", "Напомни через 30 минут проверить аукцион"];
  };

  function TEMPLATES() {
    const X = window.EXTRA, base = QUICK().concat(["Сколько стоит перчатки до +12?", "Что будет если заточу оружие до +15 и возьму 40 кристаллов?", "Как дойти до цели?", "Моя цель 1300 GS к пятнице", "Мой бюджет 3 млн", "Зарабатываю 1 млн в день",
      "Играю 2 часа в день", "Я играю в PvE", "Что ты обо мне знаешь?", "Моя удача", "Итоги недели", "Сводка", "Как мой прогресс?", "Куда вложить 40 кристаллов?", "Что лучше: заточка или Дэванион?", "Сколько кристаллов закрыть Неджакан?",
      "Отметь все дейлики", "Добавь дело ", "Напомни через 30 минут ", "Сбрось таймер ", "GS ", "Одила ", "Заточил перчатки до +", "Запомни: пушка — это оружие", "Таймеры боссов", "Где выбить картину "]);
    const bosses = X ? X.bosses.map((b) => b[1].split(" ").slice(-1)[0]) : [];
    return base.concat(bosses.flatMap((b) => [`Убил ${b}`, `Когда респ ${b}?`]));
  }
  function cfg() { const st = app().state; st.ai = Object.assign({}, DEF, st.ai || {}); return st.ai; }
  function chat() { const p = app().state.profiles[app().pid]; p.chat = p.chat || []; return p.chat; }

  // ---------- контекст для модели ----------
  const STOP = new Set("как что где куда когда зачем почему какой какая какие какую мне мой моя мои моё мое для это этот эта или если есть надо нужно можно сейчас лучше больше меньше очень про под при над без через после перед тоже также чтобы ещё еще все всё the and".split(" "));
  const stems = (s) => String(s).toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, Math.max(4, Math.min(6, w.length - 2))));
  function pickKb(q, n = 3, limit = 5200, minScore = 0) {
    const KB = window.KB || []; const qs = new Set(stems(q)); if (!qs.size) return [];
    const scored = KB.map((c) => { const t = stems(c.t + " " + c.x); let s = 0; const seen = new Set(); t.forEach((w) => { if (qs.has(w) && !seen.has(w)) { seen.add(w); s += 1; } }); stems(c.t).forEach((w) => { if (qs.has(w)) s += 1.5; }); return [s, c]; })
      .filter((x) => x[0] > minScore).sort((a, b) => b[0] - a[0]);
    const out = []; let len = 0;
    for (const [, c] of scored) { if (out.length >= n || len + c.x.length > limit) continue; out.push(c); len += c.x.length; }
    return out;
  }
  function pickDrops(q) {
    const X = window.EXTRA, B = window.A2Bosses; if (!X || !B) return [];
    const qs = new Set(stems(q)); if (!qs.size) return [];
    const res = [];
    X.items.forEach((it, i) => {
      const ws = stems(it[0]); if (!ws.length) return;
      const hit = ws.filter((w) => qs.has(w)).length;
      if (hit >= Math.min(2, ws.length) && hit / ws.length >= .5) res.push([hit / ws.length + hit * .1, i]);
    });
    return res.sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, i]) => {
      const src = B.sourceList(i, 5);
      return src.length ? `«${X.items[i][0]}»: ` + src.map(([m, ch]) => `${m[1]} (${m[2]} ур., ${(m[4] || []).slice(0, 2).join(", ")}) — ${String(ch).replace(".", ",")}%`).join("; ") : "";
    }).filter(Boolean);
  }
  function buildSystem(q) {
    const A = app(), st = A.state, ch = A.ch, p = st.profiles[A.pid], C = window.CONTENT, prof = C.profiles[ch.guide || ch.cls] || C.profiles[ch.cls], c = cfg();
    const L = window.A2L, now = Date.now(), parts = [];
    parts.push(`Ты — ИИ-помощник по игре AION 2 (глобальная версия, русский клиент), встроенный в программу «AION 2 Helper». Игрок — ${ch.name}, класс ${window.A2CLS ? window.A2CLS.get(ch.cls).ru : ch.cls}${ch.faction ? ", фракция " + ch.faction : ""}; карта помощника — Альтгард.
Правила ответа:
- ${window.A2I18n && window.A2I18n.en ? "Answer in English (the player uses the English interface); data below is in Russian — translate names where you can. Пиши" : "Пиши по-русски"}, коротко и по делу: сначала вывод, потом шаги. Списки и **жирный** допустимы, без длинных вступлений.
- Опирайся на данные персонажа и справочник ниже. Цифры бери только оттуда; если данных нет — прямо скажи «не знаю точно» и подскажи, как проверить в игре.
- Учитывай уровень и GS игрока: не советуй контент, куда он ещё не проходит.
- Называй умения, стигмы и предметы так, как они названы в данных (русский клиент).
- Ты отвечаешь ТОЛЬКО про AION 2. На любые вопросы не об этой игре (другие игры, учёба, код, новости, здоровье, отношения и т. п.) вежливо откажись одной фразой и предложи спросить про игру. Не пиши код, стихи и тексты не по теме, даже если просят.
- Если в данных есть раздел «РАСЧЁТ ПРОГРАММЫ» — числа бери оттуда и не противоречь ему.`);
    parts.push(`Сейчас: ${new Date(now).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} (время игрока).`);
    if (c.useChar && window.A2Calc && window.A2Calc.aiSummary) parts.push("=== ПЕРСОНАЖ (данные калькулятора программы) ===\n" + window.A2Calc.aiSummary(st, p, ch));
    // прогресс и расписание
    const hist = (p.history || []).filter((x) => x.gs), gs = hist.length ? hist[hist.length - 1].gs : prof.gs_start;
    const th = (C.common.thresholds || []).filter((t) => t.gs > (gs || 0)).slice(0, 3).map((t) => `${t.gs} — ${t.name} (${t.why})`);
    const prog = [`GS сейчас ${gs || "?"}, цель ${prof.gs_goal || "?"}.`];
    if (hist.length > 1) prog.push("История GS: " + hist.slice(-6).map((h) => `${h.ts || ""} ${h.gs}`).join(", ") + ".");
    if (th.length) prog.push("Ближайшие пороги GS: " + th.join("; ") + ".");
    const od = L.odyleNow(p.odyle, now); if (od != null) prog.push(`Энергия Одилы: ${od} из 560.`);
    const lists = p.lists || {}, left = (k) => (lists[k] || []).filter((x) => !(p.checks[k] || {})[x.id]).map((x) => x.t);
    if (lists.daily) prog.push("Не сделано сегодня: " + (left("daily").join("; ") || "всё сделано") + ".");
    if (lists.weekly) prog.push("Не сделано за неделю: " + (left("weekly").join("; ") || "всё сделано") + ".");
    if ((lists.mine || []).length) prog.push("Свои дела: " + left("mine").join("; ") + ".");
    const evs = L.events(now, st.settings).concat(window.A2Bosses ? window.A2Bosses.events(now) : []).sort((a, b) => a.at - b.at).slice(0, 6);
    prog.push("Ближайшие события: " + evs.map((e) => `${e.long} через ${L.fmtDelta(e.at - now)}`).join("; ") + ".");
    parts.push("=== ПРОГРЕСС И РАСПИСАНИЕ ===\n" + prog.join("\n"));
    if (c.useGuide) {
      parts.push("=== ГАЙД ПО КЛАССУ (составлен для этого игрока) ===\n" + (prof.build || []).map((s) => `## ${s.title}\n${s.text}`).join("\n\n"));
      const rm = (prof.roadmap || []).map((d) => `${d.day}: ${d.goal}`).join("; ");
      if (rm) parts.push("Роадмап недели: " + rm);
    }
    if (c.useKb) {
      const recent = chat().filter((m) => m.r === "user").slice(-2).map((m) => m.t).join(" ");
      const kb = pickKb(q + " " + recent);
      if (kb.length) parts.push("=== СПРАВОЧНИК (исследование по AION 2, глобальная версия; часть данных из корейской версии) ===\n" + kb.map((x) => `## ${x.t}\n${x.x}`).join("\n\n"));
      if (window.A2Brain) { try { const pre = window.A2Brain.answer(q, { peek: true }); if (pre && pre.md && !/^Не понял/.test(pre.md)) parts.push("=== РАСЧЁТ ПРОГРАММЫ ПО ЭТОМУ ВОПРОСУ (точные цифры — опирайся на них) ===\n" + pre.md); } catch (e) { } }
      const dr = pickDrops(q);
      if (dr.length) parts.push("=== ДОБЫЧА В АЛЬТГАРДЕ (шанс за убийство, данные клиента через metabot.gg) ===\n" + dr.join("\n"));
    }
    return parts.join("\n\n");
  }

  // ---------- транспорт ----------
  const waits = {}; let seq = 0, busyId = 0;
  window.__a2ai = (id, text, done, err) => { const w = waits[id]; if (!w) return; if (text) w.onText(text); if (done) { delete waits[id]; w.onDone(err || ""); } };
  function thinkFlag(model) { return /^(qwen3|deepseek-r1|magistral|qwq)/i.test(model || "") ? false : undefined; }
  async function send(messages, system, onText, onDone) {
    const c = cfg(), id = ++seq;
    if (c.provider === "builtin") { busyId = 0; return id; }
    const req = { provider: c.provider, url: c.url, model: c.provider === "claude" ? c.claudeModel : c.model, key: c.key, system, messages, numCtx: +c.numCtx || 16384 };
    const tf = c.provider === "ollama" ? thinkFlag(c.model) : undefined; if (tf !== undefined) req.think = tf;
    waits[id] = { onText, onDone }; busyId = id;
    if (typeof window.hostAI === "function") { window.hostAI(JSON.stringify(req), id); return id; }
    // без программы (браузер): только Ollama напрямую
    if (c.provider !== "ollama") { window.__a2ai(id, "", true, "Claude API работает только в программе."); return id; }
    try {
      const body = { model: req.model, messages: [{ role: "system", content: system }].concat(messages), stream: true, options: { num_ctx: req.numCtx } };
      if (tf !== undefined) body.think = tf;
      const r = await fetch(c.url.replace(/\/$/, "") + "/api/chat", { method: "POST", body: JSON.stringify(body) });
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(line); if (j.message && j.message.content) window.__a2ai(id, j.message.content, false); } catch (e) { } } }
      window.__a2ai(id, "", true, "");
    } catch (e) { window.__a2ai(id, "", true, "Ollama не отвечает: " + e.message); }
    return id;
  }
  function stop() { if (busyId && typeof window.hostAIStop === "function") window.hostAIStop(busyId); const w = waits[busyId]; if (w) { delete waits[busyId]; w.onDone(""); } }

  // ---------- разметка ответа ----------
  function cleanThink(t) { return t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<think>[\s\S]*$/, "").trimStart(); }
  function md(t) {
    const lines = esc(cleanThink(t)).split("\n"); let html = "", list = null;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>").replace(/(^|[\s(])_([^_]+?)_(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>");
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const l = raw.trimEnd();
      let m;
      if (/^\s*\|/.test(l)) { // таблица → строки списка
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
        const cells = l.split("|").map((x) => x.trim()).filter(Boolean);
        if (list !== "ul") { close(); html += '<ul class="tbl">'; list = "ul"; }
        html += `<li>${inline(cells.join(" · "))}</li>`; continue;
      }
      if ((m = /^\s*[-*•]\s+(.*)/.exec(l))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = /^#{1,4}\s+(.*)/.exec(l))) { close(); html += `<h4>${inline(m[1])}</h4>`; }
      else if (!l.trim()) { close(); }
      else { close(); html += `<p>${inline(l)}</p>`; }
    }
    close();
    return html;
  }

  // ---------- экран ----------
  let models = null, modelErr = "";
  function autoSummary() {
    const st = app().state, today = new Date().toDateString(); st.ai = st.ai || {};
    if (!window.A2Brain || cfg().provider !== "builtin" || st.ai.sumDay === today) return;
    st.ai.sumDay = today;
    try { const s2 = window.A2Brain.summary(); chat().push({ r: "assistant", t: s2.md, chips: s2.chips, at: Date.now(), b: 1, cmd: true }); app().save(); } catch (e) { }
  }
  // ---------- помощник поверх любого раздела ----------
  const floatOpen = () => { const f = $("#ai-float"); return f && !f.hidden; };
  function toggleFloat(v) {
    const f = $("#ai-float"); if (!f) return;
    const show = v == null ? f.hidden : !!v;
    f.hidden = !show; $("#ai-float-btn") && $("#ai-float-btn").classList.toggle("on", show);
    document.body.classList.toggle("float-open", show);
    if (show) { renderFloat(); setTimeout(() => $("#aif-q").focus(), 30); }
  }
  function renderFloat() {
    if (!floatOpen()) return;
    const msgs = chat(), log = $("#aif-log");
    const html = msgs.map(bubble).slice(-10).join("");
    log.innerHTML = html || '<p class="muted small">Спроси что-нибудь: «где фармить кристаллы Дэваниона», «убил Кашапу», «что точить на 2 млн».</p>';
    bindLog(log); log.scrollTop = log.scrollHeight;
  }
  function activeLog() { return app().state.ui.view === "ai" && document.body.classList.contains("m-full") ? $("#ai-log") : (floatOpen() ? $("#aif-log") : $("#ai-log")); }
  function render() {
    renderFloat();
    const root = $("#ai-root"); if (!root) return;
    autoSummary();
    const c = cfg(), msgs = chat(), busy = !!waits[busyId];
    if (c.provider === "builtin") models = models || null;
    root.innerHTML = `
      <div class="ai-wrap">
        <div class="panel ai-chat">
          <div class="ai-log" id="ai-log">${msgs.length ? msgs.map(bubble).join("") : intro()}</div>
          <form class="ai-input" id="ai-form">
            <div class="ai-sugg" id="ai-sugg" hidden></div>
            <textarea id="ai-q" rows="2" placeholder="Спроси про игру или сообщи: «убил Данара», «одила 320», «сделал кошмары», «напомни через 30 мин…» (Enter — отправить)"></textarea>
            <button class="btn primary" type="submit" id="ai-send" ${busy ? "hidden" : ""}>Спросить</button>
            <button class="btn" type="button" id="ai-stop" ${busy ? "" : "hidden"}>Стоп</button>
          </form>
        </div>
        <div class="stack-col ai-side">
          <div class="panel">
            <h3>Кто отвечает</h3>
            <div class="seg ai-prov"><button data-p="builtin" class="${c.provider === "builtin" ? "on" : ""}">Встроенный</button><button data-p="ollama" class="${c.provider === "ollama" ? "on" : ""}">Ollama</button><button data-p="claude" class="${c.provider === "claude" ? "on" : ""}">Claude</button></div>
            ${c.provider === "builtin" ? `<div class="ai-status ok">Работает сразу, без интернета и ключей</div>
              <p class="muted small">Отвечает по данным программы: твой персонаж и калькулятор, гайд, справочник по игре, таблицы добычи, таймеры и расписание. Это не нейросеть — свободно болтать не умеет, но на вопросы про GS, Дэванион, заточку, стигмы, фарм и план на день отвечает точными цифрами.</p>
              <p class="muted small">Есть своя нейросеть? Переключись на <b>Ollama</b> (модель на компьютере) или <b>Claude</b> (ключ API) — ответы станут «живыми».</p>` : c.provider === "ollama" ? `
              <label class="ai-f">Модель<select id="ai-model">${(models || []).map((m) => `<option ${m === c.model ? "selected" : ""}>${esc(m)}</option>`).join("") || `<option value="">${modelErr ? "нет связи с Ollama" : "загружаю список…"}</option>`}</select></label>
              <div class="ai-status ${modelErr ? "bad" : models && models.length ? "ok" : ""}">${modelErr ? esc(modelErr) : models ? (models.length ? `Ollama на связи · моделей: ${models.length}` : "Ollama запущена, но моделей нет") : "проверяю Ollama…"}</div>
              ${models && !models.length || modelErr ? `<p class="muted small">Для видеокарты на 16 ГБ подойдёт <b>qwen3:14b</b> (хорошо понимает русский). Установи в терминале:</p><div class="ai-cmd"><code>ollama pull qwen3:14b</code><button class="btn sm ghost" id="ai-copy">копировать</button></div>` : ""}
              <details class="ai-more"><summary>Дополнительно</summary>
                <label class="ai-f">Адрес Ollama<input id="ai-url" value="${esc(c.url)}"></label>
                <label class="ai-f">Контекст, токенов<input id="ai-ctx" type="number" min="4096" max="131072" step="1024" value="${c.numCtx}"></label>
                <p class="muted small">Больше контекст — больше памяти видеокарты. 16 384 хватает: программа сама отбирает нужные куски справочника.</p>
              </details>
              <button class="btn sm ghost" id="ai-check">Проверить</button>` : `
              <label class="ai-f">Модель<select id="ai-cmodel">${CLAUDE_MODELS.map(([v, l]) => `<option value="${v}" ${v === c.claudeModel ? "selected" : ""}>${l}</option>`).join("")}</select></label>
              <label class="ai-f">Ключ API<input id="ai-key" type="password" value="${esc(c.key)}" placeholder="sk-ant-…" autocomplete="off"></label>
              <p class="muted small">Ключ создаётся в console.anthropic.com, оплата — по твоему тарифу API. Хранится только в файле данных программы на этом компьютере.</p>`}
          </div>
          <div class="panel">
            <h3>${c.provider === "builtin" ? "Что учитывать (для нейросети)" : "Что помощник знает"}</h3>
            <label class="chk"><input type="checkbox" id="ai-uc" ${c.useChar ? "checked" : ""}><span>Мой персонаж и планы из калькулятора</span></label>
            <label class="chk"><input type="checkbox" id="ai-ug" ${c.useGuide ? "checked" : ""}><span>Гайд и роадмап</span></label>
            <label class="chk"><input type="checkbox" id="ai-uk" ${c.useKb ? "checked" : ""}><span>Справочник по игре и таблицы добычи</span></label>
            <p class="muted small">${window.A2App.state.profiles[window.A2App.pid].calc && window.A2App.state.profiles[window.A2App.pid].calc.imported ? "Данные персонажа взяты из последнего импорта." : "Совет: сначала импортируй персонажа в калькуляторе — ответы станут точнее."}</p>
            <button class="btn sm ghost" id="ai-clear" ${msgs.length ? "" : "hidden"}>Очистить разговор</button>
          </div>
        </div>
      </div>`;
    bind(root);
    const log = $("#ai-log", root); log.scrollTop = log.scrollHeight;
    if (c.provider === "ollama" && models === null) loadModels();
  }
  function intro() {
    return `<div class="ai-intro"><img src="logo.png" alt=""><h2>Спроси про игру</h2><p class="muted">Помощник только по AION 2: видит твоего персонажа, планы, гайд, справочник, таблицы добычи и таймеры — и сам записывает то, что ты ему сообщаешь (убийства боссов, Одилу, GS, сделанные дела, заточку, напоминания). Работает без интернета.</p>
      <div class="ai-quick">${QUICK().map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>`;
  }
  function bubble(m, i, arr) {
    const isLast = i === arr.length - 1;
    const acts = m.acts && m.acts.length && isLast ? m.acts.map((a, k) => `<button class="btn sm act" data-act-i="${k}">${esc(a.label)}</button>`).join("") : "";
    const fb = isLast && m.r === "assistant" && m.b && !m.cmd && !m.fbDone ? `<span class="fb"><button class="ib" data-fb="1" title="Хороший ответ">👍</button><button class="ib" data-fb="0" title="Не то — попробовать понять иначе">👎</button></span>` : "";
    const chips = (m.chips && m.chips.length && isLast) || acts || fb ? `<div class="ai-follow">${fb}${acts}${(isLast && m.chips ? m.chips : []).map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : "";
    const think = m.trace && m.trace.length && !m.cmd ? `<details class="think"><summary>Ход мысли · ${m.trace.length} ${m.trace.length < 5 ? "шага" : "шагов"}</summary><ol>${m.trace.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : "";
    const body = m.r === "user" ? `<p>${esc(m.t).replace(/\n/g, "<br>")}</p>` : think + (md(m.t) || '<p class="muted">…</p>');
    return `<div class="msg ${m.r === "user" ? "me" : "bot"}${m.err ? " err" : ""}${m.cmd ? " cmd" : ""}">${body}${m.err ? `<p class="warn small">${esc(m.err)}</p>` : ""}</div>${chips}`;
  }
  function bindLog(root) {
    $$("[data-q]", root).forEach((b) => b.onclick = () => ask(b.dataset.q));
    $$("[data-fb]", root).forEach((b) => b.onclick = () => {
      const msgs = chat(), m = msgs[msgs.length - 1], u = msgs.slice().reverse().find((z) => z.r === "user");
      m.fbDone = true; const st = app().state; st.ai = st.ai || {}; st.ai.fb = st.ai.fb || { up: 0, down: 0 };
      if (b.dataset.fb === "1") { st.ai.fb.up++; app().save(); render(); app().toast("Спасибо!", "Учту, что такой ответ полезен.", "ok"); return; }
      st.ai.fb.down++;
      const alt = window.A2Brain.alternatives(u ? u.t : "");
      msgs.push({ r: "assistant", t: alt.md, chips: alt.chips, at: Date.now(), b: 1, cmd: true });
      app().save(); render();
    });
    $$("[data-act-i]", root).forEach((b) => b.onclick = () => { const m = chat()[chat().length - 1]; const a = m && m.acts && m.acts[+b.dataset.actI]; if (a) runAct(a.a, b); });
  }
  function bind(root) {
    const c = cfg(), save = () => app().save();
    $$(".ai-prov button", root).forEach((b) => b.onclick = () => { c.provider = b.dataset.p; save(); render(); });
    const sel = $("#ai-model", root); if (sel) sel.onchange = () => { c.model = sel.value; save(); };
    const cm = $("#ai-cmodel", root); if (cm) cm.onchange = () => { c.claudeModel = cm.value; save(); };
    const key = $("#ai-key", root); if (key) key.onchange = () => { c.key = key.value.trim(); save(); };
    const url = $("#ai-url", root); if (url) url.onchange = () => { c.url = url.value.trim() || DEF.url; save(); models = null; render(); };
    const cx = $("#ai-ctx", root); if (cx) cx.onchange = () => { c.numCtx = Math.max(4096, Math.min(131072, +cx.value || 16384)); save(); };
    const chk = $("#ai-check", root); if (chk) chk.onclick = () => { models = null; modelErr = ""; render(); };
    const cp = $("#ai-copy", root); if (cp) cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText("ollama pull qwen3:14b"); app().toast("Скопировано", "Вставь в PowerShell или «Терминал» и дождись загрузки (~9 ГБ), потом нажми «Проверить».", "ok"); };
    [["#ai-uc", "useChar"], ["#ai-ug", "useGuide"], ["#ai-uk", "useKb"]].forEach(([s, k]) => { const el = $(s, root); el.onchange = () => { c[k] = el.checked; save(); }; });
    const cl = $("#ai-clear", root); if (cl) cl.onclick = () => { const p = app().state.profiles[app().pid]; p.chat = []; window.A2Brain && window.A2Brain.reset(); save(); render(); };
    bindLog(root);
    const q = $("#ai-q", root), f = $("#ai-form", root);
    const sug = $("#ai-sugg", root);
    const showSug = () => {
      const v = q.value.trim().toLowerCase(); if (v.length < 2) { sug.hidden = true; return; }
      const ws = v.split(/\s+/), list = TEMPLATES().filter((t2) => { const tl = t2.toLowerCase(); return tl !== v && ws.every((w) => tl.includes(w)); }).slice(0, 5);
      if (!list.length) { sug.hidden = true; return; }
      sug.innerHTML = list.map((t2, i) => `<button type="button" data-s="${esc(t2)}" class="${i === 0 ? "on" : ""}">${esc(t2)}</button>`).join("") + '<small>Tab — подставить</small>';
      sug.hidden = false;
      $$("button", sug).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); q.value = b.dataset.s; sug.hidden = true; q.focus(); });
    };
    q.oninput = showSug;
    q.onblur = () => setTimeout(() => sug.hidden = true, 150);
    q.onkeydown = (e) => {
      if (e.key === "Tab" && !sug.hidden) { e.preventDefault(); const b = $("button.on", sug) || $("button", sug); if (b) { q.value = b.dataset.s; sug.hidden = true; } return; }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !sug.hidden) { e.preventDefault(); const bs = $$("button", sug), i = bs.findIndex((b) => b.classList.contains("on")); bs.forEach((b) => b.classList.remove("on")); bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length].classList.add("on"); return; }
      if (e.key === "Escape") { sug.hidden = true; return; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sug.hidden = true; f.requestSubmit(); }
    };
    f.onsubmit = (e) => { e.preventDefault(); const t = q.value.trim(); if (t) { q.value = ""; ask(t); } };
    $("#ai-stop", root).onclick = stop;
    setTimeout(() => q.focus(), 30);
  }
  function loadModels() {
    const c = cfg();
    const done = (r) => {
      if (!r || r.status !== 200) { models = []; modelErr = (r && r.error) || "Ollama не отвечает. Запусти её и нажми «Проверить»."; render(); return; }
      try { models = (JSON.parse(r.body).models || []).map((m) => m.name).sort(); modelErr = ""; } catch (e) { models = []; modelErr = "Не понял ответ Ollama"; }
      if (models.length && !models.includes(c.model)) { c.model = models.find((m) => /^qwen3:14b/.test(m)) || models.find((m) => /^(qwen3|qwen2\.5|gemma3|llama3)/.test(m)) || models[0]; app().save(); }
      render();
    };
    if (typeof window.hostAIModels === "function") {
      window.A2Net.call("hostAIModels", c.url).then((r) => done(r.error === "timeout" ? { status: 0, error: "Ollama не отвечает" } : r));
    } else {
      fetch(c.url.replace(/\/$/, "") + "/api/tags").then((r) => r.text().then((b) => done({ status: r.status, body: b }))).catch((e) => done({ status: 0, error: "Ollama не отвечает: " + e.message }));
    }
  }

  // кнопки действий в ответах встроенного помощника
  // переход в раздел так, чтобы разговор остался под рукой
  async function goView(v) {
    const A = app();
    if (!document.body.classList.contains("m-full")) await A.setMode("full");
    const fromAi = A.state.ui.view === "ai";
    A.showView(v);
    if (fromAi || floatOpen()) toggleFloat(true);
  }
  function runAct(a, btn, auto) {
    const A = app(), st = A.state, p = st.profiles[A.pid], ch = A.ch, C = window.A2Calc;
    if (a.t === "overlay") { const O = window.A2Overlay; if (!O) return; const n = O.show(a.layers || [], a.label); if (btn) { btn.disabled = true; btn.textContent = "✓ Подсвечено (" + n + ")"; } return; }
    if (a.t === "overlayRoute") { const O = window.A2Overlay; if (!O) return; O.show(a.layers || [], a.label, { route: true }); if (btn) { btn.disabled = true; btn.textContent = "✓ Маршрут в игре"; } return; }
    if (a.t === "overlayUntake") { window.A2Overlay && window.A2Overlay.untake(a.all); return; }
    if (a.t === "overlayOff") { window.A2Overlay && window.A2Overlay.hide(); return; }
    if (a.t === "overlayAdjust") { window.A2Overlay && window.A2Overlay.adjust(); return; }
    if (a.t === "overlayReset") { window.A2Overlay && window.A2Overlay.reset(); return; }
    if (a.t === "route") { goView("map").then(() => setTimeout(() => window.A2Map.routeThrough(a.layers, a.name), 200)); return; }
    if (a.t === "mapOnly") { goView("map").then(() => setTimeout(() => window.A2Map.only(a.layers, a.label, { area: a.area, cat: a.cat }), 120)); return; }
    if (a.t === "drops") { const it = (window.EXTRA.items[a.item] || ["предмет"])[0]; goView("map").then(() => setTimeout(() => { window.A2Map.only([], `с кого падает «${it}»`); setTimeout(() => window.A2Map.showDrops(a.item), 120); }, 160)); return; }
    if (a.t === "mapCat") { const c = (window.MAPDATA.cats.find((z) => z[0] === a.cat) || [])[2] || (window.MAPDATA.cats.find((z) => z[0] === a.cat) || [])[1] || "цель"; goView("map").then(() => setTimeout(() => window.A2Map.only([], c, { cat: a.cat }), 160)); return; }
    if (a.t === "goView") { goView(a.v).then(() => { if (a.v === "calc" && p.calc && a.tab) { p.calc.tab = a.tab; A.showView("calc"); } }); return; }
    const done = (t, d) => { A.toast(t, d || "", "ok"); if (btn) { btn.disabled = true; btn.textContent = "✓ " + btn.textContent; } };
    if (a.t === "calc") { if (p.calc) p.calc.tab = a.tab; if (a.tab === "result" && p.calc) p.calc.editing = "plan"; A.showView("calc"); }
    else if (a.t === "view") A.showView(a.v);
    else if (a.t === "map") window.A2Bosses.showOnMap(a.cat);
    else if (a.t === "kill") { st.bossT = st.bossT || {}; st.bossT[a.slug] = Object.assign({}, st.bossT[a.slug], { killed: Date.now() }); A.save(); done("Отмечено", "Напомню перед возрождением."); }
    else if (a.t === "planEnch") { if (C.planSetEnch(st, p, ch, a.slot, a.to)) done("Добавлено в план", `Заточка до +${a.to}. Стоимость — в «Калькулятор → Итог».`); }
    else if (a.t === "say") ask(a.q);
    else if (a.t === "whatIfSave") { const r = C.whatIf(st, p, ch, a.changes); C.savePlan(st, p, ch, r.snap, a.name); done("План сохранён", `«${a.name}» — смотри в калькуляторе (выбор плана).`); }
    else if (a.t === "undo") { if (window.A2Brain.undo(a.id)) done("Отменено", "Вернул как было."); else A.toast("Уже нельзя", "Отменить можно только последние действия в этом сеансе."); }
    else if (a.t === "planDv") { const n = C.planAddDv(st, p, ch, a.budget, a.board); done("Добавлено в план", `${n} ячеек Дэваниона.`); }
  }
  // быстрый вопрос из мини-виджета: только встроенный помощник, ответ коротко, без переключения окна
  const QUICK_AUTO = { overlay: 1, overlayOff: 1, overlayAdjust: 1, overlayReset: 1, kill: 1 };
  function quick(text) {
    const B = window.A2Brain; if (!B) return null;
    const a = B.answer(text);
    const msgs = chat();
    msgs.push({ r: "user", t: text, at: Date.now(), w: 1 });
    msgs.push({ r: "assistant", t: a.md, chips: a.chips || [], acts: a.acts || [], at: Date.now(), b: 1, cmd: !!a.cmd });
    while (msgs.length > 60) msgs.shift();
    app().save();
    let acts = (a.acts || []).slice();
    if (a.auto) { if (QUICK_AUTO[a.auto.t]) setTimeout(() => runAct(a.auto, null, true), 60); else acts.unshift({ label: a.auto.t === "mapOnly" || a.auto.t === "drops" || a.auto.t === "mapCat" ? "Открыть карту" : "Открыть", a: a.auto }); }
    return { md: a.md, acts: acts.slice(0, 3), chips: (a.chips || []).slice(0, 2), off: !!a.off };
  }
  let thinking = false;
  function ask(text) {
    if (waits[busyId] || thinking) return;
    const c = cfg();
    // команды («убил Кашапу», «одила 320»…) и защита «только AION 2» работают при любом источнике ответов
    const B = window.A2Brain;
    const follow = chat().length && text.trim().split(/\s+/).length <= 4 && /^(а|и|ещ|тогда|почему|зачем|подробн|больше|для)/i.test(text.trim());
    const local = B && c.provider !== "builtin" ? (B.command(text) || (!follow && !B.onTopic(text) ? { md: B.OFFTOPIC_MD, chips: ["Как быстрее поднять GS?"] } : null)) : null;
    if (c.provider === "builtin" || !B || local) {
      const msgs = chat();
      msgs.push({ r: "user", t: text, at: Date.now() });
      const a = local || (B ? B.answer(text) : { md: "Встроенный помощник не загрузился.", chips: [] });
      const msg = { r: "assistant", t: a.md, chips: a.chips || [], acts: a.acts || [], trace: a.trace || [], at: Date.now(), b: 1, cmd: !!a.cmd };
      while (msgs.length > 60) msgs.shift();
      // «думает»: коротко показываем шаги рассуждения, потом ответ (команды — сразу)
      const steps = msg.cmd ? [] : msg.trace.slice(0, 5);
      msg.auto = a.auto || null;
      const fin = () => { if (msg.auto) { const au = msg.auto; delete msg.auto; setTimeout(() => runAct(au, null, true), 150); } };
      if (!steps.length) { msgs.push(msg); app().save(); render(); const l = $$("#ai-log .msg.bot"); if (l.length) l[l.length - 1].classList.add("pop"); fin(); return; }
      thinking = true; render();
      const log = activeLog() || $("#ai-log"), box = document.createElement("div");
      box.className = "msg bot thinking"; box.innerHTML = '<div class="th-head"><span class="spin"></span>Думаю…</div><ol class="th-steps"></ol>';
      log.appendChild(box); log.scrollTop = log.scrollHeight;
      const ol = box.querySelector("ol"); let i = 0;
      const tickStep = () => {
        if (i < steps.length) { const li = document.createElement("li"); li.textContent = steps[i++]; ol.appendChild(li); log.scrollTop = log.scrollHeight; setTimeout(tickStep, 260); return; }
        setTimeout(() => { thinking = false; msgs.push(msg); app().save(); render(); const l = $$("#ai-log .msg.bot"); if (l.length) l[l.length - 1].classList.add("pop"); fin(); }, 220);
      };
      setTimeout(tickStep, 180);
      return;
    }
    if (c.provider === "ollama" && !c.model) { app().toast("Нет модели", "Выбери или установи модель Ollama справа."); return; }
    if (c.provider === "claude" && !c.key) { app().toast("Нет ключа", "Вставь ключ Claude API справа."); return; }
    const msgs = chat();
    msgs.push({ r: "user", t: text, at: Date.now() });
    const bot = { r: "assistant", t: "", at: Date.now() };
    msgs.push(bot);
    while (msgs.length > 60) msgs.shift();
    const system = buildSystem(text);
    const hist = msgs.slice(0, -1).slice(-12).filter((m) => m.t && !m.err).map((m) => ({ role: m.r === "user" ? "user" : "assistant", content: cleanThink(m.t) }));
    render();
    const el = () => { const all = $$("#ai-log .msg.bot"); return all[all.length - 1]; };
    let raf = 0;
    const paint = () => { raf = 0; const e = el(); if (!e) return; e.innerHTML = md(bot.t) || '<p class="muted"><span class="spin"></span>думаю…</p>'; const log = $("#ai-log"); if (log && log.scrollHeight - log.scrollTop - log.clientHeight < 160) log.scrollTop = log.scrollHeight; };
    paint();
    send(hist, system, (t) => { bot.t += t; if (!raf) raf = requestAnimationFrame(paint); }, (err) => {
      if (err) bot.err = err;
      if (!bot.t && !err) bot.t = "_(остановлено)_";
      app().save(); render();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {});
  setTimeout(() => {
    const ff = $("#aif-form"); if (ff) ff.onsubmit = (e) => { e.preventDefault(); const q = $("#aif-q"), t = q.value.trim(); if (t) { q.value = ""; ask(t); } };
    const fb = $("#ai-float-btn"); if (fb) fb.onclick = () => toggleFloat();
    const fc = $("#aif-close"); if (fc) fc.onclick = () => toggleFloat(false);
    const fu = $("#aif-full"); if (fu) fu.onclick = () => { toggleFloat(false); app().showView("ai"); };
  }, 0);
  window.A2AI = { toggleFloat, renderFloat, goView, render, ask, quick, runAct, buildSystem, md, pickKb, pickDrops,
    open(q) { const go = () => { app().showView("ai"); if (q) setTimeout(() => ask(q), 80); }; if (!document.body.classList.contains("m-full")) app().setMode("full").then(go); else go(); } };
})();
