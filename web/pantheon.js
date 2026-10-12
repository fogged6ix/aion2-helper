/* Пантеон: украшения (картины, статуи, колосс), которые дают божественные показатели.
   Справочник — data/pantheon.js; что у игрока есть и что стоит в Пантеоне — отмечает он сам (в профиле персонажа).
   Значения бонусов отдельных украшений в данных глобального клиента на сайтах пока не опубликованы — смотри подсказку в игре. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const T = (s) => (window.T ? window.T(s) : s);
  const en = () => window.A2I18n && A2I18n.lang === "en";
  const app = () => window.A2App;
  const KIND = { artwork: ["Картина", "Artwork"], statue: ["Статуя", "Statue"], colossus: ["Колосс", "Colossus"] };
  const GOD_KEY = { Time: "GodTime", Destruction: "GodDestruction", Death: "GodDeath", Illusion: "GodIllusion", Wisdom: "GodWisdom" };
  let filter = "", tab = "all";

  function store() {
    const A = app(), p = A.state.profiles[A.pid];
    p.pantheon = p.pantheon || { owned: {}, placed: {} };
    return p.pantheon;
  }
  function sheet() {
    const A = app(), p = A.state.profiles[A.pid];
    return (p.calc && p.calc.sheet) || {};
  }
  // украшение → индекс предмета в таблицах добычи (по русскому или английскому названию)
  let idx = null;
  function itemIndex(d) {
    if (!idx) {
      idx = {};
      ((window.EXTRA || {}).items || []).forEach((it, i) => { idx[String(it[0]).toLowerCase()] = i; });
    }
    for (const n of [d[2], d[3]]) { const i = idx[String(n).toLowerCase()]; if (i != null) return i; }
    return null;
  }
  const name = (d) => (en() ? d[3] : d[2]);

  function render(root) {
    if (!root || !window.PANTHEON) return;
    const P = window.PANTHEON, S = store(), sh = sheet();
    const placed = (k) => P.decor.filter((d) => d[1] === k && S.placed[d[0]]).length;
    const ownedN = P.decor.filter((d) => S.owned[d[0]]).length;
    const list = P.decor.filter((d) => (tab === "all" || (tab === "owned" ? S.owned[d[0]] : !S.owned[d[0]])) && (!filter || name(d).toLowerCase().includes(filter.toLowerCase())));
    root.innerHTML = `
      <div class="pan">
        <div class="pan-top">
          <div class="panel pan-hero">
            <p class="kicker">${T("Пантеон")}</p>
            <h2>${T("Украшения дают божественные показатели")}</h2>
            <p class="muted">${T("12 мест под картины, 4 под статуи и 1 под колосса. Открывается после задания Возвышения «Тот, кто слышит голос» (22 ур.). Украшение сначала нужно зарегистрировать из сумки.")}</p>
            <div class="pan-slots">
              ${["artwork", "statue", "colossus"].map((k) => `<div class="slotbar"><span>${esc(KIND[k][en() ? 1 : 0])}</span><b>${placed(k)} / ${P.slots[k]}</b><i style="width:${Math.min(100, placed(k) / P.slots[k] * 100)}%"></i></div>`).join("")}
            </div>
          </div>
          <div class="panel pan-gods">
            <h3>${T("Божественные показатели")}</h3>
            <table class="tbl gods">${P.deity.map((g) => {
              const v = GOD_KEY[g[0]] ? sh[GOD_KEY[g[0]]] : null;
              return `<tr><th>${esc(en() ? g[4] : g[3])}<small>${esc(en() ? g[2] : g[1])}</small></th><td>${esc(en() ? g[6] : g[5])}</td><td class="num">${v != null && v !== "" ? esc(v) : ""}</td></tr>`;
            }).join("")}</table>
            <p class="muted small">${T("Числа — из импорта персонажа (Armory). Остальные божества сайт отдаёт одной суммой")}${sh.GodOther ? `: <b>${esc(sh.GodOther)}</b>` : ""}.</p>
          </div>
        </div>
        <div class="panel pan-list">
          <div class="row gap wrap">
            <div class="seg" id="pan-tabs">${[["all", "Все"], ["need", "Нет у меня"], ["owned", "Есть"]].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${T(l)}</button>`).join("")}</div>
            <input id="pan-q" placeholder="${T("Поиск украшения")}" value="${esc(filter)}">
            <span class="spacer"></span>
            <span class="muted">${T("Есть")}: <b>${ownedN}</b> / ${P.decor.length}</span>
          </div>
          <ul class="decor">${list.map((d) => {
            const i = itemIndex(d), src = i != null && window.A2Bosses ? window.A2Bosses.sourceList(i, 2) : [];
            return `<li class="${S.owned[d[0]] ? "own" : ""}">
              <span class="d-ic ${d[1]}" aria-hidden="true"></span>
              <div class="d-main"><b>${esc(name(d))}</b><small>${esc(KIND[d[1]][en() ? 1 : 0])}${src.length ? " · " + src.map(([m, ch]) => `${esc(m[1])} ${String(ch).replace(".", ",")}%`).join(", ") : ""}</small></div>
              ${i != null ? `<button class="ib" data-drop="${i}" title="${T("Где выбить")}"><svg class="ic sm"><use href="#i-map"/></svg></button>` : ""}
              <label class="chk sm"><input type="checkbox" data-own="${esc(d[0])}" ${S.owned[d[0]] ? "checked" : ""}><span>${T("Есть")}</span></label>
              <label class="chk sm"><input type="checkbox" data-place="${esc(d[0])}" ${S.placed[d[0]] ? "checked" : ""} ${S.owned[d[0]] ? "" : "disabled"}><span>${T("В пантеоне")}</span></label>
            </li>`;
          }).join("") || `<li class="muted">${T("Ничего не нашлось")}</li>`}</ul>
          <p class="muted small">${T("Список украшений — из базы предметов metabot.gg (глобальный клиент); шансы — из таблиц добычи Альтгарда. Бонусы конкретного украшения смотри в подсказке в игре: сайты их пока не публикуют.")}</p>
        </div>
      </div>`;
    $$("#pan-tabs button", root).forEach((b) => b.onclick = () => { tab = b.dataset.t; render(root); });
    const q = $("#pan-q", root); q.oninput = () => { filter = q.value; const pos = q.selectionStart; render(root); const q2 = $("#pan-q", root); q2.focus(); q2.setSelectionRange(pos, pos); };
    $$("[data-own]", root).forEach((c) => c.onchange = () => { const k = c.dataset.own; if (c.checked) S.owned[k] = 1; else { delete S.owned[k]; delete S.placed[k]; } app().save(); render(root); });
    $$("[data-place]", root).forEach((c) => c.onchange = () => {
      const k = c.dataset.place, d = P.decor.find((x) => x[0] === k);
      if (c.checked && placed(d[1]) >= P.slots[d[1]]) { c.checked = false; app().toast(T("Нет свободного места"), T("Сначала убери другое украшение этого типа."), ""); return; }
      if (c.checked) S.placed[k] = 1; else delete S.placed[k];
      app().save(); render(root);
    });
    $$("[data-drop]", root).forEach((b) => b.onclick = () => { app().showView("map"); setTimeout(() => window.A2Map && window.A2Map.showDrops(+b.dataset.drop), 300); });
  }
  window.A2Pantheon = { render };
})();
