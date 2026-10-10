/* Калькулятор персонажа: умения, стигмы, Дэванион, снаряжение → итог */
(function () {
  const CD = window.CALCDATA;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ICON = (id, p = "s") => `icons/${p}${id}.webp`;

  // ---------- справочник показателей ----------
  const STATS = [
    // [key, label, pct, group]
    ["Attack", "АТК", 0, "atk"], ["Accuracy", "Меткость", 0, "atk"], ["Critical", "Крит. удар", 0, "atk"],
    ["CombatSpeed", "СКР боя", 1, "atk"], ["AdditionalHitRate", "Мультиудар", 1, "atk"], ["AmplifyAllDamage", "Увелич. урона", 1, "atk"],
    ["WeaponDamage", "Увелич. урона оружием", 1, "atk"], ["AmplifyCriticalDamage", "Увелич. крит. урона", 1, "atk"],
    ["CoolTimeDecrease", "Сокращение перезарядки", 1, "atk"], ["PerfectHit", "Совершенный удар", 1, "atk"], ["PowerHit", "Мощный удар", 1, "atk"],
    ["Pierce", "Пробитие", 0, "atk"], ["FrontAttack", "АТК спереди", 0, "atk"], ["BackAttack", "АТК с тыла", 0, "atk"],
    ["PvEAmplify", "Увелич. урона в PvE", 1, "atk"], ["BossAmplify", "Урон по боссам", 1, "atk"], ["AbnormalAccuracy", "Попадание эффектами", 1, "atk"],
    ["HPMax", "ОЗ", 0, "def"], ["MPMax", "ОМ", 0, "def"], ["DefenseMain", "ЗЩТ", 0, "def"], ["Evasion", "УКЛ", 0, "def"], ["Block", "Блок", 0, "def"],
    ["CriticalResist", "Сопротивление крит. удару", 0, "def"], ["DecreaseDamage", "Стойкость к урону", 1, "def"],
    ["DecreaseCriticalDamage", "Стойкость к крит. урону", 1, "def"], ["AdditionalHitResistRate", "Сопротивление мультиудару", 1, "def"],
    ["AbnormalResistance", "Сопротивление негат. эффектам", 1, "def"], ["HPRegen", "Восст. ОЗ", 0, "def"], ["MPRegen", "Восст. ОМ", 0, "def"],
    ["MoveSpeed", "Скорость движения", 1, "def"], ["PvEDecrease", "Стойкость к урону в PvE", 1, "def"], ["Regen", "Регенерация", 1, "def"],
    ["Power", "Мощь", 0, "attr"], ["Precision", "Точность", 0, "attr"], ["Agility", "Ловкость", 0, "attr"], ["Vitality", "Здоровье", 0, "attr"],
    ["Intellect", "Интеллект", 0, "attr"], ["Will", "Воля", 0, "attr"],
    ["GodTime", "Время (Сиэль) — СКР боя", 0, "god"], ["GodDestruction", "Разрушение (Джикел) — АТК", 0, "god"], ["GodDeath", "Смерть (Триниэль) — крит", 0, "god"],
    ["GodIllusion", "Иллюзия (Кайсинель) — перезарядка", 0, "god"], ["GodWisdom", "Мудрость (Люмиэль) — мощный удар", 0, "god"], ["GodOther", "Прочие божества", 0, "god"],
    ["PvPAddDamage", "АТК в PvP", 0, "pvp"], ["PvPAmplifyDamage", "Увелич. урона в PvP", 1, "pvp"], ["PvPDecreaseDamage", "Стойкость к урону в PvP", 1, "pvp"],
    ["PvPDamageDefense", "ЗЩТ в PvP", 0, "pvp"], ["PvPCritical", "Крит. удар в PvP", 0, "pvp"], ["PvPCriticalResist", "Сопротивление крит. удару в PvP", 0, "pvp"],
    ["PvPAccuracy", "Меткость в PvP", 0, "pvp"], ["PvPEvasion", "УКЛ в PvP", 0, "pvp"],
  ];
  const SDEF = {}; STATS.forEach((s) => SDEF[s[0]] = { key: s[0], label: s[1], pct: !!s[2], group: s[3] });
  const ALIAS = { FixingDamage: "Attack", Defense: "DefenseMain" };      // «Доп. АТК/ЗЩТ» Дэваниона складываются в АТК/ЗЩТ
  const GROUPS = [["atk", "Атака"], ["def", "Защита и ресурсы"], ["attr", "Основные атрибуты"], ["god", "Божественные показатели"], ["pvp", "PvP"]];
  const SLOTS = [
    ["weapon", "Оружие", "L"], ["offhand", "Второй слот", "L"], ["helmet", "Шлем", "L"], ["shoulders", "Наплечники", "L"], ["chest", "Нагрудник", "L"],
    ["gloves", "Перчатки", "L"], ["pants", "Поножи", "L"], ["boots", "Сапоги", "L"], ["cape", "Плащ", "L"],
    ["earring1", "Серьга I", "R"], ["earring2", "Серьга II", "R"], ["necklace", "Ожерелье", "R"], ["ring1", "Кольцо I", "R"], ["ring2", "Кольцо II", "R"],
    ["amulet", "Амулет", "R"], ["bracelet", "Браслет I", "R"], ["bracelet2", "Браслет II", "R"], ["belt", "Пояс", "R"],
    ["rune1", "Руна I", "R"], ["rune2", "Руна II", "R"],
  ];
  const GRADES = { "": ["Обычный", "#b9b3c9"], C: ["Обычный", "#c9c3d6"], R: ["Редкий", "#5fd08a"], L: ["Легендарный", "#5aa8ff"], U: ["Уникальный", "#ff9a3c"], E: ["Эпический", "#e05cff"], S: ["Особый", "#38e0d0"] };
  const fmtVal = (key, v) => { const d = SDEF[key]; if (!d) return String(v); const n = Math.round(v * 100) / 100; return d.pct ? (n.toFixed(Math.abs(n) % 1 ? 1 : 0).replace(".", ",") + "%") : String(Math.round(n)); };
  const sign = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±");

  // ---------- данные класса ----------
  function cls(c) { return CD.classes[c]; }
  function skillById(c, id) { return cls(c).skills.find((s) => s.id === id); }
  function boardStat(key, raw) { const r = CD.rules[key]; return r && r.pct ? raw / 100 : raw; }

  // ---------- начальные снимки ----------
  function emptySnap(c) {
    const s = { skills: {}, specs: {}, stigmaSlots: [null, null, null, null], stigmaLv: {}, dv: {}, gear: {}, extra: [] };
    cls(c).skills.forEach((k) => { if (k.kind !== "stigma" && k.unlock <= 1) s.skills[k.id] = 1; });
    return s;
  }
  function slotBlank() { return { name: "", grade: "", ilvl: 0, ench: 0, main: [], per: [], ilvlPer: 2, bind: [], stones: [], sockets: 0 }; }
  function ensure(p, ch) {
    if (p.calc && p.calc.v === 1) { const k = p.calc; k.alt = k.alt || {}; k.planId = k.planId || "p0"; k.planName = k.planName || "План A"; k.adv = k.adv || { mode: "dps", budget: 40 }; return k; }
    const cur = emptySnap(ch.cls);
    p.calc = { v: 1, level: 45, editing: "plan", tab: "skills", board: 0, sel: {}, extraPts: { skill: 0, stigma: 0 },
      sheet: {}, cur, plan: clone(cur), planId: "p0", planName: "План A", alt: {}, adv: { mode: "dps", budget: 40 } };
    return p.calc;
  }

  // ---------- расчёты ----------
  function dvSelected(c, snap) {
    const out = [];
    cls(c).boards.forEach((b) => { const set = new Set(snap.dv[b.id] || []); b.nodes.forEach((n) => { if (n[7] || set.has(n[0])) out.push([b, n]); }); });
    return out;
  }
  function skillBonus(c, snap) {
    const bonus = {};
    dvSelected(c, snap).forEach(([, n]) => { if (n[3] === "k" && n[10]) bonus[n[10]] = (bonus[n[10]] || 0) + n[11]; });
    Object.values(snap.gear).forEach((g) => [...(g.bind || []), ...(g.main || [])].forEach(([k, v]) => {
      if (String(k).startsWith("skill:")) { const id = +k.slice(6); bonus[id] = (bonus[id] || 0) + (+v || 0); }
    }));
    (snap.extra || []).forEach(([k, v]) => { if (String(k).startsWith("skill:")) { const id = +k.slice(6); bonus[id] = (bonus[id] || 0) + (+v || 0); } });
    return bonus;
  }
  function contrib(c, snap) {
    const t = {};
    const add = (k, v) => { k = ALIAS[k] || k; if (!SDEF[k] || !v) return; t[k] = (t[k] || 0) + (+v); };
    dvSelected(c, snap).forEach(([, n]) => n[9].forEach(([k, raw]) => add(k, boardStat(k, raw))));
    Object.values(snap.gear).forEach((g) => { (g.main || []).forEach(([k, v]) => add(k, v)); (g.bind || []).forEach(([k, v]) => add(k, v)); (g.stones || []).forEach(([k, v]) => add(k, v)); });
    (snap.extra || []).forEach(([k, v]) => add(k, v));
    return t;
  }
  function spentSkill(c, snap) {
    let n = 0;
    cls(c).skills.forEach((s) => { if (s.kind === "stigma") return; const lv = snap.skills[s.id] || 0; for (let i = 1; i < lv; i++) n += s.cost[i] || 0; });
    return n;
  }
  function spentStigma(c, snap) {
    let n = 0;
    snap.stigmaSlots.forEach((id) => { if (!id) return; const s = skillById(c, id), lv = snap.stigmaLv[id] || 1; for (let i = 0; i < lv; i++) n += s.cost[i] || 0; });
    return n;
  }
  function dvCost(c, snap) { return dvSelected(c, snap).reduce((a, [, n]) => a + (n[7] ? 0 : n[5]), 0); }
  function budgetAt(c, level) { const b = cls(c).budget; return b.find((x) => x.level === level) || b[b.length - 1]; }
  function gearIlvl(snap) { return Object.values(snap.gear).reduce((a, g) => a + (+g.ilvl || 0), 0); }
  function stoneIlvl(snap) { return Object.values(snap.gear).reduce((a, g) => a + (g.stones || []).filter((x) => x[0]).length * 2.5, 0); }

  // ---------- подсказки умений ----------
  function tipText(s, level) {
    const lv = Math.max(1, Math.min(level || 1, s.max));
    const vals = s.vals[lv - 1] || s.vals[s.vals.length - 1] || [];
    let t = s.tip.replace(/\{(\d+)\}\s*[-–]\s*\{(\d+)\}/g, (m, a, b) => {
      const A = vals[+a], B = vals[+b];
      if (Array.isArray(A) && Array.isArray(B)) return A[0] === B[0] ? `${A[0]} (+${A[1]}% АТК)` : `${A[0]}–${B[0]} (+${A[1]}% АТК)`;
      return `${fmtV(A)}–${fmtV(B)}`;
    }).replace(/\{(\d+)\}/g, (m, a) => fmtV(vals[+a]));
    return esc(t).replace(/&lt;chat_combat&gt;/g, "<b class='hl'>").replace(/&lt;\/&gt;/g, "</b>").replace(/\n/g, "<br>");
  }
  function fmtV(v) {
    if (v == null) return "?";
    if (Array.isArray(v)) return `${v[0]} (+${v[1]}% АТК)`;
    if (typeof v === "object" && "ms" in v) return (v.ms / 1000).toString().replace(".", ",") + " с";
    return String(v);
  }

  // ---------- состояние рендера ----------
  let ctx = null; // { st, p, ch, save, root }
  const C = () => ctx.p.calc;
  const snap = () => C()[C().editing];
  const cc = () => ctx.ch.cls;
  function commit(rerender = true) { ctx.save(); if (rerender) render(); else renderHead(); }

  // ---------- обмен билдами ----------
  async function shareFile(name, content, title) {
    if (typeof window.hostExport === "function") {
      const p = await window.hostExport(name, content);
      if (p) { window.A2Toast && A2Toast(title, "Файл: " + p + ". Открываю папку — отправь его другу.", "ok"); window.hostReveal && window.hostReveal(p); return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: "application/json" })); a.download = name + ".json"; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 500);
  }
  function importBuild(text, fname) {
    let o; try { o = JSON.parse(text); } catch (e) { window.A2Toast && A2Toast("Не тот файл", "Это не билд помощника."); return; }
    const calc = o && (o.type === "aion2helper-build" ? o.calc : o.calc && o.calc.cur ? o.calc : null);
    if (!calc || !calc.cur) { window.A2Toast && A2Toast("Не тот файл", "В файле нет билда калькулятора."); return; }
    const from = (o.character && o.character.name) || fname.replace(/\.json$/, "");
    if (o.character && o.character.cls && o.character.cls !== cc()) { window.A2Toast && A2Toast("Другой класс", `Это билд класса «${window.A2CLS.name(o.character.cls)}» — открой персонажа этого класса и загрузи снова.`); return; }
    const k = C(), add = (name, snap) => { const id = "p" + Math.random().toString(36).slice(2, 7); k.alt[id] = { name: name.slice(0, 30), snap: clone(snap) }; return id; };
    const first = add(`${from}: сейчас`, calc.cur);
    if (calc.plan) add(`${from}: ${calc.planName || "план"}`, calc.plan);
    Object.values(calc.alt || {}).forEach((pl) => pl && pl.snap && add(`${from}: ${pl.name}`, pl.snap));
    switchPlan(first); k.editing = "plan"; k.tab = "compare"; commit();
    window.A2Toast && A2Toast("Билд загружен", `Билд «${from}» добавлен как планы — сравни с собой во вкладке «Сравнение планов». Твой «Сейчас в игре» не тронут.`, "ok");
  }

  // ---------- несколько планов ----------
  function planList() { const k = C(); return [{ id: k.planId, name: k.planName }].concat(Object.entries(k.alt).map(([id, v]) => ({ id, name: v.name }))).sort((a, b) => a.name.localeCompare(b.name, "ru")); }
  function allPlans() { const k = C(); return [{ id: k.planId, name: k.planName, snap: k.plan }].concat(Object.entries(k.alt).map(([id, v]) => ({ id, name: v.name, snap: v.snap }))).sort((a, b) => a.name.localeCompare(b.name, "ru")); }
  function switchPlan(id) {
    const k = C(); if (id === k.planId || !k.alt[id]) return;
    k.alt[k.planId] = { name: k.planName, snap: k.plan };
    const t = k.alt[id]; delete k.alt[id];
    k.plan = t.snap; k.planName = t.name; k.planId = id;
  }

  function render() {
    const root = ctx.root, k = C();
    root.innerHTML = `
      <div class="calc-head">
        <div class="seg" id="cx-mode"><button data-m="cur">Сейчас в игре</button><button data-m="plan">План</button></div>
        <div class="plan-pick"><select id="cx-plan" title="Активный план">${planList().map((x) => `<option value="${x.id}" ${x.id === k.planId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
          <button class="ib" id="cx-plan-add" title="Новый план — копия текущего"><svg class="ic sm"><use href="#i-plus"/></svg></button>
          <button class="ib" id="cx-plan-ren" title="Переименовать план"><svg class="ic sm"><use href="#i-edit"/></svg></button>
          ${planList().length > 1 ? '<button class="ib" id="cx-plan-del" title="Удалить план"><svg class="ic sm"><use href="#i-close"/></svg></button>' : ""}</div>
        <label class="lvl">Уровень <input id="cx-level" type="number" min="1" max="${cls(cc()).levelCap}" value="${k.level}"></label>
        <div class="chips" id="cx-chips"></div>
        <div class="spacer"></div>
        <button class="btn" id="cx-import" title="Загрузить снаряжение, умения, стигмы и Дэванион с официального сайта через metabot.gg"><svg class="ic sm"><use href="#i-download"/></svg>Импорт из игры</button>
        ${ctx.ch.armory ? '<button class="ib" id="cx-refresh" title="Обновить из игры (Armory)"><svg class="ic sm"><use href="#i-swap"/></svg></button>' : ""}
        <button class="ib" id="cx-share" title="Поделиться билдом — сохранить файл, который можно отдать другу"><svg class="ic sm"><use href="#i-share"/></svg></button>
        <button class="ib" id="cx-load" title="Загрузить билд из файла (добавится как планы)"><svg class="ic sm"><use href="#i-upload"/></svg></button><input type="file" id="cx-file" accept=".json,application/json" hidden>
        <button class="btn" id="cx-copy" title="Скопировать всё из «Сейчас» в «План»">План = как сейчас</button>
      </div>
      ${k.imported ? `<div class="imp-line muted small">«Сейчас в игре» загружено ${new Date(k.imported.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${esc(k.imported.server)} · боевая мощь ${esc(k.imported.cp || "—")} · уровень предметов ${esc(k.imported.ilvl || "—")}</div>` : ""}
      <div class="seg calc-tabs" id="cx-tabs">
        <button data-t="skills">Умения</button><button data-t="stigmas">Стигмы</button><button data-t="dv">Дэванион</button>
        <button data-t="gear">Снаряжение</button><button data-t="sheet">Лист персонажа</button><button data-t="result">Итог</button>
        <button data-t="advice">Советник</button><button data-t="compare">Сравнение планов</button>
      </div>
      <div class="calc-body" id="cx-body"></div>
      <div class="cx-tip" id="cx-tip"></div>`;
    $$("#cx-mode button", root).forEach((b) => { b.classList.toggle("on", b.dataset.m === k.editing); b.onclick = () => { k.editing = b.dataset.m; commit(); }; });
    $$("#cx-tabs button", root).forEach((b) => { b.classList.toggle("on", b.dataset.t === k.tab); b.onclick = () => { k.tab = b.dataset.t; commit(); }; });
    $("#cx-level", root).onchange = (e) => { k.level = Math.max(1, Math.min(cls(cc()).levelCap, +e.target.value || 1)); commit(); };
    $("#cx-copy", root).onclick = () => { k.plan = clone(k.cur); k.editing = "plan"; commit(); window.A2Toast && A2Toast("План сброшен", "Теперь он совпадает с тем, что сейчас в игре.", "ok"); };
    $("#cx-plan", root).onchange = (e) => { switchPlan(e.target.value); k.editing = "plan"; commit(); };
    $("#cx-plan-add", root).onclick = () => {
      const name = prompt("Название нового плана:", "План " + "ABCDEFGHIJ"[planList().length] || "Новый план"); if (!name) return;
      const copy = clone(k.plan); const id = "p" + Math.random().toString(36).slice(2, 7);
      k.alt[id] = { name: name.trim().slice(0, 30), snap: copy }; switchPlan(id); k.editing = "plan"; commit();
    };
    $("#cx-plan-ren", root).onclick = () => { const n = prompt("Новое название плана:", k.planName); if (n && n.trim()) { k.planName = n.trim().slice(0, 30); commit(); } };
    const del = $("#cx-plan-del", root);
    if (del) del.onclick = () => {
      if (!confirm(`Удалить «${k.planName}»?`)) return;
      const other = Object.keys(k.alt)[0]; const t = k.alt[other]; delete k.alt[other];
      k.plan = t.snap; k.planName = t.name; k.planId = other; commit();
    };
    const rf = $("#cx-refresh", root); if (rf) rf.onclick = () => window.A2Import && window.A2Import.refresh(ctx, applyImport);
    $("#cx-share", root).onclick = () => shareFile(`Билд ${ctx.ch.name} ${new Date().toISOString().slice(0, 10)}`, JSON.stringify({ type: "aion2helper-build", v: 1, character: { name: ctx.ch.name, cls: ctx.ch.cls }, calc: k }, null, 1), "Билд сохранён");
    $("#cx-load", root).onclick = () => $("#cx-file", root).click();
    $("#cx-file", root).onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) f.text().then((t) => importBuild(t, f.name)); };
    $("#cx-import", root).onclick = () => window.A2Import && window.A2Import.open(ctx, applyImport);
    root.classList.toggle("editing-plan", k.editing === "plan");
    renderHead();
    const body = $("#cx-body", root);
    body.classList.remove("swap"); void body.offsetWidth; body.classList.add("swap");
    (({ skills: renderSkills, stigmas: renderStigmas, dv: renderDv, gear: renderGear, sheet: renderSheet, result: renderResult, advice: renderAdvice, compare: renderCompare })[k.tab] || renderSkills)(body);
  }
  function renderHead() {
    const k = C(), s = snap(), b = budgetAt(cc(), k.level);
    const sp = spentSkill(cc(), s), sg = spentStigma(cc(), s), dv = dvCost(cc(), s);
    const skB = b.skill + (+k.extraPts.skill || 0), stB = b.stigma + (+k.extraPts.stigma || 0);
    const dvNow = dvCost(cc(), k.cur);
    $("#cx-chips").innerHTML = `
      <span class="chip ${sp > skB ? "bad" : ""}" title="Потрачено очков умений / доступно на уровне ${k.level}">Очки умений <b>${sp}</b> / ${skB}</span>
      <span class="chip ${sg > stB ? "bad" : ""}" title="Потрачено очков стигм / доступно">Стигмы <b>${sg}</b> / ${stB}</span>
      <span class="chip" title="Кристаллы Дэваниона во всех выбранных ячейках">Дэванион <b>${dv}</b>${k.editing === "plan" && dv !== dvNow ? ` <em>${sign(dv - dvNow)}${Math.abs(dv - dvNow)}</em>` : ""}</span>`;
  }

  // ---------- Умения ----------
  function skillTotal(s, sn, bonus) { const bought = sn.skills[s.id] || 0; return bought ? bought + (bonus[s.id] || 0) : 0; }
  function renderSkills(body) {
    const k = C(), sn = snap(), bonus = skillBonus(cc(), sn), all = cls(cc()).skills.filter((s) => s.kind !== "stigma");
    const sel = skillById(cc(), k.sel.skill) && skillById(cc(), k.sel.skill).kind !== "stigma" ? skillById(cc(), k.sel.skill) : all[0];
    const cell = (s) => {
      const lv = sn.skills[s.id] || 0, b = bonus[s.id] || 0, locked = s.unlock > k.level;
      return `<button class="sk ${s.id === sel.id ? "on" : ""} ${locked ? "locked" : ""} ${lv ? "" : "zero"}" data-id="${s.id}" title="${esc(s.name)}">
        <img src="${ICON(s.id)}" alt=""><span class="lv">${lv ? lv + (b ? `<i>+${b}</i>` : "") : locked ? "ур." + s.unlock : "—"}</span></button>`;
    };
    body.innerHTML = `
      <div class="skills-wrap">
        <div class="sk-grid-wrap panel">
          <h3>Активные</h3><div class="sk-grid">${all.filter((s) => s.kind === "active").map(cell).join("")}</div>
          <h3 class="mt">Пассивные</h3><div class="sk-grid">${all.filter((s) => s.kind === "passive").map(cell).join("")}</div>
          <p class="muted small">Число — уровень, купленный очками (до 10). Фиолетовое «+N» — бонус от Дэваниона и снаряжения.</p>
        </div>
        <div class="sk-detail panel" id="sk-detail"></div>
      </div>`;
    $$(".sk", body).forEach((b) => b.onclick = () => { k.sel.skill = +b.dataset.id; ctx.save(); renderSkills(body); });
    renderSkillDetail($("#sk-detail", body), sel, sn, bonus);
  }
  function renderSkillDetail(box, s, sn, bonus) {
    const k = C(), lv = sn.skills[s.id] || 0, b = bonus[s.id] || 0, total = lv ? lv + b : 0;
    const curLv = (k.cur.skills[s.id] || 0), curTotal = curLv ? curLv + (skillBonus(cc(), k.cur)[s.id] || 0) : 0;
    const slotsOpen = cls(cc()).specSlots.filter((x) => total >= x).length;
    const chosen = sn.specs[s.id] || [];
    const nextCost = lv && lv < s.buyMax ? s.cost[lv] : null;
    box.innerHTML = `
      <div class="skd-head">
        <img class="big-ic" src="${ICON(s.id)}" alt="">
        <div><h2>${esc(s.name)}</h2><p class="muted">${s.kind === "active" ? "Активное умение" : "Пассивное умение"} · открывается на ${s.unlock} ур.</p></div>
      </div>
      <div class="stepper">
        <button class="btn" data-d="-1" ${lv <= 0 ? "disabled" : ""}>−</button>
        <div class="val"><b>${total || "—"}</b><small>${lv ? `${lv} очками${b ? ` + ${b} бонус` : ""}` : "не изучено"}</small></div>
        <button class="btn" data-d="1" ${lv >= s.buyMax || s.unlock > k.level ? "disabled" : ""}>+</button>
        <span class="muted small">${nextCost != null ? `следующий уровень: ${nextCost} оч.` : lv >= s.buyMax ? "выше — только бонусы +N" : ""}</span>
      </div>
      ${C().editing === "plan" && curTotal !== total ? `<p class="delta">Сейчас в игре: ${curTotal || "—"} → в плане: <b>${total || "—"}</b></p>` : ""}
      <div class="tip-card">${total ? tipText(s, total) : '<span class="muted">Умение не изучено. Подсказка на 1 уровне:</span><br>' + tipText(s, 1)}
        ${s.cd && s.cd[Math.max(0, total - 1)] ? `<div class="muted small">Перезарядка ${s.cd[Math.max(0, total - 1)]} с</div>` : ""}</div>
      ${s.specs.length ? `<h3 class="mt">Особенности <span class="muted small">— открыто ячеек: ${slotsOpen} из 3 (на ${cls(cc()).specSlots.join(", ")} ур. умения)</span></h3>
        <div class="specs">${s.specs.map((p) => {
          const avail = total >= p.unlock, on = chosen.includes(p.id);
          return `<button class="spec ${on ? "on" : ""} ${avail ? "" : "locked"}" data-p="${p.id}">
            <img src="${ICON(p.id, "p")}" alt=""><span><b>${esc(p.text)}</b><small>с ${p.unlock} ур. умения</small></span></button>`;
        }).join("")}</div>` : ""}`;
    $$(".stepper .btn", box).forEach((btn) => btn.onclick = () => {
      const d = +btn.dataset.d; let v = (sn.skills[s.id] || 0) + d;
      v = Math.max(0, Math.min(s.buyMax, v)); if (v) sn.skills[s.id] = v; else delete sn.skills[s.id];
      const tot = v ? v + b : 0; sn.specs[s.id] = (sn.specs[s.id] || []).filter((pid) => (s.specs.find((x) => x.id === pid) || {}).unlock <= tot)
        .slice(0, cls(cc()).specSlots.filter((x) => tot >= x).length);
      commit();
    });
    $$(".spec", box).forEach((el) => el.onclick = () => {
      const id = +el.dataset.p, p = s.specs.find((x) => x.id === id), arr = sn.specs[s.id] = sn.specs[s.id] || [];
      if (arr.includes(id)) arr.splice(arr.indexOf(id), 1);
      else {
        if (total < p.unlock) return flash(el, `Нужен ${p.unlock} уровень умения`);
        if (arr.length >= slotsOpen) return flash(el, slotsOpen ? "Все ячейки особенностей заняты — сними одну" : `Первая ячейка откроется на ${cls(cc()).specSlots[0]} ур. умения`);
        arr.push(id);
      }
      commit();
    });
  }
  function flash(el, msg) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); window.A2Toast && A2Toast("Нельзя", msg); }

  // ---------- Стигмы ----------
  function renderStigmas(body) {
    const k = C(), sn = snap(), list = cls(cc()).skills.filter((s) => s.kind === "stigma"), lvls = cls(cc()).stigmaSlotLevels;
    const slotSel = k.sel.slot ?? 0;
    const selId = sn.stigmaSlots[slotSel];
    body.innerHTML = `
      <div class="stg-wrap">
        <div class="panel">
          <h3>Слоты стигм</h3>
          <div class="stg-slots">${sn.stigmaSlots.map((id, i) => {
            const locked = k.level < lvls[i], s = id && skillById(cc(), id);
            return `<button class="stg-slot ${i === slotSel ? "on" : ""} ${locked ? "locked" : ""}" data-i="${i}">
              ${s ? `<img src="${ICON(s.id)}" alt=""><span class="lv">${sn.stigmaLv[s.id] || 1}</span>` : `<span class="empty">${locked ? "с " + lvls[i] + " ур." : "пусто"}</span>`}</button>`;
          }).join("")}</div>
          <h3 class="mt">Все стигмы класса</h3>
          <div class="sk-grid">${list.map((s) => {
            const inSlot = sn.stigmaSlots.indexOf(s.id);
            return `<button class="sk ${inSlot >= 0 ? "used" : ""} ${selId === s.id ? "on" : ""}" data-id="${s.id}" title="${esc(s.name)}"><img src="${ICON(s.id)}" alt="">${inSlot >= 0 ? `<span class="lv">${sn.stigmaLv[s.id] || 1}</span>` : ""}</button>`;
          }).join("")}</div>
          <p class="muted small">Выбери слот сверху, затем стигму. Цена уровней в очках стигм: 1–5 — по 1, 6–10 — по 2, 11–15 — по 4, 16–20 — по 8.</p>
        </div>
        <div class="panel" id="stg-detail"></div>
      </div>`;
    $$(".stg-slot", body).forEach((b) => b.onclick = () => { k.sel.slot = +b.dataset.i; ctx.save(); renderStigmas(body); });
    $$(".sk", body).forEach((b) => b.onclick = () => {
      const id = +b.dataset.id, i = k.sel.slot ?? 0;
      if (k.level < lvls[i]) return flash(b, `Этот слот откроется на ${lvls[i]} уровне персонажа`);
      const was = sn.stigmaSlots.indexOf(id);
      if (was >= 0 && was !== i) sn.stigmaSlots[was] = sn.stigmaSlots[i];
      sn.stigmaSlots[i] = id; if (!sn.stigmaLv[id]) sn.stigmaLv[id] = 1;
      commit();
    });
    const det = $("#stg-detail", body), s = selId && skillById(cc(), selId);
    if (!s) { det.innerHTML = `<p class="muted">Слот пуст. Выбери стигму из списка слева.</p>`; return; }
    const lv = sn.stigmaLv[s.id] || 1, nextCost = lv < s.buyMax ? s.cost[lv] : null;
    det.innerHTML = `
      <div class="skd-head"><img class="big-ic" src="${ICON(s.id)}" alt=""><div><h2>${esc(s.name)}</h2><p class="muted">Стигма · слот ${slotSel + 1}</p></div></div>
      <div class="stepper">
        <button class="btn" data-d="-1" ${lv <= 1 ? "disabled" : ""}>−</button>
        <div class="val"><b>${lv}</b><small>уровень стигмы</small></div>
        <button class="btn" data-d="1" ${lv >= s.buyMax ? "disabled" : ""}>+</button>
        <span class="muted small">${nextCost ? `следующий: ${nextCost} оч.` : "максимум"}</span>
        <button class="btn ghost" id="stg-remove">Снять</button>
      </div>
      <div class="tip-card">${tipText(s, lv)}</div>
      <h3 class="mt">Особенности стигмы</h3>
      <div class="specs">${s.specs.map((p) => `<div class="spec ${lv >= p.unlock ? "on" : "locked"}"><img src="${ICON(p.id, "p")}" alt=""><span><b>${esc(p.text)}</b><small>с ${p.unlock} ур. — ${lv >= p.unlock ? "действует" : "ещё не открыта"}</small></span></div>`).join("")}</div>`;
    $$(".stepper .btn[data-d]", det).forEach((b) => b.onclick = () => { sn.stigmaLv[s.id] = Math.max(1, Math.min(s.buyMax, lv + +b.dataset.d)); commit(); });
    $("#stg-remove", det).onclick = () => { sn.stigmaSlots[slotSel] = null; commit(); };
  }

  // ---------- Дэванион ----------
  function renderDv(body) {
    const k = C(), sn = snap(), boards = cls(cc()).boards, bi = Math.min(k.board || 0, boards.length - 1), b = boards[bi];
    const set = new Set(sn.dv[b.id] || []);
    const pct = (bd) => { const s = new Set(sn.dv[bd.id] || []); const tot = bd.nodes.filter((n) => !n[7]).reduce((a, n) => a + n[5], 0); const got = bd.nodes.filter((n) => !n[7] && s.has(n[0])).reduce((a, n) => a + n[5], 0); return Math.round((got / tot) * 100); };
    const byPos = {}; b.nodes.forEach((n) => byPos[n[1] + ":" + n[2]] = n);
    const rows = b.nodes.map((n) => n[1]), cols = b.nodes.map((n) => n[2]);
    const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
    const taken = (n) => n[7] || set.has(n[0]);
    const reach = (n) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => { const m = byPos[(n[1] + dr) + ":" + (n[2] + dc)]; return m && taken(m); });
    const locked = k.level < b.needLevel;
    let cells = "";
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const n = byPos[r + ":" + c];
      if (!n) { cells += `<i class="void"></i>`; continue; }
      const on = taken(n), can = !on && reach(n), g = n[4] || "S";
      const links = [[0, 1, "r"], [1, 0, "b"]].map(([dr, dc, cl]) => { const m = byPos[(r + dr) + ":" + (c + dc)]; return m && on && taken(m) ? cl : ""; }).join(" ");
      cells += `<button class="dn g${g} t${n[3]} ${on ? "on" : ""} ${can ? "can" : ""} ${links}" data-id="${n[0]}" style="grid-row:${r - r0 + 1};grid-column:${c - c0 + 1}">${
        n[3] === "k" && n[10] ? `<img src="${ICON(n[10])}" alt="">` : n[3] === "o" ? `<img src="logo.png" alt="">` : `<span>${esc(shortLabel(n))}</span>`}</button>`;
    }
    // суммы по доске
    const sums = {}, skl = {};
    b.nodes.forEach((n) => { if (!taken(n)) return; n[9].forEach(([kk, raw]) => sums[kk] = (sums[kk] || 0) + raw); if (n[3] === "k" && n[10]) skl[n[10]] = (skl[n[10]] || 0) + n[11]; });
    const cost = b.nodes.filter((n) => !n[7] && set.has(n[0])).reduce((a, n) => a + n[5], 0), total = b.nodes.filter((n) => !n[7]).reduce((a, n) => a + n[5], 0);
    body.innerHTML = `
      <div class="seg dv-tabs">${boards.map((bd, i) => `<button data-i="${i}" class="${i === bi ? "on" : ""} ${k.level < bd.needLevel ? "lockedtab" : ""}">${esc(bd.name)} <small>${pct(bd)}%</small></button>`).join("")}</div>
      <div class="dv-wrap">
        <div class="dv-board panel ${locked ? "is-locked" : ""}">
          <div class="dv-grid" style="grid-template-columns:repeat(${c1 - c0 + 1},var(--cell));grid-template-rows:repeat(${r1 - r0 + 1},var(--cell))">${cells}</div>
          ${locked ? `<div class="dv-lock">Доска открывается на ${b.needLevel} уровне</div>` : ""}
        </div>
        <div class="panel dv-side">
          <h2>${esc(b.name)}</h2>
          <p class="muted">Потрачено <b class="ink">${cost}</b> из ${total} кристаллов · ${Math.round(cost / total * 100)}%</p>
          <div class="meter wide"><i style="width:${cost / total * 100}%"></i></div>
          <div class="row gap"><button class="btn" id="dv-fill">Заполнить доску</button><button class="btn ghost" id="dv-clear">Сбросить доску</button></div>
          <h3 class="mt">Показатели с доски</h3>
          <ul class="kv">${Object.entries(sums).sort((a, b2) => (CD.rules[a[0]] || {}).order - (CD.rules[b2[0]] || {}).order).map(([kk, raw]) => `<li><span>${esc(CD.statLabels[kk] || kk)}</span><b>+${fmtRule(kk, raw)}</b></li>`).join("") || '<li class="muted">Пока ничего</li>'}</ul>
          <h3 class="mt">Уровни умений</h3>
          <ul class="kv">${Object.entries(skl).map(([id, n]) => { const s = skillById(cc(), +id); return `<li><span><img class="mini" src="${ICON(id)}" alt="">${esc(s ? s.name : id)}</span><b>+${n}</b></li>`; }).join("") || '<li class="muted">Пока ничего</li>'}</ul>
          <p class="muted small mt">Квадрат — показатель, круг — +1 к умению. Ячейку можно взять, только если она соединена с центром. Снятие ячейки снимает всё, что держалось только на ней.</p>
        </div>
      </div>`;
    $$(".dv-tabs button", body).forEach((x) => x.onclick = () => { k.board = +x.dataset.i; ctx.save(); renderDv(body); });
    const tip = $("#cx-tip");
    $$(".dn", body).forEach((el) => {
      const n = b.nodes.find((x) => x[0] === +el.dataset.id);
      el.onmouseenter = () => {
        const g = GRADES[n[4]] || ["Центр", "#fff"];
        tip.innerHTML = `<b style="color:${g[1]}">${esc(n[8] || "Центр доски")}</b><small>${n[7] ? "Стартовая ячейка" : `${g[0]} · ${n[5]} крист. · с ${n[6]} ур.`}</small>`;
        const r = el.getBoundingClientRect(); tip.style.left = (r.right + 8) + "px"; tip.style.top = (r.top - 4) + "px"; tip.classList.add("on");
      };
      el.onmouseleave = () => tip.classList.remove("on");
      el.onclick = () => {
        if (locked) return flash(el, `Доска откроется на ${b.needLevel} уровне`);
        if (n[7]) return;
        const cur = new Set(sn.dv[b.id] || []);
        if (cur.has(n[0])) { cur.delete(n[0]); sn.dv[b.id] = [...prune(b, cur)]; }
        else { if (!reach(n)) return flash(el, "Ячейка не соединена с уже взятыми"); if (n[6] > k.level) return flash(el, `Нужен ${n[6]} уровень`); cur.add(n[0]); sn.dv[b.id] = [...cur]; }
        tip.classList.remove("on"); commit();
      };
    });
    $("#dv-fill", body).onclick = () => { if (locked) return; sn.dv[b.id] = b.nodes.filter((n) => !n[7] && n[6] <= k.level).map((n) => n[0]); commit(); };
    $("#dv-clear", body).onclick = () => { sn.dv[b.id] = []; commit(); };
  }
  function shortLabel(n) { const m = /([+−-][\d,.]+%?)\s*$/.exec(n[8] || ""); return m ? m[1] : "•"; }
  function fmtRule(k, raw) { const r = CD.rules[k]; if (!r) return raw; const v = r.pct ? raw / 100 : raw; return (r.pct ? v.toFixed(r.dec).replace(".", ",") + "%" : v); }
  function prune(b, set) {
    const byPos = {}; b.nodes.forEach((n) => byPos[n[1] + ":" + n[2]] = n);
    const start = b.nodes.filter((n) => n[7]); const seen = new Set(start.map((n) => n[0])); const q = [...start];
    while (q.length) { const n = q.shift(); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = byPos[(n[1] + dr) + ":" + (n[2] + dc)]; if (m && !seen.has(m[0]) && set.has(m[0])) { seen.add(m[0]); q.push(m); } } }
    return new Set([...set].filter((id) => seen.has(id)));
  }

  // ---------- Снаряжение ----------
  function statOptions(sel, withSkills) {
    let o = `<option value="">—</option>` + GROUPS.map(([g, gl]) => `<optgroup label="${gl}">${STATS.filter((s) => s[3] === g).map((s) => `<option value="${s[0]}" ${s[0] === sel ? "selected" : ""}>${esc(s[1])}</option>`).join("")}</optgroup>`).join("");
    if (withSkills) o += `<optgroup label="Уровень умения +N">${cls(cc()).skills.filter((s) => s.kind !== "stigma").map((s) => `<option value="skill:${s.id}" ${"skill:" + s.id === sel ? "selected" : ""}>${esc(s.name)} +N</option>`).join("")}</optgroup>`;
    return o;
  }
  function renderGear(body) {
    const k = C(), sn = snap(), cur = k.cur, selSlot = k.sel.slot2 || "weapon";
    const card = ([id, name]) => {
      const g = sn.gear[id], c0 = cur.gear[id], gr = GRADES[(g && g.grade) || ""];
      const dEnch = g && c0 && k.editing === "plan" ? (g.ench || 0) - (c0.ench || 0) : 0;
      return `<button class="slot ${id === selSlot ? "on" : ""} ${g && g.name ? "" : "empty"}" data-s="${id}" style="--gc:${gr[1]}">
        <span class="sl-n">${esc(name)}</span>
        <b>${g && g.name ? esc(g.name) : "пусто"}</b>
        <span class="sl-m">${g && g.name ? `+${g.ench || 0}${dEnch ? ` <em>(${sign(dEnch)}${Math.abs(dEnch)})</em>` : ""} · ур. ${g.ilvl || 0} · камни ${(g.stones || []).filter((x) => x[0]).length}/${g.sockets || 0}` : "нажми, чтобы заполнить"}</span></button>`;
    };
    body.innerHTML = `
      <div class="gear-wrap">
        <div class="doll">
          <div class="col">${SLOTS.filter((s) => s[2] === "L").map(card).join("")}</div>
          <div class="col">${SLOTS.filter((s) => s[2] === "R").map(card).join("")}</div>
        </div>
        <div class="panel gear-ed" id="gear-ed"></div>
      </div>`;
    $$(".slot", body).forEach((b) => b.onclick = () => { k.sel.slot2 = b.dataset.s; ctx.save(); renderGear(body); });
    renderGearEditor($("#gear-ed", body), selSlot);
  }
  function renderGearEditor(box, id) {
    const k = C(), sn = snap(), name = SLOTS.find((s) => s[0] === id)[1];
    const g = sn.gear[id] = sn.gear[id] || slotBlank();
    const lines = (arr, key, withSkills, max) => `
      <div class="lines" data-key="${key}">${arr.map(([s, v], i) => `<div class="ln"><select data-i="${i}">${statOptions(s, withSkills)}</select><input data-i="${i}" type="number" step="0.1" value="${v}"><button class="ib x" data-i="${i}" title="Убрать"><svg class="ic sm"><use href="#i-close"/></svg></button></div>`).join("")}
      ${arr.length < max ? `<button class="btn ghost add" data-key="${key}">+ строка</button>` : ""}</div>`;
    box.innerHTML = `
      <h2>${esc(name)}</h2>
      <p class="muted small">${k.editing === "plan" ? "Редактируешь план. При смене заточки основные показатели пересчитаются сами по приросту за +1." : "Перепиши значения из подсказки предмета в игре."}</p>
      <div class="form ge">
        <label class="full">Название<input id="g-name" value="${esc(g.name)}" placeholder="Например: Лук Кромеды"></label>
        <label>Редкость<select id="g-grade">${Object.entries(GRADES).filter(([kk]) => kk).map(([kk, [l]]) => `<option value="${kk}" ${g.grade === kk ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Уровень предмета<input id="g-ilvl" type="number" value="${g.ilvl || 0}"></label>
        <label>Заточка +<div class="stepper sm"><button class="btn" data-e="-1">−</button><input id="g-ench" type="number" min="0" max="20" value="${g.ench || 0}"><button class="btn" data-e="1">+</button></div></label>
        <label>Гнёзд для камней<input id="g-sock" type="number" min="0" max="6" value="${g.sockets || 0}"></label>
        <label class="full">Предмет на metabot.gg — для шансов заточки<input id="g-slug" value="${esc(g.slug || "")}" placeholder="адрес страницы предмета или, например, spectral-gloves"></label>
      </div>
      <h3 class="mt">Основные показатели (на текущей заточке)</h3>${lines(g.main, "main", true, 6)}
      <h3 class="mt">Прирост за +1 заточки</h3>${lines(g.per, "per", false, 4)}
      <label class="inline">Уровень предмета за +1 <input id="g-ilvlper" type="number" step="0.5" value="${g.ilvlPer ?? 2}"></label>
      <h3 class="mt">Привязка души</h3>${lines(g.bind, "bind", true, 4)}
      <h3 class="mt">Манакамни / инкрустация</h3>${lines(g.stones, "stones", false, Math.max(g.sockets || 0, 0))}
      ${(g.sockets || 0) === 0 ? '<p class="muted small">Укажи число гнёзд выше, чтобы вставить камни.</p>' : ""}
      <div class="row gap mt"><button class="btn ghost" id="g-clear">Очистить слот</button>${k.editing === "plan" ? '<button class="btn ghost" id="g-revert">Вернуть как сейчас</button>' : ""}</div>`;
    const re = () => { commit(false); const doll = $(`.slot[data-s="${id}"]`); if (doll) { const card = ctx.root.querySelector(".doll"); renderGear(ctx.root.querySelector("#cx-body")); } };
    $("#g-name", box).onchange = (e) => { g.name = e.target.value.trim(); re(); };
    $("#g-grade", box).onchange = (e) => { g.grade = e.target.value; re(); };
    $("#g-ilvl", box).onchange = (e) => { g.ilvl = +e.target.value || 0; re(); };
    $("#g-sock", box).onchange = (e) => { g.sockets = Math.max(0, +e.target.value || 0); g.stones = g.stones.slice(0, g.sockets); re(); };
    $("#g-slug", box).onchange = (e) => { g.slug = slugFrom(e.target.value.trim()); e.target.value = g.slug; ctx.save(); if (g.slug) fetchEnch(g.slug); };
    $("#g-ilvlper", box).onchange = (e) => { g.ilvlPer = +e.target.value || 0; ctx.save(); };
    const setEnch = (v) => {
      v = Math.max(0, Math.min(20, v)); const d = v - (g.ench || 0); if (!d) return;
      (g.per || []).forEach(([s, inc]) => { const m = g.main.find((x) => x[0] === s); if (m) m[1] = Math.round((+m[1] + inc * d) * 10) / 10; else if (s) g.main.push([s, Math.round(inc * d * 10) / 10]); });
      g.ilvl = Math.round(((+g.ilvl || 0) + (g.ilvlPer ?? 2) * d) * 10) / 10; g.ench = v; re();
    };
    $("#g-ench", box).onchange = (e) => setEnch(+e.target.value || 0);
    $$("[data-e]", box).forEach((b) => b.onclick = () => setEnch((g.ench || 0) + +b.dataset.e));
    $$(".lines", box).forEach((wrap) => {
      const key = wrap.dataset.key, arr = g[key];
      $$("select", wrap).forEach((s) => s.onchange = () => { arr[+s.dataset.i][0] = s.value; ctx.save(); });
      $$("input", wrap).forEach((s) => s.onchange = () => { arr[+s.dataset.i][1] = +s.value || 0; ctx.save(); });
      $$(".x", wrap).forEach((b) => b.onclick = () => { arr.splice(+b.dataset.i, 1); re(); });
    });
    $$(".add", box).forEach((b) => b.onclick = () => { g[b.dataset.key].push(["", 0]); re(); });
    $("#g-clear", box).onclick = () => { sn.gear[id] = slotBlank(); re(); };
    const rv = $("#g-revert", box); if (rv) rv.onclick = () => { sn.gear[id] = clone(k.cur.gear[id] || slotBlank()); re(); };
  }

  // ---------- Лист персонажа ----------
  function renderSheet(body) {
    const k = C();
    body.innerHTML = `
      <div class="panel sheet">
        <h2>Показатели персонажа сейчас</h2>
        <p class="muted">Перепиши числа из окна персонажа (P) — это точка отсчёта. План = эти числа + разница между «Сейчас» и «План» по Дэваниону, снаряжению и прочим бонусам.</p>
        ${GROUPS.map(([g, gl]) => `<h3 class="mt">${gl}</h3><div class="sheet-grid">${STATS.filter((s) => s[3] === g).map((s) => `<label><span>${esc(s[1])}${s[2] ? ", %" : ""}</span><input data-k="${s[0]}" type="number" step="0.1" value="${k.sheet[s[0]] ?? ""}"></label>`).join("")}</div>`).join("")}
        <h3 class="mt">Прочие бонусы (${k.editing === "plan" ? "план" : "сейчас"})</h3>
        <p class="muted small">Титулы, крылья, питомцы, Пантеон, Арканы, баффы — всё, что не попало в другие вкладки. Указывай то, что изменится.</p>
        <div id="extra-lines"></div>
        <h3 class="mt">Дополнительные очки</h3>
        <div class="sheet-grid"><label><span>Очки умений сверх уровня</span><input id="xp-skill" type="number" value="${k.extraPts.skill || 0}"></label><label><span>Очки стигм сверх уровня</span><input id="xp-stigma" type="number" value="${k.extraPts.stigma || 0}"></label></div>
      </div>`;
    $$(".sheet-grid input[data-k]", body).forEach((i) => i.onchange = () => { const v = i.value.trim(); if (v === "") delete k.sheet[i.dataset.k]; else k.sheet[i.dataset.k] = +v.replace(",", "."); ctx.save(); });
    $("#xp-skill", body).onchange = (e) => { k.extraPts.skill = +e.target.value || 0; commit(false); };
    $("#xp-stigma", body).onchange = (e) => { k.extraPts.stigma = +e.target.value || 0; commit(false); };
    const ex = $("#extra-lines", body), sn = snap();
    const draw = () => {
      ex.innerHTML = `<div class="lines">${sn.extra.map(([s, v], i) => `<div class="ln"><select data-i="${i}">${statOptions(s, true)}</select><input data-i="${i}" type="number" step="0.1" value="${v}"><button class="ib x" data-i="${i}"><svg class="ic sm"><use href="#i-close"/></svg></button></div>`).join("")}<button class="btn ghost add">+ бонус</button></div>`;
      $$("select", ex).forEach((s) => s.onchange = () => { sn.extra[+s.dataset.i][0] = s.value; ctx.save(); });
      $$("input", ex).forEach((s) => s.onchange = () => { sn.extra[+s.dataset.i][1] = +s.value || 0; ctx.save(); });
      $$(".x", ex).forEach((b) => b.onclick = () => { sn.extra.splice(+b.dataset.i, 1); ctx.save(); draw(); });
      $(".add", ex).onclick = () => { sn.extra.push(["", 0]); ctx.save(); draw(); };
    };
    draw();
  }

  // ---------- Итог ----------
  function renderResult(body) {
    const k = C(), c = cc(), A = contrib(c, k.cur), B = contrib(c, k.plan);
    const keys = new Set([...Object.keys(A), ...Object.keys(B), ...Object.keys(k.sheet)]);
    const rowsFor = (g) => STATS.filter((s) => s[3] === g && keys.has(s[0])).map((s) => {
      const key = s[0], d = (B[key] || 0) - (A[key] || 0), base = k.sheet[key];
      const known = base != null && base !== "";
      const now = known ? +base : (A[key] || 0), plan = now + d;
      if (!known && !A[key] && !B[key]) return "";
      const cap = key === "CoolTimeDecrease" && plan > 60 ? '<em class="warn">выше потолка 60%</em>' : "";
      return `<tr class="${d ? "chg" : ""}"><th>${esc(s[1])}</th><td>${fmtVal(key, now)}${known ? "" : '<sup title="Не указано в листе персонажа: учтены только Дэванион и снаряжение">*</sup>'}</td><td class="arrow">${d ? "→" : ""}</td><td><b>${fmtVal(key, plan)}</b> ${cap}</td><td class="d ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d ? sign(d) + fmtVal(key, Math.abs(d)) : ""}</td></tr>`;
    }).join("");
    const bA = skillBonus(c, k.cur), bB = skillBonus(c, k.plan);
    const skillRows = cls(c).skills.filter((s) => s.kind !== "stigma").map((s) => {
      const a = skillTotal(s, k.cur, bA), b = skillTotal(s, k.plan, bB);
      const spA = (k.cur.specs[s.id] || []), spB = (k.plan.specs[s.id] || []);
      const newSpecs = spB.filter((x) => !spA.includes(x)).map((x) => s.specs.find((p) => p.id === x)).filter(Boolean);
      if (a === b && !newSpecs.length) return "";
      return `<li><img src="${ICON(s.id)}" alt=""><div><b>${esc(s.name)}</b> <span class="muted">${a || "—"} → </span><b class="ink">${b || "—"}</b>
        ${newSpecs.length ? `<small>Новые особенности: ${newSpecs.map((p) => esc(p.text)).join("; ")}</small>` : ""}
        ${b && b !== a ? `<details><summary>Подсказка на ${b} ур.</summary><div class="tip-card">${tipText(s, b)}</div></details>` : ""}</div></li>`;
    }).join("");
    const stg = (sn) => sn.stigmaSlots.map((id) => id ? `${skillById(c, id).name} ${sn.stigmaLv[id] || 1}` : "—").join(", ");
    const gearRows = SLOTS.map(([id, name]) => {
      const a = k.cur.gear[id] || {}, b = k.plan.gear[id] || {};
      const parts = [];
      if ((a.name || "") !== (b.name || "")) parts.push(`замена: ${esc(a.name || "пусто")} → ${esc(b.name || "пусто")}`);
      if ((a.ench || 0) !== (b.ench || 0)) parts.push(`заточка +${a.ench || 0} → +${b.ench || 0}`);
      const sa = (a.stones || []).filter((x) => x[0]).length, sb = (b.stones || []).filter((x) => x[0]).length;
      if (sa !== sb) parts.push(`камни ${sa} → ${sb}`);
      if (JSON.stringify(a.bind || []) !== JSON.stringify(b.bind || [])) parts.push("привязка души изменена");
      return parts.length ? `<li><b>${esc(name)}</b><span>${parts.join(" · ")}</span></li>` : "";
    }).join("");
    const ilA = gearIlvl(k.cur), ilB = gearIlvl(k.plan), stA = stoneIlvl(k.cur), stB = stoneIlvl(k.plan);
    const gsNow = k.sheet.GS;
    const dGs = Math.round((ilB - ilA) + (stB - stA));
    const dvA = dvCost(c, k.cur), dvB = dvCost(c, k.plan);
    const b = budgetAt(c, k.level);
    const en = planEnchant(k.cur, k.plan);
    const enHtml = en.rows.length || en.missing.length ? `
        <div class="panel ench-panel">
          <div class="res-head"><h3>Заточка по плану: ожидаемые траты</h3><span class="muted small">с учётом шансов и гарантии (pity) каждого шага</span></div>
          ${en.rows.length ? `<div class="ench-sum"><div><span class="muted">Кинары</span><b>≈ ${fmtK(en.gold)}</b></div>${Object.entries(en.mats).map(([m, n]) => `<div><span class="muted">${esc(matName(m))}</span><b>≈ ${Math.round(n).toLocaleString("ru-RU")}</b></div>`).join("")}</div>
          <table class="stat-tbl ench-tbl">${en.rows.map((r) => `<tr><th>${esc(r.name)}<small>${esc(r.item)}</small></th><td>+${r.from} → +${r.to}</td><td>${fmtK(r.c.gold)} кинаров</td><td>≈${r.c.attempts.toFixed(1).replace(".", ",")} попыт.${r.c.risky ? ' <em class="warn" title="При неудаче уровень падает">риск −1</em>' : ""}</td></tr>`).join("")}</table>` : ""}
          ${en.missing.length ? `<p class="muted small">Нет данных о шансах: ${en.missing.map((m) => esc(m.name)).join(", ")}. Импортируй персонажа или укажи адрес предмета на metabot.gg в редакторе снаряжения${en.missing.some((m) => m.slug) ? " — загружаю…" : ""}.</p>` : ""}
        </div>` : "";
    const needF = en.missing.filter((m) => m.slug).map((m) => m.slug);
    if (needF.length && !renderResult._busy) { renderResult._busy = true; Promise.all(needF.map(fetchEnch)).then((r) => { renderResult._busy = false; if (r.some(Boolean) && C().tab === "result") render(); }); }
    body.innerHTML = `
      <div class="result ${k.onlyChg ? "only-chg" : ""}">
        <div class="res-top">
          <div class="panel res-card"><span class="muted">Кристаллы Дэваниона нужно</span><b>${Math.max(0, dvB - dvA)}</b><small>всего в плане ${dvB}, сейчас ${dvA}</small></div>
          <div class="panel res-card"><span class="muted">Очки умений в плане</span><b>${spentSkill(c, k.plan)}</b><small>доступно ${b.skill + (+k.extraPts.skill || 0)} на ${k.level} ур.</small></div>
          <div class="panel res-card"><span class="muted">Очки стигм в плане</span><b>${spentStigma(c, k.plan)}</b><small>доступно ${b.stigma + (+k.extraPts.stigma || 0)}; сейчас потрачено ${spentStigma(c, k.cur)}</small></div>
          <div class="panel res-card"><span class="muted">Уровень снаряжения</span><b>${dGs >= 0 ? "+" : "−"}${Math.abs(dGs)}</b><small>≈ по уровням предметов и камням (+2,5 за камень)</small></div>
        </div>
        <div class="ai-cta"><button class="btn" id="res-ai"><svg class="ic sm"><use href="#i-ai"/></svg>Спросить ИИ: стоит ли идти по плану «${esc(k.planName)}»?</button></div>
        ${enHtml}
        <div class="res-cols">
          <div class="panel">
            <div class="res-head"><h3>Показатели: сейчас → план</h3><label class="res-filter"><input type="checkbox" id="only-chg" ${k.onlyChg ? "checked" : ""}> только изменения</label></div>
            ${GROUPS.map(([g, gl]) => { const r = rowsFor(g); return r ? `<table class="stat-tbl"><caption>${gl}</caption>${r}</table>` : ""; }).join("") || '<p class="muted">Заполни «Лист персонажа» или измени план — здесь появится разница.</p>'}
            <p class="muted small">* — показателя нет в листе персонажа, поэтому показана только сумма из Дэваниона и снаряжения. Проценты от атрибутов и божеств игра считает сама; здесь — только прибавки.</p>
          </div>
          <div class="stack-col">
            <div class="panel"><h3>Умения</h3><ul class="res-skills">${skillRows || '<li class="muted">Уровни умений не меняются.</li>'}</ul></div>
            <div class="panel"><h3>Стигмы</h3><p><span class="muted">Сейчас:</span> ${esc(stg(k.cur))}</p><p><span class="muted">План:</span> <b>${esc(stg(k.plan))}</b></p></div>
            <div class="panel"><h3>Снаряжение</h3><ul class="res-gear">${gearRows || '<li class="muted">Без изменений.</li>'}</ul></div>
          </div>
        </div>
      </div>`;
    $("#res-ai", body).onclick = () => window.A2AI && window.A2AI.open(`Разбери мой план «${k.planName}» в калькуляторе: что он даст, сколько стоит и в каком порядке это делать? Есть ли вложения выгоднее?`);
    $("#only-chg", body).onchange = (e) => { k.onlyChg = e.target.checked; ctx.save(); $(".result", body).classList.toggle("only-chg", k.onlyChg); };
  }

  // ---------- стоимость заточки (шансы и цены — metabot.gg) ----------
  const EX = () => window.EXTRA || { ench: {}, mats: {} };
  function enchCache() { const st = ctx.st; st.cache = st.cache || {}; st.cache.ench = st.cache.ench || {}; return st.cache.ench; }
  function enchData(slug) { if (!slug) return null; return EX().ench[slug] || enchCache()[slug] || null; }
  function matName(id) { return EX().mats[id] || (enchCache()._mats || {})[id] || "материал " + id; }
  // ожидаемые попытки и траты для перехода from → to
  function enchCost(slug, from, to) {
    const d = enchData(slug); if (!d || to <= from) return null;
    const [max, steps] = d; to = Math.min(to, max);
    const att = steps.map(([succ, bonus]) => { let e = 0, surv = 1, j = 0; while (surv > 1e-9 && j < 400) { e += surv; const p = Math.min(1, (succ + j * bonus) / 100); surv *= 1 - p; j++; } return e; });
    const N = []; // N[L] — вектор ожидаемых попыток на каждом уровне, чтобы подняться с L на L+1
    for (let L = 0; L < steps.length; L++) {
      const v = new Array(steps.length).fill(0), [succ, bonus, pen] = steps[L];
      if (pen < 0 && L > 0 && bonus === 0) { const p = succ / 100; v[L] = 1 / p; N[L - 1].forEach((x, i) => v[i] += x * (1 - p) / p); }
      else v[L] = att[L];
      N[L] = v;
    }
    const A = new Array(steps.length).fill(0);
    for (let L = from; L < to; L++) N[L].forEach((x, i) => A[i] += x);
    let gold = 0, attempts = 0; const mats = {};
    A.forEach((n, i) => { if (!n) return; attempts += n; gold += n * steps[i][3]; steps[i][4].forEach(([m, c]) => mats[m] = (mats[m] || 0) + n * c); });
    let worst = 0; for (let L = from; L < to; L++) { const [succ, bonus] = steps[L]; worst += bonus ? Math.ceil((100 - succ) / bonus) + 1 : 0; }
    return { gold, mats, attempts, risky: steps.slice(from, to).some((s) => s[2] < 0), max, worst };
  }
  const fmtK = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " млн" : n >= 1e3 ? Math.round(n / 1e3) + " тыс." : String(Math.round(n));
  function slugFrom(v) { const m = /items\/([a-z0-9-]+)/.exec(v || ""); return m ? m[1] : /^[a-z0-9-]+$/.test(v || "") ? v : ""; }
  async function fetchEnch(slug) {
    if (!slug || enchData(slug) || !window.A2Net) return enchData(slug);
    const r = await window.A2Net.get("https://metabot.gg/ru/aion-2/items/" + slug);
    if (!r || r.status !== 200) return null;
    const R = rscText(r.body), i = R.indexOf('"steps":[');
    if (i < 0) return null;
    const j = R.indexOf('],"max":', i);
    try {
      const steps = JSON.parse(R.slice(i + 8, j + 1)), max = +(/\d+/.exec(R.slice(j + 8, j + 14)) || [steps.length])[0];
      const mi = R.indexOf('"mats":', j), me = R.indexOf(',"fullHref"', mi);
      try { const m = JSON.parse(R.slice(mi + 7, me)); const c = enchCache(); c._mats = c._mats || {}; Object.entries(m).forEach(([id, v]) => c._mats[id] = v.name); } catch (e) { }
      enchCache()[slug] = [max, steps.map((x) => [x.successPct, x.failBonusPct, x.failPenalty, x.gold, x.costs.map((c) => [c.item, c.count])])];
      ctx.save(); return enchCache()[slug];
    } catch (e) { return null; }
  }
  function rscText(html) {
    let out = ""; const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g; let m;
    while ((m = re.exec(html))) { try { out += JSON.parse('"' + m[1] + '"'); } catch (e) { } }
    return out;
  }
  function planEnchant(a, b) {
    const rows = []; let gold = 0; const mats = {}; const missing = [];
    SLOTS.forEach(([id, name]) => {
      const x = a.gear[id] || {}, y = b.gear[id] || {};
      if (!y.name || (y.ench || 0) <= 0) return;
      const same = (x.name || "") === (y.name || "");
      const from = same ? (x.ench || 0) : 0, to = y.ench || 0;
      if (to <= from) return;
      const slug = y.slug || (same ? x.slug : "");
      const c = enchCost(slug, from, to);
      if (!c) { missing.push({ id, name, slug, from, to }); return; }
      gold += c.gold; Object.entries(c.mats).forEach(([m, n]) => mats[m] = (mats[m] || 0) + n);
      rows.push({ id, name, item: y.name, from, to, c });
    });
    return { rows, gold, mats, missing };
  }

  // ---------- импорт персонажа ----------
  function applyImport(data, opts) {
    const k = C(), c = cc(), cur = emptySnap(c);
    cur.skills = {}; cur.specs = {};
    // Дэванион
    cls(c).boards.forEach((b) => { const open = new Set(data.dv[b.id] || []); cur.dv[b.id] = b.nodes.filter((n) => !n[7] && open.has(n[0])).map((n) => n[0]); });
    // снаряжение
    Object.entries(data.gear).forEach(([slot, g]) => cur.gear[slot] = g);
    // умения: на сайте уровень уже с бонусами — вычитаем бонусы Дэваниона и предметов
    const bonus = skillBonus(c, cur);
    const notes = [];
    data.skills.forEach(([id, lv, equipped]) => {
      const s = skillById(c, id); if (!s) return;
      if (s.kind === "stigma") { cur.stigmaLv[id] = Math.max(1, Math.min(s.buyMax, lv || 1)); if (equipped) { const i = cur.stigmaSlots.indexOf(null); if (i >= 0) cur.stigmaSlots[i] = id; } return; }
      if (!lv) return;
      const base = Math.max(1, Math.min(s.buyMax, lv - (bonus[id] || 0)));
      if (lv - (bonus[id] || 0) > s.buyMax) notes.push(s.name + ": уровень выше " + s.buyMax + " без учёта бонусов");
      cur.skills[id] = base;
    });
    k.cur = cur;
    if (opts.resetPlan) { k.plan = clone(cur); }
    // очки сверх уровня (задания, книги и т. п.): подгоняем так, чтобы «сейчас» не было в минусе
    const bud = budgetAt(c, data.level || k.level);
    const overSk = spentSkill(c, cur) - bud.skill, overSt = spentStigma(c, cur) - bud.stigma;
    if (overSk > (+k.extraPts.skill || 0)) { k.extraPts.skill = overSk; notes.push(`очки умений сверх уровня: +${overSk}`); }
    if (overSt > (+k.extraPts.stigma || 0)) { k.extraPts.stigma = overSt; notes.push(`очки стигм сверх уровня: +${overSt}`); }
    if (data.attrs) Object.assign(k.sheet, data.attrs);
    if (data.ilvl) k.sheet.GS = data.ilvl;
    k.level = data.level || k.level;
    k.imported = { at: Date.now(), server: data.server, cp: data.cp, ilvl: data.ilvl, url: data.url };
    k.editing = "cur";
    ctx.save(); render();
    return notes;
  }

  // ---------- советник ----------
  const WEIGHTS = {
    dps: { label: "Урон в PvE", unit: "≈% урона", w: (sh) => { const atk = +sh.Attack || 900; return {
      Attack: 100 / atk, FrontAttack: 50 / atk, BackAttack: 40 / atk, AmplifyAllDamage: 1, PvEAmplify: 1, BossAmplify: .8, CombatSpeed: .9, WeaponDamage: .6,
      AmplifyCriticalDamage: .35, CoolTimeDecrease: .7, PerfectHit: .5, PowerHit: .5, AdditionalHitRate: .6, Critical: .03, Accuracy: .012, Pierce: .003,
      Power: .1, Intellect: .02, Precision: .03, GodTime: .09, GodDestruction: .05, GodDeath: .05, GodIllusion: .04, GodWisdom: .03 }; } },
    tank: { label: "Выживаемость", unit: "≈% живучести", w: (sh) => { const hp = +sh.HPMax || 11000, df = +sh.DefenseMain || 4700; return {
      HPMax: 100 / hp, DefenseMain: 35 / df, DecreaseDamage: 1, DecreaseCriticalDamage: .4, CriticalResist: .04, Evasion: .02, Block: .02, HPRegen: .004,
      AbnormalResistance: .3, AdditionalHitResistRate: .4, Vitality: .1, Agility: .03, MoveSpeed: .1 }; } },
    pvp: { label: "PvP", unit: "≈% в PvP", w: (sh) => { const atk = +sh.Attack || 900, hp = +sh.HPMax || 11000; return {
      Attack: 100 / atk, AmplifyAllDamage: 1, CombatSpeed: .9, PvPAmplifyDamage: 1, PvPAddDamage: 100 / atk, PvPDecreaseDamage: 1, PvPCritical: .03, PvPCriticalResist: .03,
      PvPAccuracy: .012, PvPEvasion: .012, PvPDamageDefense: .02, Critical: .03, HPMax: 60 / hp, DecreaseDamage: .8, AbnormalAccuracy: .5, AbnormalResistance: .6, CoolTimeDecrease: .6 }; } },
  };
  function valueOf(stats, W) { let v = 0; stats.forEach(([kk, x]) => { kk = ALIAS[kk] || kk; v += (W[kk] || 0) * (+x || 0); }); return v; }
  function nodeStats(n) { return n[9].map(([kk, raw]) => [kk, boardStat(kk, raw)]); }
  function adviseDv(sn, W, budget, level, onlyBoard) {
    const c = cc(), picks = [], taken = {};
    cls(c).boards.forEach((b) => taken[b.id] = new Set(sn.dv[b.id] || []));
    const skW = (id) => { const s = skillById(c, id); return !s ? 0 : s.kind === "active" ? .35 : .2; };
    const nodeVal = (n) => valueOf(nodeStats(n), W) + (n[3] === "k" && n[10] ? skW(n[10]) * n[11] : 0);
    let left = budget, guard = 0;
    while (left > 0 && guard++ < 200) {
      let best = null;
      cls(c).boards.forEach((b) => {
        if (level < b.needLevel || (onlyBoard && b.name !== onlyBoard)) return;
        const byPos = {}; b.nodes.forEach((n) => byPos[n[1] + ":" + n[2]] = n);
        const has = (n) => n[7] || taken[b.id].has(n[0]);
        b.nodes.forEach((n) => {
          if (has(n) || n[6] > level || n[5] > left) return;
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => byPos[(n[1] + dr) + ":" + (n[2] + dc)]).filter(Boolean);
          if (!nb.some(has)) return;
          // с заглядыванием на шаг вперёд: дешёвая «дверь» к ценной ячейке тоже хороша
          const ahead = Math.max(0, ...nb.filter((m) => !has(m) && m[6] <= level).map((m) => nodeVal(m) / Math.max(1, m[5])));
          const score = (nodeVal(n) + .5 * ahead * n[5]) / Math.max(1, n[5]);
          if (!best || score > best.score) best = { b, n, score, val: nodeVal(n) };
        });
      });
      if (!best || best.score <= 0) break;
      taken[best.b.id].add(best.n[0]); left -= best.n[5]; picks.push(best);
    }
    return picks;
  }
  function renderAdvice(body) {
    const k = C(), c = cc(), sn = k.plan, mode = WEIGHTS[k.adv.mode] ? k.adv.mode : "dps", WD = WEIGHTS[mode], W = WD.w(k.sheet), lv = k.level;
    const b = budgetAt(c, lv);
    const freeSk = b.skill + (+k.extraPts.skill || 0) - spentSkill(c, sn), freeSt = b.stigma + (+k.extraPts.stigma || 0) - spentStigma(c, sn);
    const picks = adviseDv(sn, W, Math.max(1, +k.adv.budget || 40), lv);
    const pickSum = picks.reduce((a, p) => a + p.n[5], 0), pickVal = picks.reduce((a, p) => a + p.val, 0);
    // заточка: следующая +1 по каждому слоту
    const ench = SLOTS.map(([id, name]) => {
      const g = sn.gear[id]; if (!g || !g.name || !g.per || !g.per.length) return null;
      const d = enchData(g.slug), e = g.ench || 0;
      if (d && e >= d[0]) return null;
      const gain = valueOf(g.per, W), cost = enchCost(g.slug, e, e + 1);
      return { id, name, g, gain, cost, per100k: cost ? gain / Math.max(1, cost.gold / 1e5) : null };
    }).filter(Boolean).sort((x, y) => (y.per100k ?? -1) - (x.per100k ?? -1) || y.gain - x.gain);
    // умения: кто ближе к следующей ячейке особенности
    const bonus = skillBonus(c, sn), slots = cls(c).specSlots;
    const near = cls(c).skills.filter((s) => s.kind !== "stigma" && (sn.skills[s.id] || 0) > 0).map((s) => {
      const lvB = sn.skills[s.id], tot = lvB + (bonus[s.id] || 0), next = slots.find((x) => x > tot);
      if (!next || lvB >= s.buyMax) return null;
      const need = next - tot; if (lvB + need > s.buyMax) return null;
      let pts = 0; for (let i = lvB; i < lvB + need; i++) pts += s.cost[i] || 0;
      return { s, tot, next, need, pts };
    }).filter(Boolean).sort((x, y) => x.pts - y.pts).slice(0, 6);
    const emptySock = SLOTS.reduce((a, [id]) => { const g = sn.gear[id]; return a + (g && g.name ? Math.max(0, (g.sockets || 0) - (g.stones || []).filter((x) => x[0]).length) : 0); }, 0);
    body.innerHTML = `
      <div class="advice">
        <div class="panel adv-head">
          <div class="seg" id="adv-mode">${Object.entries(WEIGHTS).map(([id, x]) => `<button data-m="${id}" class="${id === mode ? "on" : ""}">${x.label}</button>`).join("")}</div>
          <label class="inline">Кристаллов Дэваниона в запасе <input id="adv-budget" type="number" min="1" max="999" value="${k.adv.budget || 40}"></label>
          <p class="muted small">Советник смотрит на текущий план «${esc(k.planName)}» и считает пользу в условных единицах «${WD.unit}». Веса — ориентир, а не формула игры: они опираются на твой лист персонажа (АТК ${k.sheet.Attack || "?"}, ОЗ ${k.sheet.HPMax || "?"}).</p>
        </div>
        <div class="adv-cols">
          <div class="panel">
            <div class="res-head"><h3>Дэванион: куда вложить ${pickSum} крист.</h3>${picks.length ? '<button class="btn primary" id="adv-dv-apply">Взять всё в план</button>' : ""}</div>
            ${picks.length ? `<ol class="adv-list">${picks.map((p) => `<li><span class="dot g${p.n[4] || "S"}"></span><div><b>${esc(p.n[8] || "")}</b><small>${esc(p.b.name)} · ${p.n[5]} крист.${p.val ? ` · +${p.val.toFixed(2).replace(".", ",")}` : " · проход к ценной ячейке"}</small></div></li>`).join("")}</ol>
              <p class="muted small">Итого ≈ +${pickVal.toFixed(1).replace(".", ",")} ${WD.unit}. Порядок важен: ячейки идут цепочкой от уже взятых.</p>` : '<p class="muted">Нечего предложить: доски заполнены или не хватает уровня/кристаллов.</p>'}
          </div>
          <div class="stack-col">
            <div class="panel">
              <h3>Заточка: польза за 100 тыс. кинаров</h3>
              ${ench.length ? `<table class="stat-tbl adv-tbl"><tr><th>Слот</th><td>+1</td><td>польза</td><td>кинары</td><td>на 100 тыс.</td></tr>${ench.slice(0, 8).map((e) => `<tr><th>${esc(e.name)}<small>${esc(e.g.name)}</small></th><td>+${(e.g.ench || 0) + 1}</td><td>${e.gain ? "+" + e.gain.toFixed(2).replace(".", ",") : "—"}</td><td>${e.cost ? fmtK(e.cost.gold) + (e.cost.attempts > 1.05 ? `<small>≈${e.cost.attempts.toFixed(1).replace(".", ",")} попыт.</small>` : "") : '<small>нет шансов</small>'}</td><td><b>${e.per100k != null ? e.per100k.toFixed(2).replace(".", ",") : "—"}</b></td></tr>`).join("")}</table>
                <p class="muted small">Учтён прирост за +1 из карточки предмета. Шансы и цены — с metabot.gg; если у предмета их нет, импортируй персонажа или укажи адрес предмета в редакторе снаряжения.</p>` : '<p class="muted">Заполни снаряжение (или импортируй персонажа) — тогда появится сравнение.</p>'}
            </div>
            <div class="panel">
              <h3>Очки умений и стигм</h3>
              <ul class="kv">
                <li><span>Свободно очков умений</span><b class="${freeSk < 0 ? "warn" : ""}">${freeSk}</b></li>
                <li><span>Свободно очков стигм</span><b class="${freeSt < 0 ? "warn" : ""}">${freeSt}</b></li>
                <li><span>Пустых гнёзд под манакамни</span><b>${emptySock}</b></li>
              </ul>
              ${near.length ? `<h3 class="mt">Ближе всего к новой особенности</h3><ul class="adv-list">${near.map((x) => `<li><img class="mini" src="${ICON(x.s.id)}" alt=""><div><b>${esc(x.s.name)}</b><small>${x.tot} → ${x.next} ур.: +${x.need} ур. за ${x.pts} оч. — откроется ячейка особенности</small></div></li>`).join("")}</ul>` : ""}
              ${emptySock ? `<p class="muted small">Каждый вставленный манакамень даёт около +2,5 к уровню снаряжения — это самый дешёвый рост GS.</p>` : ""}
            </div>
          </div>
        </div>
      </div>`;
    $$("#adv-mode button", body).forEach((x) => x.onclick = () => { k.adv.mode = x.dataset.m; commit(); });
    $("#adv-budget", body).onchange = (e) => { k.adv.budget = Math.max(1, Math.min(999, +e.target.value || 40)); commit(); };
    const ap = $("#adv-dv-apply", body);
    if (ap) ap.onclick = () => {
      picks.forEach((p) => { const arr = sn.dv[p.b.id] = sn.dv[p.b.id] || []; if (!arr.includes(p.n[0])) arr.push(p.n[0]); });
      k.editing = "plan"; commit(); window.A2Toast && A2Toast("Добавлено в план", `${picks.length} ячеек Дэваниона, ${pickSum} кристаллов.`, "ok");
    };
    // догружаем шансы заточки для предметов без данных
    const need = [...new Set(SLOTS.map(([id]) => (sn.gear[id] || {}).slug).filter((s) => s && !enchData(s)))];
    if (need.length && !renderAdvice._busy) { renderAdvice._busy = true; Promise.all(need.map(fetchEnch)).then((r) => { renderAdvice._busy = false; if (r.some(Boolean) && C().tab === "advice") render(); }); }
  }

  // ---------- сравнение планов ----------
  function renderCompare(body) {
    const k = C(), c = cc(), plans = allPlans(), W = WEIGHTS.dps.w(k.sheet), WT = WEIGHTS.tank.w(k.sheet);
    const A = contrib(c, k.cur), b = budgetAt(c, k.level);
    const keyStats = ["Attack", "Critical", "Accuracy", "CombatSpeed", "AmplifyAllDamage", "PvEAmplify", "CoolTimeDecrease", "HPMax", "DefenseMain", "DecreaseDamage"];
    const col = plans.map((p) => {
      const B = contrib(c, p.snap), d = {}; Object.keys(SDEF).forEach((kk) => { const x = (B[kk] || 0) - (A[kk] || 0); if (x) d[kk] = x; });
      const en = planEnchant(k.cur, p.snap);
      return { p, d, dps: valueOf(Object.entries(d), W), tank: valueOf(Object.entries(d), WT), dv: Math.max(0, dvCost(c, p.snap) - dvCost(c, k.cur)), sk: spentSkill(c, p.snap), sg: spentStigma(c, p.snap),
        gs: Math.round(gearIlvl(p.snap) - gearIlvl(k.cur) + stoneIlvl(p.snap) - stoneIlvl(k.cur)), gold: en.gold, miss: en.missing.length };
    });
    const best = (f) => Math.max(...col.map(f));
    const cell = (x, v, f, fmt) => `<td class="${col.length > 1 && f(x) === best(f) && f(x) > 0 ? "best" : ""}">${fmt(v)}</td>`;
    const n1 = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",");
    body.innerHTML = `
      <div class="panel compare">
        <div class="res-head"><h3>Планы рядом</h3><span class="muted small">Всё считается от «Сейчас в игре». Зелёным — лучший по строке.</span></div>
        <div class="cmp-scroll"><table class="stat-tbl cmp">
          <tr><th></th>${col.map((x) => `<td class="${x.p.id === k.planId ? "act" : ""}"><b>${esc(x.p.name)}</b>${x.p.id === k.planId ? "<small>активный</small>" : `<button class="btn ghost sm" data-go="${x.p.id}">открыть</button>`}</td>`).join("")}</tr>
          <tr><th>Урон PvE, ${WEIGHTS.dps.unit}</th>${col.map((x) => cell(x, x.dps, (y) => y.dps, n1)).join("")}</tr>
          <tr><th>Живучесть, ${WEIGHTS.tank.unit}</th>${col.map((x) => cell(x, x.tank, (y) => y.tank, n1)).join("")}</tr>
          <tr><th>Уровень снаряжения</th>${col.map((x) => cell(x, x.gs, (y) => y.gs, (v) => (v >= 0 ? "+" : "−") + Math.abs(v))).join("")}</tr>
          <tr><th>Кристаллы Дэваниона</th>${col.map((x) => `<td>${x.dv}</td>`).join("")}</tr>
          <tr><th>Очки умений</th>${col.map((x) => `<td class="${x.sk > b.skill + (+k.extraPts.skill || 0) ? "warn" : ""}">${x.sk}</td>`).join("")}</tr>
          <tr><th>Очки стигм</th>${col.map((x) => `<td class="${x.sg > b.stigma + (+k.extraPts.stigma || 0) ? "warn" : ""}">${x.sg}</td>`).join("")}</tr>
          <tr><th>Кинары на заточку</th>${col.map((x) => `<td>${x.gold ? "≈" + fmtK(x.gold) : "—"}${x.miss ? `<small>+${x.miss} без данных</small>` : ""}</td>`).join("")}</tr>
          ${keyStats.map((kk) => `<tr><th>${esc(SDEF[kk].label)}</th>${col.map((x) => `<td>${x.d[kk] ? sign(x.d[kk]) + fmtVal(kk, Math.abs(x.d[kk])) : ""}</td>`).join("")}</tr>`).join("")}
        </table></div>
        <p class="muted small">Создай ещё план кнопкой «+» рядом с выбором плана, чтобы сравнить разные пути: например «всё в Дэванион» против «заточка оружия до +15».</p>
      </div>`;
    $$("[data-go]", body).forEach((x) => x.onclick = () => { switchPlan(x.dataset.go); k.editing = "plan"; k.tab = "result"; commit(); });
  }

  // ---------- сводка персонажа для ИИ-помощника ----------
  function aiSummary(st, p, ch) {
    const keep = ctx;
    ctx = { st, p, ch, save: () => { }, root: null };
    try {
      ensure(p, ch);
      const k = C(), c = cc(), cur = k.cur, out = [];
      const statName = (kk) => String(kk).startsWith("skill:") ? ((skillById(c, +String(kk).slice(6)) || {}).name || kk) + " (ур. умения)" : (SDEF[ALIAS[kk] || kk] || { label: kk }).label;
      const statLine = (arr) => (arr || []).filter((x) => x[0]).map(([kk, v]) => `${statName(kk)} ${String(kk).startsWith("skill:") ? "+" + v : fmtVal(ALIAS[kk] || kk, +v)}`).join(", ");
      out.push(`Уровень персонажа: ${k.level}.`);
      if (k.imported) out.push(`Официальные данные (Armory, ${new Date(k.imported.at).toLocaleDateString("ru-RU")}): боевая мощь ${k.imported.cp || "?"}, уровень предметов (GS) ${k.imported.ilvl || "?"}, сервер ${k.imported.server || "?"}.`);
      else out.push("Персонаж не импортирован из Armory — данные введены вручную и могут быть неполными.");
      const sh = Object.entries(k.sheet).filter(([kk, v]) => SDEF[kk] && v !== "" && v != null).map(([kk, v]) => `${SDEF[kk].label} ${fmtVal(kk, +v)}`);
      if (sh.length) out.push("Лист персонажа: " + sh.join(", ") + ".");
      out.push("\nСнаряжение (сейчас):");
      SLOTS.forEach(([id, name]) => {
        const g = cur.gear[id]; if (!g || !g.name) { out.push(`- ${name}: пусто`); return; }
        const d = enchData(g.slug), st2 = (g.stones || []).filter((x) => x[0]).length;
        out.push(`- ${name}: ${g.name}, ${(GRADES[g.grade] || ["?"])[0].toLowerCase()}, заточка +${g.ench || 0}${d ? " из +" + d[0] : ""}, ур. предмета ${g.ilvl || "?"}, манакамни ${st2}/${g.sockets || 0}` +
          (g.main && g.main.length ? `; основные: ${statLine(g.main)}` : "") + (g.bind && g.bind.length ? `; привязка души: ${statLine(g.bind)}` : "") + (st2 ? `; камни: ${statLine(g.stones)}` : ""));
      });
      const bonus = skillBonus(c, cur);
      const sk = cls(c).skills.filter((s) => s.kind !== "stigma" && cur.skills[s.id]).map((s) => `${s.name} ${cur.skills[s.id] + (bonus[s.id] || 0)}${bonus[s.id] ? ` (${cur.skills[s.id]} куплено + ${bonus[s.id]} бонус)` : ""}`);
      out.push("\nУмения (" + window.A2CLS.name(c) + "): " + sk.join("; ") + ".");
      const specs = Object.entries(cur.specs || {}).filter(([, a]) => a && a.length).map(([id, a]) => { const s = skillById(c, +id); return s ? `${s.name}: ${a.map((x) => (s.specs.find((pp) => pp.id === x) || {}).text).filter(Boolean).join("; ")}` : ""; }).filter(Boolean);
      if (specs.length) out.push("Выбранные особенности: " + specs.join(" | ") + ".");
      out.push("Стигмы в слотах: " + cur.stigmaSlots.map((id) => id ? `${skillById(c, id).name} ${cur.stigmaLv[id] || 1}` : "пусто").join(", ") +
        ". Изучены, но не надеты: " + (Object.keys(cur.stigmaLv).map(Number).filter((id) => !cur.stigmaSlots.includes(id)).map((id) => `${(skillById(c, id) || {}).name} ${cur.stigmaLv[id]}`).join(", ") || "нет") + ".");
      const b = budgetAt(c, k.level);
      out.push(`Очки умений: потрачено ${spentSkill(c, cur)} из ${b.skill + (+k.extraPts.skill || 0)}; очки стигм: ${spentStigma(c, cur)} из ${b.stigma + (+k.extraPts.stigma || 0)}.`);
      out.push("Дэванион: " + cls(c).boards.map((bd) => { const set = new Set(cur.dv[bd.id] || []); const tot = bd.nodes.filter((n) => !n[7]); const got = tot.filter((n) => set.has(n[0])); return `${bd.name} ${got.length}/${tot.length} ячеек (${got.reduce((a, n) => a + n[5], 0)}/${tot.reduce((a, n) => a + n[5], 0)} крист.)${k.level < bd.needLevel ? ", откроется на " + bd.needLevel + " ур." : ""}`; }).join("; ") + ".");
      const tot = contrib(c, cur), top = ["Attack", "Critical", "Accuracy", "CombatSpeed", "AmplifyAllDamage", "PvEAmplify", "CoolTimeDecrease", "HPMax", "DefenseMain"].filter((x) => tot[x]);
      if (top.length) out.push("Сумма от Дэваниона и снаряжения: " + top.map((x) => `${SDEF[x].label} +${fmtVal(x, tot[x])}`).join(", ") + ".");
      // план
      const plans = allPlans().filter((pl) => JSON.stringify(pl.snap) !== JSON.stringify(cur));
      plans.slice(0, 3).forEach((pl) => {
        const en = planEnchant(cur, pl.snap), A = contrib(c, cur), B = contrib(c, pl.snap);
        const d = Object.keys(SDEF).map((x) => [x, (B[x] || 0) - (A[x] || 0)]).filter(([, v]) => v).slice(0, 10).map(([x, v]) => `${SDEF[x].label} ${sign(v)}${fmtVal(x, Math.abs(v))}`);
        out.push(`\nПлан «${pl.name}»: нужно кристаллов Дэваниона ${Math.max(0, dvCost(c, pl.snap) - dvCost(c, cur))}; очки умений ${spentSkill(c, pl.snap)}, стигм ${spentStigma(c, pl.snap)}` +
          (en.rows.length ? `; заточка: ${en.rows.map((r) => `${r.name} +${r.from}→+${r.to} ≈${fmtK(r.c.gold)} кинаров`).join(", ")} (итого ≈${fmtK(en.gold)})` : "") + (d.length ? `; изменение показателей: ${d.join(", ")}` : "") + ".");
      });
      // советник
      const W = WEIGHTS.dps.w(k.sheet), picks = adviseDv(cur, W, 40, k.level);
      if (picks.length) out.push("\nРасчёт программы — лучшие ячейки Дэваниона на 40 кристаллов (по урону): " + picks.slice(0, 12).map((x) => `${x.n[8]} [${x.b.name}, ${x.n[5]} кр.]`).join("; ") + ".");
      const ench = SLOTS.map(([id, name]) => { const g = cur.gear[id]; if (!g || !g.name || !g.per || !g.per.length) return null; const d = enchData(g.slug); if (d && (g.ench || 0) >= d[0]) return null; const gain = valueOf(g.per, W), cost = enchCost(g.slug, g.ench || 0, (g.ench || 0) + 1); return cost && gain ? { name, g, gain, cost, v: gain / Math.max(1, cost.gold / 1e5) } : null; }).filter(Boolean).sort((a, b2) => b2.v - a.v).slice(0, 5);
      if (ench.length) out.push("Расчёт программы — выгоднейшая следующая заточка (≈% урона на 100 тыс. кинаров): " + ench.map((e) => `${e.name} +${e.g.ench + 1} (${fmtK(e.cost.gold)} кинаров, ${e.v.toFixed(2)})`).join("; ") + ".");
      return out.join("\n");
    } catch (e) { return "Не удалось собрать данные калькулятора: " + e.message; }
    finally { ctx = keep; }
  }

  // ---------- структурированный разбор для встроенного помощника ----------
  function analysis(st, p, ch, o = {}) {
    const keep = ctx;
    ctx = { st, p, ch, save: () => { }, root: null };
    try {
      ensure(p, ch);
      const k = C(), c = cc(), cur = k.cur, mode = o.mode || "dps", W = WEIGHTS[mode].w(k.sheet), b = budgetAt(c, k.level);
      const gear = SLOTS.map(([id, name]) => { const g = cur.gear[id] || {}; const d = enchData(g.slug);
        return { id, name, item: g.name || "", grade: (GRADES[g.grade] || ["?"])[0], ench: g.ench || 0, max: d ? d[0] : null, ilvl: +g.ilvl || 0, sockets: g.sockets || 0, stones: (g.stones || []).filter((x) => x[0]).length, slug: g.slug, per: g.per || [] }; });
      const filled = gear.filter((g) => g.item);
      // заточка: следующая ступень и «бесплатные» шаги со 100% шансом
      const ench = filled.map((g) => {
        const d = enchData(g.slug); if (!d || g.ench >= d[0]) return null;
        const next = enchCost(g.slug, g.ench, g.ench + 1), gain = valueOf(g.per, W), sure = d[1].slice(g.ench).findIndex((s) => s[0] < 100);
        const safeTo = sure < 0 ? d[0] : g.ench + sure;
        return { ...g, next, gain, per100k: next && gain ? gain / Math.max(1, next.gold / 1e5) : 0, safeTo, safeCost: safeTo > g.ench ? enchCost(g.slug, g.ench, safeTo) : null };
      }).filter(Boolean);
      const bonus = skillBonus(c, cur), slots = cls(c).specSlots;
      const near = cls(c).skills.filter((s) => s.kind !== "stigma" && (cur.skills[s.id] || 0) > 0).map((s) => {
        const lv = cur.skills[s.id], tot = lv + (bonus[s.id] || 0), nx = slots.find((x) => x > tot); if (!nx || lv >= s.buyMax) return null;
        const need = nx - tot; if (lv + need > s.buyMax) return null; let pts = 0; for (let i = lv; i < lv + need; i++) pts += s.cost[i] || 0;
        return { name: s.name, kind: s.kind, tot, next: nx, need, pts };
      }).filter(Boolean).sort((x, y) => x.pts - y.pts);
      const stg = cur.stigmaSlots.map((id, i) => ({ slot: i + 1, open: k.level >= cls(c).stigmaSlotLevels[i], id, name: id ? skillById(c, id).name : "", lv: id ? cur.stigmaLv[id] || 1 : 0, next: id ? (skillById(c, id).specs.find((pp) => pp.unlock > (cur.stigmaLv[id] || 1)) || null) : null }));
      const stOwn = Object.keys(cur.stigmaLv).map(Number).filter((id) => !cur.stigmaSlots.includes(id)).map((id) => ({ name: (skillById(c, id) || {}).name, lv: cur.stigmaLv[id] }));
      const boards = cls(c).boards.map((bd) => { const set = new Set(cur.dv[bd.id] || []); const t = bd.nodes.filter((n) => !n[7]); const g = t.filter((n) => set.has(n[0])); return { name: bd.name, got: g.length, total: t.length, cost: g.reduce((a, n) => a + n[5], 0), costTotal: t.reduce((a, n) => a + n[5], 0), needLevel: bd.needLevel, open: k.level >= bd.needLevel }; });
      const picks = adviseDv(cur, W, Math.max(1, o.budget || 40), k.level).map((x) => ({ label: x.n[8], board: x.b.name, cost: x.n[5], val: x.val }));
      const skills = cls(c).skills.filter((s) => s.kind !== "stigma" && cur.skills[s.id]).map((s) => ({ name: s.name, kind: s.kind, lv: cur.skills[s.id], total: cur.skills[s.id] + (bonus[s.id] || 0) }));
      const A = contrib(c, cur);
      const plans = allPlans().filter((pl) => JSON.stringify(pl.snap) !== JSON.stringify(cur)).map((pl) => {
        const B = contrib(c, pl.snap), d = {}; Object.keys(SDEF).forEach((x) => { const v = (B[x] || 0) - (A[x] || 0); if (v) d[x] = v; });
        const en = planEnchant(cur, pl.snap);
        return { name: pl.name, active: pl.id === k.planId, crystals: Math.max(0, dvCost(c, pl.snap) - dvCost(c, cur)), en, dps: valueOf(Object.entries(d), WEIGHTS.dps.w(k.sheet)), tank: valueOf(Object.entries(d), WEIGHTS.tank.w(k.sheet)),
          diff: Object.entries(d).slice(0, 10).map(([x, v]) => `${SDEF[x].label} ${sign(v)}${fmtVal(x, Math.abs(v))}`), sk: spentSkill(c, pl.snap), sg: spentStigma(c, pl.snap) };
      });
      return { level: k.level, imported: k.imported || null, sheet: k.sheet, gear, ench, near, stg, stOwn, boards, picks, skills, plans,
        freeSk: b.skill + (+k.extraPts.skill || 0) - spentSkill(c, cur), freeSt: b.stigma + (+k.extraPts.stigma || 0) - spentStigma(c, cur),
        emptySockets: filled.reduce((a, g) => a + Math.max(0, g.sockets - g.stones), 0), unit: WEIGHTS[mode].unit, fmtK };
    } finally { ctx = keep; }
  }

  // ---------- точечные запросы встроенного помощника ----------
  function withCtx(st, p, ch, fn) { const keep = ctx; ctx = { st, p, ch, save: () => document.dispatchEvent(new Event("a2save")), root: null }; try { ensure(p, ch); return fn(C(), cc()); } finally { ctx = keep; } }
  const tipMd = (h) => String(h).replace(/<b class='hl'>/g, "**").replace(/<\/b>/g, "**").replace(/<br>/g, "\n").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  function skillInfo(st, p, ch, id) {
    return withCtx(st, p, ch, (k, c) => {
      const s = skillById(c, id); if (!s) return null;
      const cur = k.cur, bonus = skillBonus(c, cur)[id] || 0;
      const stig = s.kind === "stigma", lv = stig ? (cur.stigmaLv[id] || 0) : (cur.skills[id] || 0), total = stig ? lv : (lv ? lv + bonus : 0);
      const planLv = stig ? (k.plan.stigmaLv[id] || 0) : (k.plan.skills[id] || 0);
      const chosen = (cur.specs || {})[id] || [];
      let next = null; if (lv && lv < s.buyMax) next = s.cost[stig ? lv : lv] || 0;
      return { id, name: s.name, kind: s.kind, unlock: s.unlock, lv, bonus, total, buyMax: s.buyMax, max: s.max, planLv, inSlot: stig ? cur.stigmaSlots.indexOf(id) + 1 : 0,
        tip: tipMd(tipText(s, Math.max(1, total))), tipNext: total && total < s.max ? tipMd(tipText(s, total + 1)) : "", next,
        specs: s.specs.map((x) => ({ text: x.text, unlock: x.unlock, open: total >= x.unlock, chosen: chosen.includes(x.id) })), specSlots: cls(c).specSlots };
    });
  }
  function enchQuote(st, p, ch, slot, to) {
    return withCtx(st, p, ch, (k) => {
      const g = k.cur.gear[slot]; if (!g || !g.name) return null;
      const d = enchData(g.slug), from = g.ench || 0, max = d ? d[0] : null;
      if (to == null) to = from + 1; if (max) to = Math.min(to, max);
      const cost = to > from ? enchCost(g.slug, from, to) : null, n = Math.max(0, to - from);
      const gain = (g.per || []).map(([kk, v]) => [kk, v * n]);
      const W = WEIGHTS.dps.w(k.sheet), WT = WEIGHTS.tank.w(k.sheet);
      return { slot, name: SLOTS.find((x) => x[0] === slot)[1], item: g.name, from, to, max, cost, steps: d ? d[1] : null,
        gain: gain.map(([kk, v]) => `${(SDEF[ALIAS[kk] || kk] || { label: kk }).label} +${fmtVal(ALIAS[kk] || kk, v)}`), dps: valueOf(gain, W), tank: valueOf(gain, WT), ilvl: n * (g.ilvlPer ?? 1), hasData: !!d };
    });
  }
  // жадно раскладываем бюджет кинаров по шагам заточки (лучшая польза на кинар — первой)
  function enchBudget(st, p, ch, kinah, mode) {
    return withCtx(st, p, ch, (k) => {
      const W = WEIGHTS[mode || "dps"].w(k.sheet), lv = {}, out = []; let left = kinah, guard = 0;
      SLOTS.forEach(([id]) => { const g = k.cur.gear[id]; if (g && g.name) lv[id] = g.ench || 0; });
      while (left > 0 && guard++ < 300) {
        let best = null;
        SLOTS.forEach(([id, name]) => {
          const g = k.cur.gear[id]; if (!g || !g.name || !g.per || !g.per.length) return;
          const d = enchData(g.slug); if (!d || lv[id] >= d[0]) return;
          const c = enchCost(g.slug, lv[id], lv[id] + 1); if (!c || c.gold > left) return;
          const v = valueOf(g.per, W); if (v <= 0) return;
          const score = v / Math.max(1, c.gold);
          if (!best || score > best.score) best = { id, name, item: g.name, c, v, score };
        });
        if (!best) break;
        lv[best.id]++; left -= best.c.gold;
        const last = out.find((o) => o.id === best.id);
        if (last) { last.to = lv[best.id]; last.gold += best.c.gold; last.v += best.v; } else out.push({ id: best.id, name: best.name, item: best.item, from: lv[best.id] - 1, to: lv[best.id], gold: best.c.gold, v: best.v });
      }
      return { rows: out, spent: kinah - left, left, unit: WEIGHTS[mode || "dps"].unit, total: out.reduce((a, r) => a + r.v, 0) };
    });
  }
  function planSetEnch(st, p, ch, slot, to) {
    return withCtx(st, p, ch, (k) => {
      const g = k.plan.gear[slot]; if (!g || !g.name) return false;
      const d = enchData(g.slug); to = Math.max(0, Math.min(d ? d[0] : 20, to));
      const dd = to - (g.ench || 0); if (!dd) return true;
      (g.per || []).forEach(([s, inc]) => { const m = g.main.find((x) => x[0] === s); if (m) m[1] = Math.round((+m[1] + inc * dd) * 10) / 10; });
      g.ilvl = Math.round(((+g.ilvl || 0) + (g.ilvlPer ?? 1) * dd) * 10) / 10; g.ench = to;
      ctx.save(); return true;
    });
  }
  // «заточил перчатки до +8» — меняем «Сейчас в игре»; план подтягиваем, если он не был выше
  function curSetEnch(st, p, ch, slot, to) {
    return withCtx(st, p, ch, (k) => {
      const apply = (g, v) => { const dd = v - (g.ench || 0); if (!dd) return; (g.per || []).forEach(([s2, inc]) => { const m = g.main.find((x) => x[0] === s2); if (m) m[1] = Math.round((+m[1] + inc * dd) * 10) / 10; }); g.ilvl = Math.round(((+g.ilvl || 0) + (g.ilvlPer ?? 1) * dd) * 10) / 10; g.ench = v; };
      const g = k.cur.gear[slot]; if (!g || !g.name) return null;
      const d = enchData(g.slug); to = Math.max(0, Math.min(d ? d[0] : 20, to));
      const from = g.ench || 0, pg = k.plan.gear[slot];
      apply(g, to);
      if (pg && pg.name === g.name && (pg.ench || 0) <= to) apply(pg, to);
      ctx.save(); return { from, to, item: g.name, name: SLOTS.find((x) => x[0] === slot)[1] };
    });
  }
  function planAddDv(st, p, ch, budget, board) {
    return withCtx(st, p, ch, (k) => {
      const picks = adviseDv(k.plan, WEIGHTS.dps.w(k.sheet), budget, k.level, board);
      picks.forEach((x) => { const arr = k.plan.dv[x.b.id] = k.plan.dv[x.b.id] || []; if (!arr.includes(x.n[0])) arr.push(x.n[0]); });
      ctx.save(); return picks.length;
    });
  }
  function dvBoardInfo(st, p, ch, board, budget) {
    return withCtx(st, p, ch, (k, c) => {
      const bd = cls(c).boards.find((b) => b.name === board); if (!bd) return null;
      const set = new Set(k.cur.dv[bd.id] || []), t = bd.nodes.filter((n) => !n[7]), g = t.filter((n) => set.has(n[0]));
      const picks = adviseDv(k.cur, WEIGHTS.dps.w(k.sheet), budget || 40, k.level, board).map((x) => ({ label: x.n[8], cost: x.n[5], val: x.val }));
      const sums = {}; g.forEach((n) => n[9].forEach(([kk, raw]) => sums[kk] = (sums[kk] || 0) + raw));
      return { name: bd.name, got: g.length, total: t.length, cost: g.reduce((a, n) => a + n[5], 0), costTotal: t.reduce((a, n) => a + n[5], 0), needLevel: bd.needLevel, open: k.level >= bd.needLevel, picks,
        sums: Object.entries(sums).map(([kk, raw]) => `${CD.statLabels[kk] || kk} +${fmtRule(kk, raw)}`) };
    });
  }
  function names(ch) { const c = cls(ch.cls); return { skills: c.skills.map((s) => [s.id, s.name, s.kind]), boards: c.boards.map((b) => b.name) }; }

  // ---------- v4: шаги роста GS, «что если», риск заточки, сохранение плана ----------
  // все возможные шаги заточки по порядку «дешевле всего за единицу уровня предмета» (по каждой вещи — по очереди)
  function ilvlSteps(st, p, ch, opt = {}) {
    return withCtx(st, p, ch, (k) => {
      const lv = {}, out = []; let cum = 0, cumGold = 0, guard = 0;
      SLOTS.forEach(([id]) => { const g = k.cur.gear[id]; if (g && g.name) lv[id] = g.ench || 0; });
      while (guard++ < 400) {
        let best = null;
        SLOTS.forEach(([id, name]) => {
          const g = k.cur.gear[id]; if (!g || !g.name) return; const d = enchData(g.slug); if (!d || lv[id] >= d[0]) return;
          const c = enchCost(g.slug, lv[id], lv[id] + 1); if (!c) return;
          const il = g.ilvlPer ?? 1, sc = c.gold / Math.max(.5, il);
          if (!best || sc < best.sc) best = { id, name, item: g.name, to: lv[id] + 1, gold: c.gold, ilvl: il, sc, risky: d[1][lv[id]][0] < 100, chance: d[1][lv[id]][0] };
        });
        if (!best) break;
        lv[best.id]++; cum += best.ilvl; cumGold += best.gold;
        out.push(Object.assign(best, { cum, cumGold }));
        if (opt.gain && cum >= opt.gain) break;
        if (opt.gold && cumGold >= opt.gold) break;
      }
      return out;
    });
  }
  function applyEnch(g, v) { const dd = v - (g.ench || 0); if (!dd) return; (g.per || []).forEach(([s2, inc]) => { const m = g.main.find((x) => x[0] === s2); if (m) m[1] = Math.round((+m[1] + inc * dd) * 10) / 10; }); g.ilvl = Math.round(((+g.ilvl || 0) + (g.ilvlPer ?? 1) * dd) * 10) / 10; g.ench = v; }
  function whatIf(st, p, ch, changes) {
    return withCtx(st, p, ch, (k, c) => {
      const snapX = clone(k.cur), rows = [];
      let gold = 0;
      (changes.ench || []).forEach(({ slot, to }) => {
        const g = snapX.gear[slot]; if (!g || !g.name) return;
        const d = enchData(g.slug); const t2 = Math.max(0, Math.min(d ? d[0] : 20, to)); const from = g.ench || 0;
        const cost = t2 > from ? enchCost(g.slug, from, t2) : null; if (cost) gold += cost.gold;
        applyEnch(g, t2); rows.push({ slot, name: SLOTS.find((x) => x[0] === slot)[1], item: g.name, from, to: t2, cost });
      });
      let picks = [];
      if (changes.crystals) { picks = adviseDv(snapX, WEIGHTS.dps.w(k.sheet), changes.crystals, k.level); picks.forEach((x) => { const arr = snapX.dv[x.b.id] = snapX.dv[x.b.id] || []; arr.push(x.n[0]); }); }
      if (changes.sockets) SLOTS.forEach(([id]) => { const g = snapX.gear[id]; if (g && g.name) while ((g.stones || []).filter((s) => s[0]).length < (g.sockets || 0)) { g.stones = g.stones || []; g.stones.push(["Critical", 7]); } });
      const A = contrib(c, k.cur), B = contrib(c, snapX), d = {};
      Object.keys(SDEF).forEach((x) => { const v = (B[x] || 0) - (A[x] || 0); if (v) d[x] = v; });
      const gs = Math.round((gearIlvl(snapX) - gearIlvl(k.cur)) + (stoneIlvl(snapX) - stoneIlvl(k.cur)));
      return { rows, gold, picks: picks.length, crystals: picks.reduce((a, x) => a + x.n[5], 0), gs, dps: valueOf(Object.entries(d), WEIGHTS.dps.w(k.sheet)), tank: valueOf(Object.entries(d), WEIGHTS.tank.w(k.sheet)),
        diff: Object.entries(d).slice(0, 8).map(([x, v]) => `${SDEF[x].label} ${sign(v)}${fmtVal(x, Math.abs(v))}`), snap: snapX };
    });
  }
  function savePlan(st, p, ch, snap, name) {
    return withCtx(st, p, ch, (k) => { const id = "p" + Math.random().toString(36).slice(2, 7); k.alt[id] = { name: String(name).slice(0, 30), snap: clone(snap) }; switchPlan(id); ctx.save(); return id; });
  }
  // Монте-Карло: распределение затрат на путь from → to (с гарантией и откатами)
  function enchSim(st, p, ch, slot, to, budget, runs = 3000) {
    return withCtx(st, p, ch, (k) => {
      const g = k.cur.gear[slot]; if (!g || !g.name) return null; const d = enchData(g.slug); if (!d) return null;
      const from = g.ench || 0; to = Math.min(to, d[0]); if (to <= from) return null;
      const steps = d[1], res = [];
      for (let r = 0; r < runs; r++) {
        let L = from, gold = 0, fails = 0, guard = 0;
        while (L < to && guard++ < 5000) {
          const [succ, bonus, pen, cost] = steps[L]; gold += cost;
          if (Math.random() * 100 < Math.min(100, succ + fails * bonus)) { L++; fails = 0; } else { fails++; if (pen < 0 && L > from) { L--; fails = 0; } }
        }
        res.push(gold);
      }
      res.sort((a, b) => a - b);
      const q = (x) => res[Math.min(res.length - 1, Math.floor(x * res.length))];
      return { from, to, p10: q(.1), p50: q(.5), p90: q(.9), max: res[res.length - 1], mean: res.reduce((a, b) => a + b, 0) / res.length, pBudget: budget ? res.filter((x) => x <= budget).length / res.length : null };
    });
  }

  const mountAuto = {};
  window.A2Calc = {
    mount(root, st, p, ch, save) {
      ctx = { root, st, p, ch, save }; ensure(p, ch); render();
      const k = p.calc;
      if (st.settings.autoUpdate && ch.armory && window.A2Import && !mountAuto[ch.id] && (!k.imported || Date.now() - k.imported.at > 864e5)) { mountAuto[ch.id] = 1; window.A2Import.refresh(ctx, applyImport, true); }
    },
    SLOTS, GRADES, rscText, slugFrom, fetchEnch, enchCost, aiSummary, analysis, skillInfo, enchQuote, enchBudget, planSetEnch, curSetEnch, ilvlSteps, whatIf, savePlan, enchSim, planAddDv, dvBoardInfo, names,
    _test: { enchCost, planEnchant, adviseDv, applyImport, valueOf, WEIGHTS, contrib, skillBonus, spentSkill, spentStigma, dvCost, prune, ensure, emptySnap, tipText, cls },
  };
})();
