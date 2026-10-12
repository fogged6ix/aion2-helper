"""Подробные гайды по классам и макросы из гайдов metabot.gg (raw5/guides.json, выгрузка страниц
«class-builds-guide», «gear-progression-guide» на ru и en). Пишет web/data/guides2.js:
  GUIDE2[cls][lang] = {intro, core[], stigmas[], pvp, stats[], dv, theo, steps[{t, b}], tip, macros[{name, when, skills[]}]}
  GUIDE2._common[lang] = {gear: {intro, steps[{t, b}], avoid}, theo: [[классы, выбор, почему]], macroRules[]}
Запуск: python3 tools/build_guides2.py (нужен node для чтения названий умений)."""
import json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = json.load(open(os.path.join(ROOT, 'raw5', 'guides.json'), encoding='utf-8'))
CLS = ['gladiator', 'templar', 'assassin', 'ranger', 'sorcerer', 'spiritmaster', 'cleric', 'chanter']
EN_NAME = {c: c.capitalize() for c in CLS}

names = json.loads(subprocess.check_output(['node', '-e', r'''
global.window = {};
require(process.argv[1] + "/web/data/calcdata.js"); require(process.argv[1] + "/web/data/i18n_data_en.js");
const out = {};
for (const [k, c] of Object.entries(window.CALCDATA.classes)) out[k] = c.skills.map((s) => [s.id, s.name, (window.I18N_DATA_EN.skills[s.id] || [])[0] || ""]);
console.log(JSON.stringify(out));
''', ROOT]).decode())

unent = lambda s: s.replace('&gt;', '>').replace('&lt;', '<').replace('&amp;', '&').replace('&#x27;', "'").replace('&quot;', '"')


def split_title(s):
    """«Накопите баффыПомечающий выстрел…» → («Накопите баффы», «Помечающий выстрел…»)"""
    m = re.search(r'(?<=[a-zа-яё0-9%)»])(?=[A-ZА-ЯЁ])', s)
    return (s[:m.start()].strip(), s[m.start():].strip()) if m else ('', s.strip())


def section(t, start_pat, end_pats, last=False):
    ms = list(re.finditer(start_pat, t))
    m = (ms[-1] if last else ms[0]) if ms else None
    if not m:
        return ''
    rest = t[m.end():]
    ends = [rest.find(e) for e in end_pats if rest.find(e) > 0]
    return rest[:min(ends)] if ends else rest


def parse_class(t, c, lang):
    if lang == 'ru':
        body = section(t, r'\nЛучший билд %s в AION 2\n' % EN_NAME[c], ['\nЛучший билд ', '\nПорядок Stigma'], last=True)
        keys = dict(core='Основные умения', stig='Стигмы в порядке открытия', stats='Приоритет характеристик', dv='Daevanion и Священный камень')
        play, theo_kw, pvp_kw = 'Как играть', 'Священный камень:', 'Замены для PvP:'
    else:
        body = section(t, r'\nBest %s Build in AION 2\n' % EN_NAME[c], ['\nBest ', '\nStigma order'], last=True)
        keys = dict(core='Core skills', stig='Stigmas in unlock order', stats='Stat priority', dv='Daevanion and Theostone')
        play, theo_kw, pvp_kw = 'How to play', 'Theostone:', 'PvP swaps:'
    lines = [unent(x).strip() for x in body.split('\n') if x.strip()]
    out = {'intro': lines[0] if lines else '', 'core': [], 'stigmas': [], 'pvp': '', 'stats': [], 'dv': '', 'theo': '', 'steps': [], 'tip': ''}
    in_play = False
    for ln in lines[1:]:
        cells = [x.strip() for x in ln.split('|') if x.strip()]
        if len(cells) == 2 and cells[0] in keys.values():
            k, v = cells
            if k == keys['core']:
                out['core'] = [x.strip() for x in v.split(',')]
            elif k == keys['stig']:
                main, _, pvp = v.partition(pvp_kw)
                out['stigmas'] = [x.strip(' .') for x in main.split('/')]
                out['pvp'] = pvp.strip(' .')
            elif k == keys['stats']:
                out['stats'] = [x.strip() for x in v.split('>')]
            elif k == keys['dv']:
                dv, _, th = v.partition(theo_kw)
                out['dv'], out['theo'] = dv.strip(), th.strip()
            continue
        if ln.startswith(play):
            in_play = True
            continue
        if in_play and re.match(r'^[1-9]\D', ln):
            t1, b = split_title(ln[1:])
            out['steps'].append({'t': t1, 'b': b})
            continue
        if ln.startswith('Причины выбора') or ln.startswith('Stat reasons'):
            in_play = False
            continue
        if not in_play and out['steps'] and not ln.startswith('|'):
            t1, b = split_title(ln)
            out['tip'] = (t1 + ': ' if t1 else '') + b
    return out


