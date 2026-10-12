/* Логика без DOM: расписания, сбросы, состояние. Время — миллисекунды UTC. */
(function (root) {
  const H = 3600e3, D = 86400e3;
  const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const DEFAULT_SETTINGS = {
    serverOffset: 9,         // часовой пояс сервера, ч от UTC
    dailyReset: "06:00",     // время сервера
    weeklyDay: 2,            // 0=Пн … 2=Ср
    weeklyTime: "16:00",
    notifyMin: 5,
    sound: true,
    autoFade: true,
    idleOpacity: 0.55,
    topmost: true,
    startMode: "compact",
    profile: "main",
    hotkeyToggle: "Ctrl+Shift+A", // показать/спрятать окно
    hotkeyClick: "Ctrl+Shift+X",  // сквозные клики
    winNotify: true,              // уведомления Windows
    tray: true,
    bossNotify: true,
    autoUpdate: true,
    hotkeyOverlay: "Ctrl+Shift+M", // подсветка поверх игры
    hotkeyAdjust: "Ctrl+Shift+N",  // выровнять подсветку
    ovFollow: false,               // (старое) показывать только с открытой картой игры
    ovMode: "auto",                // auto — сам находит карту игры на экране; key — по клавише; always — всегда
    hotkeyTaken: "Ctrl+Shift+C",   // точка под курсором — «взято»
    ovTips: true,                  // подсказка при наведении на значок поверх игры
    updateRepo: "",                // GitHub: владелец/репозиторий с выпусками программы
    lang: "",                      // язык интерфейса: ru / en (пусто — по системе)
    updateCheck: true,             // проверять обновления раз в сутки
    chatRead: false,               // читать чат игры (распознавание текста Windows)
    chatArea: null,                // область чата: доли экрана [x, y, w, h]
    combatRead: false,             // счётчик урона: распознавать журнал боя
    combatArea: null,              // область журнала боя на экране
    pingOn: true,                  // показывать пинг до сервера игры
    pingPin: "",                   // закреплённое соединение игры «ip:порт» (пусто — автовыбор)
    ovMapKey: "M",
    playStart: "",                 // когда обычно начинаешь играть
    remindReset: true,             // напоминать о несделанном перед сбросом
  };

  function hhmm(s) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s || "");
    if (!m) throw new Error("bad time " + s);
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) throw new Error("bad time " + s);
    return h * H + mi * 60e3;
  }
  const local = (t, off) => t + off * H;           // «серверные часы» как UTC-поля
  const unlocal = (t, off) => t - off * H;
  const dayStart = (lt) => Math.floor(lt / D) * D;
  const weekday = (lt) => (new Date(lt).getUTCDay() + 6) % 7; // 0=Пн

  function nextEvery(now, off, hours, offsetHour = 0) {
    const lt = local(now, off);
    const base = dayStart(lt) + offsetHour * H;
    let k = Math.floor((lt - base) / (hours * H)) + 1;
    return unlocal(base + k * hours * H, off);
  }
  function nextDaily(now, off, s) {
    const lt = local(now, off);
    let t = dayStart(lt) + hhmm(s);
    if (t <= lt) t += D;
    return unlocal(t, off);
  }
  function nextWeekly(now, off, days, s) {
    const lt = local(now, off);
    for (let i = 0; i < 8; i++) {
      const d0 = dayStart(lt) + i * D;
      if (days.includes(weekday(d0))) {
        const t = d0 + hhmm(s);
        if (t > lt) return unlocal(t, off);
      }
    }
    throw new Error("no weekday");
  }

  function events(now, st) {
    const off = +st.serverOffset;
    return [
      { id: "rift", name: "Разлом", long: "Пространственно-временной разлом",
        hint: "Каждые 3 ч. Очки Бездны → осколки стигм. Ближе всего к тебе — восток, у Руин Васфельта.",
        at: nextEvery(now, off, 3, 0), period: 3 * H },
      { id: "daily", name: "Сброс дня", long: "Ежедневный сброс",
        hint: "Поручения поставки, ежедневные подземелья, Кошмары, ключи Фестиваля шуго.",
        at: nextDaily(now, off, st.dailyReset), period: D },
      { id: "weekly", name: "Сброс недели", long: "Недельный сброс (" + WD[+st.weeklyDay] + ")",
        hint: "До сброса добери недельные лимиты: 14 ежедневных подземелий, 7 наград в экспедициях, 3 Возвышения.",
        at: nextWeekly(now, off, [+st.weeklyDay], st.weeklyTime), period: 7 * D },
      { id: "nahma", name: "Нахма", long: "Бездна: Страж-владыка Нахма",
        hint: "Нижняя и Средняя Решанта, Вс и Пт.",
        at: nextWeekly(now, off, [6, 4], "21:00"), period: 0 },
      { id: "executors", name: "Палачи Бездны", long: "Бездна: Палачи (Тамаса, Кайра, Арго)",
        hint: "Нижняя Решанта, Пн/Чт/Сб. Плавильный камень гарантирован.",
        at: nextWeekly(now, off, [0, 3, 5], "21:30"), period: 0 },
    ].sort((a, b) => a.at - b.at);
  }

  // Энергия Одилы: +15 каждые 3 ч, потолок 560
  function odyleNow(o, now) {
    if (!o || o.value == null) return null;
    const ticks = Math.floor((now - o.at) / (3 * H));
    return Math.min(560, o.value + Math.max(0, ticks) * 15);
  }
  function odyleFullAt(o, now) {
    const v = odyleNow(o, now);
    if (v == null) return null;
    if (v >= 560) return now;
    const ticksDone = Math.max(0, Math.floor((now - o.at) / (3 * H)));
    const need = Math.ceil((560 - v) / 15);
    return o.at + (ticksDone + need) * 3 * H;
  }

  function fmtDelta(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const p = (n) => String(n).padStart(2, "0");
    return d ? `${d} д ${p(h)}:${p(m)}` : `${p(h)}:${p(m)}:${p(s)}`;
  }
  function fmtLocal(t) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, "0");
    const today = new Date(); const tm = new Date(Date.now() + D);
    const same = (a, b) => a.toDateString() === b.toDateString();
    const day = same(d, today) ? "сегодня" : same(d, tm) ? "завтра" : WD[(d.getDay() + 6) % 7] + " " + p(d.getDate()) + "." + p(d.getMonth() + 1);
    return `${day}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function newState() {
    return { v: 2, settings: Object.assign({}, DEFAULT_SETTINGS), profiles: {}, ui: { view: "today", checksTab: "daily", map: {} } };
  }
  function normalize(s) {
    const st = newState();
    if (s && typeof s === "object") {
      Object.assign(st.settings, s.settings || {});
      st.profiles = s.profiles || {};
      if (Array.isArray(s.chars)) st.chars = s.chars;
      if (s.bossT && typeof s.bossT === "object") st.bossT = s.bossT;
      if (Array.isArray(s.timers)) st.timers = s.timers;
      if (s.cache && typeof s.cache === "object") st.cache = s.cache;
      for (const k of ["kills", "loot", "sessions"]) if (Array.isArray(s[k])) st[k] = s[k];
      for (const k of ["ai", "session", "combat"]) if (s[k] && typeof s[k] === "object") st[k] = s[k];
      Object.assign(st.ui, s.ui || {});
    }
    return st;
  }
  function profile(st, pid) {
    const p = st.profiles[pid] = st.profiles[pid] || {};
    p.checks = p.checks || { daily: {}, weekly: {}, roadmap: {} };
    for (const k of ["daily", "weekly", "roadmap"]) p.checks[k] = p.checks[k] || {};
    if (!("lastDaily" in p)) p.lastDaily = null;
    if (!("lastWeekly" in p)) p.lastWeekly = null;
    p.history = p.history || [];
    p.odyle = p.odyle || null;
    return p;
  }
  // Снять отметки, если с прошлого раза наступил сброс. Возвращает список сброшенного.
  function applyResets(st, pid, now) {
    const s = st.settings, p = profile(st, pid), off = +s.serverOffset, done = [];
    const lastD = nextDaily(now, off, s.dailyReset) - D;
    const lastW = nextWeekly(now, off, [+s.weeklyDay], s.weeklyTime) - 7 * D;
    if (p.lastDaily == null || p.lastDaily < lastD) {
      if (p.lastDaily != null) { p.checks.daily = {}; done.push("daily"); }
      p.lastDaily = lastD;
    }
    if (p.lastWeekly == null || p.lastWeekly < lastW) {
      if (p.lastWeekly != null) { p.checks.weekly = {}; done.push("weekly"); }
      p.lastWeekly = lastW;
    }
    return done;
  }
  function nextThreshold(gs, th) {
    return th.slice().sort((a, b) => a.gs - b.gs).find((t) => t.gs > gs) || null;
  }

  const api = { H, D, WD, DEFAULT_SETTINGS, hhmm, nextEvery, nextDaily, nextWeekly, events, odyleNow, odyleFullAt,
    fmtDelta, fmtLocal, newState, normalize, profile, applyResets, nextThreshold };
  if (typeof module !== "undefined") module.exports = api; else root.A2L = api;
})(this);
