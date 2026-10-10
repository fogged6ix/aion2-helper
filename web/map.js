/* Карта Альтгарда: тайлы, слои, легенда, поиск */
(function () {
  if (window.A2I18n) window.A2I18n.patchData(); // английские названия слоёв и точек
  const D = window.MAPDATA, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const app = () => window.A2App;
  const NZ = D.map.nativeZoom;
  let map, canvas, inited = false;
  const layerById = {}; D.layers.forEach((l, i) => layerById[l.id] = l);
  const areaById = {}; D.areas.forEach((a) => areaById[a[0]] = a);
  const groups = {};      // id → L.LayerGroup (built lazily)
  const CREATURE = "#ff3df2";

  // точки по категориям
  const byCat = D.cats.map(() => []);
  D.points.forEach((p, i) => byCat[p[2]].push(i));
  const catsOfLayer = {};
  D.cats.forEach((c, ci) => (catsOfLayer[c[4]] = catsOfLayer[c[4]] || []).push(ci));

  // ---------- глифы ----------
  const SH = {
    star: (c) => `<path d="M13 2.5l3 6.6 7.2.8-5.4 4.9 1.5 7.1L13 18.3 6.7 21.9l1.5-7.1L2.8 9.9l7.2-.8z" fill="${c}" stroke="#2a0d0d" stroke-width="1.4" stroke-linejoin="round"/>`,
    skull: (c) => `<path d="M13 3.5c-4.7 0-8 3.2-8 7.4 0 2.5 1.2 4.2 2.8 5.2V20h10.4v-3.9c1.6-1 2.8-2.7 2.8-5.2 0-4.2-3.3-7.4-8-7.4z" fill="${c}" stroke="#3a0d2a" stroke-width="1.4"/><circle cx="10" cy="11.5" r="1.8" fill="#3a0d2a"/><circle cx="16" cy="11.5" r="1.8" fill="#3a0d2a"/>`,
    gate: (c) => `<path d="M5 22V11a8 8 0 0116 0v11z" fill="${c}" stroke="#0d2142" stroke-width="1.5"/><path d="M9.5 22v-8a3.5 3.5 0 017 0v8z" fill="#0d2142"/>`,
    seal: (c) => `<path d="M13 2.8l8.6 5v10.2L13 23 4.4 18V7.8z" fill="${c}" stroke="#25124f" stroke-width="1.5"/><path d="M13 8.2l4 2.3v4.7L13 17.5l-4-2.3v-4.7z" fill="#25124f" opacity=".55"/>`,
    rift: (c) => `<circle cx="13" cy="13" r="9" fill="#2b1406" stroke="${c}" stroke-width="3"/><path d="M13 7.5c3 0 5 2.2 5 5s-2.5 4.6-4.8 4.6-3.6-1.5-3.6-3.3 1.3-2.8 2.8-2.8" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    wing: (c) => `<path d="M13 22c-1.2-3.8-5.8-6.1-8.8-12.6C8.4 11 11 13 13 15.6 15 13 17.6 11 21.8 9.4 18.8 15.9 14.2 18.2 13 22z" fill="${c}" stroke="#0d3530" stroke-width="1.4" stroke-linejoin="round"/><circle cx="13" cy="7" r="3" fill="${c}" stroke="#0d3530" stroke-width="1.4"/>`,
    mono: (c) => `<path d="M10 23V7l3-4.5L16 7v16z" fill="${c}" stroke="#3d2c06" stroke-width="1.5" stroke-linejoin="round"/><path d="M7 23h12" stroke="#3d2c06" stroke-width="2"/>`,
    cube: (c) => `<path d="M13 3.5l8 4.4v9.2l-8 4.4-8-4.4V7.9z" fill="${c}" stroke="#0b3540" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 7.9l8 4.4 8-4.4M13 12.3v9.2" fill="none" stroke="#0b3540" stroke-width="1.4"/>`,
    coin: (c) => `<circle cx="13" cy="13" r="8" fill="${c}" stroke="#3a2f10" stroke-width="1.5"/><path d="M13 8.5v9M10.5 10.5h4a1.8 1.8 0 010 3.6h-3a1.8 1.8 0 000 3.6h4" fill="none" stroke="#3a2f10" stroke-width="1.4"/>`,
    chest: (c) => `<rect x="5" y="9" width="16" height="11" rx="2" fill="${c}" stroke="#3a2f10" stroke-width="1.5"/><path d="M5 13h16M13 12v3" stroke="#3a2f10" stroke-width="1.5"/>`,
    dot: (c) => `<circle cx="13" cy="13" r="6" fill="${c}" stroke="#1b1b1b" stroke-width="1.5"/>`,
  };
  const glyph = (shape, color, size = 22) => `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 26 26">${(SH[shape] || SH.dot)(color)}</svg>`;

  const ll = (x, y) => map.unproject([x, y], NZ);
  const xy = (latlng) => map.project(latlng, NZ);

  function catName(ci) { const c = D.cats[ci]; return c[2] || c[1]; }
  function pointTitle(pi) {
    const p = D.points[pi], c = D.cats[p[2]];
    if (p[4] >= 0 && ["teleports", "dungeons", "merchants", "storage", "monoliths"].includes(c[4])) return D.labels[p[4]];
    return c[2] || c[1];
  }
  function popupHtml(pi) {
    const p = D.points[pi], c = D.cats[p[2]], lay = layerById[c[4]] || { name: "Мобы", color: CREATURE, note: "" };
    const a = areaById[p[3]];
    const title = pointTitle(pi);
    const sub = [];
    if (c[2] && c[2] !== title) sub.push(c[1]); else if (title !== c[1] && c[4] !== "dungeons" && c[4] !== "teleports") sub.push(c[1]);
    if (c[3]) sub.push(c[3]);
    if (a) sub.push(a[2] || a[1]);
    let extra = "";
    if (p[4] >= 0 && c[4] === "cubes") extra = D.labels[p[4]];
    const n = byCat[p[2]].length;
    return `<div class="pp-t">${esc(title)}</div>
      <div class="pp-s">${esc(sub.join(" · "))}</div>
      ${lay.note ? `<div class="pp-n">${esc(lay.note)}</div>` : ""}
      ${extra ? `<div class="pp-n">${esc(extra)}</div>` : ""}
      <span class="pp-tag" style="color:${lay.color};border-color:${lay.color}">${esc(lay.name)}${n > 1 ? " · " + n + " точек" : ""}</span>
      <div class="pp-c">X ${p[0]} · Y ${p[1]}</div>`;
  }

  function buildGroup(id) {
    if (groups[id]) return groups[id];
    if (id.startsWith("u:")) { groups[id] = L.layerGroup(); return groups[id]; }
    const g = L.layerGroup();
    let cis, lay;
    if (id.startsWith("c:")) { cis = [D.cats.findIndex((c) => c[0] === id.slice(2))]; lay = { shape: "dot", color: CREATURE }; }
    else { cis = catsOfLayer[id] || []; lay = layerById[id]; }
    const iconic = lay.shape !== "dot";
    for (const ci of cis) for (const pi of byCat[ci]) {
      const p = D.points[pi];
      let m;
      if (iconic) {
        const lvl = lay.id === "sealed" && D.cats[ci][3] ? `<span class="mk-lvl">${D.cats[ci][3].replace("Ур. ", "")}</span>` : "";
        const big = lay.id === "bosses" ? 34 : 26;
        m = L.marker(ll(p[0], p[1]), {
          icon: L.divIcon({ className: "mk", html: glyph(lay.shape, lay.color, big) + lvl, iconSize: [big, big], iconAnchor: [big / 2, big / 2], popupAnchor: [0, -big / 2] }),
          riseOnHover: true, title: pointTitle(pi),
        });
      } else {
        m = L.circleMarker(ll(p[0], p[1]), { renderer: canvas, radius: 4.5, color: "#1f1a14", weight: 1.2, fillColor: lay.color, fillOpacity: .95 });
      }
      m.bindPopup(() => popupHtml(pi), { maxWidth: 300, autoPanPadding: [340, 40] });
      m._pi = pi;
      g.addLayer(m);
    }
    groups[id] = g;
    return g;
  }
  function onState() { const s = app().state.ui; s.map = s.map || {}; s.map.on = s.map.on || {}; return s.map.on; }
  function isOn(id) {
    const on = onState();
    if (id.startsWith("u:")) return on[id] !== false;
    if (id in on) return on[id];
    const l = layerById[id];
    return !!(l && l.on);
  }
  function setOn(id, v, quiet) {
    onState()[id] = v;
    const g = buildGroup(id);
    if (v) g.addTo(map); else map.removeLayer(g);
    if (!quiet) { syncLegend(); persist(); }
  }
  let pT = 0;
  function persist() { clearTimeout(pT); pT = setTimeout(() => { const s = app().state.ui.map; const c = map.getCenter(); s.view = [xy(c).x, xy(c).y, map.getZoom()]; window.A2App && window.A2App.state && document.dispatchEvent(new Event("a2save")); }, 300); }

  // ---------- легенда ----------
  function legendItem(id, name, color, shape, cnt, note, lvl) {
    return `<button class="lg-item ${isOn(id) ? "" : "off"}" data-id="${esc(id)}">
      ${glyph(shape, color, 20)}<span class="nm">${esc(name)}${lvl ? ` <span class="ct">${esc(lvl)}</span>` : ""}</span><span class="ct">${cnt}</span>
      <svg class="ic eye"><use href="#i-eye"/></svg>${note ? `<span class="note">${esc(note)}</span>` : ""}</button>`;
  }
  function renderLegend() {
    const main = D.layers.filter((l) => l.group === "main"), gat = D.layers.filter((l) => l.group === "gather");
    const cnt = (id) => (catsOfLayer[id] || []).reduce((a, ci) => a + byCat[ci].length, 0);
    const creatures = (catsOfLayer.creatures || []).slice().sort((a, b) => lvlNum(D.cats[a][3]) - lvlNum(D.cats[b][3]) || D.cats[a][1].localeCompare(D.cats[b][1]));
    const open = app().state.ui.map.open || { main: true };
    $("#legend-body").innerHTML = `
      <div class="lg-group ${open.main ? "open" : ""}" data-g="main">
        <div class="lg-head"><button class="lg-tog"><svg class="ic sm chev"><use href="#i-chev"/></svg> Главное</button><button class="all" data-all="main">все / ничего</button></div>
        <div class="lg-items">${main.map((l) => legendItem(l.id, l.name, l.color, l.shape, cnt(l.id), l.note)).join("")}</div>
      </div>
      <div class="lg-group ${open.gather ? "open" : ""}" data-g="gather">
        <div class="lg-head"><button class="lg-tog"><svg class="ic sm chev"><use href="#i-chev"/></svg> Сбор ресурсов</button><button class="all" data-all="gather">все / ничего</button></div>
        <div class="lg-items">${gat.map((l) => legendItem(l.id, l.name, l.color, "dot", cnt(l.id), l.note)).join("")}</div>
      </div>
      <div class="lg-group ${open.mine !== false ? "open" : ""}" data-g="mine">
        <div class="lg-head"><button class="lg-tog"><svg class="ic sm chev"><use href="#i-chev"/></svg> Мои отметки</button></div>
        <div class="lg-items">${legendItem("u:marks", "Метки и заметки", "#ffd75a", "dot", userData().marks.length, "Правый клик по карте или кнопка «метка» справа")}${legendItem("u:routes", "Маршруты", "#7ef0c8", "dot", userData().routes.length, "Кнопка «маршрут»: кликай точки, Enter — готово")}
          <div class="u-list">${userData().routes.map((r) => `<button class="u-route" data-r="${r.id}"><svg class="ic sm"><use href="#i-route"/></svg>${esc(r.name)} <small>${r.pts.length} точ.</small></button>`).join("")}</div></div>
      </div>
      <div class="lg-group ${open.mobs ? "open" : ""}" data-g="mobs">
        <div class="lg-head"><button class="lg-tog"><svg class="ic sm chev"><use href="#i-chev"/></svg> Мобы (${creatures.length})</button><button class="all" data-all="mobs">скрыть всех</button></div>
        <div class="lg-items"><input class="lg-filter" id="mob-filter" placeholder="Фильтр: имя или уровень, напр. 45">
          <div id="mob-list">${creatures.map((ci) => legendItem("c:" + D.cats[ci][0], D.cats[ci][1], CREATURE, "dot", byCat[ci].length, "", D.cats[ci][3])).join("")}</div></div>
      </div>`;
    $$(".lg-tog").forEach((b) => b.onclick = () => {
      const g = b.closest(".lg-group"); g.classList.toggle("open");
      const o = app().state.ui.map.open = app().state.ui.map.open || {}; o[g.dataset.g] = g.classList.contains("open"); persist();
    });
    $("#legend-body").addEventListener("click", (e) => {
      const ur = e.target.closest(".u-route");
      if (ur) { const r = userData().routes.find((x) => x.id === ur.dataset.r); if (r) { setOn("u:routes", true); map.flyToBounds(L.latLngBounds(r.pts.map((p) => ll(p[0], p[1]))).pad(.25), { paddingTopLeft: [340, 20], maxZoom: 4.5, duration: .8 }); } return; }
      const it = e.target.closest(".lg-item");
      if (it) { setOn(it.dataset.id, !isOn(it.dataset.id)); return; }
      const all = e.target.closest("[data-all]");
      if (all) {
        const k = all.dataset.all;
        const ids = k === "main" ? main.map((l) => l.id) : k === "gather" ? gat.map((l) => l.id) : creatures.map((ci) => "c:" + D.cats[ci][0]);
        const anyOn = ids.some(isOn);
        ids.forEach((id) => setOn(id, k === "mobs" ? false : !anyOn, true));
        syncLegend(); persist();
      }
    });
    $("#mob-filter").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$("#mob-list .lg-item").forEach((b) => b.style.display = !q || b.textContent.toLowerCase().includes(q) ? "" : "none");
    });
  }
  function syncLegend() { $$(".lg-item").forEach((b) => b.classList.toggle("off", !isOn(b.dataset.id))); }
  const lvlNum = (s) => +((/(\d+)/.exec(s || "") || [0, 999])[1]);

  // ---------- поиск ----------
  const index = [];
  function buildIndex() {
    const add = (title, sub, kind, color, shape, act, extra = "") => index.push({ title, sub, color, shape, act, hay: (title + " " + sub + " " + extra).toLowerCase(), kind });
    D.layers.forEach((l) => add(l.name, "Слой карты · показать все точки", "layer", l.color, l.shape, { layer: l.id }, l.en || ""));
    D.cats.forEach((c, ci) => {
      const lay = layerById[c[4]];
      const n = byCat[ci].length;
      if (c[4] === "creatures") { add(c[1], `Моб · ${c[3] || "ур. ?"} · ${n} точек`, "mob", CREATURE, "dot", { mob: c[0] }); return; }
      if (["teleports", "dungeons", "merchants", "storage", "monoliths", "cubes"].includes(c[4]) && n > 1) {
        if (c[4] === "merchants" || c[4] === "cubes") return;
        byCat[ci].forEach((pi) => { const p = D.points[pi], a = areaById[p[3]]; add(pointTitle(pi), lay.name + (a ? " · " + (a[2] || a[1]) : ""), "point", lay.color, lay.shape, { point: pi }); });
        return;
      }
      if (lay && lay.group === "gather") return;
      if (n === 1) { const p = D.points[byCat[ci][0]], a = areaById[p[3]]; add(c[2] || c[1], [c[2] ? c[1] : "", lay ? lay.name : "", c[3], a ? (a[2] || a[1]) : ""].filter(Boolean).join(" · "), "point", lay.color, lay.shape, { point: byCat[ci][0] }); }
    });
    D.areas.forEach((a) => add(a[2] || a[1], a[2] ? a[1] + " · район" : "Район", "area", "#eadcbc", "dot", { area: a[0] }, a[1]));
    const B = window.A2Bosses, X = window.EXTRA;
    if (B && X) X.items.forEach((it, i) => { const src = B.sourceList(i, 99); if (!src.length) return; add(it[0], `Добыча · ${src.length} ${src.length === 1 ? "источник" : "источн."} · лучший шанс ${String(src[0][1]).replace(".", ",")}%`, "item", ITEM_C[it[1]] || "#c9c3d6", "chest", { item: i }, "предмет добыча дроп"); });
    userData().marks.forEach((m) => add(m.t || "Метка", "Моя метка", "mark", "#ffd75a", "dot", { mark: m.id }));
    // русские синонимы
    const syn = { "босс": "bosses", "боссы": "bosses", "плавильный": "bosses", "разлом": "rifts", "куб": "cubes", "телепорт": "teleports", "орихалк": "gather-orichalcum", "одила": "gather-odyle", "запечат": "sealed", "монолит": "monoliths", "торгов": "merchants", "склад": "storage", "перья": "traces", "следы": "traces" };
    index.forEach((e) => { for (const [k, v] of Object.entries(syn)) if (e.act.layer === v) e.hay += " " + k; });
  }
  let results = [], sel = 0;
  function search(q) {
    const ul = $("#map-results");
    q = q.trim().toLowerCase();
    if (!q) { ul.classList.remove("open"); ul.innerHTML = ""; return; }
    const words = q.split(/\s+/);
    results = index.map((e) => {
      if (!words.every((w) => e.hay.includes(w))) return null;
      const t = e.title.toLowerCase();
      let s = t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
      s += { point: 0, layer: .1, area: .2, mob: .3, mark: .05, item: .4 }[e.kind] || 0;
      return [s, e];
    }).filter(Boolean).sort((a, b) => a[0] - b[0] || a[1].title.length - b[1].title.length).slice(0, 40).map((x) => x[1]);
    sel = 0;
    const hl = (s) => { const i = s.toLowerCase().indexOf(words[0]); return i < 0 ? esc(s) : esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + words[0].length)) + "</mark>" + esc(s.slice(i + words[0].length)); };
    ul.innerHTML = results.length ? results.map((e, i) => `<li data-i="${i}" class="${i === 0 ? "sel" : ""}"><span class="g">${glyph(e.shape, e.color, 20)}</span><b>${hl(e.title)}</b><small>${esc(e.sub)}</small></li>`).join("")
      : `<span class="none">Ничего не нашлось. Попробуй английское название — у мобов и сундуков на карте они английские.</span>`;
    ul.classList.add("open");
  }
  function choose(e) {
    if (!e) return;
    $("#map-results").classList.remove("open");
    map.closePopup();
    const a = e.act;
    if (a.point != null) {
      const p = D.points[a.point], c = D.cats[p[2]];
      if (!isOn(c[4])) setOn(c[4], true);
      flyAndPulse(p[0], p[1], 4.6, () => {
        const g = groups[c[4]]; let mk = null;
        g && g.eachLayer((m) => { if (m._pi === a.point) mk = m; });
        mk && mk.openPopup();
      });
    } else if (a.layer) {
      setOn(a.layer, true);
      fitIds(catsOfLayer[a.layer] || []);
    } else if (a.mob) {
      const id = "c:" + a.mob; setOn(id, true);
      fitIds([D.cats.findIndex((c) => c[0] === a.mob)]);
    } else if (a.area) {
      const ar = areaById[a.area]; flyAndPulse(ar[3], ar[4], 4);
    } else if (a.item != null) {
      showDrops(a.item);
    } else if (a.mark) {
      const m = userData().marks.find((x) => x.id === a.mark); if (!m) return;
      setOn("u:marks", true); flyAndPulse(m.x, m.y, 4.5, () => { groups["u:marks"].eachLayer((mk) => { if (mk._mid === m.id) mk.openPopup(); }); });
    }
  }
  function fitIds(cis) {
    const pts = []; cis.forEach((ci) => byCat[ci].forEach((pi) => pts.push(ll(D.points[pi][0], D.points[pi][1]))));
    if (!pts.length) return;
    if (pts.length === 1) return flyAndPulse(...[xy(pts[0]).x, xy(pts[0]).y], 4.5);
    map.flyToBounds(L.latLngBounds(pts).pad(.15), { paddingTopLeft: [340, 20], maxZoom: 4.5, duration: .8 });
  }
  function flyAndPulse(x, y, z, after) {
    const target = ll(x, y);
    const off = map.getSize().x > 900 ? 160 : 0;
    const pt = map.project(target, z).subtract([off, 0]);
    map.flyTo(map.unproject(pt, z), z, { duration: .9 });
    map.once("moveend", () => {
      const pm = L.marker(target, { interactive: false, icon: L.divIcon({ className: "pulse", html: "<i></i><i></i>", iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(map);
      setTimeout(() => map.removeLayer(pm), 4200);
      after && after();
    });
  }

  // ---------- фильтр от помощника: показать только нужное ----------
  let savedOn = null;
  function only(ids, label, opts = {}) {
    if (!inited) { window.A2Map.show(); setTimeout(() => only(ids, label, opts), 450); return; }
    if (!savedOn) savedOn = Object.assign({}, onState(), Object.fromEntries(D.layers.map((l) => [l.id, isOn(l.id)])));
    const md = $("#map-drop"); if (md) md.hidden = true;
    const all = D.layers.map((l) => l.id).concat(Object.keys(onState()).filter((k) => k.startsWith("c:")));
    all.forEach((id) => { if (!ids.includes(id) && isOn(id)) setOn(id, false, true); });
    ids.forEach((id) => setOn(id, true, true));
    syncLegend(); persist();
    const bar = $("#map-filter");
    bar.innerHTML = `<svg class="ic sm"><use href="#i-ai"/></svg><span>Помощник показывает: <b>${esc(label || "выбранное")}</b></span><button class="btn sm" id="mf-restore">Вернуть все слои</button>`;
    bar.hidden = false;
    $("#mf-restore").onclick = restore;
    if (opts.area) focusArea(opts.area);
    else if (opts.cat) window.A2Map.focusCat(opts.cat);
    else { const cis = ids.flatMap((id) => id.startsWith("c:") ? [D.cats.findIndex((c) => c[0] === id.slice(2))] : (catsOfLayer[id] || [])).filter((ci) => ci >= 0); if (cis.length) fitIds(cis); }
  }
  // маршрут обхода точек слоя (ближайший сосед от «ты здесь»), сохраняется в «Мои маршруты»
  function routeThrough(layerIds, name) {
    if (!inited) { window.A2Map.show(); setTimeout(() => routeThrough(layerIds, name), 450); return 0; }
    let pts = []; layerIds.forEach((id) => (catsOfLayer[id] || []).forEach((ci) => byCat[ci].forEach((pi) => pts.push([D.points[pi][0], D.points[pi][1]]))));
    if (!pts.length) return 0;
    if (pts.length > 30) pts = pts.slice(0, 30);
    const order = []; let cur = [D.you[0], D.you[1]];
    while (pts.length) { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); cur = pts.splice(bi, 1)[0]; order.push(cur); }
    const full = [[D.you[0], D.you[1]]].concat(order);
    const u = userData(); u.routes = u.routes.filter((r) => r.name !== name);
    u.routes.push({ id: Math.random().toString(36).slice(2, 9), name, pts: full.map((p) => [Math.round(p[0]), Math.round(p[1])]) });
    saveUser(true); renderLegend();
    only(layerIds.concat(["u:routes"]), name);
    return order.length;
  }
  function restore() {
    if (savedOn) { Object.entries(savedOn).forEach(([id, v]) => setOn(id, !!v, true)); Object.keys(onState()).forEach((id) => { if (!(id in savedOn)) setOn(id, false, true); }); syncLegend(); persist(); }
    savedOn = null; const bar = $("#map-filter"); if (bar) bar.hidden = true;
  }
  function focusArea(name) {
    const n = String(name).toLowerCase();
    const a = D.areas.find((x) => (x[2] || "").toLowerCase() === n) || D.areas.find((x) => (x[2] || x[1] || "").toLowerCase().includes(n) || n.includes((x[2] || "").toLowerCase().slice(0, 8)) && x[2]);
    if (a) { flyAndPulse(a[3], a[4], 3.6); return true; } return false;
  }

  // ---------- мои метки и маршруты ----------
  const ITEM_C = { C: "#c9c3d6", R: "#5fd08a", L: "#5aa8ff", U: "#ff9a3c", E: "#e05cff", S: "#38e0d0" };
  function userData() { const s = app().state.ui; s.map = s.map || {}; const u = s.map.user = s.map.user || {}; u.marks = u.marks || []; u.routes = u.routes || []; return u; }
  const uid = () => Math.random().toString(36).slice(2, 9);
  let tool = null, draft = [], draftLine = null;
  function drawUser() {
    const gm = buildGroup("u:marks"), gr = buildGroup("u:routes");
    gm.clearLayers(); gr.clearLayers();
    userData().marks.forEach((m) => {
      const mk = L.marker(ll(m.x, m.y), { draggable: true, title: m.t, icon: L.divIcon({ className: "umark", html: `<i style="--c:${m.c || "#ffd75a"}"></i>${m.t ? `<span>${esc(m.t)}</span>` : ""}`, iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -20] }) });
      mk._mid = m.id;
      mk.bindPopup(() => {
        const el = document.createElement("div");
        el.innerHTML = `<div class="pp-t">${esc(m.t || "Метка")}</div>${m.n ? `<div class="pp-n">${esc(m.n)}</div>` : ""}<div class="pp-c">X ${Math.round(m.x)} · Y ${Math.round(m.y)}</div>
          <div class="pp-act"><button class="btn sm" data-e>Изменить</button><button class="btn sm ghost" data-d>Удалить</button></div>`;
        el.querySelector("[data-e]").onclick = () => { const t = prompt("Название метки:", m.t || ""); if (t == null) return; const n = prompt("Заметка (необязательно):", m.n || ""); m.t = t.trim().slice(0, 40); m.n = (n || "").trim().slice(0, 300); saveUser(); };
        el.querySelector("[data-d]").onclick = () => { userData().marks = userData().marks.filter((x) => x !== m); saveUser(); };
        return el;
      });
      mk.on("dragend", () => { const p = xy(mk.getLatLng()); m.x = Math.round(p.x); m.y = Math.round(p.y); saveUser(true); });
      gm.addLayer(mk);
    });
    userData().routes.forEach((r) => {
      const pts = r.pts.map((p) => ll(p[0], p[1]));
      const line = L.polyline(pts, { color: r.c || "#7ef0c8", weight: 3.5, opacity: .9, dashArray: "8 7", className: "uroute" });
      line.bindPopup(() => {
        const el = document.createElement("div");
        el.innerHTML = `<div class="pp-t">${esc(r.name)}</div><div class="pp-s">Маршрут · ${r.pts.length} точек</div><div class="pp-act"><button class="btn sm" data-e>Переименовать</button><button class="btn sm ghost" data-d>Удалить</button></div>`;
        el.querySelector("[data-e]").onclick = () => { const t = prompt("Название маршрута:", r.name); if (t && t.trim()) { r.name = t.trim().slice(0, 40); saveUser(); } };
        el.querySelector("[data-d]").onclick = () => { userData().routes = userData().routes.filter((x) => x !== r); saveUser(); };
        return el;
      });
      gr.addLayer(line);
      pts.forEach((p, i) => gr.addLayer(L.marker(p, { interactive: false, icon: L.divIcon({ className: "uvert", html: `<b>${i + 1}</b>`, iconSize: [18, 18], iconAnchor: [9, 9] }) })));
    });
  }
  function saveUser(quiet) { map.closePopup(); drawUser(); if (!quiet) renderLegend(); index.length = 0; buildIndex(); document.dispatchEvent(new Event("a2save")); }
  function setTool(t) {
    if (tool === "route" && t !== "route") finishRoute(true);
    tool = tool === t ? null : t;
    $$(".map-tools [data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool));
    map.getContainer().classList.toggle("placing", !!tool);
    tool === "route" ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();
    const hint = $("#map-hint");
    hint.hidden = !tool;
    hint.innerHTML = tool === "mark" ? "Кликни по карте, чтобы поставить метку · Esc — отмена" : tool === "route" ? "Кликай точки маршрута · Enter или двойной клик — готово · Backspace — убрать точку · Esc — отмена" : "";
  }
  function addMark(x, y) {
    const t = prompt("Название метки (например: «спот орихалка», «пещера с кубом»):", "");
    if (t == null) return;
    userData().marks.push({ id: uid(), x: Math.round(x), y: Math.round(y), t: t.trim().slice(0, 40), c: "#ffd75a" });
    setOn("u:marks", true, true); saveUser();
  }
  function drawDraft() {
    if (draftLine) map.removeLayer(draftLine);
    draftLine = draft.length ? L.polyline(draft.map((p) => ll(p[0], p[1])), { color: "#7ef0c8", weight: 3, dashArray: "4 6" }).addTo(map) : null;
  }
  function finishRoute(cancel) {
    const pts = draft.slice(); draft = []; drawDraft();
    if (cancel || pts.length < 2) return;
    const name = prompt("Название маршрута:", "Маршрут " + (userData().routes.length + 1));
    if (name == null) return;
    userData().routes.push({ id: uid(), name: (name.trim() || "Маршрут").slice(0, 40), pts });
    setOn("u:routes", true, true); saveUser();
  }
  function initTools() {
    map.on("click", (e) => {
      if (!tool) return;
      const p = xy(e.latlng);
      if (tool === "mark") { setTool(null); addMark(p.x, p.y); }
      else if (tool === "route") { draft.push([Math.round(p.x), Math.round(p.y)]); drawDraft(); }
    });
    map.on("dblclick", () => { if (tool === "route") { draft.pop(); finishRoute(); setTool(null); } });
    map.on("contextmenu", (e) => { const p = xy(e.latlng); addMark(p.x, p.y); });
    document.addEventListener("keydown", (e) => {
      if (!tool || app().state.ui.view !== "map") return;
      if (e.target.closest && e.target.closest("input, textarea")) return;
      if (e.key === "Escape") setTool(null);
      else if (e.key === "Enter" && tool === "route") { finishRoute(); setTool(null); }
      else if (e.key === "Backspace" && tool === "route") { e.preventDefault(); draft.pop(); drawDraft(); }
    });
    $$(".map-tools [data-tool]").forEach((b) => b.onclick = () => setTool(b.dataset.tool));
    drawUser();
    ["u:marks", "u:routes"].forEach((id) => { if (isOn(id)) buildGroup(id).addTo(map); });
  }

  // ---------- где падает предмет ----------
  function showDrops(i) {
    const X = window.EXTRA, B = window.A2Bosses; if (!X || !B) return;
    const it = X.items[i], box = $("#map-drop");
    const src = B.sourceList(i, 12);
    box.innerHTML = `<div class="md-head"><b style="color:${ITEM_C[it[1]] || "#c9c3d6"}">${esc(it[0])}</b><button class="ib" data-x title="Закрыть"><svg class="ic sm"><use href="#i-close"/></svg></button></div>
      <ul>${src.map(([m, ch]) => `<li ${m[5] ? `data-cat="${m[5]}"` : ""}><span>${esc(m[1])}<small>${m[2]} ур. · ${esc((m[4] || []).slice(0, 2).join(", "))}</small></span><b>${String(ch).replace(".", ",")}%</b><small class="k90">${B.kills90(ch)}</small></li>`).join("")}</ul>
      <p class="muted small">Шансы — из таблиц добычи клиента (metabot.gg). Нажми на монстра, чтобы показать его на карте.</p>`;
    box.hidden = false;
    $("[data-x]", box).onclick = () => box.hidden = true;
    $$("li[data-cat]", box).forEach((li) => li.onclick = () => window.A2Map.focusCat(li.dataset.cat));
    const first = src.find(([m]) => m[5]); if (first) window.A2Map.focusCat(first[0][5]);
  }

  // ---------- подписи районов ----------
  let areaLayerBig, areaLayerAll;
  function buildAreas() {
    areaLayerBig = L.layerGroup(); areaLayerAll = L.layerGroup();
    D.areas.forEach((a) => {
      const big = !!a[2];
      const html = big ? `${esc(a[2])}<small>${esc(a[1])}</small>` : esc(a[1]);
      const m = L.marker(ll(a[3], a[4]), { interactive: false, keyboard: false, icon: L.divIcon({ className: "area-label", html, iconSize: null }) });
      (big ? areaLayerBig : areaLayerAll).addLayer(m);
    });
    const upd = () => {
      const z = map.getZoom();
      z >= 2 ? areaLayerBig.addTo(map) : map.removeLayer(areaLayerBig);
      z >= 4 ? areaLayerAll.addTo(map) : map.removeLayer(areaLayerAll);
      const el = map.getContainer(); el.classList.toggle('zl', z < 2.75); el.classList.toggle('zm', z >= 2.75 && z < 3.75);
      const r = z >= 5 ? 6 : z >= 4 ? 5 : z >= 3 ? 4 : 3;
      Object.values(groups).forEach((g) => g.eachLayer((m) => m.setRadius && m.setRadius(r)));
    };
    map.on("zoomend", upd); upd();
  }

  function init() {
    inited = true;
    const b = D.map.bounds;
    map = L.map("map", { crs: L.CRS.Simple, minZoom: 1.25, maxZoom: 7, zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 90, attributionControl: false, zoomControl: false, preferCanvas: false });
    L.control.zoom({ position: "topright", zoomInTitle: "Приблизить", zoomOutTitle: "Отдалить" }).addTo(map);
    canvas = L.canvas({ padding: .3 });
    const bounds = L.latLngBounds(ll(b[0][0], b[0][1]), ll(b[1][0], b[1][1]));
    L.tileLayer("tiles/{z}/{x}/{y}.webp", { minZoom: 0, maxZoom: 7, maxNativeZoom: NZ, minNativeZoom: 0, tileSize: 256, noWrap: true, bounds, keepBuffer: 4,
      errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" }).addTo(map);
    map.setMaxBounds(bounds.pad(.08));
    const saved = (app().state.ui.map || {}).view;
    if (saved) map.setView(map.unproject([saved[0], saved[1]], NZ), saved[2]);
    else map.fitBounds(L.latLngBounds(ll(1900, 1900), ll(6400, 6600)), { paddingTopLeft: [330, 10] });

    // «ты здесь»
    L.marker(ll(D.you[0], D.you[1]), { icon: L.divIcon({ className: "you", html: "<i></i><i></i>", iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000, title: "Ты здесь" })
      .bindPopup(`<div class="pp-t">Ты здесь</div><div class="pp-s">Кровавый утес · Battlescar Mound</div><div class="pp-n">Рядом вход в Ущелье ауругу; ближайшие разломы — восточный кластер у Руин Васфельта.</div>`).addTo(map);

    D.layers.forEach((l) => { if (isOn(l.id)) setOn(l.id, true, true); });
    Object.keys(onState()).forEach((id) => { if (id.startsWith("c:") && onState()[id]) setOn(id, true, true); });
    buildAreas();
    buildIndex();
    renderLegend();
    initTools();

    map.on("moveend", persist);
    map.on("mousemove", (e) => { const p = xy(e.latlng); $("#coords").textContent = `X ${Math.round(p.x)} · Y ${Math.round(p.y)}`; });
    $("#map-you").onclick = () => flyAndPulse(D.you[0], D.you[1], 4.25);
    const q = $("#map-q");
    q.addEventListener("input", () => search(q.value));
    q.addEventListener("focus", () => q.value && search(q.value));
    q.addEventListener("keydown", (e) => {
      const lis = $$("#map-results li");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!lis.length) return;
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + lis.length) % lis.length;
        lis.forEach((li, i) => li.classList.toggle("sel", i === sel)); lis[sel].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") { choose(results[sel]); }
      else if (e.key === "Escape") { q.value = ""; search(""); q.blur(); }
    });
    $("#map-results").addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); li && choose(results[+li.dataset.i]); });
  }

  window.A2Map = {
    show() {
      if (!inited) { requestAnimationFrame(() => { init(); setTimeout(() => map.invalidateSize(), 60); }); }
      else setTimeout(() => map.invalidateSize(), 30);
    },
    search: (q) => { $("#map-q").value = q; search(q); return results.length; },
    focusCat(cat) {
      if (!inited) { window.A2Map.show(); setTimeout(() => window.A2Map.focusCat(cat), 350); return; }
      const ci = D.cats.findIndex((c) => c[0] === cat); if (ci < 0) return;
      const c = D.cats[ci];
      if (c[4] === "creatures") choose({ act: { mob: cat } });
      else if (byCat[ci].length === 1) choose({ act: { point: byCat[ci][0] } });
      else { setOn(c[4], true); fitIds([ci]); }
    },
    showDrops: (i) => { if (!inited) { window.A2Map.show(); setTimeout(() => showDrops(i), 450); } else showDrops(i); },
    only, restore, focusArea, routeThrough,
    // значок слоя как отдельная SVG-картинка (для подсветки поверх игры)
    glyphSvg: (shape, color, size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 26 26">${(SH[shape] || SH.dot)(color)}</svg>`,
    layerStyle: (id) => { const l = layerById[id]; return l ? { shape: l.shape, color: l.color } : { shape: "dot", color: CREATURE }; },
    layers: () => D.layers.map((l) => [l.id, l.name, l.group]),
    choose: (i) => choose(results[i || 0]),
  };
  if (app() && app().state.ui.view === "map" && document.body.classList.contains("m-full")) window.A2Map.show();
})();
