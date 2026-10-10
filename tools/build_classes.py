"""Из текстов страниц классов metabot.gg (raw4/pages.json, ru и en) собирает:
  web/data/top.js      — данные топ-игроков по каждому классу на двух языках;
  web/data/guides.js   — короткий гайд по классу (вкладка «Гайд») на двух языках.
Общие списки дел (ежедневные/еженедельные) — в web/data/content.js (без привязки к персонажу)."""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = json.load(open(os.path.join(ROOT, 'raw4/pages.json'), encoding='utf-8'))
CLS = ['gladiator', 'templar', 'assassin', 'ranger', 'sorcerer', 'spiritmaster', 'cleric', 'chanter']

L = {
    'ru': dict(best=r'ЛУЧШИЙ БИЛД [^\n]+\n\n(.+?)\n\n', core='ОСНОВНЫЕ УМЕНИЯ', stig='СТИГМЫ ПО ПОРЯДКУ ОТКРЫТИЯ', rot='РОТАЦИЯ',
               lv=r'(\d+) ур\.', slot=r'Ячейка (\d+) · Ур\. (\d+)', pvp=r'Замены для PvP: ([^\n]+)', stats=r'Приоритет характеристик\n(?:РЕДАКЦИЯ\n)?(.+?)\n\nНаш порядок',
               stones=r'Что вставляют лучшие игроки\n(?:Мало данных\n|Пока у нас[^\n]*\n)?(.+?)\n\n', dv=r'Путь Daevanion\n\n(.+?)\n\n',
               weap=r'НАИВЫСШИЙ УРОВЕНЬ ПРЕДМЕТА\n([^\n]+)\n\n(.+?)\n\n', pve=r'Сильные стороны в PvE\n\n(.+?)\n\n', pvpt=r'Сильные стороны в PvP\n\n(.+?)\n\n',
               diff=r'Сложность\n\n(.+?)\n\n', count=r'По данным лучших игроков [^:]+: (\d+)', rate=r'Кратко\n(.+?)\n\n'),
    'en': dict(best=r'BEST AION 2 [^\n]+\n\n(.+?)\n\n', core='CORE SKILLS', stig='STIGMAS IN UNLOCK ORDER', rot='ROTATION',
               lv=r'Lv\. (\d+)', slot=r'Slot (\d+) · Lv\. (\d+)', pvp=r'PvP swaps: ([^\n]+)', stats=r'Stat priority\n(?:EDITORIAL\n)?(.+?)\n\nOur order',
               stones=r'What top players socket\n(?:Low sample\n|So far we[^\n]*\n)?(.+?)\n\n', dv=r'Daevanion path\n\n(.+?)\n\n',
               weap=r'HIGHEST ITEM LEVEL\n([^\n]+)\n\n(.+?)\n\n', pve=r'PvE strengths\n\n(.+?)\n\n', pvpt=r'PvP strengths\n\n(.+?)\n\n',
               diff=r'Difficulty\n\n(.+?)\n\n', count=r'Based on (\d+) top', rate=r'At a glance\n(.+?)\n\n'),
}
# название камня → ключ характеристики калькулятора
STONE = {'атк': 'Attack', 'оз': 'HPMax', 'ом': 'MPMax', 'крит. удар': 'Critical', 'доп. меткость': 'Accuracy', 'меткость': 'Accuracy', 'зщт': 'DefenseMain',
         'блок': 'Block', 'укл': 'Evasion', 'доп. укл': 'Evasion', 'сопротивление крит. удару': 'CriticalResist',
         'attack': 'Attack', 'hp': 'HPMax', 'mp': 'MPMax', 'critical hit': 'Critical', 'accuracy bonus': 'Accuracy', 'accuracy': 'Accuracy', 'defense': 'DefenseMain',
         'block': 'Block', 'evasion': 'Evasion', 'evasion bonus': 'Evasion', 'critical hit resistance': 'CriticalResist', 'crit resist': 'CriticalResist'}


def sect(t, a, b):
    i = t.find(a)
    if i < 0:
        return ''
    j = t.find(b, i + len(a))
    return t[i + len(a): j if j > 0 else None]


def one(rx, t, g=1, flags=re.S):
    m = re.search(rx, t, flags)
    return m.group(g).strip() if m else ''


