/* Импорт персонажа из Armory (metabot.gg читает официальный сайт AION 2) */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const BASE = "https://metabot.gg";
  const REGIONS = [["eu", "Европа"], ["nae", "Северная Америка (восток)"], ["naw", "Северная Америка (запад)"], ["as", "Азия"], ["la", "Латинская Америка"]];
  // ключ класса в Armory: Ranger, Cleric, Gladiator…
  const CLASS_KEY = new Proxy({}, { get: (_, k) => window.A2CLS.armory(k) });
  const sameCls = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

  // слот на сайте → слот калькулятора
  const SLOT_POS = { 1: "weapon", 2: "offhand", 3: "helmet", 4: "shoulders", 5: "chest", 6: "pants", 7: "gloves", 8: "boots", 19: "cape",
    10: "necklace", 11: "earring1", 12: "earring2", 13: "ring1", 14: "ring2", 15: "bracelet", 16: "bracelet2", 17: "belt", 22: "amulet", 23: "rune1", 24: "rune2" };
  // английские подписи показателей предмета → ключи калькулятора
  const STAT = {
    "attack": "Attack", "defense": "DefenseMain", "hp": "HPMax", "mp": "MPMax", "accuracy": "Accuracy", "accuracy bonus": "Accuracy", "critical hit": "Critical",
    "critical hit resist": "CriticalResist", "combat speed": "CombatSpeed", "natural mp regen": "MPRegen", "natural hp regen": "HPRegen", "perfect chance": "PerfectHit",
    "damage tolerance": "DecreaseDamage", "block": "Block", "evasion": "Evasion", "evasion bonus": "Evasion", "might": "Power", "intelligence": "Intellect",
    "agility": "Agility", "vitality": "Vitality", "health": "Vitality", "precision": "Precision", "will": "Will", "penetration": "Pierce",
    "weapon damage boost": "WeaponDamage", "multi-hit chance": "AdditionalHitRate", "pve damage boost": "PvEAmplify", "damage boost": "AmplifyAllDamage",
    "critical damage boost": "AmplifyCriticalDamage", "critical hit damage boost": "AmplifyCriticalDamage", "cooldown reduction": "CoolTimeDecrease", "cooldown": "CoolTimeDecrease",
    "power hit chance": "PowerHit", "strike chance": "PowerHit", "boss damage boost": "BossAmplify", "move speed": "MoveSpeed", "movement speed": "MoveSpeed",
    "critical damage tolerance": "DecreaseCriticalDamage", "multi-hit resist": "AdditionalHitResistRate", "status effect resist": "AbnormalResistance",
    "status effect chance": "AbnormalAccuracy", "pvp damage boost": "PvPAmplifyDamage", "pvp damage tolerance": "PvPDecreaseDamage", "pvp attack": "PvPAddDamage",
    "pvp defense": "PvPDamageDefense", "pvp critical hit": "PvPCritical", "pvp critical hit resist": "PvPCriticalResist", "pvp accuracy": "PvPAccuracy", "pvp evasion": "PvPEvasion",
    "front attack": "FrontAttack", "back attack": "BackAttack", "pve damage tolerance": "PvEDecrease", "regeneration": "Regen",
  };
  const GRADE = { Common: "C", Rare: "R", Legend: "L", Unique: "U", Epic: "E", Mythic: "E", Special: "S" };
  const ATTR = { STR: "Power", DEX: "Agility", INT: "Intellect", CON: "Vitality", AGI: "Precision", WIS: "Will", Time: "GodTime", Destruction: "GodDestruction", Death: "GodDeath", Illusion: "GodIllusion", Wisdom: "GodWisdom" };
  // остальные божества (Справедливость, Свобода, Жизнь, Судьба, Пространство) — в «Прочие божества»
  const ATTR_OTHER = { Justice: 1, Freedom: 1, Life: 1, Destiny: 1, Space: 1 };

  const num = (v) => { if (v == null) return 0; const s = String(v).replace(/\s| /g, "").replace(",", "."); const r = /(-?\d+(?:\.\d+)?)(?:[–-](\d+(?:\.\d+)?))?/.exec(s); if (!r) return 0; return r[2] ? (+r[1] + +r[2]) / 2 : +r[1]; };
  const statKey = (label) => STAT[String(label || "").toLowerCase().trim()] || "";

  function grab(R, key) {
    const i = R.indexOf('"' + key + '":'); if (i < 0) return null;
    let j = i + key.length + 3, d = 0; const st = j;
    for (; j < R.length; j++) {
      const c = R[j];
      if (c === '"') { j++; while (j < R.length && R[j] !== '"') { if (R[j] === "\\") j++; j++; } }
      else if (c === "[" || c === "{") d++;
      else if (c === "]" || c === "}") { d--; if (d === 0) break; }
    }
    try { return JSON.parse(R.slice(st, j + 1)); } catch (e) { return null; }
  }

  // разбор страницы профиля
  function parseProfile(html) {
    const R = window.A2Calc.rscText(html);
    if (!R) throw new Error("Страница профиля пришла пустой");
    const out = { dv: {}, skills: [], slots: [], attrs: {} };
    const idm = /"serverId":(\d+),"characterId":"([^"]+)"/.exec(R);
    if (idm) { out.serverId = +idm[1]; out.charId = idm[2]; }
    const ks = R.indexOf("keyStats");
    if (ks > 0) { const dd = [...R.slice(ks, ks + 1500).matchAll(/"dd",null,\{"children":"([^"]+)"/g)].map((m) => m[1]); out.cp = dd[0]; out.ilvl = num(dd[1]); }
    const boards = grab(R, "boards") || [];
    // открытые ячейки Дэваниона: на странице есть не всегда — тогда догружаются по API для каждой доски
    out.boards = boards.map((b) => ({ id: b.id, openNodes: b.openNodes || 0, has: Array.isArray(b.open) }));
    boards.forEach((b) => { if (Array.isArray(b.open)) out.dv[b.id] = b.open.map(Number); });
    const reSk = /\["\$","li","(\d{8})",\{"children":\["\$","\$L[0-9a-z]+",null,\{"href":"[^"]*\/aion-2\/skills\/([a-z0-9-]+)"[\s\S]{0,1200}?skillLv","children":\["(\d+)[^"]*","([^"]*)"\]/g;
    let m; const seen = new Set();
    while ((m = reSk.exec(R))) { if (seen.has(m[1])) continue; seen.add(m[1]); out.skills.push([+m[1], +m[3], !!m[4].trim(), m[2]]); }
    const reSl = /"slotPos":(\d+),"label":"[^"]*","item":(null|\{"name":"([^"]*)","href":"\/aion-2\/items\/([a-z0-9-]+)")/g;
    while ((m = reSl.exec(R))) if (m[4]) out.slots.push([+m[1], m[4], m[3]]);
    const reAt = /"div","([A-Za-z_]+)",\{"children":\[\["\$","dt",null,\{"children":"[^"]+"\}\],\["\$","dd",null,\{"children":\[\["\$","span",null,\{"className":"[^"]*statValue","children":"(-?[\d.,]+)"/g;
    while ((m = reAt.exec(R))) {
      if (ATTR[m[1]]) out.attrs[ATTR[m[1]]] = num(m[2]);
      else if (ATTR_OTHER[m[1]]) out.attrs.GodOther = (out.attrs.GodOther || 0) + num(m[2]);
    }
    return out;
  }

  // предмет из ответа /api/aion-2/armory/item
  function buildItem(it, slot) {
    const g = { name: it.nameRu || it.name, grade: GRADE[it.grade] || "", ench: it.enchant || 0, main: [], per: [], bind: [], stones: [], sockets: it.manastoneSlots || 0, slug: (it.href || "").split("/").pop(), skipped: [] };
    const per = slot === "weapon" ? 2 : 1;
    g.ilvlPer = per;
    g.ilvl = (it.itemLevel || 0) + (it.enchant || 0) * per;
    (it.mainStats || []).forEach((s) => {
      const k = statKey(s.label); if (!k) { g.skipped.push(s.label); return; }
      const base = num(s.value), extra = num(s.extra);
      g.main.push([k, Math.round((base + extra) * 10) / 10]);
      if (extra && it.enchant) g.per.push([k, Math.round(extra / it.enchant * 100) / 100]);
    });
    (it.subStats || []).forEach((s) => { const k = statKey(s.label); if (k) g.bind.push([k, num(s.value)]); else g.skipped.push(s.label); });
    (it.manastones || []).forEach((s) => { const k = statKey(s.label); if (k) g.stones.push([k, num(s.value)]); else g.skipped.push(s.label); });
    // божественные камни (Theostones): это эффекты-срабатывания, а не показатели — сохраняем название и описание
    g.theo = []; g.theoSlots = it.godstoneSlots || 0;
    (it.godstones || []).forEach((s) => {
      const k = statKey(s.label);
      if (k && s.value != null) { g.bind.push([k, num(s.value)]); return; }
      g.theo.push({ name: String(s.label || "").replace(/^Theostone:\s*/i, "").trim(), detail: String(s.detail || "").trim() });
    });
    return g;
  }

  // ---------- окно импорта ----------
  let busy = false;
  function modal(html) {
    let m = $("#imp-modal");
    if (!m) { m = document.createElement("div"); m.id = "imp-modal"; m.className = "modal"; document.body.appendChild(m); m.addEventListener("mousedown", (e) => { if (e.target === m && !busy) close(); }); }
    m.innerHTML = `<div class="modal-card imp-card">${html}</div>`;
    m.hidden = false; requestAnimationFrame(() => m.classList.add("open"));
    return m;
  }
  function close() { const m = $("#imp-modal"); if (!m) return; m.classList.remove("open"); setTimeout(() => m.hidden = true, 200); }

  function open(ctx, apply) {
    const ch = ctx.ch, saved = ch.armory || {};
    const m = modal(`
      <h2>Импорт из игры</h2>
      <p class="muted small">Данные берутся с официального сайта AION 2 через Armory на metabot.gg: снаряжение с заточкой и камнями, умения, стигмы, доски Дэваниона, атрибуты. Сайт обновляет профиль, если копии больше 30 минут.</p>
      <div class="form imp-form">
        <label>Регион<select id="imp-region">${REGIONS.map(([k, l]) => `<option value="${k}" ${k === (saved.region || "eu") ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>Имя персонажа<input id="imp-name" value="${esc(saved.name || ch.name)}" maxlength="24"></label>
      </div>
      <div class="row gap"><button class="btn primary" id="imp-find">Найти</button><button class="btn ghost" id="imp-cancel">Отмена</button></div>
      <div id="imp-out" class="imp-out"></div>`);
    $("#imp-cancel", m).onclick = close;
    const find = async () => {
      const region = $("#imp-region", m).value, name = $("#imp-name", m).value.trim();
      if (name.length < 2) return;
      const out = $("#imp-out", m);
      out.innerHTML = `<p class="muted"><span class="spin"></span> Ищу «${esc(name)}»…</p>`;
      const r = await window.A2Net.get(`${BASE}/api/aion-2/armory/search?q=${encodeURIComponent(name)}&region=${region}&mode=nc`);
      if (!r || r.status !== 200) {
        const why = r && r.status === 429 ? "сайт просит подождать — слишком много запросов. Попробуй через минуту." : r && r.status === 403 ? "сайт отклонил запрос (403). Если повторится — открой профиль в браузере и напиши мне." : r && r.status === 0 ? "нет связи с metabot.gg (" + esc(r.error || "") + ")." : "ответ " + esc(r && r.status) + ".";
        out.innerHTML = `<p class="warn">Поиск не удался: ${why}</p>`; return;
      }
      let rows = []; try { rows = JSON.parse(r.body).rows || []; } catch (e) { }
      if (!rows.length) { out.innerHTML = `<p class="muted">Никого не нашлось в регионе «${esc(REGIONS.find((x) => x[0] === region)[1])}». Проверь имя и регион.</p>`; return; }
      out.innerHTML = `<ul class="imp-list">${rows.slice(0, 12).map((x, i) => `<li><button data-i="${i}" class="${sameCls(CLASS_KEY[ch.cls], x.classKey) ? "match" : ""}"><b>${esc(x.name)}</b><small>${esc(x.classKey)} · ${x.level} ур. · ${esc(x.serverName)} · ${x.race === "Dark" ? "Асмодиане" : "Элийцы"}</small></button></li>`).join("")}</ul>
        <label class="chk"><input type="checkbox" id="imp-plan" checked><span>Заодно сбросить план на импортированное</span></label>`;
      $$(".imp-list button", out).forEach((b) => b.onclick = () => load(ctx, apply, rows[+b.dataset.i], region));
    };
    $("#imp-find", m).onclick = find;
    $("#imp-name", m).onkeydown = (e) => { if (e.key === "Enter") find(); };
    setTimeout(() => $("#imp-name", m).focus(), 60);
  }

  // быстрое обновление уже привязанного персонажа
  function refresh(ctx, apply, quiet) {
    const a = ctx.ch.armory; if (!a) return open(ctx, apply);
    const m = modal(`<h2>Обновляю ${esc(a.name)}</h2><div id="imp-out" class="imp-out"></div>`);
    const row = { name: a.name, serverSlug: a.server, serverName: a.serverName || a.server, classKey: CLASS_KEY[ctx.ch.cls], level: (ctx.p.calc || {}).level || 45 };
    return load(ctx, apply, row, a.region, { resetPlan: false, quiet });
  }
  async function load(ctx, apply, row, region, o) {
    const m = $("#imp-modal"), out = $("#imp-out", m), resetPlan = o ? !!o.resetPlan : ($("#imp-plan", m) || {}).checked !== false;
    if (!sameCls(CLASS_KEY[ctx.ch.cls], row.classKey) && !confirm(`${row.name} — ${row.classKey}, а профиль в помощнике — ${window.A2CLS.name(ctx.ch.cls)}. Всё равно загрузить? Умения другого класса пропустятся.`)) return;
    busy = true;
    const step = (t) => out.innerHTML = `<p class="muted"><span class="spin"></span> ${esc(t)}</p>`;
    try {
      // просим сайт обновить профиль с официального сайта (раз в 10 минут; если рано — просто берём сохранённый)
      const key = String(row.key || "").split(".");
      if (row.serverId && key.length >= 3) {
        step("Обновляю профиль на сайте…");
        const rf = await window.A2Net.get(`${BASE}/api/aion-2/armory/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ region, server: row.serverId, id: key.slice(2).join(".") }) });
        if (rf && rf.status === 200) await new Promise((res) => setTimeout(res, 800));
      }
      step("Открываю профиль…");
      const url = `${BASE}/ru/aion-2/profile/${region}/${row.serverSlug}/${encodeURIComponent(row.name)}`;
      const r = await window.A2Net.get(url);
      if (!r || r.status !== 200) throw new Error("профиль не открылся (" + (r && (r.error || r.status)) + ")");
      const p = parseProfile(r.body);
      if (!p.charId) throw new Error("на странице нет данных персонажа");
      const need = (p.boards || []).filter((b) => !b.has && b.openNodes > 0);
      for (let i = 0; i < need.length; i++) {
        step(`Дэванион: доска ${i + 1} из ${need.length}`);
        const q = new URLSearchParams({ region, server: String(p.serverId), id: p.charId, board: String(need[i].id) });
        const dr = await window.A2Net.get(`${BASE}/api/aion-2/armory/daevanion?${q}`);
        try { const j = dr && dr.status === 200 ? JSON.parse(dr.body) : null; if (j && Array.isArray(j.openNodeIds)) p.dv[need[i].id] = j.openNodeIds.map(Number); } catch (e) { }
        await new Promise((res) => setTimeout(res, 120));
      }
      const dvMissing = need.filter((b) => !p.dv[b.id]).length;
      const gear = {}, skipped = new Set();
      for (let i = 0; i < p.slots.length; i++) {
        const [pos, slug, nameRu] = p.slots[i], slot = SLOT_POS[pos];
        if (!slot) continue;
        step(`Снаряжение ${i + 1} из ${p.slots.length}: ${nameRu}`);
        const q = new URLSearchParams({ region, server: String(p.serverId), id: p.charId, slot: String(pos), lang: "ru" });
        const ir = await window.A2Net.get(`${BASE}/api/aion-2/armory/item?${q}`);
        let it = null; try { it = ir && ir.status === 200 ? JSON.parse(ir.body) : null; } catch (e) { }
        if (!it) { gear[slot] = { name: nameRu, grade: "", ilvl: 0, ench: 0, main: [], per: [], ilvlPer: slot === "weapon" ? 2 : 1, bind: [], stones: [], sockets: 0, slug }; continue; }
        it.nameRu = nameRu;
        const g = buildItem(it, slot);
        g.skipped.forEach((x) => skipped.add(x)); delete g.skipped;
        (it.subSkills || []).forEach((s) => { const sk = p.skills.find((x) => x[3] === String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); if (sk) g.bind.push(["skill:" + sk[0], s.level || 1]); });
        gear[slot] = g;
        await new Promise((res) => setTimeout(res, 120));
      }
      const data = { dv: p.dv, gear, skills: p.skills, attrs: p.attrs, cp: p.cp, ilvl: p.ilvl, level: row.level, server: `${row.serverName} · ${REGIONS.find((x) => x[0] === region)[1]}`, url };
      const notes = apply(data, { resetPlan });
      ctx.ch.armory = { region, name: row.name, server: row.serverSlug, serverName: row.serverName };
      // GS в прогресс
      const app = window.A2App;
      if (app && p.ilvl) {
        const hist = ctx.p.history = ctx.p.history || []; const last = hist.filter((x) => x.gs).pop();
        const d = new Date(), z = (n) => String(n).padStart(2, "0");
        if (!last || last.gs !== p.ilvl) hist.push({ gs: p.ilvl, note: "импорт из Armory", ts: `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}` });
      }
      ctx.save();
      busy = false; close();
      const msg = [`Снаряжение: ${Object.keys(gear).length} предметов, умения и стигмы: ${p.skills.length}, Дэванион: ${Object.values(p.dv).reduce((a, x) => a + x.length, 0)} ячеек.`];
      if (dvMissing) msg.push(`Дэванион: не загрузилось досок — ${dvMissing}, попробуй «Обновить из игры» позже.`);
      if (skipped.size) msg.push("Не распознаны показатели: " + [...skipped].slice(0, 5).join(", ") + ".");
      if (notes.length) msg.push("Учтено: " + notes.join("; ") + ".");
      if (!(o && o.quiet)) window.A2Toast && A2Toast("Персонаж загружен", msg.join(" "), "ok");
      else window.A2Toast && A2Toast("Данные персонажа обновлены", `${row.name}: уровень предметов ${p.ilvl || "—"}, боевая мощь ${p.cp || "—"}.`, "ok");
      app && app.renderAll && app.renderAll();
    } catch (e) {
      busy = false;
      out.innerHTML = `<p class="warn">Не получилось: ${esc(e.message || e)}.</p><p class="muted small">Можно открыть профиль в браузере: <a href="#" id="imp-web">${esc(row.name)} на metabot.gg</a></p>`;
      const a = $("#imp-web", out); if (a) a.onclick = (ev) => { ev.preventDefault(); window.hostOpenURL ? window.hostOpenURL(`${BASE}/ru/aion-2/profile/${region}/${row.serverSlug}/${row.name}`) : window.open(`${BASE}/ru/aion-2/profile/${region}/${row.serverSlug}/${row.name}`); };
    }
  }

  window.A2Import = { open, refresh, parseProfile, buildItem, statKey, STAT };
})();
