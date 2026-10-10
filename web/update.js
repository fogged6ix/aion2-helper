/* Обновления через GitHub: проверка раз в день, обновление по кнопке */
(function () {
  const app = () => window.A2App;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DEFAULT_REPO = "fogged6ix/aion2-helper";
  let cur = "", found = null, busy = false;

  const S = () => app().state.settings;
  const repo = () => (S().updateRepo || DEFAULT_REPO || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "");
  const parts = (v) => String(v || "").replace(/^v/i, "").split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  function newer(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
  async function version() { if (cur) return cur; try { cur = typeof window.hostVersion === "function" ? await window.hostVersion() : ""; } catch (e) { } return cur; }

  function bar(html) {
    let b = $("#upd-bar");
    if (!html) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("div"); b.id = "upd-bar"; b.className = "upd-bar"; document.body.appendChild(b); }
    b.innerHTML = html;
    return b;
  }
  function offer(r) {
    found = r;
    const notes = (r.body || "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 6).map((l) => esc(l.replace(/^[-*#\s]+/, ""))).join("<br>");
    const b = bar(`<b>Доступна версия ${esc(r.tag.replace(/^v/i, ""))}</b><span class="upd-sub">у тебя ${esc(cur)}</span>
      ${notes ? `<details><summary>Что нового</summary><p>${notes}</p></details>` : ""}
      <div class="upd-row"><button class="btn sm primary" data-u="go">Обновить</button><button class="btn sm ghost" data-u="later">Позже</button><button class="btn sm ghost" data-u="skip">Пропустить эту</button></div>`);
    b.onclick = (e) => {
      const k = e.target.closest("[data-u]"); if (!k) return;
      if (k.dataset.u === "go") apply();
      else if (k.dataset.u === "later") bar(null);
      else { S().updateSkip = r.tag; app().save(); bar(null); }
    };
    status(`Есть новая версия ${r.tag.replace(/^v/i, "")}.`);
  }
  function status(t) { const el = $("#upd-status"); if (el) el.textContent = t; }

  async function check(manual) {
    const R = repo();
    await version();
    if (!R) { if (manual) app().toast("Обновления не настроены", "Укажи репозиторий GitHub в Настройках → Обновления."); status("Репозиторий не указан."); return null; }
    if (!window.A2Net) return null;
    status("Проверяю…");
    const r = await window.A2Net.call("hostUpdateCheck", R);
    S().updateLast = Date.now(); app().save();
    if (!r || r.error) { status("Не удалось проверить: " + ((r && r.error) || "нет ответа")); if (manual) app().toast("Не удалось проверить обновления", (r && r.error) || ""); return null; }
    if (cur && newer(r.tag, cur)) {
      if (manual || S().updateSkip !== r.tag) offer(r);
      else status(`Версия ${r.tag.replace(/^v/i, "")} пропущена по твоему выбору.`);
      return r;
    }
    status(`У тебя последняя версия (${cur}).`);
    if (manual) app().toast("Обновлений нет", `У тебя последняя версия ${cur}.`, "ok");
    return r;
  }

  function apply() {
    if (!found || busy) return;
    if (typeof window.hostUpdateApply !== "function") { app().toast("Обновление работает в программе для Windows", ""); return; }
    busy = true;
    app().state.ui.updNotes = { tag: found.tag, body: (found.body || "").slice(0, 600) };
    app().save();
    bar(`<b>Скачиваю версию ${esc(found.tag.replace(/^v/i, ""))}…</b><div class="upd-prog"><i style="width:0%"></i></div>`);
    window.hostUpdateApply(found.url, found.size || 0);
  }
  // события от Go: progress (0..1), error, installed
  function event(kind, v) {
    if (kind === "progress") { const i = document.querySelector("#upd-bar .upd-prog i"); if (i) i.style.width = Math.round(v * 100) + "%"; }
    else if (kind === "error") { busy = false; bar(`<b>Не получилось обновиться</b><span class="upd-sub">${esc(v)}</span><div class="upd-row"><button class="btn sm" data-u="later">Закрыть</button></div>`).onclick = (e) => { if (e.target.closest("[data-u]")) bar(null); }; }
    else if (kind === "installed") { app().save(); bar("<b>Готово — перезапускаю помощник…</b>"); }
  }

  // после запуска: сказать, что обновились, и раз в сутки проверить новое
  async function boot() {
    await version();
    const u = app().state.ui;
    if (u.updNotes && cur && !newer(u.updNotes.tag, cur)) {
      const first = (u.updNotes.body || "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 3).map((l) => l.replace(/^[-*#\s]+/, "")).join(" · ");
      setTimeout(() => app().toast("Помощник обновлён до " + cur, first || "", "ok"), 1500);
      delete u.updNotes; app().save();
    }
    const vl = $("#upd-ver"); if (vl) vl.textContent = cur || "—";
    const s = S();
    if (s.updateCheck !== false && repo() && Date.now() - (s.updateLast || 0) > 20 * 3600e3) setTimeout(() => check(false), 8000);
    else status(repo() ? "Проверю автоматически раз в сутки." : "Репозиторий не указан.");
  }
  function wait() { if (app() && app().state) boot(); else setTimeout(wait, 300); }
  setTimeout(wait, 500);
  window.A2Update = { check, apply, event, newer, repo };
})();