def find_skills(text, cls, lang, seen):
    """названия умений класса в тексте — по порядку упоминания (длинные названия раньше коротких)"""
    idx = 1 if lang == 'ru' else 2
    cand = sorted({s[idx] for s in names[cls] if s[idx]}, key=len, reverse=True)
    hits, taken = [], [False] * len(text)
    low = text.lower()
    for n in cand:
        for m in re.finditer(re.escape(n.lower()), low):
            if any(taken[m.start():m.end()]):
                continue
            for i in range(m.start(), m.end()):
                taken[i] = True
            hits.append((m.start(), n))
    out = []
    for _, n in sorted(hits):
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


MACRO = {
    'ru': dict(open='Начало боя', openWhen='Перед пуллом и в первые секунды боя: баффы и подготовка.', cycle='Основной цикл',
               cycleWhen='Пока цель жива: сильные умения с перезарядкой выше, умения без перезарядки — внизу списка.'),
    'en': dict(open='Opener', openWhen='Before the pull and in the first seconds: buffs and setup.', cycle='Main loop',
               cycleWhen='While the target is alive: strong cooldown skills higher, no-cooldown skills at the bottom.'),
}
RULES = {
    'ru': ['Макрос — несколько умений в одной ячейке панели. Удерживай клавишу макроса — умения применяются по приоритету сами.',
           'Клавиша: Настройки → Управление → «Макрос умений». Создание: окно умений → «Макросы умений» → «Добавить макрос».',
           'Срабатывает первым то, что выше в списке приоритета этой программы. В игре порядок задаётся положением в макросе — сверяйся с подсказкой в окне макроса.',
           'Обычную атаку в макрос не ставь: держи её на своей клавише и зажимай вместе с макросом.',
           'Умения без перезарядки ставь последними, иначе они перебьют всё, что ниже по приоритету.',
           'Ситуативные умения (рывки, защита, контроль) держи на отдельных клавишах.'],
    'en': ['A macro is several skills in one hotbar slot. Hold the macro key and the skills fire by priority.',
           'Key: Settings → Controls → "Skill Macros". Create: Skills window → "Skill Macros" → "Add Macro".',
           'The skill higher in this app\'s priority list fires first. In game the order is set by the position in the macro — check the hint in the macro window.',
           'Don\'t put the basic attack in the macro: keep it on its own key and hold it together with the macro.',
           'Put skills without a cooldown last, or they will block everything below them in priority.',
           'Keep situational skills (dashes, defensives, crowd control) on separate keys.'],
}


def macros(d, cls, lang):
    seen = set()
    steps = d['steps']
    a = find_skills(' '.join(s['b'] for s in steps[:2]), cls, lang, seen) if steps else []
    b = find_skills(' '.join(s['b'] for s in steps[2:]), cls, lang, seen) if len(steps) > 2 else []
    for c in d['core']:  # основные умения, которых не было в шагах, — в конец цикла
        if c not in seen:
            seen.add(c)
            b.append(c)
    M = MACRO[lang]
    return [x for x in [{'name': M['open'], 'when': M['openWhen'], 'skills': a}, {'name': M['cycle'], 'when': M['cycleWhen'], 'skills': b}] if x['skills']]


def gear(lang):
    t = G['gear_' + lang]
    if lang == 'ru':
        intro = section(t, r'Краткий ответ', ['\n']).strip()
        blk = section(t, r'\n\d+Лимит уровня[^\n]*\n', ['\nГрейды экипировки'])
        avoid_kw = 'Не тратьте материалы на…'
    else:
        intro = section(t, r'Quick answer', ['\n']).strip()
        blk = section(t, r'\n\d+Level cap[^\n]*\n', ['\nAION 2 gear grades'])
        avoid_kw = 'Don\'t spend materials on'
    steps, avoid = [], ''
    for ln in [unent(x).strip() for x in blk.split('\n') if x.strip()][1:]:
        if ln.startswith(avoid_kw):
            avoid = ln[len(avoid_kw):].strip(' ….')
            continue
        m = re.match(r'^((?:Уровень предмета|Item Level|Item level|IL)\s*[\d–\- от до]+?)(?=[А-ЯЁA-Z])', ln)
        if m:
            rest = ln[m.end():]
            t1, b = split_title(rest)
            steps.append({'t': m.group(1).strip() + ' · ' + t1, 'b': b})
    return {'intro': unent(intro), 'steps': steps, 'avoid': avoid}


