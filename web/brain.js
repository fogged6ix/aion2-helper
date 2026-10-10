/* Встроенный помощник: отвечает без интернета и без нейросети — по данным программы
   (персонаж и калькулятор, гайд, справочник, добыча, расписание). */
(function () {
  const A = () => window.A2App;
  const L = () => window.A2L;
  const fmtK = (n) => n >= 995e3 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " млн" : n >= 1e3 ? Math.round(n / 1e3) + " тыс." : String(Math.round(n));
  const num = (n, d = 1) => String(+(+n).toFixed(d)).replace(".", ",");
  const low = (s) => String(s).toLowerCase().replace(/ё/g, "е");

  // ---------- намерения ----------
  const INTENTS = [
    ["hello", ["привет", "здравств", "спасибо", "благодар", "как дела", "кто ты", "что ты умеешь", "помощь", "help"]],
    ["build", ["билд", "сборк", "как собрать", "какой билд", "мета", "как правильно качать перс"]],
    ["goal", ["до цели", "дойти до", "успею", "успеваю", "к пятниц", "к субботе", "к воскрес", "к понедельник", "к концу недели", "моя цель", "план до", "к дате"]],
    ["luck", ["удача", "удачи", "везет", "везёт", "невезет", "статистика добычи", "журнал добычи", "сколько выпало", "сколько убил"]],
    ["weekly", ["итоги недели", "отчет за неделю", "отчёт за неделю", "неделя итог", "итог недели"]],
    ["summary", ["сводк", "что нового", "доброе утро", "итоги дня", "обзор", "что сейчас важно"]],
    ["whatif", ["что если", "что будет если", "а если заточ", "если заточу", "если возьму", "если вставлю", "допустим"]],
    ["progress", ["прогресс", "темп", "прогноз", "когда достигну", "когда будет", "как я расту", "сколько набрал", "за неделю", "динамик"]],
    ["plan", ["план", "калькулятор", "стоит ли", "разбер"]],
    ["growth", ["gs", "гс", "качать", "прокач", "усилит", "сильнее", "рост", "поднять", "развив", "дальше", "в первую очередь", "что делать с перс", "прирост"]],
    ["dv", ["дэванион", "даэванион", "дэваньон", "кристалл", "доск", "ячейк", "неджакан", "джикел", "байзел", "триниэль", "асфель"]],
    ["enchant", ["заточ", "точить", "усилени", "камни усилен", "плюс", "+1", "+10", "+15", "pity", "гарант"]],
    ["stigma", ["стигм", "осколк"]],
    ["skills", ["умени", "навык", "скилл", "особенност", "ротац", "очки умен", "кнопк", "прожим"]],
    ["drops", ["где выбить", "где взять", "где найти", "выбить", "дроп", "падает", "выпада", "добыч", "шанс", "откуда"]],
    ["farm", ["фарм", "кинар", "деньг", "плавильн", "камни зачар", "орихалк", "одил", "где качаться"]],
    ["bosses", ["босс", "респ", "возрожд", "полев", "именн"]],
    ["today", ["сегодня", "вечер", "чем заняться", "что делать", "план на", "распорядок", "час", "дейлик", "ежедневн"]],
    ["schedule", ["разлом", "бездн", "нахма", "палач", "сброс", "расписан", "когда"]],
    ["stats", ["стат", "характеристик", "крит", "скорость боя", "мультиуд", "меткост", "интеллект", "мощь", "атрибут"]],
    ["gear", ["экипир", "шмот", "вещ", "снаряж", "бижутер", "оружи", "лук", "манакам", "камн", "привязк"]],
  ];
  // ---------- данные ----------
  function ctx(q) {
    const app = A(), st = app.state, ch = app.ch, p = st.profiles[app.pid], C = window.CONTENT;
    const prof = C.profiles[ch.guide || ch.cls] || C.profiles[ch.cls];
    const m = /(\d{1,4})\s*крист/.exec(low(q || ""));
    const an = window.A2Calc && window.A2Calc.analysis ? window.A2Calc.analysis(st, p, ch, { budget: m ? +m[1] : 40 }) : null;
    const hist = (p.history || []).filter((x) => x.gs);
    const gs = (hist.length ? hist[hist.length - 1].gs : 0) || (an && an.imported && an.imported.ilvl) || prof.gs_start || 0;
    return { app, st, ch, p, C, prof, an, gs, budget: m ? +m[1] : 40 };
  }
  // раздел гайда по названию (у разных версий гайда названия чуть разные)
  const GUIDE_ALIAS = { "навыки": ["навыки", "умения", "skills"], "ротация": ["ротация", "как играть", "how to play"], "статы": ["статы", "характеристики", "stats"], "стигмы": ["стигмы", "stigmas"], "экипировка": ["экипировка", "оружие", "weapon"] };
  const guide = (x, title) => { const names = GUIDE_ALIAS[low(title)] || [low(title)]; return ((x.prof.build || []).find((s) => names.some((n) => low(s.title).startsWith(n))) || {}).text || ""; };
  function excerpt(t, n = 700) { t = String(t).trim(); if (t.length <= n) return t; const cut = t.slice(0, n); const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n")); return (i > n * .5 ? cut.slice(0, i + 1) : cut) + " …"; }
  const nextThr = (x) => (x.C.common.thresholds || []).filter((t) => t.gs > x.gs).slice(0, 2);
  const noChar = (x) => !x.an || !x.an.gear.some((g) => g.item);
  const needImport = "_Персонаж не заполнен. Открой **Калькулятор → «Импорт из игры»** — тогда советы будут по твоим вещам и цифрам._";

  // ---------- ответы ----------
  function growth(x) {
    const a = x.an; if (noChar(x)) return { md: needImport + "\n\n" + excerpt(guide(x, "Экипировка"), 600), chips: ["Где фармить кинары?", "Что посмотреть в гайде?"] };
    const out = [`**Как быстрее поднять GS** (сейчас ${x.gs || "?"}). Порядок — от бесплатного к дорогому:`], steps = [];
    if (a.emptySockets) {
      const sl = a.gear.filter((g) => g.item && g.sockets > g.stones).map((g) => `${g.name} (${g.sockets - g.stones})`);
      steps.push(`**Манакамни во все гнёзда.** Свободно ${a.emptySockets} — это около **+${num(a.emptySockets * 2.5)} GS** почти даром. Где пусто: ${sl.join(", ")}.`);
    }
    const safe = a.ench.filter((e) => e.safeTo > e.ench && e.safeCost).sort((p, q) => p.safeCost.gold - q.safeCost.gold);
    if (safe.length) {
      const tot = safe.reduce((s, e) => s + e.safeCost.gold, 0), stones = safe.reduce((s, e) => s + (Object.values(e.safeCost.mats)[0] || 0), 0);
      steps.push(`**Безрисковая заточка (шанс 100%).** ${safe.slice(0, 6).map((e) => `${e.name} +${e.ench}→+${e.safeTo}`).join(", ")}${safe.length > 6 ? " и ещё " + (safe.length - 6) : ""}. Всего ≈${fmtK(tot)} кинаров и ≈${fmtK(stones)} камней усиления.`);
    }
    if (a.picks.length) {
      const c = a.picks.reduce((s, p) => s + p.cost, 0);
      steps.push(`**Дэванион.** На ${c} кристаллов лучше всего: ${a.picks.slice(0, 5).map((p) => `${p.label} (${p.board})`).join(", ")}. Весь список — в вопросе «куда вложить кристаллы».`);
    }
    if (a.freeSk > 0) steps.push(`**Очки умений:** свободно ${a.freeSk}. ${a.near[0] ? `Ближе всего к новой особенности — ${a.near[0].name}: ${a.near[0].pts} очк.` : ""}`);
    if (a.freeSt > 0) steps.push(`**Очки стигм:** свободно ${a.freeSt} — вложи в основные стигмы.`);
    const risky = a.ench.filter((e) => e.safeTo <= e.ench && e.per100k > 0).sort((p, q) => q.per100k - p.per100k)[0];
    if (risky) steps.push(`**Рискованная заточка** — потом: выгоднее всего ${risky.name} +${risky.ench + 1} (≈${fmtK(risky.next.gold)} кинаров${risky.next.attempts > 1.05 ? `, ≈${num(risky.next.attempts)} попыт.` : ""}).`);
    out.push(steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    const th = nextThr(x);
    if (th.length) out.push(`Следующий порог: **${th[0].gs}** — ${th[0].name}${x.gs ? ` (осталось ${th[0].gs - x.gs})` : ""}. ${th[0].why}.`);
    return { md: out.join("\n\n"), chips: ["Куда вложить 40 кристаллов?", "Что точить выгоднее?", "Проверь мои стигмы"] };
  }
  function dv(x) {
    const a = x.an; if (noChar(x)) return { md: needImport };
    const out = [`**Дэванион** — что взято:`, a.boards.map((b) => `- ${b.name}: ${b.got}/${b.total} ячеек, ${b.cost}/${b.costTotal} кристаллов${b.open ? "" : ` — откроется на ${b.needLevel} ур.`}`).join("\n")];
    if (a.picks.length) {
      const c = a.picks.reduce((s, p) => s + p.cost, 0), v = a.picks.reduce((s, p) => s + p.val, 0);
      out.push(`**Куда вложить ${x.budget} кристаллов** (по урону, цепочкой от уже взятых — порядок важен):\n` + a.picks.slice(0, 15).map((p, i) => `${i + 1}. ${p.label} — ${p.board}, ${p.cost} кр.`).join("\n") + (a.picks.length > 15 ? `\n…и ещё ${a.picks.length - 15}` : ""));
      out.push(`Итого ${c} кристаллов ≈ **+${num(v)} ${a.unit.replace("≈", "")}**. Добавить всё в план одной кнопкой: **Калькулятор → Советник → «Взять всё в план»**. Другая сумма — спроси «куда вложить 80 кристаллов».`);
    } else out.push("Подходящих ячеек нет: доски заполнены или не хватает уровня.");
    return { md: out.join("\n\n"), chips: ["Где фармить кристаллы Дэваниона?", "Что точить выгоднее?"] };
  }
  function enchant(x) {
    const a = x.an; if (noChar(x)) return { md: needImport };
    if (!a.ench.length) return { md: "Нет данных о шансах заточки для твоих вещей. Импортируй персонажа в калькуляторе — шансы подтянутся сами." };
    const out = ["**Заточка: что выгоднее**"];
    const safe = a.ench.filter((e) => e.safeTo > e.ench && e.safeCost);
    if (safe.length) out.push("Без риска (100%):\n" + safe.map((e) => `- ${e.name} (${e.item}) +${e.ench}→+${e.safeTo}: ≈${fmtK(e.safeCost.gold)} кинаров`).join("\n"));
    const r = a.ench.filter((e) => e.per100k > 0).sort((p, q) => q.per100k - p.per100k).slice(0, 6);
    if (r.length) out.push(`Польза следующего +1 на 100 тыс. кинаров (${a.unit.replace("≈", "≈ ")}):\n` + r.map((e, i) => `${i + 1}. ${e.name} +${e.ench + 1} — ${num(e.per100k, 2)} (стоит ≈${fmtK(e.next.gold)}${e.next.attempts > 1.05 ? `, ≈${num(e.next.attempts)} попыт.` : ""})`).join("\n"));
    const w = a.ench.find((e) => e.id === "weapon");
    if (w && w.max) out.push(`Оружие ${w.item} +${w.ench}: до +${w.max} — шаги выше +10 идут с шансом 65→20% и гарантией (+5% за неудачу). Полную стоимость любой цели покажет **Калькулятор → Итог**: поставь в плане нужный плюс.`);
    out.push("_Защитные вещи в режиме «урон» дают 0 — для них спроси про выживаемость или смотри советник в режиме «Выживаемость»._");
    return { md: out.join("\n\n"), chips: ["У меня 1 млн — что точить?", "У меня 3 млн — что точить?", "Что лучше точить: перчатки или оружие?"] };
  }
  function stigma(x) {
    const a = x.an, out = ["**Стигмы**"];
    const g = guide(x, "Стигмы");
    if (a && a.stg) {
      out.push("Сейчас в слотах: " + a.stg.map((s) => s.open ? (s.name ? `${s.name} ${s.lv}` : "пусто") : "закрыт").join(", ") + "." + (a.stOwn.length ? ` Изучены, но не надеты: ${a.stOwn.map((s) => `${s.name} ${s.lv}`).join(", ")}.` : ""));
      // в гайде «Рассекающая стрела (Explosive Arrow)» — в данных игры эта стигма называется «Взрывная стрела»
      const ALIAS = { "рассекающая стрела": "Взрывная стрела" };
      const rec = [...g.matchAll(/•\s*([^—(\n]+?)\s*(?:\(|—)/g)].map((m) => m[1].trim()).filter((n) => n.length < 40).map((n) => ALIAS[low(n)] || n);
      if (rec.length) {
        const have = a.stg.map((s) => low(s.name));
        const miss = rec.filter((n) => !have.some((h) => h && (h.includes(low(n)) || low(n).includes(h))));
        out.push(`По гайду нужны: ${rec.join(", ")}.` + (miss.length ? ` **Не хватает в слотах:** ${miss.join(", ")}.` : " Набор совпадает с гайдом."));
      }
      const nx = a.stg.filter((s) => s.next).map((s) => `${s.name}: на ${s.next.unlock} ур. — «${s.next.text}»`);
      if (nx.length) out.push("Следующие особенности стигм:\n" + nx.map((t) => "- " + t).join("\n"));
      if (a.freeSt > 0) out.push(`Свободно очков стигм: **${a.freeSt}**.`); else if (a.freeSt < 0) out.push(`Очков стигм в минусе на ${-a.freeSt} — проверь «Лист персонажа → дополнительные очки».`);
    }
    if (g) out.push("Из гайда:\n" + excerpt(g, 900));
    return { md: out.join("\n\n"), chips: ["Проверь умения", "Где брать осколки стигм?"] };
  }
  function skills(x) {
    const a = x.an, out = ["**Умения**"];
    if (a && a.skills.length) {
      out.push(`Очки умений: свободно **${a.freeSk}**.`);
      if (a.near.length) out.push("Ближе всего к новой ячейке особенности:\n" + a.near.slice(0, 5).map((n) => `- ${n.name}: ${n.tot}→${n.next} ур., ${n.pts} очк.`).join("\n"));
      out.push("Уровни сейчас: " + a.skills.map((s) => `${s.name} ${s.total}`).join(", ") + ".");
    } else out.push(needImport);
    const g1 = guide(x, "Навыки"), g2 = guide(x, "Ротация");
    if (g1) out.push("Из гайда (навыки):\n" + excerpt(g1, 700));
    if (g2) out.push("Ротация:\n" + excerpt(g2, 700));
    return { md: out.join("\n\n"), chips: ["Проверь мои стигмы", "Как быстрее поднять GS?"] };
  }
  // ---------- что показать на карте по теме фарма ----------
  const FARM_MAP = [
    [/плавильн/, ["bosses", "named"], "боссы и именные — плавильные камни"],
    [/камн\S* зачар|зачарован|камн\S* усилен/, ["dungeons"], "входы в экспедиции (Ущелье ауругу, Пещера Крао) — камни зачарования"],
    [/кристал|дэванион/, ["sealed", "rifts"], "запечатанные подземелья и разломы — кристаллы Дэваниона"],
    [/осколк|стигм/, ["rifts"], "разломы — осколки стигм"],
    [/одил/, ["gather-odyle"], "точки сбора Одилы"],
    [/орихалк|руд[аыу]/, ["gather-orichalcum"], "орихалк"],
    [/алмаз/, ["gather-diamond"], "алмаз"], [/сапфир/, ["gather-sapphire"], "сапфир"], [/рубин/, ["gather-ruby"], "рубин"],
    [/асват/, ["gather-asvata"], "асвата"], [/азф/, ["gather-azpha"], "азфа"], [/охкр/, ["gather-ohkra"], "охкра"], [/календул/, ["gather-calendula"], "календула"],
    [/пуджер/, ["gather-pujery"], "пуджери"], [/морф/, ["gather-morfa"], "морфа"], [/рейдам/, ["gather-raydam"], "рейдам"], [/конид/, ["gather-conide"], "конид"],
    [/куб/, ["cubes", "cubespots"], "скрытые кубы и их возможные места"],
    [/монолит/, ["monoliths"], "монолиты"], [/след|эмпире|перь/, ["traces"], "следы Эмпирея (перья)"],
    [/телепорт|статуя/, ["teleports"], "статуи телепорта"], [/торгов|магазин/, ["merchants"], "торговцы"], [/склад/, ["storage"], "склады"],
    [/кинар|деньг|золот|голд/, ["bosses", "named"], "боссы и именные — лучший доход кинаров"],
    [/босс/, ["bosses", "named"], "полевые боссы и именные монстры"],
    [/разлом/, ["rifts"], "разломы"], [/подземел|данж|экспедиц/, ["dungeons", "sealed"], "входы в подземелья"],
  ];
  function farmMap(q) {
    const t = low(q), f = FARM_MAP.find(([re]) => re.test(t));
    if (!f) return null;
    const area = window.A2Map ? null : null;
    const zone = (window.MAPDATA ? window.MAPDATA.areas : []).find((a) => a[2] && t.includes(low(a[2]).slice(0, Math.max(5, low(a[2]).length - 2))));
    return { t: "mapOnly", layers: f[1], label: f[2] + (zone ? ` · ${zone[2]}` : ""), area: zone ? zone[2] : null };
  }
  function drops(x, q) {
    const d = window.A2AI ? window.A2AI.pickDrops(q) : [];
    if (d.length) { const idx = findItemIn(q, null); return { md: "**Где выпадает** (шанс за одно убийство, данные клиента):\n\n" + d.map((s) => "- " + s).join("\n") + "\n\n🗺 Открыл карту и показал, с кого падает лучше всего.", chips: ["Таймеры боссов", "Где фармить кинары?"], auto: idx != null ? { t: "drops", item: idx } : farmMap(q), acts: idx != null ? [{ label: "Показать на карте ещё раз", a: { t: "drops", item: idx } }] : [] }; }
    return farm(x, q, true);
  }
  function farm(x, q, fromDrops) {
    const kb = window.A2AI ? window.A2AI.pickKb(q + " фарм где", 2, 2400) : [];
    const out = [fromDrops ? "Точного предмета в таблицах добычи Альтгарда не нашёл — вот что есть в справочнике по фарму:" : "**Фарм**"];
    kb.forEach((c) => out.push(`**${c.t}**\n${excerpt(c.x, 1100)}`));
    if (!kb.length) out.push("В справочнике нет ответа. Попробуй назвать предмет точнее — так, как он называется в игре.");
    const fm = farmMap(q);
    if (fm) out.push(`🗺 Открыл карту и оставил только: **${fm.label}**. Вернуть все слои — кнопка вверху карты.`);
    return { md: out.join("\n\n"), chips: ["Где выбить плавильный камень?", "Таймеры боссов"], auto: fm, acts: fm ? [{ label: "Показать на карте ещё раз", a: fm }] : [] };
  }
  function bosses(x) {
    const X = window.EXTRA, st = x.st, now = Date.now(), Bm = window.A2Bosses;
    const marked = (X ? X.bosses : []).map((b) => { const at = Bm && Bm.respawnAt(b[0]); return at ? [b, at] : null; }).filter(Boolean);
    const out = ["**Полевые боссы Альтгарда**"];
    if (marked.length) out.push("Твои отметки:\n" + marked.map(([b, at]) => { return `- ${b[1]} (${b[2]} ур., ${b[3]}): ${at <= now ? "уже должен быть" : "через " + L().fmtDelta(at - now)}`; }).join("\n"));
    else out.push("Пока ни один босс не отмечен убитым. Открой **Боссы**, нажимай «Убит» — программа напомнит о возрождении.");
    out.push("Боссы 48 ур. (Немая Тартан, Глава армии Рагт, Властелин душ Кашапа) и Бессмертный Гартуа — главный источник плавильных камней: эксперта ~5,8% за убийство. Именные 45 ур. роняют свою броню и картины для Пантеона (25%).");
    return { md: out.join("\n\n"), chips: ["Где выбить плавильный камень эксперта?", "Что делать сегодня вечером?"] };
  }
  function events(x, hours) {
    const now = Date.now(), until = now + hours * 36e5;
    const evs = L().events(now, x.st.settings).concat(window.A2Bosses ? window.A2Bosses.events(now) : []);
    // разломы — все в окне, остальные — ближайшее
    const out = [];
    for (let t = evs.find((e) => e.id === "rift").at; t <= until; t += 3 * 36e5) out.push({ at: t, name: "Разлом" });
    evs.filter((e) => e.id !== "rift" && e.at <= until).forEach((e) => out.push({ at: e.at, name: e.long }));
    return out.sort((a, b) => a.at - b.at);
  }
  const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);
  function today(x, q) {
    const m = /(\d+(?:[.,]\d+)?)\s*(час|ч(?![а-яё\d]))/.exec(low(q)); const hours = m ? +m[1].replace(",", ".") : 3;
    const p = x.p, lists = p.lists || {}, left = (k) => (lists[k] || []).filter((it) => !(p.checks[k] || {})[it.id]).map((it) => it.t);
    const out = [`**План на ${num(hours)} ч** (с ${hhmm(Date.now())}):`];
    const ev = events(x, hours);
    if (ev.length) out.push("По времени:\n" + ev.map((e) => `- **${hhmm(e.at)}** — ${e.name}`).join("\n"));
    const d = left("daily");
    if (d.length) out.push("Дела дня (" + d.length + " осталось):\n" + d.slice(0, 8).map((t, i) => `${i + 1}. ${t}`).join("\n"));
    else out.push("Дела дня закрыты ✓");
    const od = L().odyleNow(p.odyle, Date.now());
    if (od != null && od >= 400) out.push(`Энергия Одилы ${od}/560 — потрать в экспедициях (Ущелье ауругу, Пещера Крао), иначе прирост сгорит.`);
    const wk = left("weekly"), wReset = L().events(Date.now(), x.st.settings).find((e) => e.id === "weekly");
    if (wk.length && wReset && wReset.at - Date.now() < 36 * 36e5) out.push(`До недельного сброса ${L().fmtDelta(wReset.at - Date.now())} — не забудь: ${wk.slice(0, 4).join("; ")}.`);
    if ((lists.mine || []).length) { const mn = left("mine"); if (mn.length) out.push("Свои дела: " + mn.join("; ") + "."); }
    if (x.an && x.an.emptySockets) out.push(`Между делами: вставь манакамни в ${x.an.emptySockets} пустых гнёзд (+${num(x.an.emptySockets * 2.5)} GS).`);
    return { md: out.join("\n\n"), chips: ["Как быстрее поднять GS?", "Таймеры боссов"] };
  }
  function schedule(x) {
    const now = Date.now(), evs = L().events(now, x.st.settings);
    const rift = evs.find((e) => e.id === "rift"), rifts = [0, 1, 2, 3].map((i) => hhmm(rift.at + i * 3 * 36e5));
    return { md: `**Расписание** (время твоего компьютера):\n\n- Разломы каждые 3 ч: ближайшие ${rifts.join(", ")}\n` + evs.filter((e) => e.id !== "rift").map((e) => `- ${e.long}: ${new Date(e.at).toLocaleString("ru-RU", { weekday: "short", hour: "2-digit", minute: "2-digit" })} (через ${L().fmtDelta(e.at - now)})`).join("\n") + "\n\nЧасовой пояс сервера и время сбросов меняются в **Настройках**.", chips: ["Что делать сегодня вечером?"] };
  }
  function stats(x) {
    const a = x.an, out = ["**Характеристики**"], sh = a ? a.sheet : {};
    const keys = [["Attack", "АТК"], ["Critical", "Крит. удар"], ["Accuracy", "Меткость"], ["CombatSpeed", "СКР боя, %"], ["AdditionalHitRate", "Мультиудар, %"], ["CoolTimeDecrease", "Перезарядка, %"], ["HPMax", "ОЗ"], ["DefenseMain", "ЗЩТ"]].filter(([k]) => sh[k] != null && sh[k] !== "");
    if (keys.length) out.push("Сейчас: " + keys.map(([k, l]) => `${l} ${num(sh[k])}`).join(", ") + ".");
    const g = guide(x, "Статы"); if (g) out.push(excerpt(g, 900));
    return { md: out.join("\n\n"), chips: ["Проверь мои стигмы", "Что точить выгоднее?"] };
  }
  function gear(x) {
    const a = x.an; if (noChar(x)) return { md: needImport + "\n\n" + excerpt(guide(x, "Экипировка"), 800) };
    const weak = a.gear.filter((g) => g.item).sort((p, q) => p.ilvl - q.ilvl).slice(0, 4);
    const out = ["**Снаряжение**", "Самые слабые места (по уровню предмета): " + weak.map((g) => `${g.name} — ${g.item} +${g.ench} (ур. ${g.ilvl})`).join("; ") + "."];
    const empty = a.gear.filter((g) => !g.item); if (empty.length) out.push("Пустые слоты: " + empty.map((g) => g.name).join(", ") + ".");
    if (a.emptySockets) out.push(`Пустых гнёзд под манакамни: ${a.emptySockets}.`);
    const g = guide(x, "Экипировка"); if (g) out.push("Из гайда:\n" + excerpt(g, 900));
    return { md: out.join("\n\n"), chips: ["Что точить выгоднее?", "Где выбить плавильный камень?"] };
  }
  function plan(x, q) {
    const a = x.an; if (!a || !a.plans.length) return { md: "Планы совпадают с тем, что сейчас в игре. Измени что-нибудь в **Калькуляторе** (вкладка «План») — и спроси снова.", chips: ["Как быстрее поднять GS?"] };
    const out = ["**Разбор планов** (от «Сейчас в игре»):"];
    a.plans.forEach((pl) => {
      const lines = [`**${pl.name}**${pl.active ? " (активный)" : ""}`];
      if (pl.crystals) lines.push(`- Кристаллы Дэваниона: ${pl.crystals}`);
      if (pl.en.rows.length) lines.push(`- Заточка: ${pl.en.rows.map((r) => `${r.name} +${r.from}→+${r.to}`).join(", ")} — ≈${fmtK(pl.en.gold)} кинаров`);
      if (pl.en.missing.length) lines.push(`- Нет шансов заточки для: ${pl.en.missing.map((m) => m.name).join(", ")}`);
      lines.push(`- Даёт ≈ +${num(pl.dps)}% урона и +${num(pl.tank)}% живучести (оценка по весам советника)`);
      if (pl.en.gold > 0 && pl.dps > 0) lines.push(`- Эффективность: ≈${num(pl.dps / (pl.en.gold / 1e6), 2)}% урона на 1 млн кинаров`);
      if (pl.diff.length) lines.push(`- Показатели: ${pl.diff.join(", ")}`);
      out.push(lines.join("\n"));
    });
    out.push("Порядок обычно такой: сначала бесплатное (манакамни, Дэванион из накопленных кристаллов, шаги заточки со 100% шансом), потом рискованные плюсы — начиная с вещи с лучшей «пользой на 100 тыс.» (вопрос «что точить выгоднее»).");
    return { md: out.join("\n\n"), chips: ["Что точить выгоднее?", "Куда вложить 40 кристаллов?"] };
  }
  function build(x) {
    const first = (title, n) => (guide(x, title).split("\n").map((l) => l.trim()).filter((l) => l && !/^(вариант|набор)/i.test(l)).slice(0, n));
    const out = [`**Билд ${window.A2CLS.gen(x.ch.cls)} — коротко**`];
    const st2 = stigma(x).md.split("\n\n").find((p2) => /Не хватает|совпадает/.test(p2)); if (st2) out.push("**Стигмы:** " + st2.replace(/^По гайду нужны:\s*/, ""));
    const sk = first("Навыки", 3); if (sk.length) out.push("**Умения:**\n" + sk.map((l) => "- " + l.replace(/^[•\-\d.\s]+/, "")).join("\n"));
    const ro = first("Ротация", 4); if (ro.length) out.push("**Ротация:**\n" + ro.map((l) => "- " + l.replace(/^[•\-\s]+/, "")).join("\n"));
    const sa = first("Статы", 1); if (sa.length) out.push("**Характеристики:** " + sa[0]);
    const dv2 = first("Дэванион", 2); if (dv2.length) out.push("**Дэванион:** " + dv2.join(" ").replace(/[•]/g, ""));
    const ge = first("Экипировка", 1); if (ge.length) out.push("**Снаряжение:** " + ge[0]);
    out.push("Подробнее по любой части — спроси: «проверь стигмы», «какие статы важнее», «куда вложить кристаллы».");
    return { md: out.join("\n\n"), chips: ["Проверь мои стигмы", "Какие характеристики важнее?", "Куда вложить 40 кристаллов?"], it: "build" };
  }
  function progress(x) {
    const h = (x.p.history || []).filter((r) => r.gs && r.ts).map((r) => ({ gs: +r.gs, t: new Date(r.ts.replace(" ", "T")).getTime() })).filter((r) => r.t).sort((a, b) => a.t - b.t);
    const goal = x.prof.gs_goal || 1600, out = [`**Прогресс GS** — сейчас ${x.gs || "?"}, цель ${goal}.`];
    if (h.length >= 2) {
      const a = h[0], b = h[h.length - 1], days = Math.max(.25, (b.t - a.t) / 864e5), rate = (b.gs - a.gs) / days;
      out.push(`С ${new Date(a.t).toLocaleDateString("ru-RU")} набрано **${b.gs - a.gs >= 0 ? "+" : ""}${b.gs - a.gs}** за ${num(days)} дн. — в среднем ${num(rate)} в день.`);
      if (rate > 0 && goal > b.gs) out.push(`При таком темпе цель ${goal} — примерно через **${Math.ceil((goal - b.gs) / rate)} дн.** (${new Date(Date.now() + (goal - b.gs) / rate * 864e5).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}).`);
      out.push("Последние записи: " + h.slice(-5).map((r) => `${new Date(r.t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${r.gs}`).join(", ") + ".");
    } else out.push("Записей пока мало. Пиши мне «GS 1150» после каждого апгрейда — посчитаю темп и прогноз. Импорт персонажа тоже записывает GS.");
    const th = nextThr(x); if (th.length) out.push(`Ближайший порог: ${th[0].gs} — ${th[0].name}.`);
    return { md: out.join("\n\n"), chips: ["Как быстрее поднять GS?", "Хочу 1300 GS — хватит ли без риска?"] };
  }
  function hello(x, q) {
    const thanks = /спасиб|благодар/.test(low(q));
    return { md: (thanks ? "Пожалуйста! " : "Привет! ") + `Я встроенный помощник по AION 2 — работаю без интернета и считаю по данным программы для **${x.ch.name}**. Могу:
- подсказать, как быстрее поднять GS (сейчас ${x.gs || "?"});
- расписать, куда вложить кристаллы Дэваниона и что выгоднее точить — с ценой в кинарах;
- сверить стигмы и умения с гайдом;
- найти, с кого падает предмет в Альтгарде, и напомнить про боссов;
- составить план на вечер по расписанию и списку дел;
- запоминать за тебя: «убил Кашапу 10 минут назад», «одила 320», «GS 1150», «сделал кошмары и поставки», «заточил перчатки до +8», «добавь дело купить камни», «напомни через 30 минут проверить аукцион»;
- держать твою цель и строить план по дням: «моя цель 1300 GS к пятнице», «мой бюджет 3 млн», «как дойти до цели?»;
- считать «что будет, если заточу оружие до +15 и возьму 40 кристаллов» и риск заточки;
- вести журнал добычи и удачи: «выпала картина Кашапы», «моя удача», «итоги недели».`, chips: ["Как быстрее поднять GS?", "Что делать сегодня вечером?", "Проверь мои стигмы"] };
  }
  function fallback(x, q) {
    const kb = window.A2AI ? window.A2AI.pickKb(q, 2, 2600, 2) : [];
    const gs = (x.prof.build || []).filter((s) => low(q).split(/\s+/).some((w) => w.length > 4 && low(s.text).includes(w.slice(0, 5)))).slice(0, 1);
    const out = [];
    if (kb.length || gs.length) {
      out.push("Вот что нашлось по твоему вопросу:");
      gs.forEach((s) => out.push(`**Гайд — ${s.title}**\n${excerpt(s.text, 700)}`));
      kb.forEach((c) => out.push(`**${c.t}**\n${excerpt(c.x, 900)}`));
    } else out.push("Не нашёл ответа на этот вопрос по AION 2 в своих данных. Лучше всего я отвечаю про рост GS, Дэванион, заточку, стигмы, умения, добычу, боссов и план на день — и понимаю команды вроде «убил Кашапу» или «одила 320».");
    return { md: out.join("\n\n"), chips: ["Как быстрее поднять GS?", "Что делать сегодня вечером?", "Где выбить плавильный камень?"] };
  }

  // ================= понимание вопроса =================
  const END = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ешь|ает|яет|ует|ают|яют|уют|ить|ать|ять|еть|уть|ться|тся|ой|ей|ий|ый|ая|яя|ое|ее|ые|ие|ую|юю|ам|ям|ах|ях|ом|ем|ов|ев|ью|ия|ть|ти|ся|сь|а|я|о|е|ы|и|у|ю|ь|й)$/;
  function stem(w) { w = low(w); if (w.length <= 4) return w; const s = w.replace(END, ""); return s.length >= 3 ? s : w.slice(0, 3); }
  const words = (s) => low(s).match(/[a-zа-я0-9+]+/g) || [];
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // ключ найден как подстрока или, для длинных ключей, с одной опечаткой в начале слова
  function hasKey(t, toks, k) {
    if (t.includes(k)) return true;
    if (k.length < 5 || /\s/.test(k)) return false;
    return toks.some((w) => w.length >= k.length - 1 && lev(w.slice(0, k.length), k) <= 1);
  }
  function intents(q) {
    const t = " " + low(q) + " ", toks = words(q);
    const res = INTENTS.map(([id, keys], i) => { let s = 0; keys.forEach((k) => { if (hasKey(t, toks, k)) s += k.length > 5 ? 1.3 : 1; }); return [id, s - i * 0.001]; }).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    if (res[0] && res[0][0] === "farm" && /(где|выбит|дроп|пада)/.test(t) && !FARM_MAP.find(([re]) => re.test(t))) res[0][0] = "drops";
    // «где фармить кристаллы / орихалк / кубы» — это вопрос про место, а не про Дэванион или заточку
    if (/(где|фарм|добыть|достать|набить|выбить|взять)/.test(t) && !/(сколько|стоит|\+\d)/.test(t) && FARM_MAP.find(([re]) => re.test(t)) && !(res[0] && ["drops", "bosses"].includes(res[0][0]) && !/фарм/.test(t))) {
      const fi = res.findIndex((r) => r[0] === "farm"); if (fi > 0) res.unshift(res.splice(fi, 1)[0]); else if (fi < 0) res.unshift(["farm", 9]);
    }
    return res;
  }
  function intentOf(q) { const r = intents(q); return r[0] ? r[0][0] : null; }

  const SLOT_WORDS = [["weapon", ["оружи", "лук", "посох", "булав", "меч", "кинжал", "сфер", "гримуар"]], ["offhand", ["второй слот", "наруч", "щит"]], ["helmet", ["шлем"]],
    ["shoulders", ["наплеч"]], ["chest", ["нагрудн", "торс", "кирас"]], ["gloves", ["перчат"]], ["pants", ["понож", "штан", "набедрен"]], ["boots", ["сапог", "ботин", "обув"]],
    ["cape", ["плащ", "мантию", "мантия", "мантии"]], ["earring1", ["серьг", "серег"]], ["necklace", ["ожерел"]], ["ring1", ["кольц"]], ["amulet", ["амулет"]], ["bracelet", ["браслет"]], ["belt", ["пояс"]], ["rune1", ["рун"]]];
  const PAIR = { earring1: "earring2", ring1: "ring2", bracelet: "bracelet2", rune1: "rune2" };
  function entities(q, ch) {
    const t = low(q), toks = words(q), e = {};
    const sl = SLOT_WORDS.filter(([, ks]) => ks.some((k) => /\s/.test(k) ? t.includes(k) : toks.some((w) => w.startsWith(k) || (k.length >= 5 && lev(w.slice(0, k.length), k) <= 1)))).map(([id]) => id);
    if (sl.length) e.slots = sl;
    let m;
    if ((m = /(\d+(?:[.,]\d+)?)\s*(млн|миллион|kk|кк)/.exec(t))) e.kinah = +m[1].replace(",", ".") * 1e6;
    else if ((m = /(\d+(?:[.,]\d+)?)\s*(тыс|k\b|к(?![а-яё\d]))/.exec(t))) e.kinah = +m[1].replace(",", ".") * 1e3;
    else if ((m = /(\d{5,})\s*кинар/.exec(t.replace(/\s(?=\d{3}\b)/g, "")))) e.kinah = +m[1];
    if ((m = /(\d{1,4})\s*крист/.exec(t))) e.crystals = +m[1];
    if ((m = /(\d+(?:[.,]\d+)?)\s*(час|ч(?![а-яё\d]))/.exec(t))) e.hours = +m[1].replace(",", ".");
    if ((m = /(?:\+\s?|до\s+\+?|на\s+\+)(\d{1,2})(?![а-яё\d])/.exec(t))) e.to = +m[1];
    if ((m = /(?:до|на|в|цель)\s*(\d{3,4})(?![а-яё\d])(?!\s*(?:крист|тыс|млн|кинар))/.exec(t)) || (m = /(\d{3,4})\s*(?:gs|гс)/.exec(t)) || (m = /(?:gs|гс)\s*(\d{3,4})/.exec(t))) { if (+m[1] >= 300) e.gsTarget = +m[1]; }
    // умение или стигма по названию
    if (window.A2Calc && window.A2Calc.names) {
      const qs = toks.map(stem), N = window.A2Calc.names(ch);
      let best = null;
      N.skills.forEach(([id, name, kind]) => {
        const ns = words(name).filter((w) => w.length > 2).map(stem); if (!ns.length) return;
        const hit = ns.filter((s) => qs.some((w) => w === s || (s.length >= 5 && w.length >= 4 && (w.startsWith(s) || s.startsWith(w) || lev(w, s) <= 1)))).length;
        const sc = hit / ns.length;
        if (sc >= .66 && (!best || sc > best.sc || (sc === best.sc && ns.length > best.n))) best = { id, name, kind, sc, n: ns.length };
      });
      if (best) e.skill = best;
      else if (window.CALCDATA) { // умение другого класса
        Object.entries(window.CALCDATA.classes).forEach(([cl, cd]) => { if (cl === ch.cls) return; cd.skills.forEach((s2) => {
          const ns = words(s2.name).filter((w) => w.length > 2).map(stem); if (!ns.length) return;
          const hit = ns.filter((s3) => qs.some((w) => w === s3 || (s3.length >= 5 && w.length >= 4 && (w.startsWith(s3) || s3.startsWith(w))))).length;
          if (hit / ns.length >= .99 && ns.length >= 2) e.skillOther = { cls: cl, s: s2 }; }); });
      }
      const bd = N.boards.find((b) => qs.some((w) => w.length >= 4 && (stem(b).startsWith(w) || w.startsWith(stem(b)) || lev(w, stem(b)) <= 1)));
      if (bd) e.board = bd;
    }
    // босс по имени
    const X = window.EXTRA;
    if (X) {
      const qs = toks.filter((w) => w.length >= 4).map(stem);
      // имя босса — слова с заглавной буквы; «Острый», «Глава», «Немая» и т. п. в начале не считаем
      const nameWords = (n) => { const caps = n.split(" ").filter((w) => /^[А-ЯЁ]/.test(w)); return (caps.length > 1 ? caps.slice(1) : caps).map(low).filter((w) => w.length >= 4); };
      const hit = X.bosses.filter((b) => nameWords(b[1]).some((w) => qs.some((q2) => q2 === stem(w) || (q2.length >= 4 && lev(q2, stem(w)) <= 1))));
      if (hit.length && hit.length <= 3) e.bosses = hit;
    }
    return e;
  }

  // ================= поиск по справочнику (BM25 + лучшие предложения) =================
  let corpus = null;
  function buildCorpus(x) {
    const docs = [];
    (window.KB || []).forEach((c) => docs.push({ t: c.t, x: c.x, src: "Справочник" }));
    (x.prof.build || []).forEach((s) => docs.push({ t: "Гайд — " + s.title, x: s.text, src: "Гайд" }));
    (x.C.common.thresholds || []).forEach((t) => docs.push({ t: `Порог GS ${t.gs}`, x: `GS ${t.gs}: ${t.name}. ${t.why}.`, src: "Пороги" }));
    (x.C.common.levers || []).forEach((l) => docs.push({ t: l.name || l.title || "Рычаг GS", x: typeof l === "string" ? l : JSON.stringify(l).replace(/[{}"\[\]]/g, " "), src: "Рычаги" }));
    const CD = window.CALCDATA; if (CD) Object.values(CD.classes).forEach((c) => c.skills.forEach((s) => docs.push({ t: s.name, x: s.name + ". " + String(s.tip || "").replace(/<[^>]+>|\{\d+\}/g, "…"), src: "Умение" })));
    docs.forEach((d) => { d.toks = words(d.t + " " + d.x).map(stem); d.len = d.toks.length; d.tf = {}; d.toks.forEach((w) => d.tf[w] = (d.tf[w] || 0) + 1); });
    const df = {}; docs.forEach((d) => Object.keys(d.tf).forEach((w) => df[w] = (df[w] || 0) + 1));
    const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
    corpus = { docs, df, avg, N: docs.length };
    return corpus;
  }
  const STOPW = new Set("как что где куда когда зачем почему какой какая какие какую мне мой моя мои мое для это этот эта или если есть надо нужно можно сейчас лучше больше меньше очень про под при над без через после перед тоже также чтобы еще все the and игр aion".split(" ").map(stem));
  function search(x, q, n = 2) {
    const C = corpus || buildCorpus(x), qt = [...new Set(words(q).filter((w) => w.length > 2).map(stem).filter((w) => !STOPW.has(w)))];
    if (!qt.length) return [];
    const idf = (w) => Math.log(1 + (C.N - (C.df[w] || 0) + .5) / ((C.df[w] || 0) + .5));
    const sc = C.docs.map((d) => { let s = 0; qt.forEach((w) => { const f = d.tf[w] || 0; if (f) s += idf(w) * (f * 2.2) / (f + 1.2 * (.25 + .75 * d.len / C.avg)); }); return [s, d]; }).filter((r) => r[0] > 0).sort((a, b) => b[0] - a[0]);
    return sc.slice(0, n).map(([s, d]) => {
      const sents = d.x.split(/(?<=[.!?…])\s+|\n+/).map((s2) => s2.trim()).filter((s2) => s2.length > 25 && !/^\|?[-:| ]+\|?$/.test(s2));
      const ss = sents.map((s2, i) => { const st = new Set(words(s2).map(stem)); let v = 0; qt.forEach((w) => { if (st.has(w)) v += idf(w); }); return [v, i, s2]; }).filter((r) => r[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).sort((a, b) => a[1] - b[1]);
      return { score: s, d, text: ss.map((r) => r[2]).join(" ") || excerpt(d.x, 500) };
    });
  }

  // ================= точечные ответы =================
  const calc = () => window.A2Calc;
  function skillAnswer(x, e) {
    const s = calc().skillInfo(x.st, x.p, x.ch, e.skill.id); if (!s) return null;
    const out = [`**${s.name}** — ${s.kind === "stigma" ? "стигма" : s.kind === "active" ? "активное умение" : "пассивное умение"}`];
    if (s.kind === "stigma") out.push(s.lv ? `Уровень ${s.lv} из ${s.buyMax}${s.inSlot ? `, надета в слот ${s.inSlot}` : ", **не надета**"}.` : "Не изучена.");
    else out.push(s.lv ? `Уровень **${s.total}** (${s.lv} куплено очками${s.bonus ? ` + ${s.bonus} бонус Дэваниона/вещей` : ""}), покупается до ${s.buyMax}.` : `Не изучено (открывается на ${s.unlock} ур.).`);
    if (s.next) out.push(`Следующий уровень стоит **${s.next}** ${s.kind === "stigma" ? "очк. стигм" : "очк. умений"}.`);
    out.push(`Что делает на ${Math.max(1, s.total)} ур.:\n${s.tip}`);
    if (s.tipNext) { const a = s.tip.match(/\d+(?:[.,]\d+)?/g) || [], b = s.tipNext.match(/\d+(?:[.,]\d+)?/g) || []; const ch = b.map((v, i) => v !== a[i] ? `${a[i] || "?"}→${v}` : null).filter(Boolean); if (ch.length) out.push(`На ${s.total + 1} ур. числа меняются: ${ch.slice(0, 6).join(", ")}.`); }
    if (s.specs.length) out.push("Особенности:\n" + s.specs.map((p) => `- ${p.open ? (p.chosen ? "✅" : "🔓") : "🔒"} с ${p.unlock} ур. — ${p.text}`).join("\n") + (s.kind !== "stigma" ? `\n_Ячейки особенностей открываются на ${s.specSlots.join(", ")} ур. умения._` : ""));
    const g = (x.prof.build || []).map((b) => b.text.split("\n").filter((l) => low(l).includes(low(s.name)))).flat().slice(0, 3);
    if (g.length) out.push("В гайде:\n" + g.map((l) => "- " + l.replace(/^[•\-\s]+/, "")).join("\n"));
    return { md: out.join("\n\n"), chips: [s.kind === "stigma" ? "Проверь мои стигмы" : "Проверь умения", "Как быстрее поднять GS?"], acts: [{ label: "Открыть в калькуляторе", a: { t: "calc", tab: s.kind === "stigma" ? "stigmas" : "skills" } }] };
  }
  function bossAnswer(x, e) {
    const B = window.A2Bosses, X = window.EXTRA, now = Date.now(), out = [], acts = [];
    e.bosses.forEach((b) => {
      const [slug, name, lv, zone, cat] = b, at = B.respawnAt(slug), m = X.mobs.find((mm) => mm[0] === slug);
      const top = m ? m[6].filter((r) => r[1] >= 1 && r[1] < 100 && !/Сундук|Камень духа/.test(X.items[r[0]][0])).slice(0, 5).map((r) => `${X.items[r[0]][0]} ${num(r[1], 2)}%`) : [];
      out.push(`**${name}** — ${lv} ур., ${zone}.\n` + (at ? (at <= now ? "По твоей отметке уже должен появиться." : `По твоей отметке появится через **${L().fmtDelta(at - now)}** (в ${hhmm(at)}).`) : "Убитым не отмечен — нажми «Убит», когда упадёт, и я напомню о возрождении.") + (top.length ? `\nДобыча: ${top.join(", ")}.` : ""));
      acts.push({ label: `${name.split(" ").slice(-1)[0]}: убит сейчас`, a: { t: "kill", slug } });
      if (cat) acts.push({ label: "На карте", a: { t: "map", cat } });
    });
    const cat0 = e.bosses[0] && e.bosses[0][4];
    return { md: out.join("\n\n"), chips: ["Таймеры боссов", "Где выбить плавильный камень?"], acts, auto: cat0 && /где|найти|карт|покажи/.test(low(lastQ)) ? { t: "mapCat", cat: cat0 } : null };
  }
  function enchSlotAnswer(x, e) {
    const out = [], acts = [];
    let slots = e.slots.slice(0, 3);
    slots = slots.flatMap((s) => PAIR[s] && x.an && x.an.gear.find((g) => g.id === PAIR[s] && g.item) ? [s, PAIR[s]] : [s]);
    slots.forEach((slot) => {
      const qd = calc().enchQuote(x.st, x.p, x.ch, slot, e.to); if (!qd) { out.push(`**${(SLOT_WORDS.find((s) => s[0] === slot) || [slot])[0]}** — слот пуст.`); return; }
      if (!qd.hasData) { out.push(`**${qd.name} — ${qd.item} +${qd.from}.** Нет данных о шансах: импортируй персонажа или укажи адрес предмета на metabot в редакторе снаряжения.`); return; }
      if (qd.to <= qd.from) { out.push(`**${qd.name} — ${qd.item}** уже +${qd.from}${qd.max ? ` (максимум +${qd.max})` : ""}.`); return; }
      const c = qd.cost, mats = Object.values(c.mats)[0] || 0;
      const lines = [`**${qd.name} — ${qd.item}: +${qd.from} → +${qd.to}**${qd.max ? ` (максимум +${qd.max})` : ""}`,
        `- Стоимость: ≈**${fmtK(c.gold)}** кинаров и ≈${fmtK(mats)} камней усиления`,
        `- Попыток в среднем: ${num(c.attempts)}${c.worst > c.attempts ? `; в худшем случае гарантия сработает примерно через ${c.worst} попыт.` : ""}`,
        c.risky ? "- ⚠️ На этих шагах при неудаче уровень падает — реальные траты могут быть выше" : "",
        qd.gain.length ? `- Прибавка: ${qd.gain.join(", ")}; уровень предмета +${qd.ilvl}` : "",
        `- Польза: ≈+${num(qd.dps, 2)}% урона, ≈+${num(qd.tank, 2)}% живучести`];
      const st = qd.steps ? qd.steps.slice(qd.from, qd.to).map((s, i) => `+${qd.from + i + 1}: ${s[0]}%`).join(", ") : "";
      if (st && qd.to - qd.from <= 6) lines.push(`- Шансы шагов: ${st}`);
      if (qd.steps && qd.steps.slice(qd.from, qd.to).some((z) => z[0] < 100)) {
        const sim = calc().enchSim(x.st, x.p, x.ch, slot, qd.to, mem(x).budget);
        if (sim) { lines.push(`- 🎲 Разброс (3000 симуляций): в половине случаев ≤ ${fmtK(sim.p50)}, в 9 из 10 ≤ **${fmtK(sim.p90)}**, повезёт — ${fmtK(sim.p10)}`);
          if (sim.pBudget != null) lines.push(`- С твоим запасом ${fmtK(mem(x).budget)} шанс дойти до +${qd.to}: **${num(sim.pBudget * 100, 0)}%**`); }
      }
      out.push(lines.filter(Boolean).join("\n"));
      acts.push({ label: `В план: ${qd.name} +${qd.to}`, a: { t: "planEnch", slot, to: qd.to } });
    });
    if (!e.to) out.push("_Спроси с целью, например «сколько стоит оружие до +15», — посчитаю путь целиком._");
    return { md: out.join("\n\n"), chips: ["Что точить выгоднее?", "У меня 2 млн кинаров — что точить?"], acts };
  }
  function budgetAnswer(x, e) {
    const r = calc().enchBudget(x.st, x.p, x.ch, e.kinah, "dps");
    if (!r.rows.length) return { md: `На ${fmtK(e.kinah)} кинаров выгодных шагов заточки не нашлось (или нет данных о шансах — импортируй персонажа).`, chips: ["Что точить выгоднее?"] };
    const out = [`**Как потратить ${fmtK(e.kinah)} кинаров на заточку** (сначала то, что даёт больше урона на кинар):`,
      r.rows.map((o, i) => `${i + 1}. ${o.name} (${o.item}) +${o.from}→+${o.to} — ≈${fmtK(o.gold)}`).join("\n"),
      `Итого ≈${fmtK(r.spent)} (останется ≈${fmtK(r.left)}), прибавка ≈ **+${num(r.total)} ${r.unit.replace("≈", "")}**. Это средние траты; на шагах ниже 100% может уйти больше или меньше.`];
    return { md: out.join("\n\n"), chips: ["Куда вложить 40 кристаллов?", "Как быстрее поднять GS?"], acts: r.rows.map((o) => ({ label: `В план: ${o.name} +${o.to}`, a: { t: "planEnch", slot: o.id, to: o.to } })).slice(0, 4) };
  }
  function boardAnswer(x, e) {
    const b = calc().dvBoardInfo(x.st, x.p, x.ch, e.board, e.crystals || 40); if (!b) return null;
    const out = [`**${b.name}**: взято ${b.got}/${b.total} ячеек, потрачено ${b.cost}/${b.costTotal} кристаллов${b.open ? "" : ` — доска откроется на ${b.needLevel} ур.`}. До полного заполнения: **${b.costTotal - b.cost}** кристаллов.`];
    if (b.sums.length) out.push("Уже даёт: " + b.sums.join(", ") + ".");
    if (b.picks.length) out.push(`Лучшие следующие ячейки на этой доске (${e.crystals || 40} кр.):\n` + b.picks.slice(0, 10).map((p, i) => `${i + 1}. ${p.label} — ${p.cost} кр.`).join("\n"));
    return { md: out.join("\n\n"), chips: ["Куда вложить 40 кристаллов?"], acts: b.picks.length ? [{ label: `В план: ${b.name}, ${e.crystals || 40} кр.`, a: { t: "planDv", budget: e.crystals || 40, board: b.name } }] : [] };
  }
  function gsTargetAnswer(x, e) {
    const a = x.an, gs = x.gs || 0, need = e.gsTarget - gs;
    if (need <= 0) return { md: `GS ${gs} — цель ${e.gsTarget} уже взята. Следующий порог: ${(nextThr(x)[0] || {}).gs || "—"}.`, chips: ["Как быстрее поднять GS?"] };
    const out = [`**До GS ${e.gsTarget} не хватает ${need}.**`];
    if (a && a.gear.some((g) => g.item)) {
      const sock = a.emptySockets * 2.5;
      const safe = a.ench.filter((x2) => x2.safeTo > x2.ench && x2.safeCost);
      const safeGs = safe.reduce((s, x2) => s + (x2.safeTo - x2.ench) * (x2.id === "weapon" ? 2 : 1), 0), safeGold = safe.reduce((s, x2) => s + x2.safeCost.gold, 0);
      out.push(`- Манакамни в пустые гнёзда: ≈+${num(sock)}\n- Безрисковая заточка (100%): ≈+${safeGs} за ≈${fmtK(safeGold)} кинаров`);
      const tot = sock + safeGs;
      out.push(tot >= need ? `Этого **хватит** (≈+${num(tot)}): без риска и без новых вещей.` : `Это даёт ≈+${num(tot)} — не хватит ещё ≈${num(need - tot)}. Остальное: рискованная заточка выше +10, замена бижутерии 33–43 ур. и Арканы (с 1 600 — по +40 за карту).`);
    }
    const th = (x.C.common.thresholds || []).filter((t) => t.gs > gs && t.gs <= e.gsTarget);
    if (th.length) out.push("По пути откроется:\n" + th.map((t) => `- ${t.gs}: ${t.name}`).join("\n"));
    return { md: out.join("\n\n"), chips: ["Как быстрее поднять GS?", "Что точить выгоднее?"] };
  }
  const WHY = {
    growth: "Порядок «бесплатное → дешёвое → рискованное»: манакамни и шаги заточки со 100% шансом дают GS гарантированно, а шаги выше +10 могут сжечь в разы больше кинаров. Ячейки Дэваниона я выбираю жадно: на каждом шаге беру доступную ячейку с лучшей пользой на кристалл (с учётом того, что дешёвая ячейка может открывать путь к ценной).",
    dv: "Каждой ячейке я считаю пользу в «% урона»: АТК пересчитываю через твою текущую атаку (1% атаки = АТК/100), проценты урона и скорости боя — почти 1:1, крит и меткость — слабее. Делю на цену в кристаллах и иду цепочкой от уже взятых ячеек, как требует игра.",
    enchant: "До +10 шанс обычно 100% — платишь только кинары и камни усиления. Выше +10 шанс падает (у уникальных вещей 65 → 50 → 35 → 25 → 20%), но каждая неудача прибавляет к шансу следующей попытки 5% («гарантия», pity), пока не повезёт; у некоторых вещей (руны) при неудаче уровень падает на 1. Ожидаемые траты считаю по шансам каждого шага и гарантии (+5% к шансу после каждой неудачи). «Польза на 100 тыс.» — прибавка от следующего +1 (из прироста за заточку в карточке предмета), делённая на её среднюю цену.",
    skills: "Очки умений покупают уровни до 10 (цена растёт: 1–1–1–2–2–2–4–4–4), всё выше — только бонусы Дэваниона и вещей. На 8, 12 и 20 уровне умения открываются ячейки особенностей — поэтому выгодно доводить ключевые умения именно до этих порогов.",
    goal: "Сначала беру бесплатный прирост (манакамни в пустые гнёзда, +2,5 GS за камень), потом шаги заточки в порядке «меньше всего кинаров за +1 уровня предмета» — по каждой вещи по очереди, как в игре. Складываю, пока не наберётся нужный GS, и сравниваю цену с твоим запасом и доходом за оставшиеся дни.",
    whatif: "Я делаю копию твоего персонажа, применяю к ней изменения (заточку с приростом из карточек вещей, ячейки Дэваниона, камни) и сравниваю показатели копии с текущими. Цена заточки — средняя по шансам и гарантии.",
    compare: "Если варианты тратят один ресурс (например, кинары), сравниваю пользу на 100 тыс. кинаров и риск шага. Если ресурсы разные (кинары, кристаллы, очки, манакамни), варианты не конкурируют — делаю оба, начиная с бесплатного и дешёвого: так GS растёт быстрее всего на единицу затрат. Урон и защиту не смешиваю — это выбор цели.",
    resources: "Порядок такой: сначала то, что почти ничего не стоит (манакамни в пустые гнёзда, свободные очки умений и стигм), потом ресурсы, которые больше ни на что не тратятся (кристаллы Дэваниона), и в конце — кинары на заточку, начиная с шагов с лучшей пользой на кинар. Так каждый ресурс работает с максимальной отдачей.",
    gear: "Слабые места определяю по уровню предмета: вещь с самым низким уровнем сильнее всего тянет GS вниз. Гайд советует сначала камни в гнёзда, потом заточку брони до +10, привязку души и только потом замену бижутерии.",
    stigma: "Сверяю надетые стигмы с набором из гайда. В гайде «Рассекающая стрела (Explosive Arrow)» — в данных игры эта стигма называется «Взрывная стрела».",
  };

  // ================= команды из чата =================
  // «убил Кашапу 5 минут назад», «одила 320», «сделал кошмары», «напомни через 30 минут проверить аукцион» …
  const undos = {};
  function snapState(x) {
    const p = x.p, k = p.calc || {};
    return JSON.stringify({ bossT: x.st.bossT || {}, timers: x.st.timers || [], lists: p.lists || null, checks: p.checks, odyle: p.odyle || null, history: p.history || [], cur: k.cur ? k.cur.gear : null, plan: k.plan ? k.plan.gear : null, pid: x.app.pid, chars: x.st.chars, kills: x.st.kills || [], loot: x.st.loot || [], mem: p.mem || {}, syn: (x.st.ai || {}).syn || [] });
  }
  function undo(id) {
    const u = undos[id]; if (!u) return false;
    const s = JSON.parse(u), st = A().state, p = st.profiles[s.pid];
    st.bossT = s.bossT; st.timers = s.timers; st.chars = s.chars; st.kills = s.kills; st.loot = s.loot; st.ai = st.ai || {}; st.ai.syn = s.syn;
    if (p) p.mem = s.mem;
    if (p) { if (s.lists) p.lists = s.lists; p.checks = s.checks; p.odyle = s.odyle; p.history = s.history; if (p.calc && s.cur) { p.calc.cur.gear = s.cur; p.calc.plan.gear = s.plan; } }
    delete undos[id]; A().save(); A().renderAll && A().renderAll(); return true;
  }
  function whenAgo(t) {
    let m;
    if ((m = /(\d+)\s*(мин|м(?![а-яё\d]))[а-яё\w]*\s*назад/.exec(t))) return Date.now() - +m[1] * 60e3;
    if ((m = /(\d+(?:[.,]\d+)?)\s*(час|ч(?![а-яё\d]))[а-яё\w]*\s*назад/.exec(t))) return Date.now() - +m[1].replace(",", ".") * 36e5;
    if (/полчаса назад/.test(t)) return Date.now() - 30 * 60e3;
    if (/час назад/.test(t)) return Date.now() - 36e5;
    if ((m = /(?<![а-яё])в\s+(\d{1,2})[:.](\d{2})/.exec(t))) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() > Date.now() + 60e3) d.setDate(d.getDate() - 1); return d.getTime(); }
    return Date.now();
  }
  const KILL = /(убил|убили|убит|завалил|завалили|снес|снесли|сн[её]с|слили|слил|упал|упала|умер|умерла|забрал|забрали|зарезал|положил|положили|отметь)/;
  // поиск пункта в списках дел по смыслу
  function findTasks(x, text) {
    const p = x.p, L2 = p.lists || {}, qs = new Set(words(text).filter((w) => w.length > 2).map(stem).filter((w) => !STOPW.has(w) && !/^(сдела|выполн|закр|отмет|готов|прош|сня|отмен)/.test(w)));
    if (!qs.size) return [];
    const out = [];
    ["daily", "weekly", "mine"].forEach((k) => (L2[k] || []).forEach((it) => {
      const ws = words(it.t).filter((w) => w.length > 2).map(stem); if (!ws.length) return;
      const hit = ws.filter((w) => qs.has(w) || [...qs].some((q2) => q2.length >= 5 && (w.startsWith(q2) || q2.startsWith(w)))).length;
      if (hit) out.push({ k, it, sc: hit / Math.min(ws.length, qs.size + 1) + hit * .05 });
    }));
    return out.sort((a, b) => b.sc - a.sc);
  }
  function command(q) {
    // «запомни: пуха — это оружие» — до перевода сленга, иначе запомним уже переведённое
    const rawT = low(q).trim(); let tm;
    if ((tm = /^запомни[:,]?\s*(.+?)\s+(?:—|–|-|=|значит)\s+(?:это\s+)?(.+)$/.exec(rawT)) && !/цель|бюджет|играю|доход/.test(rawT)) {
      const a = tm[1].replace(/[«»"]/g, "").trim(), b = tm[2].replace(/[«»"]/g, "").trim(), st0 = A().state;
      if (a.length >= 2 && b.length >= 2) { const before0 = snapState(ctx(q)); st0.ai = st0.ai || {}; st0.ai.syn = (st0.ai.syn || []).filter((z) => z.a !== a); st0.ai.syn.push({ a, b }); const id = "u" + Date.now(); undos[id] = before0; A().save(); return { md: `✅ Запомнил: «${a}» = «${b}». Теперь понимаю так.`, cmd: true, acts: [{ label: "Отменить", a: { t: "undo", id } }] }; }
    }
    q = normalize(q).q;
    const x = ctx(q), t = low(q).trim(), st = x.st, p = x.p, now = Date.now();
    const done = (md, extra = {}) => { const id = "u" + now + Math.random().toString(36).slice(2, 5); undos[id] = before; A().save(); A().renderAll && A().renderAll(); return Object.assign({ md: "✅ " + md, cmd: true, acts: [{ label: "Отменить", a: { t: "undo", id } }].concat(extra.acts || []), chips: extra.chips || [] }); };
    const before = snapState(x);
    const ents = entities(q, x.ch);
    let m;
    const c3 = command3(q, x, t, ents); if (c3) return c3;
    const c2 = command2(q, x, t, ents, done); if (c2) return c2;
    // --- боссы ---
    if (ents.bosses && /(сбрось|сброс|отмени|удали|убери)\s*(таймер|отметк)?/.test(t)) {
      st.bossT = st.bossT || {}; ents.bosses.forEach((b) => { if (st.bossT[b[0]]) delete st.bossT[b[0]].killed; });
      return done(`Сбросил таймер: ${ents.bosses.map((b) => b[1]).join(", ")}.`);
    }
    if (ents.bosses && !KILL.test(t) && /(респ|возрожд|появляется|кд(?![а-яё\d]))/.test(t) && (m = /(\d+(?:[.,]\d+)?)\s*(мин|м(?![а-яё\d])|час|ч(?![а-яё\d]))/.exec(t))) {
      const min = Math.round(+m[1].replace(",", ".") * (/^ч|^час/.test(m[2]) ? 60 : 1));
      st.bossT = st.bossT || {}; ents.bosses.forEach((b) => { st.bossT[b[0]] = Object.assign({}, st.bossT[b[0]], { every: min }); });
      return done(`Запомнил: ${ents.bosses.map((b) => b[1]).join(", ")} — возрождение через ${min} мин после убийства.`);
    }
    if (ents.bosses && KILL.test(t) && !/(когда|сколько|где|\?)/.test(t)) {
      const at = whenAgo(t), B = window.A2Bosses;
      st.bossT = st.bossT || {};
      ents.bosses.forEach((b) => { st.bossT[b[0]] = Object.assign({}, st.bossT[b[0]], { killed: at }); logKill(st, b[0], at); });
      const lines = ents.bosses.map((b) => { const r = B.respawnAt(b[0]); return `**${b[1]}** — убит в ${hhmm(at)}, возродится в **${hhmm(r)}** (через ${L().fmtDelta(r - now)})`; });
      return done(lines.join("\n") + "\nНапомню заранее.", { chips: ["Таймеры боссов"] });
    }
    // --- свой таймер / напоминание ---
    if ((m = /(?:напомни|напоминание|таймер|поставь таймер)\s*(?:мне\s*)?(?:через|на)\s*(\d+(?:[.,]\d+)?)\s*(минут[а-яё\w]*|мин|м(?![а-яё\d])|час[а-яё\w]*|ч(?![а-яё\d]))\s*(.*)$/.exec(t))) {
      const min = Math.round(+m[1].replace(",", ".") * (/^ч|^час/.test(m[2]) ? 60 : 1)), name = (q.slice(q.length - m[3].length).trim() || "Напоминание").replace(/^(что|про|о|об)\s+/i, "");
      st.timers = st.timers || []; st.timers.push({ id: Math.random().toString(36).slice(2, 8), name: name.slice(0, 40), min, repeat: /каждые/.test(t), start: now });
      return done(`Таймер «${name}» — через ${min} мин (в ${hhmm(now + min * 60e3)}).`);
    }
    if ((m = /(?:напомни|напоминание)\s*(?:мне\s*)?в\s*(\d{1,2})[:.](\d{2})\s*(.*)$/.exec(t))) {
      const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1);
      const name = (q.slice(q.length - m[3].length).trim() || "Напоминание").replace(/^(что|про|о|об)\s+/i, "");
      st.timers = st.timers || []; st.timers.push({ id: Math.random().toString(36).slice(2, 8), name: name.slice(0, 40), min: Math.max(1, Math.round((d.getTime() - now) / 60e3)), repeat: false, start: now });
      return done(`Напомню «${name}» в ${hhmm(d.getTime())}.`);
    }
    if ((m = /(?:каждые)\s*(\d+)\s*(минут[а-яё\w]*|мин|час[а-яё\w]*|ч(?![а-яё\d]))\s*(?:напоминай|напомни)?\s*(.*)$/.exec(t)) && /напомин|таймер/.test(t)) {
      const min = +m[1] * (/^ч|^час/.test(m[2]) ? 60 : 1), name = (q.slice(q.length - m[3].length).trim() || "Повтор").slice(0, 40);
      st.timers = st.timers || []; st.timers.push({ id: Math.random().toString(36).slice(2, 8), name, min, repeat: true, start: now });
      return done(`Повторяющийся таймер «${name}» — каждые ${min} мин.`);
    }
    // --- энергия Одилы ---
    if ((m = /одил[а-яё\w]*\s*(?:сейчас|теперь|у меня|=|:)?\s*(\d{1,3})(?![а-яё\d])/.exec(t)) || (m = /(\d{1,3})\s*одил/.exec(t))) {
      const v = Math.max(0, Math.min(560, +m[1])); p.odyle = { value: v, at: now };
      const full = L().odyleFullAt(p.odyle, now);
      return done(`Одила: ${v}/560.${v < 560 ? ` Упрётся в потолок через ${L().fmtDelta(full - now)}.` : " Уже потолок — трать в экспедициях!"}`);
    }
    // --- GS ---
    if (((m = /(?:gs|гс|гир\s*скор[а-яё\w]*)\s*(?:сейчас|теперь|стал[а-яё\w]*|=|:)?\s*(\d{3,4})(?![а-яё\d])/.exec(t)) || (m = /(\d{3,4})\s*(?:gs|гс)(?![а-яё\d])/.exec(t))) && !/(хочу|до\s|сколько|хватит|когда|цель|\?)/.test(t)) {
      const v = +m[1], d = new Date(), z = (n) => String(n).padStart(2, "0");
      p.history = p.history || []; p.history.push({ gs: v, ts: `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`, note: "из чата" });
      const prev = p.history.filter((h) => h.gs).slice(-2)[0];
      const th = (x.C.common.thresholds || []).find((h) => h.gs > v);
      return done(`Записал GS ${v}${prev && prev.gs !== v ? ` (было ${prev.gs}, ${v > prev.gs ? "+" : ""}${v - prev.gs})` : ""}.${th ? ` До порога ${th.gs} (${th.name}) — ${th.gs - v}.` : ""}`);
    }
    // --- заточка: «заточил перчатки до +8», «слетела серьга до +5» ---
    if (ents.slots && (m = /(?:\+|до\s*\+?|на\s*\+)\s?(\d{1,2})(?![а-яё\d])/.exec(t)) && /(заточ|точнул|точн|улучшил|усилил|сделал|прокачал|слетел|сломал|упал|теперь)/.test(t) && !/(сколько|стоит|\?)/.test(t)) {
      const slot = ents.slots[0], r = window.A2Calc.curSetEnch(st, p, x.ch, slot, +m[1]);
      if (!r) return { md: "Этот слот пуст в калькуляторе — сначала импортируй персонажа или заполни снаряжение.", cmd: true };
      return done(`${r.name} (${r.item}): +${r.from} → **+${r.to}** в «Сейчас в игре».`, { chips: ["Что точить выгоднее?"] });
    }
    // --- свои дела ---
    if ((m = /^(?:добавь|запиши|создай)\s+(?:в\s+)?(?:дело|дела|задачу|задачи|мои дела|в мои дела|в список)?\s*[:«"]?\s*(.+)$/.exec(t)) && /(дел|задач|список)/.test(t)) {
      const text = q.slice(q.length - m[1].length).replace(/[»"]$/, "").trim();
      if (text.length < 2) return null;
      const L2 = p.lists = p.lists || { daily: [], weekly: [], mine: [] }; L2.mine = L2.mine || [];
      L2.mine.push({ id: "m" + Math.random().toString(36).slice(2, 8), t: text.charAt(0).toUpperCase() + text.slice(1) });
      return done(`Добавил в «Мои дела»: ${text}.`);
    }
    // --- отметки в делах ---
    const undoMark = /(отмени|сними|не сделал|убери отметк|снять отметк)/.test(t);
    if (/^(сделал|сделала|выполнил|выполнила|закрыл|закрыла|прош[её]л|прошла|готово|отметь|отметить|done)(?![а-яё\d])|(сделал|выполнил|закрыл|прош[её]л)\s/.test(t) || (undoMark && /(отметк|сделал|дел)/.test(t))) {
      if (/(все|всё)\s*(дейлик|ежедневн|дела дня|на сегодня)/.test(t)) {
        (p.lists.daily || []).forEach((it) => p.checks.daily[it.id] = !undoMark);
        return done(undoMark ? "Снял все отметки дня." : "Отметил все дела дня. Красавчик!");
      }
      const parts = t.split(/,|\sи\s/).map((s2) => s2.trim()).filter(Boolean), marked = [];
      parts.forEach((part) => { const f = findTasks(x, part)[0]; if (f && f.sc >= .34) { p.checks[f.k] = p.checks[f.k] || {}; p.checks[f.k][f.it.id] = !undoMark; if (!marked.includes(f.it.t)) marked.push(f.it.t); } });
      if (marked.length) return done((undoMark ? "Снял отметку: " : "Отметил: ") + marked.join("; ") + ".");
      if (!ents.bosses) return { md: "Не нашёл такого пункта в делах. Напиши точнее (например «сделал кошмары») или добавь его: «добавь дело …».", cmd: true, chips: ["Что делать сегодня вечером?"] };
    }
    // --- персонаж ---
    if ((m = /(?:переключи[а-яё\w]*|смени[а-яё\w]*|выбери)\s+(?:на\s+)?(?:персонажа\s+)?(.+)$/.exec(t))) {
      const w = m[1].trim(), c = st.chars.find((c2) => low(c2.name) === w || low(c2.name).startsWith(w) || (window.A2CLS.find(w) === c2.cls));
      if (c) { st.settings.profile = c.id; A().state.settings.profile = c.id; setTimeout(() => { const b = document.querySelector(`.pf-main[data-p="${c.id}"]`); if (b) b.click(); }, 50); return { md: `✅ Переключаю на **${c.name}**.`, cmd: true }; }
    }
    // --- навигация ---
    const VIEWS = [["map", /карт/], ["calc", /калькулятор/], ["bosses", /босс/], ["checks", /дела|список дел|чеклист/], ["settings", /настройк/], ["progress", /прогресс|график/], ["build", /гайд|билд/], ["today", /сегодня|главн/]];
    if (/(маршрут|обойти|обход|по порядку)/.test(t) && /(босс|именн|монолит|разлом|подземел|экспедиц|телепорт)/.test(t)) {
      const L3 = /босс/.test(t) && /именн/.test(t) ? ["bosses", "named"] : /именн/.test(t) ? ["named"] : /монолит/.test(t) ? ["monoliths"] : /разлом/.test(t) ? ["rifts"] : /подземел|экспедиц/.test(t) ? ["dungeons"] : /телепорт/.test(t) ? ["teleports"] : /все[хм]? босс|и именн/.test(t) ? ["bosses", "named"] : ["bosses"];
      const name = "Маршрут: " + (L3.length > 1 ? "боссы и именные" : ({ named: "именные", monoliths: "монолиты", rifts: "разломы", dungeons: "подземелья", teleports: "телепорты", bosses: "боссы" })[L3[0]]);
      return { md: `✅ Проложил **${name.toLowerCase()}** от твоей точки, ближайший следующий — по порядку. Маршрут сохранён в «Мои маршруты» на карте.`, cmd: true, auto: { t: "route", layers: L3, name }, acts: [{ label: "Маршрут поверх игры", a: { t: "overlayRoute", layers: L3, label: name } }] };
    }
    if (/^(открой|покажи|перейди|включи|где)(?![а-яё\d])/.test(t) && /карт/.test(t) && !ents.bosses) {
      const fm = farmMap(t); if (fm) return { md: `✅ Показываю на карте: **${fm.label}**.`, cmd: true, auto: fm };
    }
    if (/^(открой|покажи|перейди|включи)(?![а-яё\d])/.test(t)) {
      if (ents.bosses && /карт/.test(t)) { const b = ents.bosses[0]; if (b[4]) return { md: `✅ Показываю **${b[1]}** на карте.`, cmd: true, auto: { t: "mapCat", cat: b[4] } }; }
      const v = VIEWS.find(([, re]) => re.test(t));
      if (v) return { md: "✅ Открываю — я рядом, кнопка ✨ вверху или Ctrl+K.", cmd: true, auto: { t: "goView", v: v[0] } };
    }
    return null;
  }

  // ================= только AION 2 =================
  const GAME = /(подсвет|топ|сесси|aion|айон|аион|даэв|дэв|асмод|элий|альтгард|вертерон|бездн|решант|рейндж|стрел|клирик|гладиатор|темплар|убийц|чародей|заклинател|чантер|маг(?![а-яё\d])|танк|хил|данж|подземел|босс|моб|квест|скилл|умени|стигм|шмот|экип|заточ|кинар|кристал|дэванион|гс(?![а-яё\d])|gs\b|pvp|пвп|pve|пве|фарм|дроп|лут|гильди|легион|осад|арен|крафт|сбор|питом|крыль|титул|манакам|руна|амулет|разлом|одил|шуго|кошмар|экспедиц|сервер|персонаж|прокач|лвл|уровен|билд|ротац|урон|крит|атак|защит|меткост|сундук|ключ|поручен|сброс|ежедневн|недельн)/;
  const OFF = /(погод|рецепт|анекдот|шутк|стих|песн|политик|президент|выбор|доллар|курс валют|биткоин|крипт|акци|домашн|реферат|сочинен|математик|уравнен|переведи|перевод|напиши код|программ|python|javascript|sql|фильм|сериал|новост|футбол|хоккей|врач|лекарств|болит|диет|отношени|девушк|парн|любов)/;
  function onTopic(q) {
    const t = low(q);
    if (OFF.test(t) && !GAME.test(t)) return false;
    if (GAME.test(t)) return true;
    if (intents(q).length) return true;
    const x = ctx(q), e = entities(q, x.ch); if (e.skill || e.bosses || e.board || e.slots) return true;
    const h = search(x, q, 1); return !!(h[0] && h[0].score >= 2.5);
  }
  const OFFTOPIC_MD = "Я помощник **только по AION 2** — про другое не отвечаю. Спроси про своего персонажа, билд, заточку, Дэванион, стигмы, фарм, боссов или план на вечер. А ещё можно просто сообщать мне новости: «убил Кашапу», «одила 320», «сделал кошмары», «напомни через 30 минут проверить аукцион».";

  // ================= «подумать»: сравнение вариантов, общий план по ресурсам, наблюдения =================
  const TOPIC_RU = { progress: "прогресс GS", plan: "разбор плана", growth: "как поднять GS", dv: "Дэванион", enchant: "заточка", stigma: "стигмы", skills: "умения", drops: "где выпадает",
    farm: "фарм", bosses: "боссы", today: "план на время", schedule: "расписание", stats: "характеристики", gear: "снаряжение", hello: "приветствие", compare: "сравнение вариантов", resources: "план по ресурсам" };
  const SLOT_RU = { weapon: "оружие", offhand: "второй слот", helmet: "шлем", shoulders: "наплечники", chest: "нагрудник", gloves: "перчатки", pants: "поножи", boots: "сапоги", cape: "плащ", earring1: "серьга", necklace: "ожерелье", ring1: "кольцо", amulet: "амулет", bracelet: "браслет", belt: "пояс", rune1: "руна" };
  const COMPARE = /(что лучше|что выгодн|что важнее|что сначала|сначала .+ или|стоит ли|или лучше|\sили\s|vs|выгоднее)/;
  // варианты, которые встречаются в вопросе «X или Y»
  function optionsIn(t, ents) {
    const o = [];
    (ents.slots || []).forEach((s) => o.push({ k: "slot", slot: s }));
    if (/дэванион|кристал|ячейк|доск/.test(t)) o.push({ k: "dv" });
    if (/манакам|камн.{0,4}в гн|гнезд/.test(t)) o.push({ k: "sockets" });
    if (/стигм/.test(t)) o.push({ k: "stigma" });
    if (/умени|скилл|навык/.test(t)) o.push({ k: "skills" });
    if (/бижутер|серьг|кольц|ожерел/.test(t) && !(ents.slots || []).length) o.push({ k: "jewel" });
    if (/заточ|точить|усилен/.test(t) && !(ents.slots || []).length) o.push({ k: "enchant" });
    return o;
  }
  function compareAnswer(x, q, ents, trace) {
    const t = low(q), opts = optionsIn(t, ents), a = x.an;
    if (opts.length < 2 || !a) return null;
    trace.push(`Вижу сравнение: ${opts.map((o) => o.k === "slot" ? (SLOT_RU[o.slot] || o.slot) : { dv: "Дэванион", sockets: "манакамни", stigma: "стигмы", skills: "умения", jewel: "бижутерия", enchant: "заточка" }[o.k]).join(" vs ")}.`);
    // оцениваем каждый вариант: ресурс, польза за единицу, что даёт
    const ev = opts.map((o) => {
      if (o.k === "slot") {
        const qd = calc().enchQuote(x.st, x.p, x.ch, o.slot, null);
        if (!qd || !qd.cost) return { o, name: qd ? qd.name : o.slot, res: "кинары", note: qd ? `${qd.item}: нет данных о шансах или уже максимум` : "слот пуст", per: 0 };
        const per = Math.max(qd.dps, qd.tank * .6) / Math.max(1, qd.cost.gold / 1e5);
        return { o, name: `${qd.name} +${qd.to}`, res: "кинары", per, cost: qd.cost.gold, gain: qd.dps ? `+${num(qd.dps, 2)}% урона` : `+${num(qd.tank, 2)}% живучести`, note: `${qd.item}, ≈${fmtK(qd.cost.gold)}, шанс ${qd.steps ? qd.steps[qd.from][0] : "?"}%` };
      }
      if (o.k === "enchant") { const b = a.ench.filter((e) => e.per100k > 0).sort((p, q2) => q2.per100k - p.per100k)[0]; return b ? { o, name: `заточка (лучшее: ${b.name} +${b.ench + 1})`, res: "кинары", per: b.per100k, gain: `+${num(b.gain, 2)}% урона`, note: `≈${fmtK(b.next.gold)}` } : { o, name: "заточка", res: "кинары", per: 0, note: "нет выгодных шагов" }; }
      if (o.k === "dv") { const c = a.picks.reduce((s, p) => s + p.cost, 0), v = a.picks.reduce((s, p) => s + p.val, 0); return { o, name: "Дэванион", res: "кристаллы", per: c ? v / c : 0, gain: `+${num(v)}% урона за ${c} кр.`, note: `${num(c ? v / c : 0, 2)}% на кристалл` }; }
      if (o.k === "sockets") return { o, name: "манакамни", res: "манакамни (дёшево)", per: a.emptySockets ? 99 : 0, gain: `+${num(a.emptySockets * 2.5)} GS`, note: `${a.emptySockets} пустых гнёзд` };
      if (o.k === "stigma") return { o, name: "стигмы", res: "очки и осколки стигм", per: a.freeSt > 0 ? 50 : 1, note: a.freeSt > 0 ? `свободно ${a.freeSt} очк.` : "свободных очков нет" };
      if (o.k === "skills") return { o, name: "умения", res: "очки умений", per: a.freeSk > 0 ? 50 : 1, note: a.freeSk > 0 ? `свободно ${a.freeSk} очк.` : "свободных очков нет" };
      if (o.k === "jewel") { const weak = a.gear.filter((g) => /earring|ring|necklace|bracelet/.test(g.id) && g.item).sort((p, q2) => p.ilvl - q2.ilvl)[0]; return { o, name: "замена бижутерии", res: "время на фарм", per: 2, note: weak ? `слабейшая: ${weak.name} (ур. ${weak.ilvl})` : "" }; }
      return { o, name: o.k, res: "?", per: 0 };
    });
    ev.forEach((e) => trace.push(`${e.name}: ресурс — ${e.res}${e.note ? "; " + e.note.replace(/\.$/, "") : ""}.`));
    const res = new Set(ev.map((e) => e.res)), out = [];
    if (res.size === 1 && res.has("кинары") && ev.some((e) => /урона/.test(e.gain || "")) && ev.some((e) => /живучести/.test(e.gain || ""))) {
      // одна вещь даёт урон, другая только защиту — это выбор цели, а не цены
      const dmg = ev.filter((e) => /урона/.test(e.gain || "")), def = ev.filter((e) => /живучести/.test(e.gain || ""));
      trace.push("Варианты дают разное: одно — урон, другое — живучесть. Сравниваю по цели и по риску.");
      out.push(`**Для урона — ${dmg.map((e) => e.name).join(", ")}** (${dmg.map((e) => e.gain).join(", ")}). **${def.map((e) => e.name).join(", ")}** даёт только защиту (${def.map((e) => e.gain).join(", ")}).`);
      ev.forEach((e) => out.push(`- ${e.name}: ${e.gain} — ${e.note}`));
      const cheapSafe = def.filter((e) => /шанс 100%/.test(e.note));
      if (cheapSafe.length) out.push(`Совет: ${cheapSafe.map((e) => e.name).join(", ")} — дёшево и без риска, доточи заодно; основные кинары — в ${dmg[0].name}.`);
      else out.push(`Если сейчас тяжело выживать — сначала защита, иначе — урон.`);
      const acts = ev.filter((e) => e.o.k === "slot").map((e) => ({ label: `В план: ${e.name}`, a: { t: "planEnch", slot: e.o.slot, to: calc().enchQuote(x.st, x.p, x.ch, e.o.slot, null).to } }));
      return { md: out.join("\n"), acts, chips: ["Почему так?"], it: "compare" };
    }
    if (res.size === 1 && res.has("кинары")) {
      const s = ev.slice().sort((p, q2) => q2.per - p.per), w = s[0], l = s[s.length - 1];
      trace.push(`Один ресурс (кинары) — сравниваю пользу на 100 тыс.: ${s.map((e) => `${e.name} ${num(e.per, 2)}`).join(" > ")}.`);
      if (w.per <= 0) { out.push("Ни один вариант сейчас не даёт пользы по урону — посмотри режим «Выживаемость» в советнике."); }
      else {
        const k = l.per > 0 ? w.per / l.per : Infinity;
        out.push(`**Выгоднее: ${w.name}.** ${w.gain} за ${w.note.split(", ").slice(1).join(", ")} — это ${isFinite(k) ? `в ${num(k)} раза больше пользы на кинар, чем ${l.name}` : `единственный вариант с прибавкой к урону`}.`);
        s.forEach((e) => out.push(`- ${e.name}: ${e.gain || "—"} (${e.note})`));
      }
      const acts = ev.filter((e) => e.o.k === "slot" && e.per > 0).map((e) => ({ label: `В план: ${e.name}`, a: { t: "planEnch", slot: e.o.slot, to: calc().enchQuote(x.st, x.p, x.ch, e.o.slot, null).to } }));
      return { md: out.join("\n"), acts, chips: ["Почему так?", "У меня 2 млн кинаров — что точить?"], it: "compare" };
    }
    trace.push("Ресурсы разные — варианты не конкурируют, решаю по порядку «бесплатное → дешёвое → дорогое».");
    const order = ev.slice().sort((p, q2) => q2.per - p.per);
    out.push("**Это не «или-или»: они тратят разные ресурсы, поэтому делай оба** — в таком порядке:");
    order.forEach((e, i) => out.push(`${i + 1}. **${e.name}** — ${e.res}${e.gain ? `, даёт ${e.gain}` : ""}${e.note ? ` (${e.note})` : ""}`));
    if (ev.some((e) => e.o.k === "sockets") && a.emptySockets) out.push("Манакамни — первым делом: самое дешёвое и сразу видно в GS.");
    return { md: out.join("\n"), chips: ["Почему такой порядок?"], it: "compare" };
  }
  function resourcesAnswer(x, q, ents, trace) {
    const a = x.an; if (!a || noChar(x)) return null;
    const out = ["**План на твои ресурсы**"], acts = [];
    trace.push(`Ресурсы из вопроса: ${[ents.kinah ? fmtK(ents.kinah) + " кинаров" : "", ents.crystals ? ents.crystals + " кристаллов" : "", ents.hours ? ents.hours + " ч" : ""].filter(Boolean).join(", ")}.`);
    let step = 1, total = 0;
    if (a.emptySockets) { out.push(`${step++}. **Манакамни** в ${a.emptySockets} гнёзд — ≈+${num(a.emptySockets * 2.5)} GS (почти бесплатно).`); trace.push("Пустые гнёзда есть — ставлю первым шагом."); }
    if (a.freeSk > 0 || a.freeSt > 0) out.push(`${step++}. **Очки:** ${a.freeSk > 0 ? `умений ${a.freeSk}` : ""}${a.freeSk > 0 && a.freeSt > 0 ? ", " : ""}${a.freeSt > 0 ? `стигм ${a.freeSt}` : ""} — вложи, это бесплатно.`);
    if (ents.crystals) {
      const p2 = a.picks, c = p2.reduce((s, p) => s + p.cost, 0), v = p2.reduce((s, p) => s + p.val, 0); total += v;
      out.push(`${step++}. **Дэванион, ${c} кр.:** ${p2.slice(0, 6).map((p) => p.label).join(", ")}${p2.length > 6 ? ` и ещё ${p2.length - 6}` : ""} — ≈+${num(v)}% урона.`);
      acts.push({ label: `В план: Дэванион ${ents.crystals} кр.`, a: { t: "planDv", budget: ents.crystals } });
      trace.push(`Дэванион: жадный подбор ячеек на ${ents.crystals} кр. дал ≈+${num(v)}%.`);
    }
    if (ents.kinah) {
      const r = calc().enchBudget(x.st, x.p, x.ch, ents.kinah, "dps"); total += r.total;
      out.push(`${step++}. **Заточка на ${fmtK(ents.kinah)}:** ${r.rows.map((o) => `${o.name} +${o.from}→+${o.to}`).join(", ") || "выгодных шагов нет"} — ≈+${num(r.total)}% урона (останется ≈${fmtK(r.left)}).`);
      r.rows.slice(0, 3).forEach((o) => acts.push({ label: `В план: ${o.name} +${o.to}`, a: { t: "planEnch", slot: o.id, to: o.to } }));
      trace.push(`Заточка: разложил ${fmtK(ents.kinah)} по шагам с лучшей пользой на кинар.`);
    }
    if (ents.hours) { const ev = events(x, ents.hours); if (ev.length) out.push(`${step++}. **По времени (${ents.hours} ч):** ${ev.slice(0, 4).map((e) => `${hhmm(e.at)} ${e.name}`).join(", ")}.`); }
    if (total) out.push(`Итого ≈ **+${num(total)}% урона** по оценке советника.`);
    return { md: out.join("\n"), acts, chips: ["Почему такой порядок?"], it: "resources" };
  }
  // что стоит заметить прямо сейчас (не чаще раза в несколько минут на тему)
  const noticed = {};
  function notices(x) {
    const now = Date.now(), out = [], once = (k, ms) => { if (noticed[k] && now - noticed[k] < ms) return false; noticed[k] = now; return true; };
    try {
      const evs = L().events(now, x.st.settings), rift = evs.find((e) => e.id === "rift");
      if (rift && rift.at - now < 15 * 60e3 && once("rift" + rift.at, 6e5)) out.push(`разлом через ${L().fmtDelta(rift.at - now).slice(3)} — успеешь добежать.`);
      (window.A2Bosses ? window.A2Bosses.events(now) : []).filter((e) => e.at - now < 10 * 60e3 && e.at > now).slice(0, 1).forEach((e) => { if (once(e.id + e.at, 6e5)) out.push(`${e.long} возродится через ${L().fmtDelta(e.at - now).slice(3)}.`); });
      const od = L().odyleNow(x.p.odyle, now); if (od != null && od >= 500 && once("od", 18e5)) out.push(`Одила уже ${od}/560 — скоро прирост начнёт сгорать.`);
      const dr = evs.find((e) => e.id === "daily"), lists = x.p.lists || {}, left = (lists.daily || []).filter((it) => !(x.p.checks.daily || {})[it.id]).length;
      if (dr && dr.at - now < 2 * 36e5 && left && once("daily", 18e5)) out.push(`до сброса дня ${L().fmtDelta(dr.at - now).slice(0, 5)}, а несделанных дел ещё ${left}.`);
    } catch (e) { }
    return out.slice(0, 2);
  }

  // ================= v4: «почти как нейросеть» =================
  const pick = (arr, seed) => arr[Math.abs(((seed ?? Date.now() / 7000) | 0)) % arr.length];
  // --- нормализация: сленг игроков, свои синонимы, неправильная раскладка ---
  const SLANG = [["пушк[а-яё]*|пух[аиуе]|ствол[а-яё]*", "оружие"], ["шмот[а-яё]*|шмотк[а-яё]*", "снаряжение"], ["бижа|бижу|бижутер[а-яё]*", "бижутерия"], ["кд", "перезарядка"],
    ["дейлик[а-яё]*|дейли", "ежедневные дела"], ["викли|недельк[а-яё]*", "недельные дела"], ["одилк[а-яё]*", "одила"], ["данж[а-яё]*", "подземелье"], ["рб", "босс"], ["хп", "ОЗ"], ["мп", "ОМ"],
    ["дпс|дамаг[а-яё]*|дмг", "урон"], ["шард[а-яё]*", "осколки стигм"], ["крис(?:ы|ов|ики|ты|тов)", "кристаллы"], ["лям(?:а|ов|ы)?", "млн"], ["кк", "млн"],
    ["скил(?:л)?(?:ы|ов|а|ам|ами)?", "умения"], ["лут[а-яё]*", "добыча"], ["девик|дэвик", "Дэванион"], ["гир ?скор[а-яё]*|гирскор[а-яё]*", "GS"], ["апнуть|апнул|апать", "поднять"]];
  const SLANG_RE = SLANG.map(([a, b]) => [new RegExp("(?<![а-яёa-z])(?:" + a + ")(?![а-яёa-z])", "gi"), b]);
  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`", RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
  function normalize(q) {
    const notes = []; let s = String(q);
    const syn = (A().state.ai || {}).syn || [];
    if (!/[а-яё]/i.test(s) && /[a-z]{3}/i.test(s) && !/^(gs|pvp|pve|aion|ok)(\s|$)/i.test(s.trim())) {
      const conv = s.replace(/[a-z\[\];',.`]/gi, (c) => { const i = EN.indexOf(c.toLowerCase()); return i < 0 ? c : RU[i]; });
      if (intents(conv).length || /(привет|убил|сделал|одил|сколько|что|где|когда|как)/.test(low(conv))) { notes.push(`Исправил раскладку: «${conv}».`); s = conv; }
    }
    syn.forEach(({ a, b }) => { const re = new RegExp("(?<![а-яёa-z])" + a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![а-яёa-z])", "gi"); if (re.test(s)) { s = s.replace(re, b); notes.push(`Твой синоним: «${a}» → «${b}».`); } });
    let changed = false; SLANG_RE.forEach(([re, b]) => { const n = s.replace(re, b); if (n !== s) { s = n; changed = true; } });
    if (changed) notes.push(`Перевёл сленг: «${s}».`);
    return { q: s, notes };
  }

  // --- даты: «к пятнице», «через неделю», «к 15 октября», «завтра» ---
  const WDAYS = ["воскрес", "понедельник", "вторник", "сред", "четверг", "пятниц", "суббот"];
  const MONTHS = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
  function parseDate(t) {
    const now = new Date(); let m;
    const end = (d) => { d.setHours(23, 59, 0, 0); return d.getTime(); };
    if (/послезавтра/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 2); return end(d); }
    if (/завтра/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); return end(d); }
    if (/сегодня/.test(t)) return end(new Date(now));
    if ((m = /через\s+(\d+)\s*(дн|день|дня|сут)/.exec(t))) { const d = new Date(now); d.setDate(d.getDate() + +m[1]); return end(d); }
    if ((m = /через\s+(\d+)?\s*недел/.exec(t))) { const d = new Date(now); d.setDate(d.getDate() + 7 * (+m[1] || 1)); return end(d); }
    if (/конц[ау] недели|выходн/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return end(d); }
    for (let i = 0; i < 7; i++) if (new RegExp("(?:к|в|до|на)\\s+" + WDAYS[i]).test(t)) { const d = new Date(now); let add = (i - d.getDay() + 7) % 7; if (add === 0) add = 7; d.setDate(d.getDate() + add); return end(d); }
    if ((m = /(\d{1,2})\s+([а-яё]+)/.exec(t))) { const mi = MONTHS.findIndex((mm) => m[2].startsWith(mm) && (mm !== "ма" || /^ма[йяю]/.test(m[2]))); if (mi >= 0) { const d = new Date(now.getFullYear(), mi, +m[1]); if (d < now) d.setFullYear(d.getFullYear() + 1); return end(d); } }
    if ((m = /(\d{1,2})\.(\d{1,2})(?!\d)/.exec(t))) { const d = new Date(now.getFullYear(), +m[2] - 1, +m[1]); if (d < now) d.setFullYear(d.getFullYear() + 1); return end(d); }
    return null;
  }
  const dateRu = (ts) => new Date(ts).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
  const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 864e5));
  const mem = (x) => { x.p.mem = x.p.mem || {}; return x.p.mem; };
  const money = (n, u) => +String(n).replace(",", ".") * (/млн|кк|m/.test(u) ? 1e6 : /тыс|к|k/.test(u) ? 1e3 : 1);

  // --- журнал добычи ---
  function findItemIn(text, bossSlug) {
    const X = window.EXTRA; if (!X) return null;
    const qs = new Set(words(text).filter((w) => w.length > 2).map(stem));
    const pool = bossSlug ? (X.mobs.find((m) => m[0] === bossSlug) || [, , , , , , []])[6].map((r) => r[0]) : X.items.map((_, i) => i);
    let best = null;
    pool.forEach((i) => {
      const ws = words(X.items[i][0]).filter((w) => w.length > 2).map(stem); if (!ws.length) return;
      const hit = ws.filter((w) => qs.has(w) || [...qs].some((q2) => q2.length >= 4 && w.length >= 4 && (w.startsWith(q2) || q2.startsWith(w)))).length;
      const sc = hit / ws.length; if (hit && sc >= .5 && (!best || sc > best.sc || (sc === best.sc && ws.length > best.n))) best = { i, sc, n: ws.length };
    });
    return best ? best.i : null;
  }
  const chanceOf = (slug, i) => { const m = (window.EXTRA.mobs.find((mm) => mm[0] === slug) || [])[6] || []; const r = m.find((rr) => rr[0] === i); return r ? r[1] / 100 : null; };
  function binomLE(n, k, p) { let s = 0, c = 1; for (let i = 0; i <= k; i++) { if (i > 0) c = c * (n - i + 1) / i; s += c * Math.pow(p, i) * Math.pow(1 - p, n - i); } return Math.min(1, s); }

  // --- новые команды: память, обучение, добыча, уточнения ---
  // ---------- v4: подсветка в игре, фарм-сессии, расписание игры ----------
  const durRu = (ms) => { const m = Math.max(1, Math.round(ms / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
  function sessionStats(st, s, end) {
    const to = end || Date.now(), kills = (st.kills || []).filter((k) => k.at >= s.start && k.at <= to), loot = (st.loot || []).filter((l) => l.at >= s.start && l.at <= to && l.item != null);
    const h = Math.max((to - s.start) / 3600e3, 1 / 60);
    return { ms: to - s.start, kills: kills.length, loot: loot.length, kinah: s.kinah || 0, kh: (s.kinah || 0) / h, killsH: kills.length / h };
  }
  function sessionLine(s, r) {
    return `${new Date(s.start).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} ${hhmm(s.start)} · **${s.what || "фарм"}** · ${durRu(r.ms)}` +
      (r.kinah ? ` · ${fmtK(r.kinah)} (${fmtK(r.kh)}/ч)` : "") + (r.kills ? ` · боссов ${r.kills}` : "") + (r.loot ? ` · добыча ${r.loot}` : "");
  }
  function sessionsReport(st) {
    const list = (st.sessions || []).slice(-8).reverse();
    const cur = st.session;
    if (!list.length && !cur) return { md: "Фарм-сессий пока нет. Скажи **«начинаю фарм орихалка»** перед фармом, по ходу — «заработал 300к», «убил Кашапу», «выпал плавильный камень», в конце — **«закончил фарм»**. Посчитаю кинары и боссов в час и сравню места.", cmd: true, chips: ["Начинаю фарм"] };
    const out = ["**Фарм-сессии**"];
    if (cur) out.push("Сейчас идёт: " + sessionLine(cur, sessionStats(st, cur)));
    if (list.length) out.push(list.map((s) => "- " + sessionLine(s, s.r)).join("\n"));
    // лучшие места по кинарам в час
    const by = {}; (st.sessions || []).forEach((s) => { if (!s.r || !s.r.kinah) return; const k = s.what || "фарм"; (by[k] = by[k] || { ms: 0, kinah: 0, n: 0 }); by[k].ms += s.r.ms; by[k].kinah += s.r.kinah; by[k].n++; });
    const best = Object.entries(by).map(([k, v]) => [k, v.kinah / Math.max(v.ms / 3600e3, 1 / 60), v.n]).sort((a, b) => b[1] - a[1]);
    if (best.length) out.push("**Доход в час по местам:**\n" + best.slice(0, 5).map(([k, v, n], i) => `${i + 1}. ${k} — ${fmtK(v)}/ч _(${n} сесс.)_`).join("\n") + (best.length > 1 ? `\n\nВыгоднее всего — **${best[0][0]}**.` : ""));
    return { md: out.join("\n\n"), cmd: true, chips: cur ? ["Закончил фарм"] : ["Начинаю фарм"] };
  }
  function command3(q, x, t, ents) {
    const st = x.st, now = Date.now(); let m;
    // --- подсветка поверх игры ---
    if (/(взят|взял|собрал|нашел|отметил)\S*/.test(t) && /(сколько|статистик)/.test(t) && /(куб|след|пер|монолит|точ)/.test(t) && window.A2Overlay) {
      const by = window.A2Overlay.stats(), D = window.MAPDATA, nm = (id) => (D.layers.find((l) => l.id === id) || {}).name || id;
      const lines = Object.entries(by).map(([k, v]) => `- ${nm(k)}: **${v}**` + (k === "cubes" ? ` из ${D.points.filter((p) => D.cats[p[2]][4] === "cubes").length}` : ""));
      return { md: lines.length ? "**Взято за эту неделю** (отмечено клавишей «взято»):\n" + lines.join("\n") : `Пока ничего не отмечено. Открой карту в игре с подсветкой, наведи мышь на точку и нажми **${A().state.settings.hotkeyTaken || "Ctrl+Shift+C"}**.`, cmd: true };
    }
    if (/(верни|сбрось|очисти|убери)\s+(все\s+)?(взят|отметки взят|собранн)/.test(t)) return { md: "✅ Вернул все взятые точки на подсветку.", cmd: true, auto: { t: "overlayUntake", all: true } };
    if (/маршрут/.test(t) && /(в игре|поверх|подсвет|на карте игры)/.test(t)) {
      const fm = farmMap(t);
      const layers = fm ? fm.layers : ents.bosses ? ["bosses", "named"] : /куб/.test(t) ? ["cubes"] : null;
      if (layers) return { md: `✅ Рисую маршрут поверх карты игры: **${fm ? fm.label : "боссы"}** — от твоей точки к ближайшей, номера по порядку.`, cmd: true, auto: { t: "overlayRoute", layers, label: "маршрут: " + (fm ? fm.label : "боссы") } };
    }
    if (/(читай|включи чтени|следи за|смотри)\s*(\S+\s+)?чат/.test(t) && window.A2Chat) { window.A2Chat.enable(true); return { md: A().state.settings.chatArea ? "✅ Читаю чат игры: добычу, кинары и убийства боссов записываю сам." : "✅ Обведи мышью окно чата игры поверх экрана — дальше буду читать его сам.", cmd: true }; }
    if (/(выключи|не читай|перестань читать|отключи)\s*(чтени\S*\s+)?чат/.test(t) && window.A2Chat) { window.A2Chat.enable(false); return { md: "✅ Больше не читаю чат.", cmd: true }; }
    if (/подсвет/.test(t)) {
      if (/(выключ|отключ|убер|спрячь|скрой|погас|хватит|не надо)/.test(t)) return { md: "✅ Подсветку поверх игры выключил.", cmd: true, auto: { t: "overlayOff" } };
      if (/(выровн|совмест|откалибр|подгон|настро|сдвин|не совпада|кривo|криво|съехал)/.test(t)) return { md: "✅ Включил выравнивание: **тащи мышью** — сдвиг, **колесо** — масштаб (Shift — точнее), стрелки — по пикселю. **Enter** или правый клик — готово, Esc — отмена. Ориентируйся на бирюзовые кружки — это статуи телепорта.", cmd: true, auto: { t: "overlayAdjust" } };
      if (/сброс/.test(t)) return { md: "✅ Сбросил выравнивание — подсветка снова по центру экрана.", cmd: true, auto: { t: "overlayReset" } };
      const fm = farmMap(t);
      let layers = fm ? fm.layers : null, label = fm ? fm.label : null;
      if (!layers && ents.bosses) { layers = ["bosses", "named"]; label = "боссы"; }
      if (!layers && /(метк|мои точк)/.test(t)) { layers = ["u:marks"]; label = "мои метки"; }
      if (!layers && /(карт|слои|как на карте|что на карте)/.test(t)) { layers = []; label = "слои карты"; }
      if (!layers && /^подсвет\S*\s*$/.test(t)) { layers = []; label = "слои карты"; }
      if (layers) {
        const n = window.A2Overlay ? window.A2Overlay.points(layers.length ? layers : window.A2Overlay.currentMapLayers()).length : 0;
        const s = A().state.settings;
        return { md: `✅ Подсвечиваю поверх игры: **${label}**${n ? ` (${n} точ.)` : ""}.\n\n` + (s.ovFollow ? `Открой карту в игре (**${s.ovMapKey || "M"}**) — точки появятся.` : `Открой карту в игре — точки уже поверх экрана. Спрятать: **${s.hotkeyOverlay || "Ctrl+Shift+M"}**.`) + ` Если не совпадают с картой — скажи «выровнять подсветку» (или ${s.hotkeyAdjust || "Ctrl+Shift+N"}).`, cmd: true, auto: { t: "overlay", layers, label }, chips: ["Выровнять подсветку", "Выключи подсветку"] };
      }
    }
    // --- фарм-сессии ---
    if (/(начина\S*|начал\S*|старт\S*|запуска\S*|запусти|включи|иду|пошел)\s+(фарм|сесси)/.test(t) || /^(фарм|сессия)\s+(старт|начат)/.test(t)) {
      if (st.session) { const r = sessionStats(st, st.session); return { md: `Сессия уже идёт: **${st.session.what}**, ${durRu(r.ms)}. Скажи «закончил фарм», чтобы подвести итог.`, cmd: true, chips: ["Закончил фарм"] }; }
      const fm = farmMap(t);
      let what = (/фарм\S*\s+(.+)$/.exec(t) || [])[1] || "";
      what = what.replace(/^(на|в|у)\s+/, "").replace(/[.!?]+$/, "").trim();
      if (fm && (!what || what.length > 40)) what = fm.label.split(/\s[—·]\s/)[0];
      st.session = { start: now, what: what || "фарм", kinah: 0 };
      A().save();
      return { md: `✅ Засек фарм-сессию: **${st.session.what}**, старт в ${hhmm(now)}.\n\nПо ходу пиши «заработал 300к», «убил Кашапу», «выпал плавильный камень». В конце — «закончил фарм»: посчитаю доход в час.`, cmd: true, chips: ["Заработал 100к", "Как идёт фарм?", "Закончил фарм"], acts: fm ? [{ label: "Показать на карте", a: fm }, { label: "Подсветить в игре", a: { t: "overlay", layers: fm.layers, label: fm.label } }] : [] };
    }
    if (/(закончил\S*|заканчиваю|стоп|останови\S*|заверш\S*|хватит|конец|финиш\S*)\s+(фарм|сесси)/.test(t) || /^(фарм|сессия)\s+(стоп|всё|все|конец)/.test(t)) {
      const s = st.session;
      if (!s) return { md: "Сейчас нет запущенной фарм-сессии. Начни: «начинаю фарм одилы».", cmd: true };
      if ((m = /(\d+(?:[.,]\d+)?)\s*(млн|тыс|кк|к|k)/.exec(t))) s.kinah = (s.kinah || 0) + money(m[1], m[2]);
      const r = sessionStats(st, s, now); s.end = now; s.r = r;
      st.sessions = st.sessions || []; st.sessions.push(s); while (st.sessions.length > 60) st.sessions.shift();
      delete st.session; A().save();
      const prev = st.sessions.filter((z) => z !== s && z.what === s.what && z.r && z.r.kinah);
      const avg = prev.length ? prev.reduce((a, z) => a + z.r.kinah / Math.max(z.r.ms / 3600e3, 1 / 60), 0) / prev.length : 0;
      return { md: `✅ Итог сессии **${s.what}**: ${durRu(r.ms)}` + (r.kinah ? `, заработано **${fmtK(r.kinah)}** → **${fmtK(r.kh)} в час**` : ", кинары не записаны") + (r.kills ? `, боссов ${r.kills}` : "") + (r.loot ? `, добычи ${r.loot}` : "") + "." +
        (avg && r.kinah ? `\n\nОбычно здесь ${fmtK(avg)}/ч — сегодня ${r.kh >= avg ? "**лучше** обычного 👍" : "хуже обычного"}.` : ""), cmd: true, chips: ["Мои фарм-сессии"] };
    }
    if ((m = /^(?:\+|заработал\S*|получил\S*|продал\S*(?:\s+\S+)*?\s+(?:за|на)|поднял\S*|нафармил\S*)\s*(\d+(?:[.,]\d+)?)\s*(млн|тыс|кк|к|k)?/.exec(t)) && !/(в|за)\s+(день|сутки|час|недел)/.test(t) && (st.session || /кинар|к$|кк|млн|тыс/.test(t))) {
      const v = money(m[1], m[2] || "");
      if (!st.session) return { md: `Записать ${fmtK(v)} некуда — фарм-сессия не запущена. Скажи «начинаю фарм» в начале, и я посчитаю доход в час.`, cmd: true, chips: ["Начинаю фарм"] };
      st.session.kinah = (st.session.kinah || 0) + v; A().save();
      const r = sessionStats(st, st.session);
      return { md: `✅ Записал +${fmtK(v)} — за сессию **${fmtK(r.kinah)}**, ${durRu(r.ms)} → ≈${fmtK(r.kh)}/ч.`, cmd: true };
    }
    if (/(фарм-?сесси|сесси\S* фарм|как идет фарм|статистик\S* фарм|доход в час|сколько (я )?(заработал|нафармил))/.test(t)) return sessionsReport(st);
    // --- расписание игры ---
    if ((m = /(?:играю|захожу|начинаю играть|сажусь играть)\s+(?:обычно\s+|каждый день\s+|по вечерам\s+)?(?:с|в|около|после)\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s*(?:до|-|–)\s*(\d{1,2})(?:[:.](\d{2}))?)?/.exec(t)) && +m[1] < 24) {
      const M = mem(x), f = (h, mm) => String(h).padStart(2, "0") + ":" + (mm || "00");
      M.playStart = f(+m[1], m[2]); A().state.settings.playStart = M.playStart; if (m[3]) { M.playEnd = f(+m[3] % 24, m[4]); const d = ((+m[3] * 60 + +(m[4] || 0)) - (+m[1] * 60 + +(m[2] || 0)) + 1440) % 1440; if (d) M.hours = d / 60; }
      A().save();
      return { md: `✅ Запомнил: играешь с **${M.playStart}**${M.playEnd ? ` до **${M.playEnd}**` : ""}. В ${M.playStart} пришлю план на вечер: что не сделано из дел, когда разлом и боссы. За 30 мин до сброса дня напомню о несделанном.`, cmd: true, chips: ["Что ты обо мне помнишь?"] };
    }
    if (/(не напоминай|выключи напоминан|без напоминан)/.test(t) && /(расписан|вечер|план|сброс|игр)/.test(t)) {
      const M = mem(x); delete M.playStart; delete M.playEnd; A().state.settings.playStart = ""; A().save();
      return { md: "✅ Больше не буду присылать план к началу игры.", cmd: true };
    }
    return null;
  }
  // ---------- сравнение с топ-игроками ----------
  const TOPRE = /(топ\S*|лучш\S* игрок|сильнейш|как у (топ|лучш)|у топов|мета-?игрок|что берут|что ставят|что вставляют)/;
  function topAnswer(x, trace) {
    const lang = (window.A2I18n && window.A2I18n.lang) || "ru";
    const T0 = ((window.TOP || {})[x.ch.cls] || {})[lang] || ((window.TOP || {})[x.ch.cls] || {}).ru, a = x.an;
    const T = T0 && Object.assign({ n: `топ-игроки: ${window.A2CLS.name(x.ch.cls)} (metabot.gg${T0.count ? ", " + T0.count + " игроков" : ""})` }, T0);
    if (!T) return { md: "Для этого класса у меня нет данных топ-игроков.", chips: [] };
    trace.push(`Беру снимок «${T.n}» и сравниваю с твоим «Сейчас в игре».`);
    const has = (list, n) => list.some((h) => h && (low(h).includes(low(n)) || low(n).includes(low(h))));
    const out = [`**Ты и ${T.n}**`];
    // стигмы
    const mySt = a && a.stg ? a.stg.filter((s) => s.name).map((s) => s.name) : [];
    const myLv = {}; if (a && a.stg) a.stg.forEach((s) => { if (s.name) myLv[low(s.name)] = s.lv; });
    out.push("**Стигмы** (доля топов, их уровень → твой):\n" + T.stigmas.map(([n, lv, p]) => {
      const mine = Object.entries(myLv).find(([k]) => k.includes(low(n)) || low(n).includes(k));
      return `- ${mine ? "✅" : "❌"} ${n} — ${p}%, у топов ${lv} ур.` + (mine ? ` → у тебя ${mine[1]} ур.${mine[1] < lv ? " _(подтянуть)_" : ""}` : " → **нет в слотах**");
    }).join("\n"));
    const extra = mySt.filter((n) => !has(T.stigmas.map((z) => z[0]), n) && !has(T.pvp, n));
    if (extra.length) out.push(`У тебя вместо мета-стигм: ${extra.join(", ")}.` + (T.pvp.length ? ` Для PvP топы меняют на: ${T.pvp.join(", ")}.` : ""));
    else if (T.pvp.length) out.push(`Для PvP топы ставят: ${T.pvp.join(", ")}.`);
    // основные умения
    if (a && a.skills && a.skills.length) {
      const sk = {}; a.skills.forEach((s) => (sk[low(s.name)] = s.total));
      out.push("**Основные умения** (у топов почти все 7 ур.):\n" + T.core.map(([n, lv, p]) => { const v = Object.entries(sk).find(([k]) => k.includes(low(n)) || low(n).includes(k)); return `- ${v ? (v[1] >= lv ? "✅" : "⬆️") : "❌"} ${n} — ${v ? `у тебя ${v[1]} ур.` : "не вкачано"}`; }).join("\n"));
    } else out.push("Умения: " + T.core.map((z) => z[0]).join(", ") + " — у 99% топов на 7 ур. Импортируй персонажа, чтобы сравнить точно.");
    // манакамни
    if (T.stones.length && a && a.gear) {
      const cnt = {}; let tot = 0;
      const gearRaw = ((x.p.calc || {}).cur || {}).gear || {};
      Object.values(gearRaw).forEach((g) => (g.stones || []).forEach((s) => { if (s && s[0]) { cnt[s[0]] = (cnt[s[0]] || 0) + 1; tot++; } }));
      if (tot) out.push("**Манакамни** (доля у топов → у тебя):\n" + T.stones.map(([k, n, p]) => `- ${n}: ${p}% → ${Math.round((cnt[k] || 0) / tot * 100)}%`).join("\n"));
      else out.push("**Манакамни у топов:** " + T.stones.map(([, n, p]) => `${n} ${p}%`).join(", ") + ".");
    }
    out.push("**Приоритет характеристик:** " + T.stats.map(([n, w]) => `${n} (${w})`).join(" → ") + ".");
    out.push("**Дэванион у топов:** " + T.dv);
    const miss = T.stigmas.filter(([n]) => !Object.keys(myLv).some((k) => k.includes(low(n)) || low(n).includes(k)));
    if (a && a.stg && miss.length) out.push(`👉 Главное отличие: нет **${miss[0][0]}** (берут ${miss[0][2]}% топов). ${a.freeSt > 0 ? `Свободно очков стигм: ${a.freeSt}.` : ""}`);
    else if (a && a.stg && mySt.length) out.push("👉 Набор стигм как у топов — дальше разница в уровнях и заточке.");
    return { md: out.join("\n\n"), chips: ["Проверь мои стигмы", "Как быстрее поднять GS?"], acts: [{ label: "Открыть стигмы", a: { t: "calc", tab: "stigmas" } }], it: "stigma" };
  }
  function command2(q, x, t, ents, done) {
    const st = x.st, M = mem(x), now = Date.now(); let m;
    // обучение: «запомни: пушка — это оружие»
    if ((m = /^запомни[:,]?\s*(.+?)\s+(?:—|–|-|=|это|значит)\s+(.+)$/.exec(t)) && !/цель|бюджет|играю|доход/.test(t)) {
      const a = m[1].replace(/[«»"]/g, "").trim(), b = m[2].replace(/[«»"]/g, "").trim();
      if (a.length >= 2 && b.length >= 2) { st.ai = st.ai || {}; st.ai.syn = (st.ai.syn || []).filter((s) => s.a !== a); st.ai.syn.push({ a, b }); return done(`Запомнил: «${a}» = «${b}». Теперь понимаю так.`); }
    }
    // цель
    if ((m = /(?:моя\s+)?цель[:\s-]+(?:gs|гс)?\s*(\d{3,4})/.exec(t)) || (m = /(?:хочу|надо|нужно)\s+(?:gs|гс)?\s*(\d{3,4})\s*(?:gs|гс)?\s+(?:к|до)\s+/.exec(t)) && /(запомни|цель|хочу|надо|нужно)/.test(t) && !/(как|успею|хватит|сколько|\?)/.test(t)) {
      const gs = +m[1], dt = parseDate(t);
      M.goalGs = gs; if (dt) M.goalDate = dt;
      return done(`Цель записана: **GS ${gs}**${dt ? ` к ${dateRu(dt)} (${daysLeft(dt)} дн.)` : ""}. Спрашивай «как дойти до цели?» — составлю план по дням.`, { chips: ["Как дойти до цели?"] });
    }
    if ((m = /играю\s*(?:по|примерно|около)?\s*(\d+(?:[.,]\d+)?)\s*(час|ч)/.exec(t))) { M.hours = +m[1].replace(",", "."); return done(`Запомнил: играешь около ${num(M.hours)} ч в день — буду учитывать в планах.`); }
    if ((m = /(?:я\s+(?:играю\s+)?(?:в\s+|на\s+)?|играю\s+(?:в\s+)?)(пве|pve|пвп|pvp)/.exec(t))) { M.style = /пвп|pvp/.test(m[1]) ? "pvp" : "pve"; return done(`Запомнил: ты играешь в ${M.style === "pvp" ? "PvP" : "PvE"} — советы буду считать под это.`); }
    if (/(?:мне\s+)?важн\S*\s+(живуч|выжив|защит|танк)/.test(t)) { M.style = "tank"; return done("Запомнил: тебе важнее выживаемость — буду оценивать по ней."); }
    if ((m = /(?:зарабатываю|фармлю|доход|получаю)[^\d]*(\d+(?:[.,]\d+)?)\s*(млн|тыс|кк|к|k)?\S*\s*(?:в|за)\s*(день|сутки|час)/.exec(t))) { const v = money(m[1], m[2] || ""); M.income = /час/.test(m[3]) ? v * (M.hours || 2) : v; return done(`Запомнил доход: ≈${fmtK(M.income)} кинаров в день.`); }
    if ((m = /(?:мой\s+|у меня\s+)?бюджет[^\d]*(\d+(?:[.,]\d+)?)\s*(млн|тыс|кк|к|k)?/.exec(t)) || (m = /(?:у меня|есть|накопил)\s+(\d+(?:[.,]\d+)?)\s*(млн|тыс|кк)\S*\s*кинар/.exec(t)) && !/(что|куда|как|\?)/.test(t)) { M.budget = money(m[1], m[2] || ""); M.budgetAt = now; return done(`Запомнил: в запасе ≈${fmtK(M.budget)} кинаров.`); }
    if (/(что ты (?:обо мне )?(?:знаешь|помнишь)|что ты запомнил|моя память|мои цели)/.test(t)) {
      const L2 = [];
      if (M.goalGs) L2.push(`Цель: GS ${M.goalGs}${M.goalDate ? ` к ${dateRu(M.goalDate)} (осталось ${daysLeft(M.goalDate)} дн.)` : ""}`);
      if (M.hours) L2.push(`Играешь ≈${num(M.hours)} ч в день`);
      if (M.style) L2.push(`Стиль: ${M.style === "pvp" ? "PvP" : M.style === "tank" ? "важна выживаемость" : "PvE"}`);
      if (M.budget) L2.push(`Запас кинаров: ≈${fmtK(M.budget)}`);
      if (M.income) L2.push(`Доход: ≈${fmtK(M.income)} в день`);
      const syn = (st.ai || {}).syn || []; if (syn.length) L2.push("Твои слова: " + syn.map((s) => `«${s.a}» = «${s.b}»`).join(", "));
      const k = (st.kills || []).length, lo = (st.loot || []).filter((l) => l.item != null).length; if (k || lo) L2.push(`Журнал: ${k} убийств боссов, ${lo} записей добычи`);
      return { md: L2.length ? "**Что я помню про тебя:**\n" + L2.map((l) => "- " + l).join("\n") + "\n\nИзменить: «моя цель 1400 к воскресенью», «играю 3 часа в день», «забудь цель»." : "Пока ничего. Расскажи: «моя цель 1300 GS к пятнице», «играю 2 часа в день», «я в PvE», «мой бюджет 3 млн», «зарабатываю 1 млн в день».", cmd: true };
    }
    if ((m = /забудь\s+(цель|всё|все|бюджет|доход|стиль|часы|слова|синоним)/.exec(t))) {
      const w = m[1];
      if (/цель/.test(w)) { delete M.goalGs; delete M.goalDate; } else if (/бюджет/.test(w)) delete M.budget; else if (/доход/.test(w)) delete M.income; else if (/стиль/.test(w)) delete M.style; else if (/час/.test(w)) delete M.hours;
      else if (/слов|синон/.test(w)) { st.ai = st.ai || {}; st.ai.syn = []; } else { x.p.mem = {}; }
      return done("Забыл.");
    }
    // добыча: «выпала картина Ноблуда», «с Кашапы упал плавильный камень», «Кашапа ничего не дал»
    const lootVerb = /(выпал|выпала|выпало|выпали|дропнул|дропнулся|залутал|выбил|получил|достал|упал[аио]?\s+(?!босс))/;
    const boss = ents.bosses && ents.bosses[0];
    if (boss && /(ничего|пусто|ноль|пустой)/.test(t) && /(не дал|не выпал|пусто|ничего)/.test(t)) {
      st.loot = st.loot || []; st.loot.push({ at: now, slug: boss[0], item: null });
      logKill(st, boss[0], now);
      return done(`Записал: ${boss[1]} — без ценной добычи. Статистику удачи покажу по запросу «моя удача».`, { chips: ["Моя удача"] });
    }
    if (lootVerb.test(t) && !/(где|сколько|шанс|\?)/.test(t)) {
      const lastKill = (st.kills || []).slice(-1)[0], slug = boss ? boss[0] : (lastKill && now - lastKill.at < 45 * 60e3 ? lastKill.slug : null);
      const parts = t.replace(/^.*?(выпал[аио]?|выпали|дропнул\S*|залутал|выбил|получил|достал|упал[аио]?)\s+/, "").split(/,|\sи\s/);
      const got = parts.map((pt) => findItemIn(pt, slug) ?? findItemIn(pt, null)).filter((i) => i != null);
      if (got.length) {
        st.loot = st.loot || [];
        got.forEach((i) => st.loot.push({ at: now, slug, item: i }));
        if (slug) logKill(st, slug, now);
        const X = window.EXTRA, B = slug && X.bosses.find((b) => b[0] === slug);
        const lines = got.map((i) => { const c = slug ? chanceOf(slug, i) : null; return `**${X.items[i][0]}**${c ? ` (шанс ${num(c * 100, 2)}%${c < .1 ? " — повезло!" : ""})` : ""}`; });
        return done(`Записал добычу${B ? ` с ${B[1]}` : ""}: ${lines.join(", ")}.`, { chips: ["Моя удача"] });
      }
    }
    // уточнения вместо угадывания
    if (KILL.test(t) && !ents.bosses && /^(убил|убили|завалил|завалили|снес|снесли|слили)(?![а-яё])/.test(t) && words(t).length <= 3) {
      const known = (x.st.kills || []).slice(-6).map((k) => k.slug).reverse(), X = window.EXTRA;
      const sug = [...new Set(known.concat(["soul-ruler-kashapa", "high-commander-lagta", "silent-dartan", "melted-danar"]))].slice(0, 5).map((s) => X.bosses.find((b) => b[0] === s)).filter(Boolean);
      return { md: "Кого убил? Нажми или напиши имя:", cmd: true, chips: sug.map((b) => "Убил " + b[1].split(" ").slice(-1)[0]) };
    }
    if (/^напомни(?![а-яё])/.test(t) && !/(через|в\s+\d|каждые)/.test(t)) {
      const what = q.replace(/^напомни(те)?\s*(мне)?\s*/i, "").trim() || "проверить";
      return { md: `Когда напомнить «${what}»?`, cmd: true, chips: [15, 30, 60, 120].map((n) => `Напомни через ${n} минут ${what}`) };
    }
    return null;
  }
  function logKill(st, slug, at) { st.kills = st.kills || []; const lk = st.kills.filter((k) => k.slug === slug).slice(-1)[0]; if (!lk || at - lk.at > 20 * 60e3) st.kills.push({ at, slug }); while (st.kills.length > 2000) st.kills.shift(); }

  // --- удача по журналу ---
  function luck(x) {
    const st = x.st, X = window.EXTRA, kills = st.kills || [], loot = st.loot || [];
    if (!kills.length) return { md: "Журнал пуст. Пиши мне «убил Кашапу» и «выпала картина Кашапы» (или «Кашапа ничего не дал») — посчитаю, везёт ли тебе по сравнению с шансами игры.", chips: ["Убил Кашапу"] };
    const by = {}; kills.forEach((k) => (by[k.slug] = by[k.slug] || { n: 0, got: {} }).n++);
    loot.forEach((l) => { if (l.slug && l.item != null && by[l.slug]) by[l.slug].got[l.item] = (by[l.slug].got[l.item] || 0) + 1; });
    let sumGot = 0, sumExp = 0; const out = ["**Твоя удача по журналу**"];
    Object.entries(by).sort((a, b) => b[1].n - a[1].n).forEach(([slug, v]) => {
      const B = X.bosses.find((b) => b[0] === slug) || [slug, slug], m = X.mobs.find((mm) => mm[0] === slug);
      const key = (m ? m[6] : []).filter((r) => r[1] >= 1 && r[1] < 60 && !/Сундук|Камень духа|Эссенция/.test(X.items[r[0]][0])).slice(0, 4);
      const lines = key.map((r) => { const p2 = r[1] / 100, got = v.got[r[0]] || 0, exp = v.n * p2; sumGot += got; sumExp += exp;
        const note = got < exp && got === 0 ? ` — не выпадало ни разу, шанс такой серии ${num(Math.pow(1 - p2, v.n) * 100, 1)}%` : got > exp * 1.5 && got >= 2 ? " — выше нормы 🍀" : "";
        return `${X.items[r[0]][0]}: ${got} из ожидаемых ${num(exp, 1)}${note}`; });
      out.push(`**${B[1]}** — убийств: ${v.n}\n` + lines.map((l) => "- " + l).join("\n"));
    });
    if (sumExp > 0) { const idx = sumGot / sumExp; out.splice(1, 0, kills.length < 5 ? `Убийств пока ${kills.length} — для выводов об удаче мало данных, записывай дальше.` : `Индекс удачи: **${num(idx * 100, 0)}%** от среднего (${idx >= 1.15 ? "тебе везёт" : idx <= .85 ? "пока не везёт — это нормальная дисперсия" : "всё в пределах нормы"}).`); }
    return { md: out.join("\n\n"), chips: ["Итоги недели"] };
  }

  // --- планировщик цели ---
  function goalAnswer(x, q, ents, trace) {
    const t = low(q), M = mem(x), target = ents.gsTarget || M.goalGs, dl = parseDate(t) || M.goalDate || null;
    if (!target) return { md: "Какая цель? Напиши, например, «моя цель 1300 GS к пятнице» — я запомню и составлю план по дням.", chips: ["Моя цель 1300 GS к пятнице", "Моя цель 1400 GS через неделю"], cmd: true };
    const gs = x.gs || 0, need = target - gs, a = x.an;
    trace.push(`Цель: GS ${target}${dl ? ` к ${dateRu(dl)}` : ""}; сейчас ${gs}, не хватает ${Math.max(0, need)}.`);
    if (need <= 0) return { md: `🎉 Цель GS ${target} уже взята (сейчас ${gs}). Поставить новую? «моя цель ${Math.ceil((gs + 100) / 100) * 100} к воскресенью».`, chips: ["Как быстрее поднять GS?"] };
    if (noChar(x)) return { md: needImport };
    const sock = a.emptySockets * 2.5, rest = Math.max(0, need - sock);
    const steps = rest > 0 ? calc().ilvlSteps(x.st, x.p, x.ch, { gain: rest }) : [];
    const gained = sock + (steps.length ? steps[steps.length - 1].cum : 0), gold = steps.length ? steps[steps.length - 1].cumGold : 0, risky = steps.filter((s) => s.risky);
    trace.push(`Бесплатно: манакамни +${num(sock)}. Остальное — заточка: ${steps.length} шагов, ≈${fmtK(gold)}${risky.length ? `, из них ${risky.length} с риском` : ""}.`);
    const days = dl ? Math.max(1, daysLeft(dl)) : null, have = (M.budget || 0) + (M.income || 0) * (days || 0);
    const out = [`**Цель: GS ${target}${dl ? ` к ${dateRu(dl)}` : ""}** — сейчас ${gs}, нужно ещё **+${need}**${days ? `, осталось ${days} дн` : ""}.`];
    const plan = [];
    if (sock) plan.push(`Манакамни в ${a.emptySockets} гнёзд → +${num(sock)}`);
    const per = {}; steps.forEach((s) => { const k2 = s.id; per[k2] = per[k2] || { name: s.name, item: s.item, from: s.to - 1, to: s.to, gold: 0, risky: false }; per[k2].to = s.to; per[k2].gold += s.gold; per[k2].risky = per[k2].risky || s.risky; });
    Object.values(per).forEach((r) => plan.push(`${r.name} +${r.from}→+${r.to} — ≈${fmtK(r.gold)}${r.risky ? " ⚠️ риск" : ""}`));
    out.push(plan.map((l, i) => `${i + 1}. ${l}`).join("\n"));
    if (gained < need) out.push(`Даже со всей возможной заточкой выйдет ≈+${num(gained)} — **не хватит ${num(need - gained)}**. Остальное — замена бижутерии и слабых вещей (у тебя самые низкие: ${a.gear.filter((g) => g.item).sort((p, q2) => p.ilvl - q2.ilvl).slice(0, 2).map((g) => g.name).join(", ")}).`);
    else out.push(`Итого ≈ **${fmtK(gold)} кинаров**${risky.length ? ` (часть шагов с шансом ниже 100% — может понадобиться больше)` : ""}.`);
    if (M.budget || M.income) {
      const ok = have >= gold;
      trace.push(`Деньги: запас ${fmtK(M.budget || 0)} + доход ${fmtK(M.income || 0)}×${days || 0} дн. = ${fmtK(have)}; нужно ${fmtK(gold)}.`);
      out.push(ok ? `💰 По деньгам **успеваешь**: у тебя будет ≈${fmtK(have)}${days ? ` к ${dateRu(dl)}` : ""}.` : `💰 Не хватает ≈**${fmtK(gold - have)}**${M.income ? ` — это ещё ≈${Math.ceil((gold - have) / M.income)} дн. фарма` : ""}.`);
    } else out.push("Сколько у тебя кинаров? Напиши «мой бюджет 3 млн» и «зарабатываю 1 млн в день» — скажу, успеваешь ли по деньгам.");
    if (days && days > 1 && plan.length > 1) {
      const per2 = Math.ceil(plan.length / days), dd = [];
      for (let d = 0; d < days && d * per2 < plan.length; d++) dd.push(`- **${dateRu(Date.now() + d * 864e5)}:** ${plan.slice(d * per2, (d + 1) * per2).map((l) => l.split(" — ")[0].replace(/ →.*$/, "")).join("; ")}`);
      out.push("**По дням:**\n" + dd.join("\n"));
    }
    const acts = Object.entries(per).slice(0, 4).map(([slot, r]) => ({ label: `В план: ${r.name} +${r.to}`, a: { t: "planEnch", slot, to: r.to } }));
    if (!M.goalGs || M.goalGs !== target) acts.unshift({ label: "Запомнить цель", a: { t: "say", q: `моя цель ${target}${dl ? " к " + new Date(dl).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : ""}` } });
    return { md: out.join("\n\n"), acts, chips: ["Мой бюджет 3 млн", "Что ты обо мне знаешь?"], it: "goal" };
  }

  // --- «что если» ---
  function whatIfAnswer(x, q, trace) {
    const segs = low(q).split(/,|\sи\s|;|\sа\s/), ench = [];
    segs.forEach((sg) => { const e = entities(sg, x.ch); if (e.slots && e.to) e.slots.forEach((s) => ench.push({ slot: s, to: e.to })); });
    const e0 = entities(q, x.ch), crystals = e0.crystals || 0, sockets = /манакам|камн\S* в гн|гнезд/.test(low(q));
    if (!ench.length && !crystals && !sockets) return null;
    const r = calc().whatIf(x.st, x.p, x.ch, { ench, crystals, sockets });
    trace.push(`Симулирую: ${[ench.map((c) => `${SLOT_RU[c.slot] || c.slot} до +${c.to}`).join(", "), crystals ? crystals + " кр. в Дэванион" : "", sockets ? "все гнёзда заполнены" : ""].filter(Boolean).join("; ")}.`);
    trace.push(`Пересчитал копию персонажа: GS ${r.gs >= 0 ? "+" : ""}${r.gs}, урон +${num(r.dps)}%, живучесть +${num(r.tank)}%.`);
    const out = ["**Что будет, если…**"];
    r.rows.forEach((w) => out.push(`- ${w.name} (${w.item}) +${w.from}→+${w.to}${w.cost ? ` — ≈${fmtK(w.cost.gold)}${w.cost.risky ? " ⚠️" : ""}` : ""}`));
    if (crystals) out.push(`- Дэванион: ${r.picks} ячеек на ${r.crystals} кр.`);
    if (sockets) out.push("- Манакамни во все пустые гнёзда");
    out.push(`**Итог:** GS **${r.gs >= 0 ? "+" : ""}${r.gs}** (станет ≈${(x.gs || 0) + r.gs}), урон ≈**+${num(r.dps)}%**, живучесть ≈+${num(r.tank)}%${r.gold ? `, кинаров ≈**${fmtK(r.gold)}**` : ""}.`);
    if (r.diff.length) out.push("Показатели: " + r.diff.join(", ") + ".");
    const goal = mem(x).goalGs; if (goal) out.push((x.gs || 0) + r.gs >= goal ? `🎯 Этого хватает до твоей цели GS ${goal}.` : `🎯 До цели GS ${goal} останется ещё ${goal - (x.gs || 0) - r.gs}.`);
    return { md: out.join("\n"), acts: [{ label: "Сохранить как план", a: { t: "whatIfSave", changes: { ench, crystals, sockets }, name: "Что если " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) } }], chips: ["Почему так?"], it: "whatif" };
  }

  // --- сводка дня и итоги недели ---
  function summary(x) {
    const h = new Date().getHours(), now = Date.now(), M = mem(x);
    const hi = h < 6 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
    const out = [`**${hi}, ${x.ch.name}!** ${pick(["Вот что важно сейчас:", "Коротко по делу:", "Сводка на сейчас:"])}`];
    const L3 = [];
    L3.push(`GS **${x.gs || "?"}**${M.goalGs ? ` → цель ${M.goalGs}${M.goalDate ? ` к ${dateRu(M.goalDate)} (${daysLeft(M.goalDate)} дн.)` : ""}, осталось ${Math.max(0, M.goalGs - (x.gs || 0))}` : ""}`);
    const ev = events(x, 3).slice(0, 4); if (ev.length) L3.push("Ближайшие 3 ч: " + ev.map((e) => `${hhmm(e.at)} ${e.name}`).join(", "));
    const od = L().odyleNow(x.p.odyle, now); if (od != null) L3.push(`Одила ${od}/560${od >= 500 ? " — пора тратить!" : ""}`);
    const lists = x.p.lists || {}, left = (k) => (lists[k] || []).filter((it) => !((x.p.checks || {})[k] || {})[it.id]).length;
    if (lists.daily) L3.push(`Дела: день — осталось ${left("daily")}, неделя — ${left("weekly")}`);
    if (x.an && x.an.emptySockets) L3.push(`Быстрый плюс: ${x.an.emptySockets} пустых гнёзд под манакамни (+${num(x.an.emptySockets * 2.5)} GS)`);
    out.push(L3.map((l) => "- " + l).join("\n"));
    const nt = notices(x); if (nt.length) out.push("💡 " + nt.join(" "));
    return { md: out.join("\n\n"), chips: ["Что делать сегодня вечером?", M.goalGs ? "Как дойти до цели?" : "Моя цель 1300 GS к пятнице", "Моя удача"], it: "summary" };
  }
  function weekly(x) {
    const st = x.st, wk = Date.now() - 7 * 864e5, X = window.EXTRA;
    const h = (x.p.history || []).filter((r) => r.gs && r.ts).map((r) => ({ gs: +r.gs, t: new Date(r.ts.replace(" ", "T")).getTime() })).filter((r) => r.t >= wk);
    const kills = (st.kills || []).filter((k) => k.at >= wk), loot = (st.loot || []).filter((l) => l.at >= wk && l.item != null);
    const out = ["**Итоги недели**"];
    out.push(h.length >= 2 ? `GS: ${h[0].gs} → **${h[h.length - 1].gs}** (${h[h.length - 1].gs - h[0].gs >= 0 ? "+" : ""}${h[h.length - 1].gs - h[0].gs}).` : "GS за неделю почти не записывался — пиши «GS 1150» после апгрейдов.");
    if (kills.length) { const by = {}; kills.forEach((k) => by[k.slug] = (by[k.slug] || 0) + 1); out.push("Боссы: " + Object.entries(by).map(([s, n]) => `${(X.bosses.find((b) => b[0] === s) || [s, s])[1]} ×${n}`).join(", ") + "."); }
    if (loot.length) out.push("Добыча: " + loot.map((l) => X.items[l.item][0]).join(", ") + ".");
    const M = mem(x); if (M.goalGs && h.length >= 2) { const rate = (h[h.length - 1].gs - h[0].gs) / Math.max(1, (h[h.length - 1].t - h[0].t) / 864e5); if (rate > 0) out.push(`При таком темпе цель ${M.goalGs} — через ≈${Math.ceil((M.goalGs - h[h.length - 1].gs) / rate)} дн.${M.goalDate ? ` (нужно к ${dateRu(M.goalDate)})` : ""}.`); }
    out.push("**На следующую неделю:** " + (x.an && x.an.emptySockets ? "закрыть пустые гнёзда, " : "") + "доточить броню до +10, держать Одилу ниже 560 и отмечать боссов — я посчитаю удачу.");
    return { md: out.join("\n\n"), chips: ["Моя удача", "Как дойти до цели?"], it: "weekly" };
  }
  // --- 👎: другие трактовки вопроса ---
  const CANON = { growth: "Как быстрее поднять GS?", dv: "Куда вложить 40 кристаллов?", enchant: "Что точить выгоднее?", stigma: "Проверь мои стигмы", skills: "Проверь умения", drops: "Где выбить плавильный камень?",
    farm: "Где фармить кинары?", bosses: "Таймеры боссов", today: "Что делать сегодня вечером?", schedule: "Когда разлом?", stats: "Какие характеристики важнее?", gear: "Что со снаряжением?", plan: "Разбери мой план", progress: "Как мой прогресс?", goal: "Как дойти до цели?", luck: "Моя удача", summary: "Сводка" };
  function alternatives(q) {
    const n = normalize(q).q, ex = intents(n).map((z) => z[0]), used = ex[0];
    const alt = Object.keys(CANON).filter((k) => k !== used && (ex.includes(k))).concat(Object.keys(CANON).filter((k) => !ex.includes(k) && k !== used)).slice(0, 5).map((k) => CANON[k]);
    const x = ctx(n), hits = search(x, n, 2).map((h) => h.d.t).filter((tt) => tt.length < 60);
    return { md: "Понял, ответ не тот. Возможно, ты имел в виду одно из этого? Можно и научить меня своему слову: «запомни: пушка — это оружие».", chips: alt.concat(hits.map((h) => "Что такое " + h.replace(/^Гайд — /, "") + "?")).slice(0, 6) };
  }

  // ================= диалог =================
  let last = null;
  const FOLLOW = /^(а|и|ещ[её]|тогда|ну|так|если|подробнее|подробней|больше|почему|зачем|для)(?=[\s?,.!]|$)/;
  const EXPLAIN = /(как работает|как устроен|что такое|что значит|что это|объясни|поясни)/;
  let lastQ = "";
  function answer(q, opt) {
    const keepLast = last; lastQ = q;
    if (!(opt && opt.peek)) { const c = command(q); if (c) return c; }
    const norm = normalize(q); q = norm.q;
    if (!onTopic(q) && !(last && words(q).length <= 4 && /^(а|и|ещ|тогда|почему|зачем|подробн|больше|для)/.test(low(q).trim()))) return { md: OFFTOPIC_MD, chips: ["Как быстрее поднять GS?", "Что делать сегодня вечером?"], off: true };
    const x = ctx(q), ex = intents(q), ents = entities(q, x.ch), t = low(q).trim(), short = words(q).length <= 5;
    let it = ex[0] ? ex[0][0] : null;
    // продолжение разговора: «а для перчаток?», «а если 100 кристаллов?», «подробнее», «почему?»
    let inherited = false;
    // местоимения: «а сколько стоит его до +12?» — про то же, что в прошлый раз
    if (last && last.ents && /(?<![а-яё])(её|ее|его|их|это|эту|этого|него|неё|нее|туда|там)(?![а-яё])/.test(t) && !ents.slots && !ents.skill && !ents.bosses && !ents.board) {
      ["slots", "skill", "bosses", "board"].forEach((k) => { if (last.ents[k]) ents[k] = last.ents[k]; });
    }
    if (last && (FOLLOW.test(t) || (!it && Object.keys(ents).length)) && short) {
      if (/^(а\s+)?(почему|зачем)/.test(t) && WHY[last.it]) { const r = { md: "**Почему так:** " + WHY[last.it], chips: last.chips || [] }; return r; }
      if (/подробн|больше/.test(t)) ents.more = true;
      // голое число в продолжении: «а если 80?»
      const nm = /(\d+(?:[.,]\d+)?)/.exec(t);
      if (nm && !ents.kinah && !ents.crystals && !ents.to && !ents.gsTarget && !ents.hours) {
        const n = +nm[1].replace(",", "."), le = last.ents || {};
        if (le.kinah) ents.kinah = n < 1000 ? n * (le.kinah >= 1e6 ? 1e6 : 1e3) : n;
        else if (le.gsTarget || n >= 300) ents.gsTarget = n;
        else if (last.it === "dv" || le.board || le.crystals) ents.crystals = n;
        else if ((last.it === "enchant" || le.slots) && n <= 20) ents.to = n;
        else if (le.hours || last.it === "today") ents.hours = n;
      }
      if (!it || it === "hello") { it = last.it; inherited = true; }
      Object.keys(last.ents || {}).forEach((k) => { if (!(k in ents) && !["slots", "skill", "bosses", "board"].includes(k)) ents[k] = last.ents[k]; });
      if (!ents.slots && !ents.skill && !ents.bosses && !ents.board) ["slots", "skill", "bosses", "board"].forEach((k) => { if (last.ents && last.ents[k] && it === last.it) ents[k] = last.ents[k]; });
      if (ents.crystals) x.budget = ents.crystals;
    }
    if (ents.crystals && x.an) { x.budget = ents.crystals; x.an = calc().analysis(x.st, x.p, x.ch, { budget: ents.crystals }); }
    if (ents.hours && it === "today") q = q + ` ${ents.hours} час`;
    // ход мысли: что понял, какие данные взял, что проверил
    const trace = norm.notes.slice();
    const Mx = mem(x);
    if (Mx.style && x.an && (Mx.style === "pvp" || Mx.style === "tank")) x.an = calc().analysis(x.st, x.p, x.ch, { budget: x.budget, mode: Mx.style === "pvp" ? "pvp" : "tank" });
    const entTxt = [ents.slots && "вещь: " + ents.slots.map((s) => SLOT_RU[s] || s).join(", "), ents.skill && "умение: " + ents.skill.name, ents.bosses && "босс: " + ents.bosses.map((b) => b[1]).join(", "),
      ents.board && "доска: " + ents.board, ents.kinah && "бюджет: " + fmtK(ents.kinah), ents.crystals && "кристаллы: " + ents.crystals, ents.to && "цель: +" + ents.to, ents.gsTarget && "цель GS: " + ents.gsTarget, ents.hours && "время: " + ents.hours + " ч"].filter(Boolean);
    trace.push(`Понял вопрос: ${TOPIC_RU[it] || "общий вопрос по игре"}${inherited ? " (продолжаю прошлую тему)" : ""}${entTxt.length ? "; " + entTxt.join("; ") : ""}.`);
    if (x.an && x.an.imported) trace.push(`Данные персонажа: импорт от ${new Date(x.an.imported.at).toLocaleDateString("ru-RU")}, GS ${x.gs}, уровень ${x.an.level}.`);
    else trace.push(noChar(x) ? "Персонаж не заполнен — отвечаю по гайду и справочнику." : `Данные персонажа введены вручную, GS ${x.gs}.`);
    let r = null;
    try {
      if (TOPRE.test(t) && !/(босс|кинар|фарм)/.test(t)) r = topAnswer(x, trace);
      if (!r && (it === "whatif" || /(что (будет|если)|если (я )?(заточ|точн|возьм|вставл|добав))/.test(t))) r = whatIfAnswer(x, q, trace);
      if (!r && (it === "goal" || (ents.gsTarget && /(к|до)\s+(пятниц|суббот|воскрес|понедельник|вторник|сред|четверг|завтр|концу|\d{1,2}\s+[а-яё]+)|через\s+\d*\s*(дн|недел)/.test(t)))) r = goalAnswer(x, q, ents, trace);
      if (!r && it === "luck") r = luck(x);
      if (!r && it === "summary") r = summary(x);
      if (!r && it === "weekly") r = weekly(x);
      if (!r && COMPARE.test(t) && optionsIn(t, ents).length >= 2) r = compareAnswer(x, q, ents, trace);
      if (!r && ((ents.kinah && ents.crystals) || (/(с чего начать|что делать с|ресурс|у меня есть)/.test(t) && (ents.kinah || ents.crystals)))) r = resourcesAnswer(x, q, ents, trace);
      if (r) { /* решено рассуждением */ }
      else if (EXPLAIN.test(t) && !ents.skill && !ents.bosses) {
        const hits = search(x, q, 2).filter((h) => h.score >= (WHY[it] ? 7 : 2));
        if (WHY[it] || hits.length) {
          const out = [];
          if (WHY[it]) out.push("**Как это устроено:** " + WHY[it]);
          hits.forEach((h) => out.push(`**${h.d.t}** _(${h.d.src})_\n${h.text}`));
          r = { md: out.join("\n\n"), chips: ["Как быстрее поднять GS?"] };
        }
      }
      if (r && r.md) { /* уже ответили */ }
      else if (it === "hello" && !Object.keys(ents).length) r = hello(x, q);
      else if (ents.skillOther && !ents.skill) {
        const o = ents.skillOther, html = window.A2Calc._test.tipText(o.s, 1);
        const md2 = String(html).replace(/<b class='hl'>/g, "**").replace(/<\/b>/g, "**").replace(/<br>/g, "\n").replace(/&[a-z]+;/g, " ");
        r = { md: `**${o.s.name}** — умение класса **${window.A2CLS.name(o.cls)}** (не твоего персонажа).\n\nНа 1 ур.: ${md2}` + (o.s.specs.length ? "\n\nОсобенности:\n" + o.s.specs.map((p2) => `- с ${p2.unlock} ур. — ${p2.text}`).join("\n") : ""), chips: [] };
        trace.push(`Умение не твоего класса — нашёл у класса ${window.A2CLS.name(o.cls)}.`);
      }
      else if (ents.skill && (!it || inherited || ["skills", "stigma", "stats", "gear", "hello"].includes(it) || /что да|как работ|что дел|зачем/.test(t))) r = skillAnswer(x, ents);
      else if (ents.bosses && (!it || inherited || ["bosses", "drops", "farm", "today", "schedule"].includes(it) || /где|когда|респ/.test(t))) r = bossAnswer(x, ents);
      else if (ents.kinah && (!it || ["enchant", "growth", "farm", "gear"].includes(it) || /потрат|вложит|куда/.test(t))) r = budgetAnswer(x, ents);
      else if (ents.slots && (inherited || it === "enchant" || it === "gear" || /сколько|стоит|цен|точ|до \+|\+\d/.test(t)) && !/где|выбит|дроп/.test(t)) r = enchSlotAnswer(x, ents);
      else if (ents.board && (!it || inherited || it === "dv")) r = boardAnswer(x, ents);
      else if (ents.gsTarget && (!it || it === "growth")) r = gsTargetAnswer(x, ents);
      if (!r && it) {
        const fns = { build, progress, hello, growth, dv, enchant, stigma, skills, drops, farm, bosses, today, schedule, stats, gear, plan };
        r = fns[it](x, q);
        // второй вопрос в том же сообщении: «что точить и куда вложить кристаллы»
        const second = ex.find((z) => z[0] !== it && z[1] >= 1 && !(["farm", "drops"].includes(z[0]) && ["farm", "drops"].includes(it)) && z[0] !== "hello");
        if (second && /\sи\s|,|\?.+\?/.test(t) && fns[second[0]]) { const r2 = fns[second[0]](x, q); r = { md: r.md + "\n\n---\n\n" + r2.md, chips: r.chips, acts: (r.acts || []).concat(r2.acts || []) }; }
      }
      if (!r) r = smartFallback(x, q);
    } catch (err) { r = { md: "Не получилось посчитать ответ: " + err.message, chips: [] }; }
    // проверка себя и уверенность
    const hasNums = /\d/.test(r.md), fromCalc = !!(x.an && x.an.imported);
    if (/Не нашёл|Точного ответа нет|не заполнен/.test(r.md)) trace.push("Проверка: прямого ответа в данных нет — честно говорю об этом.");
    else trace.push(`Проверка: ${hasNums ? "цифры взяты из калькулятора и таблиц игры" : "ответ из гайда и справочника"}; уверенность — ${fromCalc && hasNums ? "высокая" : hasNums ? "средняя" : "средняя (без расчётов)"}.`);
    r.trace = (r.trace || []).concat(trace);
    if (!(opt && opt.peek)) { const nt = notices(x); if (nt.length) r.md += "\n\n💡 **Заметил:** " + nt.join(" Ещё: "); }
    // кнопки по смыслу
    r.acts = r.acts || [];
    if (r.auto && r.auto.t === "mapOnly" && r.auto.layers && r.auto.layers.length) r.acts.push({ label: "Подсветить в игре", a: { t: "overlay", layers: r.auto.layers, label: r.auto.label } });
    if (it === "dv" && !r.acts.length && x.an && x.an.picks.length) r.acts.push({ label: `Взять ${x.budget} кр. в план`, a: { t: "planDv", budget: x.budget } });
    if ((it === "bosses") && !r.acts.length) r.acts.push({ label: "Открыть «Боссы»", a: { t: "view", v: "bosses" } });
    if (it === "drops" && !r.acts.length) r.acts.push({ label: "Искать на карте", a: { t: "view", v: "map" } });
    if ((it === "plan" || it === "enchant") && !ents.skill && !ents.skillOther) r.acts.push({ label: "Открыть «Итог»", a: { t: "calc", tab: "result" } });
    last = { it: r.it || it || (last && last.it), ents, chips: r.chips };
    if (opt && opt.peek) last = keepLast;
    return r;
  }
  function smartFallback(x, q) {
    const hits = search(x, q, 2);
    if (!hits.length || hits[0].score < 2.2) return fallback(x, q);
    const out = [hits[0].score < 4 ? "Точного ответа нет, но вот самое близкое из справочника и гайда:" : "Вот что нашлось:"];
    hits.forEach((h) => out.push(`**${h.d.t}** _(${h.d.src})_\n${h.text}`));
    return { md: out.join("\n\n"), chips: ["Как быстрее поднять GS?", "Что делать сегодня вечером?"] };
  }
  function reset() { last = null; }

  window.A2Brain = { answer, intentOf, intents, entities, search, reset, command, undo, onTopic, OFFTOPIC_MD, normalize, alternatives, summary: () => summary(ctx("сводка")), parseDate };
})();