def parse(c, lang):
    t = P[f'{c}_{"ru_RU" if lang == "ru" else "en"}']
    R = L[lang]
    out = {'best': one(R['best'], t), 'count': int(one(R['count'], t) or 0)}
    # основные умения: имя / N ур. / P%
    core = []
    lines = [x.strip() for x in sect(t, R['core'], R['stig']).split('\n') if x.strip()]
    for i in range(len(lines) - 2):
        m1, m2 = re.fullmatch(R['lv'], lines[i + 1]), re.fullmatch(r'(\d+)%', lines[i + 2])
        if m1 and m2:
            core.append([lines[i], int(m1.group(1)), int(m2.group(1))])
    out['core'] = core
    st = []
    lines = [x.strip() for x in sect(t, R['stig'], R['rot']).split('\n') if x.strip()]
    for i in range(len(lines) - 3):
        ms = re.fullmatch(R['slot'], lines[i])
        if ms:
            m1, m2 = re.fullmatch(R['lv'], lines[i + 2]), re.fullmatch(r'(\d+)%', lines[i + 3])
            if m1 and m2:
                st.append([lines[i + 1], int(m1.group(1)), int(m2.group(1)), int(ms.group(2))])
    out['stigmas'] = st
    pv = one(R['pvp'], t, flags=0)
    out['pvp'] = [x.strip() for x in pv.split(',') if x.strip()] if pv else []
    sl = [x.strip() for x in one(R['stats'], t).split('\n') if x.strip()]
    out['stats'] = [[sl[i], sl[i + 1]] for i in range(0, len(sl) - 1, 2)]
    so = [x.strip() for x in one(R['stones'], t).split('\n') if x.strip()]
    stones = []
    for i in range(0, len(so) - 1, 2):
        m = re.fullmatch(r'(\d+)%', so[i + 1])
        if m:
            stones.append([STONE.get(so[i].lower(), ''), so[i], int(m.group(1))])
    out['stones'] = stones
    out['dv'] = one(R['dv'], t)
    m = re.search(R['weap'], t, re.S)
    out['weapon'] = [m.group(1).strip(), m.group(2).strip()] if m else ['', '']
    out['pve'], out['pvpText'], out['diff'] = one(R['pve'], t), one(R['pvpt'], t), one(R['diff'], t)
    rl = [x.strip() for x in one(R['rate'], t).split('\n') if x.strip()]
    out['rating'] = [[rl[i], rl[i + 1].count('★')] for i in range(0, len(rl) - 1, 2)]
    return out


TOP, GUIDE = {}, {}
H = {'ru': dict(build='Билд', play='Как играть', stig='Стигмы', skills='Умения', stats='Характеристики', stones='Манакамни', dv='Дэванион', weap='Оружие',
               pvp='Замены для PvP', top='Данные топ-игроков (metabot.gg)', pve='PvE', pvpT='PvP', diff='Сложность', slot='слот', lv='ур.', of='игроков'),
     'en': dict(build='Build', play='How to play', stig='Stigmas', skills='Skills', stats='Stats', stones='Manastones', dv='Daevanion', weap='Weapon',
               pvp='PvP swaps', top='Top-player data (metabot.gg)', pve='PvE', pvpT='PvP', diff='Difficulty', slot='slot', lv='lv.', of='players')}
for c in CLS:
    TOP[c], GUIDE[c] = {}, {}
    for lang in ('ru', 'en'):
        d = parse(c, lang)
        TOP[c][lang] = d
        h = H[lang]
        LV = (lambda n: f"{n} {h['lv']}") if lang == 'ru' else (lambda n: f"Lv. {n}")
        g = []
        g.append({'title': h['build'], 'text': d['best']})
        g.append({'title': h['play'], 'text': f"{h['pve']}: {d['pve']}\n\n{h['pvpT']}: {d['pvpText']}\n\n{h['diff']}: {d['diff']}"
                  + ('\n\n' + ' · '.join(f"{n} {'★' * s}{'☆' * (5 - s)}" for n, s in d['rating']) if d['rating'] else '')})
        g.append({'title': h['stig'], 'text': '\n'.join(f"• {n} — {LV(lv)} ({p}% {h['of']}, {h['slot']} {LV(sl)})" for n, lv, p, sl in d['stigmas'])
                  + (f"\n\n{h['pvp']}: {', '.join(d['pvp'])}" if d['pvp'] else '')})
        g.append({'title': h['skills'], 'text': '\n'.join(f"• {n} — {LV(lv)} ({p}%)" for n, lv, p in d['core'])})
        g.append({'title': h['stats'], 'text': '\n'.join(f"{i + 1}. {n} — {x}" for i, (n, x) in enumerate(d['stats']))
                  + ('\n\n' + h['stones'] + ': ' + ', '.join(f"{n} {p}%" for _, n, p in d['stones']) if d['stones'] else '')})
        g.append({'title': h['dv'], 'text': d['dv']})
        g.append({'title': h['weap'], 'text': (d['weapon'][0] + '\n\n' + d['weapon'][1]).strip()})
        GUIDE[c][lang] = g
    print(c, {l: (len(TOP[c][l]['core']), len(TOP[c][l]['stigmas']), len(TOP[c][l]['stats']), len(TOP[c][l]['stones']), bool(TOP[c][l]['dv']), bool(TOP[c][l]['best'])) for l in ('ru', 'en')})

hdr = '/* Сгенерировано tools/build_classes.py из страниц классов metabot.gg */\n'
open(os.path.join(ROOT, 'web/data/top.js'), 'w', encoding='utf-8').write(hdr + 'window.TOP=' + json.dumps(TOP, ensure_ascii=False) + ';\n')
open(os.path.join(ROOT, 'web/data/guides.js'), 'w', encoding='utf-8').write(hdr + 'window.GUIDES=' + json.dumps(GUIDE, ensure_ascii=False) + ';\n')