def theo_table(lang):
    t = G['cb_' + lang]
    blk = section(t, r'\n\s*\|\s*\|\s*(Класс|Class)\s*\|\s*(Выбор для PvE|PvE pick)[^\n]*\n', ['\nКак настроить', '\nHow to set up'])
    rows = []
    for ln in blk.split('\n'):
        cells = [unent(x).strip() for x in ln.split('|') if x.strip()]
        if len(cells) == 3:
            rows.append(cells)
        elif rows and ln.strip() and '|' not in ln:
            break
    return rows


CLS_RU = {'gladiator': 'Гладиатор', 'templar': 'Страж', 'assassin': 'Убийца', 'ranger': 'Стрелок', 'sorcerer': 'Волшебник',
          'spiritmaster': 'Заклинатель', 'cleric': 'Целитель', 'chanter': 'Чародей'}
WORDS_RU = [('слота Stigma', 'слота стигм'), ('Stigmas', 'Стигмы'), ('Stigma', 'Стигма'), ('Daevanion', 'Дэванион'), ('Theostone', 'Божественный камень'),
            ('к Tank', 'к танкам'), ('к Dealer', 'к бойцам'), ('Tank', 'танк'), ('Dealer', 'боец'),
            ('PvE Damage Tolerance', 'стойкость к урону в PvE'), ('PvE Damage Boost', 'увеличению урона в PvE'), ('Damage Boost', 'увеличение урона'),
            ('Gale', 'Шквал'), ('Precision', 'Точность'), ('Slow', 'замедление'), ('Root', 'обездвиживание'), ('Fire', 'огня'), ('Water', 'воды'), ('MP', 'ОМ'), ('HP', 'ОЗ')]


def ru_names(obj, cls):
    """в русском гайде сайт иногда оставляет английские названия умений и классов — заменяем на русские"""
    pairs = [(en, ru) for _, ru, en in names[cls] if en and ru] + [(c.capitalize(), r) for c, r in CLS_RU.items()] + WORDS_RU
    pairs.sort(key=lambda x: -len(x[0]))
    def fix(t):
        for en, ru in pairs:
            t = re.sub(r'(?<![A-Za-zА-Яа-яЁё])' + re.escape(en) + r'(?![A-Za-zА-Яа-яЁё])', ru, t)
        return t
    if isinstance(obj, str):
        return fix(obj)
    if isinstance(obj, list):
        return [ru_names(x, cls) for x in obj]
    if isinstance(obj, dict):
        return {k: ru_names(v, cls) for k, v in obj.items()}
    return obj


OUT = {}
for c in CLS:
    OUT[c] = {}
    for lang in ('ru', 'en'):
        d = parse_class(G['cb_' + lang], c, lang)
        d['macros'] = macros(d, c, lang)
        OUT[c][lang] = ru_names(d, c) if lang == 'ru' else d
        print(c, lang, len(d['core']), len(d['stigmas']), len(d['steps']), [len(m['skills']) for m in d['macros']], bool(d['tip']))
OUT['_common'] = {lang: {'gear': gear(lang), 'theo': theo_table(lang), 'macroRules': RULES[lang],
                         'src': 'metabot.gg — AION 2: гайд по билдам, ротации и Стигмы; прогресс экипировки' if lang == 'ru' else 'metabot.gg — AION 2 class builds guide; gear progression guide'} for lang in ('ru', 'en')}
for lang in ('ru', 'en'):
    print(lang, 'gear steps', len(OUT['_common'][lang]['gear']['steps']), 'theo rows', len(OUT['_common'][lang]['theo']))
hdr = '/* Сгенерировано tools/build_guides2.py из гайдов metabot.gg */\n'
open(os.path.join(ROOT, 'web/data/guides2.js'), 'w', encoding='utf-8').write(hdr + 'window.GUIDE2=' + json.dumps(OUT, ensure_ascii=False) + ';\n')
