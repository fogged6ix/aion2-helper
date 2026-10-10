# Сборка web/data/extra.js: дроп мобов Альтгарда, полевые боссы, шансы заточки (metabot.gg)
import json, re
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R=os.path.join(ROOT,'raw3')+'/'
drops=json.load(open(R+'drops.json'))
steps=json.load(open(R+'steps.json'))
md=open(os.path.join(ROOT,'web')+'/'+'data/mapdata.js').read()
M=json.loads(md[md.index('{'):md.rindex('}')+1])
cats=[c[0] for c in M['cats']]
def catFor(slug):
    base=re.sub(r'-(lv)?\d+$','',slug)
    for pre in ('boss-','named-','creature-'):
        for s in (slug,base):
            if pre+s in cats: return pre+s
    return ''
GR={'Обычн.':'C','Редк.':'R','Легенд.':'L','Уник.':'U','Эпич.':'E','Особ.':'S','Миф.':'M'}
items=[[n,GR.get(g,g)] for n,g in drops['items']]
mobs=[]
for slug,name,lv,rank,zones,rows in drops['mobs']:
    mm=re.search(r'\s(\d+)(?:[–-](\d+))? ур\.',name)
    if mm: lv=int(mm.group(2) or mm.group(1))
    name=re.sub(r'\s+(Ревизор|Инспектор)\b.*$','',name)
    name=re.sub(r'\s+\d+(?:[–-]\d+)? ур\..*$','',name).strip(' ·')
    rows=sorted([r for r in rows if r[1] is not None],key=lambda r:-r[1])
    mobs.append([slug,name,lv,rank,zones,catFor(slug),rows])
BOSSES=[("desecrator-newbold",45),("specter-archon-axios",45),("special-operations-leader-linx",45),("black-warrior-aed",45),("veteran-shujakan",45),
("visionary-karuka",45),("advisor-resana",45),("high-overseer-nutah",45),("melted-danar",45),("drakan-battalion-weapon-guruta",45),("addicted-hardirun",45),
("sharp-shylak",45),("dark-shadow-vishwada",45),("blood-warrior-lannar",45),("predator-garsan",45),("blue-wave-kelpina",45),("faithful-rajit",45),
("berserker-vargor",45),("deceiver-trid",45),("executioner-barthien",45),("silent-dartan",48),("high-commander-lagta",48),("soul-ruler-kashapa",48),("immortal-gartua",51)]
ZONES={"desecrator-newbold":"Развалины базы легиона","specter-archon-axios":"Руины Васфельта","special-operations-leader-linx":"Руины Васфельта","black-warrior-aed":"Безымянное кладбище",
"veteran-shujakan":"Поселение черного когтя","visionary-karuka":"Поселение черного когтя","advisor-resana":"Дранактус","high-overseer-nutah":"Дранактус","melted-danar":"Место крушения Дерадикона",
"drakan-battalion-weapon-guruta":"Восток кряжа Грибадэ","addicted-hardirun":"Месторождение фафнита","sharp-shylak":"Площадь Имфетиуса","dark-shadow-vishwada":"Крепость Рагта",
"blood-warrior-lannar":"Лес Маэллан","predator-garsan":"Лес Маэллан","blue-wave-kelpina":"Лес очищения","faithful-rajit":"Наблюдательный пост святилища","berserker-vargor":"Наблюдательный пост святилища",
"deceiver-trid":"Уртумхейм","executioner-barthien":"Запад кряжа Грибадэ","silent-dartan":"Руины Васфельта","high-commander-lagta":"Крепость Рагта","soul-ruler-kashapa":"Месторождение фафнита","immortal-gartua":"Остров бессмертия"}
NAMES={"silent-dartan":"Немая Тартан","high-commander-lagta":"Глава армии Рагт","soul-ruler-kashapa":"Властелин душ Кашапа","immortal-gartua":"Бессмертный Гартуа"}
bymob={m[0]:m for m in mobs}
bosses=[]
for slug,lv in BOSSES:
    m=bymob.get(slug)
    name=NAMES.get(slug) or (m[1] if m else slug)
    bosses.append([slug,name,lv,ZONES[slug],catFor(slug)])
ench={k:[v['max'],v['s']] for k,v in steps['out'].items()}
mats={k:v['name'] for k,v in steps['mats'].items()}
out={'items':items,'mobs':mobs,'bosses':bosses,'ench':ench,'mats':mats,'src':'metabot.gg, глобальный клиент','at':'2026-10-10'}
s='/* Сгенерировано tools/build_extra.py — данные metabot.gg (глобальный клиент) */\nwindow.EXTRA='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n'
open(os.path.join(ROOT,'web')+'/'+'data/extra.js','w').write(s)
print(len(s), sum(1 for m in mobs if m[5]), len(mobs), [b for b in bosses if not b[4]])
