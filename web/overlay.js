/* Подсветка поверх игры: отправляем точки нужных слоёв в прозрачное окно поверх экрана игры.
   Режимы: auto — программа сама находит карту игры на экране и подгоняет точки (по умолчанию);
   key — показывать по клавише карты; always — всегда поверх (по ручному выравниванию). */
(function () {
  const D = window.MAPDATA;
  const app = () => window.A2App;
  const has = () => typeof window.hostOverlay === "function";
  const layerById = {}; (D ? D.layers : []).forEach((l) => (layerById[l.id] = l));
  const SHORT = { teleports: 1, dungeons: 1, merchants: 1, storage: 1, monoliths: 1 };
  const WEEKLY = { cubes: 1, cubespots: 1, traces: 1, monoliths: 1 }; // «взято» до недельного сброса; остальное — на 15 мин
  let last = null;     // последний отправленный набор (для проверки/тестов)
  let seen = false;    // автоопределение: карта игры сейчас на экране

  function ov() {
    const u = app().state.ui;
    u.overlay = u.overlay || { on: true, layers: [], label: "", calib: {} };
    const o = u.overlay; o.calib = o.calib || {}; o.taken = o.taken || []; o.layers = o.layers || [];
    return o;
  }
  const S = () => app().state.settings;
  function mode() { const s = S(); return s.ovMode || (s.ovFollow ? "key" : "auto"); }

  function catIdx(id) { return D.cats.findIndex((c) => c[0] === id); }
  let ruNamed = null;
  const TR = (x) => (window.A2I18n ? window.A2I18n.tr(x) : x);
  function title(p) { return TR(title0(p)); }
  function title0(p) {
    const c = D.cats[p[2]];
    if (p[4] >= 0 && SHORT[c[4]]) return D.labels[p[4]];
    if (c[2]) return c[2];
    // именные монстры — русское имя из справочника; запечатанные — уровень (русских названий нет)
    if (c[4] === "named") {
      if (!ruNamed) { ruNamed = {}; ((window.EXTRA || {}).bosses || []).forEach((b) => { if (b[4]) ruNamed[b[4]] = b[1]; ruNamed["named-" + b[0]] = b[1]; }); }
      if (ruNamed[c[0]]) return ruNamed[c[0]];
    }
    if (c[4] === "sealed") return "Запечатанное" + (c[3] ? " · " + c[3].toLowerCase() : "");
    const RU = { cubes: "Скрытый куб", cubespots: "Возможное место куба", rifts: "Разлом", traces: "След Эмпирея", teleports: "Статуя телепорта", dungeons: "Вход в подземелье", monoliths: "Монолит", merchants: "Торговец", storage: "Склад" };
    if (RU[c[4]]) return RU[c[4]];
    if (c[4] === "creatures") { const m = mobOf(c[0]); if (m) return m[1]; }
    return (layerById[c[4]] || {}).name || c[1];
  }
  function weekStart(now) {
    const w = window.A2L.events(now, S()).find((e) => e.id === "weekly");
    return w ? w.at - 7 * 864e5 : now - 7 * 864e5;
  }
  // что сейчас «взято» (и ещё не вернулось)
  function takenSet(now = Date.now()) {
    const o = ov(), ws = weekStart(now);
    o.taken = o.taken.filter((t) => t.weekly ? t.at >= ws : now - t.at < 15 * 60e3);
    return new Set(o.taken.map((t) => t.id));
  }
  // точки для набора слоёв; id слоя ("cubes"), категории ("c:<slug>") или «u:marks»
  function points(ids, keepTaken) {
    const want = new Set(ids), cats = new Set(), tk = keepTaken ? new Set() : takenSet();
    ids.forEach((id) => { if (id.startsWith("c:")) { const ci = catIdx(id.slice(2)); if (ci >= 0) cats.add(ci); } });
    const out = [];
    D.points.forEach((p, i) => {
      const c = D.cats[p[2]], lid = c[4];
      if (!(want.has(lid) || cats.has(p[2]))) return;
      if (tk.has("p" + i)) return;
      const lay = layerById[lid] || { color: "#ff3df2", shape: "dot" };
      out.push([p[0], p[1], lay.color, lay.shape, lid === "cubespots" || lay.shape === "dot" && lid !== "creatures" ? "" : title(p), lid === "bosses", "p" + i]);
    });
    if (want.has("u:marks")) {
      const m = (((app().state.ui.map || {}).user || {}).marks || []);
      m.forEach((x) => { if (!tk.has("m" + x.id)) out.push([x.x, x.y, "#ffd36b", "star", x.t || x.name || "Метка", false, "m" + x.id]); });
    }
    return out.slice(0, 3000);
  }
  // маршрут обхода: ближайший сосед от «ты здесь» по значимым точкам (до 30)
  function route(ids) {
    let pts = points(ids).filter((p) => p[3] !== "dot" || ids.some((id) => id.startsWith("c:"))).map((p) => [p[0], p[1]]);
    if (pts.length < 2) return null;
    if (pts.length > 30) pts = pts.slice(0, 30);
    const out = [[D.you[0], D.you[1]]]; let cur = out[0];
    while (pts.length) { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); cur = pts.splice(bi, 1)[0]; out.push(cur); }
    return out;
  }
  function refs() {
    return D.points.filter((p) => D.cats[p[2]][4] === "teleports").map((p) => [p[0], p[1], "#7fe0d0", "wing", title(p)]);
  }
  function currentMapLayers() {
    const on = ((app().state.ui.map || {}).on) || {};
    const ids = D.layers.filter((l) => (l.id in on ? on[l.id] : l.on)).map((l) => l.id).filter((id) => id !== "teleports");
    Object.keys(on).forEach((k) => { if (k.startsWith("c:") && on[k]) ids.push(k); });
    if (on["u:marks"] !== false && ((((app().state.ui.map || {}).user || {}).marks) || []).length) ids.push("u:marks");
    return ids;
  }
  function calibOut() {
    const c = ov().calib, o = {};
    Object.entries(c).forEach(([k, v]) => { if (Array.isArray(v) && v[0] > 0) o[k] = v; });
    return o;
  }
  // ---------- значки: те же картинки, что на карте помощника, готовыми растрами для окна поверх игры ----------
  const sprites = {};      // ключ → {w,h,d}
  const sentIcons = new Set();
  const dpr = () => Math.max(1, window.devicePixelRatio || 1);
  function iconKey(p) {
    const css = p[5] ? 34 : p[3] === "dot" ? 15 : 26;
    return p[3] + "|" + p[2] + "|" + Math.round(css * dpr());
  }
  async function sprite(key) {
    if (sprites[key]) return sprites[key];
    const [shape, color, px] = key.split("|"), size = +px;
    const M = window.A2Map;
    if (!M || !M.glyphSvg) return null;
    try {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(M.glyphSvg(shape, color, size));
      await img.decode();
      const c = document.createElement("canvas"); c.width = c.height = size;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0, size, size);
      const d = g.getImageData(0, 0, size, size).data, out = new Uint8Array(size * size * 4);
      for (let i = 0; i < d.length; i += 4) { // RGBA → BGRA с умноженной альфой
        const a = d[i + 3] / 255;
        out[i] = Math.round(d[i + 2] * a); out[i + 1] = Math.round(d[i + 1] * a); out[i + 2] = Math.round(d[i] * a); out[i + 3] = d[i + 3];
      }
      let bin = ""; for (let i = 0; i < out.length; i += 8192) bin += String.fromCharCode.apply(null, out.subarray(i, i + 8192));
      return (sprites[key] = { w: size, h: size, d: btoa(bin) });
    } catch (e) { return null; }
  }
  let sendSeq = 0;
  async function send(extra) {
    const o = ov(), s = S(), seq = ++sendSeq;
    const ids = o.layers.length ? o.layers : currentMapLayers();
    const pts = points(ids).map((p) => { const q = p.slice(); q[3] = iconKey(p); return q; });
    const payload = Object.assign({
      title: (o.label || "Подсветка") + " · " + pts.length + " точ.",
      pts, ref: refs(), calib: calibOut(), mode: mode(), mapKey: s.ovMapKey || "M", tips: s.ovTips !== false,
      routes: o.route ? [route(ids)].filter(Boolean) : [],
    }, extra || {});
    last = payload;
    if (!has()) return !!payload.on;
    // недостающие картинки значков — вместе с этим набором точек
    const need = [...new Set(pts.map((p) => p[3]))].filter((k) => !sentIcons.has(k));
    if (need.length) {
      const icons = {};
      for (const k of need) { const sp = await sprite(k); if (sp) { icons[k] = sp; sentIcons.add(k); } }
      payload.icons = icons;
      if (seq !== sendSeq) { // устарело: новый набор точек уже отправлен — передаём только картинки и вкл/выкл
        const p2 = { icons }; if ("on" in payload) p2.on = payload.on; if (payload.adjust) p2.adjust = true;
        return window.hostOverlay(JSON.stringify(p2));
      }
    }
    return window.hostOverlay(JSON.stringify(payload));
  }
  function names(ids) {
    return ids.map((id) => id.startsWith("c:") ? ((D.cats[catIdx(id.slice(2))] || [])[2] || id.slice(2)) : id === "u:marks" ? "мои метки" : (layerById[id] || {}).name || id).join(", ");
  }

  // показать слои поверх игры; opts.route — проложить маршрут обхода
  function show(ids, label, opts = {}) {
    const o = ov();
    if (ids && ids.length) { o.layers = ids.filter((id) => id !== "u:routes"); o.label = label || names(o.layers); }
    else { o.layers = []; o.label = "Слои карты"; }
    o.route = !!opts.route;
    o.on = true; app().save();
    send({ on: true }); sync();
    hint();
    return points(o.layers.length ? o.layers : currentMapLayers()).length;
  }
  function hide() { const o = ov(); o.on = false; app().save(); send({ on: false }); sync(); }
  function adjust() {
    const o = ov(); o.on = true; app().save();
    if (!has()) { app().toast("Выравнивание работает в программе для Windows", ""); return; }
    send({ on: true, adjust: true }); sync();
  }
  function reset() { const o = ov(); const k = Object.keys(o.calib); o.calib = {}; app().save(); send({ reset: true }); return k.length; }
  let hinted = false;
  function hint() {
    const s = S();
    if (!has()) { app().toast("Подсветка работает в программе для Windows", "Здесь только предпросмотр набора точек."); return; }
    const m = mode();
    if (m === "auto") {
      if (hinted) return; hinted = true;
      app().toast("Подсветка включена", (seen ? "Карта игры на экране — точки уже на ней." : "Открой карту в игре — помощник сам найдёт её на экране и поставит точки. ") +
        ` Метка под курсором «взято» — ${s.hotkeyTaken || "Ctrl+Shift+C"}. Игра должна быть в окне или «окно без рамки».`);
      return;
    }
    const first = !Object.keys(ov().calib).length;
    app().toast("Подсветка поверх игры включена",
      (m === "key" ? `Открой карту в игре (${s.ovMapKey || "M"}) — точки появятся; Esc или ${s.ovMapKey || "M"} — спрячутся. ` : "") +
      (first ? `Первый раз совмести точки с картой игры: ${s.hotkeyAdjust || "Ctrl+Shift+N"}, затем щёлкни по бирюзовой статуе и по ней же на карте игры — дважды. ` : "") +
      `Вкл/выкл: ${s.hotkeyOverlay || "Ctrl+Shift+M"}. Игра должна быть в оконном режиме или «без рамки».`);
  }
  // от Go: выравнивание сохранено / состояние поменялось горячей клавишей / карта найдена
  function saved(c) { ov().calib[c.key] = [c.s, c.tx, c.ty]; app().save(); app().toast("Подсветка выровнена", "Запомнил для экрана " + c.key + ". Если в игре поменяешь масштаб карты — выровняй ещё раз.", "ok"); }
  function hostState(on, adj) {
    const o = ov(); o.on = !!on; app().save();
    if (on && !adj) send({});
    sync();
  }
  let saidFound = false;
  function autoState(v) {
    if (v === "black") { app().toast("Не вижу картинку игры", "Снимок экрана получается чёрным — игра, скорее всего, в полноэкранном режиме. Переключи в настройках графики «Окно без рамки», тогда точки будут появляться сами."); return; }
    seen = !!v; sync();
    if (seen && !saidFound) { saidFound = true; app().toast("Нашёл карту игры", `Точки стоят на ней и двигаются вместе с картой. «Взято» — наведи мышь на точку и нажми ${S().hotkeyTaken || "Ctrl+Shift+C"}.`, "ok"); }
  }
  // «взято»: Go убрал точку под курсором
  function taken(id) {
    const o = ov(), now = Date.now();
    let lid = "", name = "Метка";
    if (id[0] === "p") { const p = D.points[+id.slice(1)]; if (p) { lid = D.cats[p[2]][4]; name = title(p); } }
    o.taken.push({ id, at: now, weekly: !!WEEKLY[lid] || id[0] === "m" });
    app().save();
    const ws = weekStart(now);
    const sameLayer = o.taken.filter((t) => t.at >= ws && t.id[0] === "p" && (D.cats[(D.points[+t.id.slice(1)] || [0, 0, 0])[2]] || [])[4] === lid).length;
    const total = lid ? D.points.filter((p) => D.cats[p[2]][4] === lid).length : 0;
    app().toast("Взято: " + name, WEEKLY[lid] ? `За эту неделю: ${sameLayer}${lid === "cubes" ? ` из ${total}` : ""}. Вернётся после недельного сброса.` : "Спрячу на 15 минут.", "ok");
    document.dispatchEvent(new Event("a2overlay"));
  }
  function untake(all) { const o = ov(); const n = o.taken.length; o.taken = all ? [] : o.taken.slice(0, -1); app().save(); send({}); return n - o.taken.length; }
  function stats() {
    const now = Date.now(), ws = weekStart(now), o = ov(); takenSet(now);
    const by = {};
    o.taken.forEach((t) => { if (t.at < ws || t.id[0] !== "p") return; const p = D.points[+t.id.slice(1)]; if (!p) return; const l = D.cats[p[2]][4]; by[l] = (by[l] || 0) + 1; });
    return by;
  }
  function snap(sec = 5) {
    if (typeof window.hostSnap !== "function") { app().toast("Работает в программе для Windows", ""); return; }
    window.hostSnap(sec);
    app().toast(`Снимок через ${sec} с`, "Переключись в игру и открой карту — сохраню картинку экрана в папку exports. Пришли её мне, если точки не находят карту сами.");
  }
  function snapped(p) { app().toast("Снимок сохранён", p, "ok"); if (typeof window.hostReveal === "function") window.hostReveal(p); }
  // ---------- подсказка при наведении на точку поверх игры ----------
  let mobByCat = null;
  function mobOf(catId) {
    if (!mobByCat) { mobByCat = {}; ((window.EXTRA || {}).mobs || []).forEach((m) => { if (m[5]) mobByCat[m[5]] = m; }); }
    return mobByCat[catId];
  }
  const GRADE = { C: "#c9c3d6", R: "#5fd08a", L: "#5aa8ff", U: "#ff9a3c", E: "#e05cff", S: "#38e0d0" };
  function tipInfo(id, now = Date.now()) {
    const L2 = window.A2L, X = window.EXTRA || { items: [] };
    if (id[0] === "m") {
      const m = ((((app().state.ui.map || {}).user || {}).marks) || []).find((x) => "m" + x.id === id);
      if (!m) return null;
      return { title: m.t || "Моя метка", color: "#ffd36b", lines: [{ t: "Моя метка с карты помощника", c: "#a39bb8" }, { t: `X ${Math.round(m.x)} · Y ${Math.round(m.y)}`, c: "#7d7592" }] };
    }
    const p = D.points[+id.slice(1)]; if (!p) return null;
    const c = D.cats[p[2]], lid = c[4], lay = layerById[lid] || { name: "Монстры", color: "#ff3df2", note: "" };
    const area = D.areas.find((a) => a[0] === p[3]);
    const lines = [];
    const mob = mobOf(c[0]);
    lines.push({ t: [lay.name, mob ? "ур. " + mob[2] + (mob[3] ? " · " + mob[3].toLowerCase() : "") : c[3] ? c[3].toLowerCase() : "", area ? (area[2] || area[1]) : ""].filter(Boolean).join(" · "), c: "#a39bb8" });
    // таймер возрождения босса
    if (mob && (lid === "bosses" || lid === "named") && window.A2Bosses) {
      const at = window.A2Bosses.respawnAt(mob[0]);
      if (at && at > now) lines.push({ t: `Возродится в ${new Date(at).toTimeString().slice(0, 5)} — через ${L2.fmtDelta(at - now).replace(/^00:/, "")}`, c: "#ffd36b", b: 1 });
      else if (at) lines.push({ t: "Уже должен быть на месте", c: "#74d6a4", b: 1 });
      else lines.push({ t: "Таймер не запущен — скажи помощнику «убил " + mob[1].replace(/\(.*?\)/g, "").trim().split(" ").slice(-1)[0] + "»", c: "#7d7592" });
    }
    // добыча
    if (mob && mob[6] && mob[6].length) {
      lines.push({ t: "Добыча:", c: "#eadcbc", b: 1 });
      mob[6].filter((d) => d[1] < 100 || mob[6].length < 3).slice(0, 5).forEach(([ii, ch]) => {
        const it = X.items[ii]; if (!it) return;
        lines.push({ t: `  ${it[0]} — ${String(ch).replace(".", ",")}%`, c: GRADE[it[1]] || "#f2eefb" });
      });
    }
    if (lay.note) lines.push({ t: lay.note, c: "#c9c3d6", wrap: 1 });
    if (lid === "cubes" || lid === "cubespots") lines.push({ t: lid === "cubespots" ? "Куб появляется в одной из возможных точек." : "Скрытый куб.", c: "#c9c3d6" });
    if (p[4] >= 0 && lid === "cubes" && D.labels[p[4]]) lines.push({ t: D.labels[p[4]], c: "#c9c3d6", wrap: 1 });
    if (WEEKLY[lid]) lines.push({ t: `${S().hotkeyTaken || "Ctrl+Shift+C"} — отметить «взято»`, c: "#7d7592" });
    return { title: title(p), color: lay.color || "#ff3df2", lines };
  }
  function tip(id) {
    const info = tipInfo(id);
    if (info) { info.title = TR(info.title); info.lines = (info.lines || []).map((l) => Object.assign({}, l, { t: TR(l.t) })); }
    if (info && has()) window.hostOverlay(JSON.stringify({ tip: Object.assign({ id }, info) }));
    return info;
  }
  function sync() { document.dispatchEvent(new Event("a2overlay")); const b = document.getElementById("map-ov"); if (b) b.classList.toggle("on", !!ov().on); }
  // при запуске: вернуть состояние (в автоматическом режиме подсветка включена сразу)
  let booted = false;
  function boot() {
    if (booted || !app() || !app().state) return; booted = true;
    const o = ov();
    send({ on: !!o.on });
    sync();
  }

  setTimeout(boot, 0);
  window.A2Overlay = { tip, tipInfo, snap, snapped, show, hide, adjust, reset, saved, hostState, autoState, taken, untake, stats, boot, send, points, route, names, mode,
    get last() { return last; }, get on() { return !!ov().on; }, get seen() { return seen; }, get layers() { return ov().layers; }, has, currentMapLayers };
})();
