# База знаний для ИИ-помощника: исследование по AION 2 (Рейнджер) → web/data/kb.js кусками по разделам
import json, re
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'raw3', 'report.md')).read()
chunks, path = [], []
cur = []
def flush():
    t = "\n".join(cur).strip()
    if t and path:
        title = " / ".join(path[1:]) or path[0]
        # длинные разделы режем по абзацам ~1600 символов
        buf = ""
        for para in re.split(r"\n\s*\n", t):
            if len(buf) + len(para) > 1600 and buf:
                chunks.append({"t": title, "x": buf.strip()}); buf = ""
            buf += para + "\n\n"
        if buf.strip(): chunks.append({"t": title, "x": buf.strip()})
for line in src.splitlines():
    m = re.match(r"^(#{1,3})\s+(.*)", line)
    if m:
        flush(); cur = []
        lvl = len(m.group(1)); path = path[:lvl - 1] + [m.group(2).strip()]
    else:
        cur.append(line)
flush()
# ссылки [текст](url) → текст
for c in chunks:
    c["x"] = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1", c["x"])
out = "/* Сгенерировано tools/build_kb.py — исследование по AION 2 (глобальная версия), для ИИ-помощника */\nwindow.KB=" + json.dumps(chunks, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(os.path.join(ROOT, 'web', 'data', 'kb.js'), 'w').write(out)
print(len(chunks), len(out), [c["t"][:50] for c in chunks][:40])
