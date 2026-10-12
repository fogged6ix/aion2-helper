"""Справочник Пантеона: украшения (картины, статуи, колосс) с названиями ru/en и божественные показатели.
Источники: названия предметов metabot.gg (raw5/item_names.json), описание системы — thegameswiki.com/aion-2/wiki/pantheon,
gamesfuze.com (гайд по Пантеону). Пишет web/data/pantheon.js."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
it = json.load(open(os.path.join(ROOT, 'raw5', 'item_names.json'), encoding='utf-8'))['itm']
decor = []
for slug in sorted(it['en']):
    kind = 'colossus' if slug.startswith('colossus-') else 'statue' if slug.startswith('statue-') else 'artwork' if slug.startswith('artwork-') else None
    if kind and slug in it['ru']:
        decor.append([slug, kind, it['ru'][slug], it['en'][slug]])
DEITY = [  # ключ, лорд ru, en, показатель ru, en, что повышает ru, en
    ['Justice', 'Неджакан', 'Nezekan', 'Справедливость', 'Justice', 'ЗЩТ, шанс совершенного удара', 'Defense, Perfect chance'],
    ['Freedom', 'Байзел', 'Vaizel', 'Свобода', 'Freedom', 'Меткость, уклонение', 'Accuracy, Evasion'],
    ['Illusion', 'Кайсинель', 'Kaisinel', 'Видение', 'Illusion', 'Сокращение перезарядки, пробитие стойкости', 'Cooldown reduction, Endurance penetration'],
    ['Life', 'Юстиэль', 'Yustiel', 'Жизнь', 'Life', 'ОЗ, восстановление', 'HP, Restoration'],
    ['Time', 'Сиэль', 'Siel', 'Время', 'Time', 'СКР боя, сопротивление мультиудару', 'Combat speed, Double-hit resistance'],
    ['Destruction', 'Джикел', 'Zikel', 'Разрушение', 'Destruction', 'Увеличение АТК, сопротивление совершенному удару', 'Attack increase, Perfect resistance'],
    ['Death', 'Триниэль', 'Triniel', 'Смерть', 'Death', 'Крит. удар, пробитие восстановления', 'Critical hit, Restoration penetration'],
    ['Wisdom', 'Румиэль', 'Lumiel', 'Мудрость', 'Wisdom', 'Меньше расход ОМ, шанс мультиудара', 'Lower MP cost, Double-hit chance'],
    ['Destiny', 'Маркутан', 'Marchutan', 'Судьба', 'Destiny', 'ОМ, шанс стойкости', 'MP, Endurance chance'],
    ['Space', 'Израфель', 'Israphel', 'Пространство', 'Space', 'Скорость движения, шанс блока', 'Move speed, Block chance'],
]
out = {'decor': decor, 'deity': DEITY, 'slots': {'artwork': 12, 'statue': 4, 'colossus': 1},
       'src': ['https://thegameswiki.com/aion-2/wiki/pantheon', 'https://gamesfuze.com/guides/aion-2-pantheon-guide-how-to-unlock-and-upgrade-statues/', 'https://metabot.gg/ru_RU/aion-2/items']}
open(os.path.join(ROOT, 'web/data/pantheon.js'), 'w', encoding='utf-8').write('/* Сгенерировано tools/build_pantheon.py */\nwindow.PANTHEON=' + json.dumps(out, ensure_ascii=False) + ';\n')
print(len(decor), sum(1 for d in decor if d[1] == 'artwork'), sum(1 for d in decor if d[1] == 'colossus'))
