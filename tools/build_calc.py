"""Собирает web/data/calcdata.js (все классы) и web/data/i18n_data_en.js (английские названия)
из выгрузки metabot.gg (raw4/metabot.json: страницы /classes/<класс>/build и /daevanion/<класс>)."""
import json, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(os.path.join(ROOT, 'raw4/metabot.json')))
old = open(os.path.join(ROOT, 'web/data/calcdata.js'), encoding='utf-8').read()
old = json.loads(old[old.index('=') + 1:].rstrip().rstrip(';'))
classes = {}
for c, v in src['classes'].items():
    sk = []
    for s in v['skills']:
        s = dict(s)
        s['specs'] = [{k: x[k] for k in ('id', 'unlock', 'text')} for x in s.get('specs', [])]
        sk.append(s)
    classes[c] = {'skills': sk, 'budget': v['budget'], 'levelCap': v['levelCap'], 'specSlots': v['specSlots'],
                  'stigmaSlotLevels': v['stigmaSlotLevels'], 'boards': v['boards'], 'preset': v.get('preset')}
out = {'rules': old['rules'], 'statLabels': old['statLabels'], 'classes': classes}
open(os.path.join(ROOT, 'web/data/calcdata.js'), 'w', encoding='utf-8').write('window.CALCDATA=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
en = {'skills': {}, 'specs': {}, 'boards': {}, 'nodes': {}}
for c, v in src['en'].items():
    for sid, (name, tip, specs) in v['skills'].items():
        en['skills'][sid] = [name, tip]
        ru = next((s for s in src['classes'][c]['skills'] if str(s['id']) == str(sid)), None)
        if ru:
            for sp, txt in zip(ru.get('specs', []), specs):
                en['specs'][str(sp['id'])] = txt
    en['boards'].update({str(k): x for k, x in v['boards'].items()})
    en['nodes'].update({str(k): x for k, x in v['nodes'].items()})
open(os.path.join(ROOT, 'web/data/i18n_data_en.js'), 'w', encoding='utf-8').write('window.I18N_DATA_EN=' + json.dumps(en, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('classes', list(classes), 'size', os.path.getsize(os.path.join(ROOT, 'web/data/calcdata.js')), 'en', os.path.getsize(os.path.join(ROOT, 'web/data/i18n_data_en.js')))
