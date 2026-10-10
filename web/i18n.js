/* Локализация: русский (исходный текст) и английский.
   Интерфейс пишется по-русски, а в английском режиме текст на экране переводится по словарю
   (web/i18n_en.js: точные строки + шаблоны с числами). Игровые данные (умения, доски, карта)
   подменяются английскими названиями при загрузке. Язык меняется с перезапуском окна. */
(function () {
  let lang = "ru";
  try { lang = localStorage.getItem("a2lang") || ""; } catch (e) { }
  if (lang !== "ru" && lang !== "en") lang = /^ru|^uk|^be|^kk/i.test(navigator.language || "") ? "ru" : "en";

  const norm = (s) => s.replace(/\s+/g, " ").trim();
  let dict = null, pats = null, fragRe = null, fragMap = null;
  const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monRe = new RegExp("(\\d+) (" + MON.join("|") + ")", "g");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function load() {
    if (dict) return;
    const D = window.I18N_EN || { exact: {}, patterns: [] };
    dict = new Map(Object.entries(D.exact || {}).map(([k, v]) => [norm(k), v]));
    pats = (D.patterns || []).map(([re, to]) => [new RegExp("^(?:" + (re.source || re) + ")$", "s"), to]);
    const fr = D.frag || [];
    fragMap = new Map(fr.map(([k, v]) => [k, v]));
    // куски фраз внутри строки (не посреди русского слова)
    if (fr.length) fragRe = new RegExp("(?<![А-Яа-яЁё])(?:" + fr.map(([k]) => esc(k)).join("|") + ")(?![А-Яа-яЁё])", "g");
  }
  function fill(to, m) {
    return to.replace(/\{t(\d+)\}/g, (_, i) => tr(m[+i] || "")).replace(/\{(\d+)\}/g, (_, i) => m[+i] || "");
  }
  // перевод строки: точное совпадение, затем шаблоны; иначе как есть
  // пробелы по краям текста сохраняем: «<b>5</b> DPS · …» не должно слипаться
  function tr(s) {
    if (lang !== "en" || !s || !/[А-Яа-яЁё]/.test(s)) return s;
    const out = tr0(s);
    if (out === s) return s;
    const a = /^\s*/.exec(s)[0], b = /\s*$/.exec(s)[0];
    return (out.startsWith(a) ? "" : a) + out.trim() + (b && !out.endsWith(b) ? b : out.match(/\s*$/)[0]);
  }
  function tr0(s) {
    load();
    const k = norm(s);
    const hit = dict.get(k);
    if (hit != null) return s.replace(k, hit) === s ? hit : s.replace(k, hit);
    // шаблон с числами: в словаре вместо чисел стоит «#»
    const nums = [];
    const k2 = k.replace(/[−-]?\d[\d\u00a0\u202f .,]*\d|[−-]?\d/g, (m) => { nums.push(m); return "#"; });
    if (nums.length) {
      const h2 = dict.get(k2);
      if (h2 != null) { let i = 0; return h2.replace(/#/g, () => (nums[i++] ?? "#")); }
    }
    for (const [re, to] of pats) {
      const m = re.exec(k);
      if (m) {
        const out = typeof to === "function" ? to(...m) : fill(to, m);
        if (out !== k) return out;
      }
    }
    // составные строки «А · Б · В» — по частям
    if (k.includes(" · ")) { const parts = k.split(" · "); const t = parts.map((p) => tr(p)); if (t.some((x, i) => x !== parts[i])) return t.join(" · "); }
    // последний шаг: известные куски фраз внутри строки
    let out = s.replace(monRe, (_, n, m) => MON_EN[MON.indexOf(m)] + " " + n).replace(/(\d+) ур\.(?![А-Яа-яЁё])/g, "lv. $1").replace(/(^|[^А-Яа-яЁё])[Уу]р\. (\d+)/g, "$1lv. $2");
    if (fragRe) out = out.replace(fragRe, (x) => fragMap.get(x) ?? x);
    return out;
  }
  // t("Текст {n}", {n: 5}) для кода
  function t(s, vars) {
    let out = tr(s);
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  // ---------- перевод страницы на лету ----------
  const ATTRS = ["placeholder", "title", "aria-label", "data-tip"];
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
  const done = new WeakMap(); // узел → последний переведённый текст (чтобы не крутиться)
  function trNode(n) {
    if (n.nodeType === 3) {
      const v = n.nodeValue;
      if (!v || done.get(n) === v || !/[А-Яа-яЁё]/.test(v)) return;
      const p = n.parentNode;
      if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest("[data-noi18n], .msg.bot, .msg.me, #ai-log, #aif-log, .w-ans-t, #build-text, .chat-box pre"))) return;
      const out = tr(v);
      done.set(n, out);
      if (out !== v) n.nodeValue = out;
      return;
    }
    if (n.nodeType !== 1 || n.nodeName === "SCRIPT" || n.nodeName === "STYLE") return;
    for (const a of ATTRS) {
      const v = n.getAttribute && n.getAttribute(a);
      if (v && /[А-Яа-яЁё]/.test(v)) { const out = tr(v); if (out !== v) n.setAttribute(a, out); }
    }
    if (n.nodeName === "INPUT" && (n.type === "button" || n.type === "submit") && /[А-Яа-яЁё]/.test(n.value)) n.value = tr(n.value);
    if (n.nodeName === "OPTION") { /* текст — дочерний узел */ }
    if (SKIP.has(n.nodeName) || n.hasAttribute("data-noi18n")) return;
    for (let c = n.firstChild; c; c = c.nextSibling) trNode(c);
  }
  function startObserver() {
    trNode(document.body);
    document.title = tr(document.title);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") trNode(m.target);
        else if (m.type === "attributes") trNode(m.target);
        else m.addedNodes.forEach((n) => trNode(n));
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  if (lang === "en") {
    document.documentElement.lang = "en";
    // даты и числа — в английском формате
    const fix = (l) => (l === "ru-RU" || l === "ru" ? "en-US" : l);
    const d1 = Date.prototype.toLocaleDateString, d2 = Date.prototype.toLocaleString, d3 = Date.prototype.toLocaleTimeString, n1 = Number.prototype.toLocaleString;
    Date.prototype.toLocaleDateString = function (l, o) { return d1.call(this, fix(l), o); };
    Date.prototype.toLocaleString = function (l, o) { return d2.call(this, fix(l), o); };
    Date.prototype.toLocaleTimeString = function (l, o) { return d3.call(this, fix(l), o); };
    Number.prototype.toLocaleString = function (l, o) { return n1.call(this, fix(l), o); };
    // системные окна
    const c0 = window.confirm.bind(window), p0 = window.prompt.bind(window), a0 = window.alert.bind(window);
    window.confirm = (m) => c0(tr(String(m)));
    window.prompt = (m, d) => p0(tr(String(m)), d);
    window.alert = (m) => a0(tr(String(m)));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver); else startObserver();
  }

  // ---------- игровые данные на английском ----------
  function patchData() {
    if (lang !== "en") return;
    const E = window.I18N_DATA_EN, CD = window.CALCDATA;
    if (E && CD && !CD._en) {
      CD._en = 1;
      Object.values(CD.classes).forEach((c) => {
        c.skills.forEach((s) => {
          const e = E.skills[s.id]; if (e) { s.name = e[0]; if (e[1]) s.tip = e[1]; }
          (s.specs || []).forEach((sp) => { const x = E.specs[sp.id]; if (x) sp.text = x; });
        });
        c.boards.forEach((b) => { if (E.boards[b.id]) b.name = E.boards[b.id]; b.nodes.forEach((n) => { const x = E.nodes[n[0]]; if (x) n[8] = x; }); });
      });
      const SL = (window.I18N_EN || {}).stats || {};
      Object.keys(CD.statLabels).forEach((k) => { if (SL[k]) CD.statLabels[k] = SL[k]; });
    }
    const MD = window.MAPDATA;
    if (MD && !MD._en) {
      MD._en = 1;
      MD.cats.forEach((c) => { if (c[1]) c[2] = c[1]; });
      MD.areas.forEach((a) => { if (a[1]) a[2] = a[1]; });
      MD.layers.forEach((l) => { l.name = tr(l.name); if (l.note) l.note = tr(l.note); });
      MD.labels = MD.labels.map((s) => tr(s));
    }
    const X = window.EXTRA;
    if (X && MD && !X._en) {
      X._en = 1;
      const byCat = {}; MD.cats.forEach((c) => (byCat[c[0]] = c[1]));
      (X.mobs || []).forEach((m) => { if (byCat[m[5]]) m[1] = byCat[m[5]]; });
      (X.bosses || []).forEach((b) => { const en = byCat[b[4]] || byCat["boss-" + b[0]] || byCat["named-" + b[0]]; if (en) b[1] = en; });
      if (window.I18N_ITEMS_EN) (X.items || []).forEach((it, i) => { const en = window.I18N_ITEMS_EN[i] || tr(it[0]); if (en) it[0] = en; });
      const ZN = window.I18N_ZONES_EN || {}, z = (s) => ZN[s] || s;
      (X.mobs || []).forEach((m) => { if (Array.isArray(m[4])) m[4] = m[4].map(z); if (typeof m[3] === "string") m[3] = tr(m[3]); });
      (X.bosses || []).forEach((b) => { b[3] = z(b[3]); });
      if (X.mats) Object.keys(X.mats).forEach((k) => { X.mats[k] = tr(X.mats[k]); });
    }
  }

  window.A2I18n = {
    lang, t, tr, patchData,
    set(l) { try { localStorage.setItem("a2lang", l); } catch (e) { } location.reload(); },
    get en() { return lang === "en"; },
  };
  window.T = t;
})();
