"""Собирает web/i18n_en.js — английский словарь интерфейса.
Источники: tools/i18n/en_ui.py и en_msgs.py (ручной перевод строк интерфейса),
плюс названия из игровых данных (карта, умения, доски, предметы, зоны, классы).
Запуск: python3 tools/build_i18n.py (нужен node для чтения данных)."""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'i18n'))
from en_ui import E  # noqa: E402
from en_msgs import E2  # noqa: E402

JS = r'''
global.window = {}; global.navigator = {};
const W = %r;
for (const f of ["data/calcdata.js", "data/mapdata.js", "data/extra.js", "data/i18n_data_en.js", "classes.js"]) require(W + "/" + f);
const C = window.CALCDATA, M = window.MAPDATA, X = window.EXTRA, D = window.I18N_DATA_EN, out = {};
const add = (ru, en) => { if (ru && en && ru !== en && /[А-Яа-яЁё]/.test(ru) && !(ru in out)) out[ru] = en; };
M.cats.forEach((c) => add(c[2], c[1]));
M.areas.forEach((a) => add(a[2], a[1]));
Object.values(C.classes).forEach((k) => {
  k.skills.forEach((s) => { const e = D.skills[s.id]; if (e) add(s.name, e[0]); });
  k.boards.forEach((b) => add(b.name, D.boards[b.id]));
});
(X.items || []).forEach((it, i) => add(it[0], (window.I18N_ITEMS_EN || [])[i]));
Object.entries(window.I18N_ZONES_EN || {}).forEach(([r, e]) => add(r, e));
const byCat = {}; M.cats.forEach((c) => (byCat[c[0]] = c[1]));
(X.mobs || []).forEach((m) => add(m[1], byCat[m[5]]));
(X.bosses || []).forEach((b) => add(b[1], byCat[b[4]] || byCat["boss-" + b[0]] || byCat["named-" + b[0]]));
window.A2CLS.list.forEach((c) => { add(c.ru, c.en); add(c.weapon[0], c.weapon[1]); add(c.role[0], c.role[1]); add("Гайд " + c.gen, c.en + " guide"); });
console.log(JSON.stringify({ names: out, statLabels: C.statLabels }));
'''
res = json.loads(subprocess.check_output(['node', '-e', JS % os.path.join(ROOT, 'web')]).decode())
names = res['names']

STATS_EN = {
    'CombatSpeed': 'Combat speed', 'FixingDamage': 'Bonus ATK', 'CriticalResist': 'Crit Strike Resist', 'Critical': 'Crit Strike',
    'CoolTimeDecrease': 'Cooldown reduction', 'MPMax': 'MP', 'Defense': 'Bonus DEF', 'HPMax': 'HP', 'DecreaseDamage': 'Damage resist',
    'AmplifyAllDamage': 'Damage increase', 'AmplifyCriticalDamage': 'Crit damage increase', 'DecreaseCriticalDamage': 'Crit damage resist',
    'AdditionalHitResistRate': 'Multi-hit Resist', 'AdditionalHitRate': 'Multi-hit accuracy', 'PvPDecreaseDamage': 'PvP damage resist',
    'PvPAddDamage': 'PvP ATK', 'PvPDamageDefense': 'PvP DEF', 'AbnormalAccuracy': 'Effect accuracy', 'PvPCritical': 'PvP Crit Strike',
    'PvPCriticalResist': 'PvP Crit Strike Resist', 'PvPAccuracy': 'PvP Accuracy', 'PvPEvasion': 'PvP Evasion',
    'AbnormalResistance': 'Debuff resistance', 'PvPAmplifyDamage': 'PvP damage increase',
}
missing = [k for k in res['statLabels'] if k not in STATS_EN]
if missing:
    print('нет перевода для показателей:', missing)

exact = {}
exact.update(names)          # названия из данных
exact.update(E)              # ручной перевод интерфейса важнее
exact.update(E2)
for k, ru in res['statLabels'].items():
    if k in STATS_EN:
        exact.setdefault(ru, STATS_EN[k])

# куски фраз для последнего шага (подстановка внутри строки): без чисел и не короче 4 символов
frag = sorted({k: v for k, v in exact.items() if '#' not in k and len(k.strip()) >= 4 and '\n' not in k}.items(), key=lambda kv: -len(kv[0]))

PATTERNS = r'''[
  [/Картина: (.+?) (\d+(?:[.,]\d+)?)%/, "Painting: {t1} {2}%"],
  [/Советник смотрит на текущий план «(.+?)» и считает пользу в условных единицах «≈% урона». Веса — ориентир, а не формула игры: они опираются на твой лист персонажа \(АТК (.+?), ОЗ (.+?)\)\./, "The advisor looks at the current plan “{t1}” and estimates value in conventional “≈% damage” units. Weights are a guide, not the game's formula: they rely on your character sheet (ATK {2}, HP {3})."],
  [/Спросить ИИ: стоит ли идти по плану «(.+)»\?/, "Ask AI: is it worth following plan “{t1}”?"],
  [/Снаряжение (\d+) из (\d+): (.+)/, "Gear {1} of {2}: {t3}"],
  [/(.+) — вход/, "{t1} — entrance"],
  [/Таймер не запущен — скажи помощнику «убил (.+)»/, "Timer not started — press “Killed” for {t1} on the Bosses tab"],
  [/Взято: (.+)/, "Taken: {t1}"],
  [/Пинг до сервера игры (\S+) \((ICMP|TCP)\), среднее (\d+) мс/, "Ping to the game server {1} ({2}), average {3} ms"],
  [/Не получилось: (.+)/, "Failed: {t1}"],
  [/(.+?) \+N/, "{t1} +N"],
  [/(.+?) (\d+(?:[.,]\d+)?)%/, "{t1} {2}%"],
  [/(пн|вт|ср|чт|пт|сб|вс), (\d+) (января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря),? ?(\d+:\d+)?/, function (s, d, n, m, t) {
    const D = {пн: "Mon", вт: "Tue", ср: "Wed", чт: "Thu", пт: "Fri", сб: "Sat", вс: "Sun"};
    const Mo = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const E = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return D[d] + ", " + E[Mo.indexOf(m)] + " " + n + (t ? ", " + t : "");
  }],
]'''

hdr = '/* Сгенерировано tools/build_i18n.py — английский перевод интерфейса и названий из игровых данных */\n'
body = ('window.I18N_EN={exact:' + json.dumps(exact, ensure_ascii=False, separators=(',', ':'))
        + ',\nfrag:' + json.dumps(frag, ensure_ascii=False, separators=(',', ':'))
        + ',\nstats:' + json.dumps(STATS_EN, ensure_ascii=False, separators=(',', ':'))
        + ',\npatterns:' + PATTERNS + '};\n')
open(os.path.join(ROOT, 'web', 'i18n_en.js'), 'w', encoding='utf-8').write(hdr + body)
print('exact', len(exact), 'names', len(names), 'frag', len(frag))
