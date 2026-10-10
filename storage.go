// Хранение данных по понятным файлам (вместо одного state.json).
//
//	data/
//	  settings.json          — настройки, вид окна, порядок персонажей
//	  timers.json            — таймеры боссов и свои напоминания
//	  journal.json           — журнал убийств и добычи
//	  assistant.json         — настройки ИИ-помощника и твои слова (без ключа API)
//	  secrets.json           — ключ Claude API (не отдавай этот файл!)
//	  cache.json             — скачанные шансы заточки
//	  characters/<Имя>/
//	    character.json       — персонаж: дела, отметки, прогресс GS, Одила, цели
//	    build.json           — калькулятор: «сейчас в игре», планы, лист персонажа
//	    chat.json            — переписка с помощником
//	  backups/               — ежедневные полные копии
package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type storage struct{ dir string }

var badName = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f]+`)

func safeName(s string) string {
	s = strings.TrimSpace(badName.ReplaceAllString(s, "_"))
	s = strings.Trim(s, ". ")
	if s == "" {
		s = "Персонаж"
	}
	if len([]rune(s)) > 40 {
		s = string([]rune(s)[:40])
	}
	return s
}

// пишем только если содержимое изменилось (атомарно через .tmp)
func writeJSON(path string, v interface{}) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	if old, err := os.ReadFile(path); err == nil && bytes.Equal(old, b) {
		return nil
	}
	os.MkdirAll(filepath.Dir(path), 0o755)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readJSON(path string) map[string]interface{} {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var m map[string]interface{}
	if json.Unmarshal(b, &m) != nil {
		return nil
	}
	return m
}

func pickKeys(m map[string]interface{}, keys ...string) map[string]interface{} {
	out := map[string]interface{}{}
	for _, k := range keys {
		if v, ok := m[k]; ok {
			out[k] = v
		}
	}
	return out
}

func (s *storage) save(raw string) bool {
	var st map[string]interface{}
	if json.Unmarshal([]byte(raw), &st) != nil {
		return false
	}
	ok := true
	try := func(err error) {
		if err != nil {
			ok = false
		}
	}
	chars, _ := st["chars"].([]interface{})
	profiles, _ := st["profiles"].(map[string]interface{})
	order := []string{}
	for _, c := range chars {
		if cm, ok := c.(map[string]interface{}); ok {
			if id, _ := cm["id"].(string); id != "" {
				order = append(order, id)
			}
		}
	}
	try(writeJSON(filepath.Join(s.dir, "settings.json"), map[string]interface{}{
		"_что_это": "Настройки программы и вида окна. Можно отдать другу.",
		"v":        st["v"], "settings": st["settings"], "ui": st["ui"], "order": order,
	}))
	try(writeJSON(filepath.Join(s.dir, "timers.json"), map[string]interface{}{
		"_что_это": "Таймеры полевых боссов и свои напоминания.",
		"bossT":    orEmpty(st["bossT"]), "timers": orEmptyList(st["timers"]),
	}))
	try(writeJSON(filepath.Join(s.dir, "journal.json"), map[string]interface{}{
		"_что_это": "Журнал: убийства боссов, выпавшая добыча и фарм-сессии (статистика удачи и доход в час).",
		"kills":    orEmptyList(st["kills"]), "loot": orEmptyList(st["loot"]),
		"sessions": orEmptyList(st["sessions"]), "session": st["session"],
	}))
	ai, _ := st["ai"].(map[string]interface{})
	aiPub := map[string]interface{}{}
	key := ""
	for k, v := range ai {
		if k == "key" {
			key, _ = v.(string)
			continue
		}
		aiPub[k] = v
	}
	try(writeJSON(filepath.Join(s.dir, "assistant.json"), map[string]interface{}{
		"_что_это": "Настройки ИИ-помощника и слова, которым ты его научил.", "ai": aiPub,
	}))
	if key != "" || fileExists(filepath.Join(s.dir, "secrets.json")) {
		try(writeJSON(filepath.Join(s.dir, "secrets.json"), map[string]interface{}{
			"_что_это": "Ключ Claude API. НЕ отдавай этот файл другим людям.", "claudeKey": key,
		}))
	}
	if st["cache"] != nil {
		try(writeJSON(filepath.Join(s.dir, "cache.json"), map[string]interface{}{"cache": st["cache"]}))
	}
	// персонажи: папка на каждого
	cdir := filepath.Join(s.dir, "characters")
	used := map[string]bool{}
	for _, c := range chars {
		cm, _ := c.(map[string]interface{})
		if cm == nil {
			continue
		}
		id, _ := cm["id"].(string)
		name, _ := cm["name"].(string)
		folder := safeName(name)
		for i := 2; used[strings.ToLower(folder)]; i++ {
			folder = safeName(name) + " (" + itoa(i) + ")"
		}
		used[strings.ToLower(folder)] = true
		prof, _ := profiles[id].(map[string]interface{})
		rest := map[string]interface{}{}
		for k, v := range prof {
			if k != "calc" && k != "chat" {
				rest[k] = v
			}
		}
		base := filepath.Join(cdir, folder)
		try(writeJSON(filepath.Join(base, "character.json"), map[string]interface{}{
			"_что_это": "Персонаж: дела, отметки, история GS, Одила, цели.", "character": cm, "data": rest,
		}))
		if calc, ok := prof["calc"]; ok {
			try(writeJSON(filepath.Join(base, "build.json"), map[string]interface{}{
				"_что_это": "Билд из калькулятора: снаряжение, умения, стигмы, Дэванион, планы. Можно отдать другу — в программе «Калькулятор → Загрузить билд».",
				"type":     "aion2helper-build", "v": 1, "character": pickKeys(cm, "name", "cls"), "calc": calc,
			}))
		}
		if chat, ok := prof["chat"]; ok {
			try(writeJSON(filepath.Join(base, "chat.json"), map[string]interface{}{"chat": chat}))
		}
	}
	// папки удалённых/переименованных персонажей
	if ents, err := os.ReadDir(cdir); err == nil {
		for _, e := range ents {
			if e.IsDir() && !used[strings.ToLower(e.Name())] && fileExists(filepath.Join(cdir, e.Name(), "character.json")) {
				os.RemoveAll(filepath.Join(cdir, e.Name()))
			}
		}
	}
	return ok
}

func (s *storage) load() string {
	set := readJSON(filepath.Join(s.dir, "settings.json"))
	if set == nil {
		// старый формат: один state.json здесь или в %APPDATA%
		for _, p := range s.legacy() {
			if b, err := os.ReadFile(p); err == nil && len(b) > 10 {
				return string(b)
			}
		}
		return ""
	}
	st := map[string]interface{}{"v": set["v"], "settings": set["settings"], "ui": set["ui"]}
	if t := readJSON(filepath.Join(s.dir, "timers.json")); t != nil {
		st["bossT"], st["timers"] = t["bossT"], t["timers"]
	}
	if j := readJSON(filepath.Join(s.dir, "journal.json")); j != nil {
		st["kills"], st["loot"] = j["kills"], j["loot"]
	}
	ai := map[string]interface{}{}
	if a := readJSON(filepath.Join(s.dir, "assistant.json")); a != nil {
		if m, ok := a["ai"].(map[string]interface{}); ok {
			ai = m
		}
	}
	if sec := readJSON(filepath.Join(s.dir, "secrets.json")); sec != nil {
		if k, _ := sec["claudeKey"].(string); k != "" {
			ai["key"] = k
		}
	}
	st["ai"] = ai
	if c := readJSON(filepath.Join(s.dir, "cache.json")); c != nil {
		st["cache"] = c["cache"]
	}
	type ch struct {
		id   string
		char interface{}
		prof map[string]interface{}
	}
	found := map[string]ch{}
	cdir := filepath.Join(s.dir, "characters")
	if ents, err := os.ReadDir(cdir); err == nil {
		for _, e := range ents {
			if !e.IsDir() {
				continue
			}
			c := readJSON(filepath.Join(cdir, e.Name(), "character.json"))
			if c == nil {
				continue
			}
			cm, _ := c["character"].(map[string]interface{})
			id, _ := cm["id"].(string)
			if id == "" {
				continue
			}
			prof, _ := c["data"].(map[string]interface{})
			if prof == nil {
				prof = map[string]interface{}{}
			}
			if b := readJSON(filepath.Join(cdir, e.Name(), "build.json")); b != nil && b["calc"] != nil {
				prof["calc"] = b["calc"]
			}
			if h := readJSON(filepath.Join(cdir, e.Name(), "chat.json")); h != nil && h["chat"] != nil {
				prof["chat"] = h["chat"]
			}
			found[id] = ch{id, cm, prof}
		}
	}
	chars := []interface{}{}
	profiles := map[string]interface{}{}
	seen := map[string]bool{}
	if ord, ok := set["order"].([]interface{}); ok {
		for _, o := range ord {
			if id, _ := o.(string); id != "" {
				if c, ok := found[id]; ok {
					chars = append(chars, c.char)
					profiles[id] = c.prof
					seen[id] = true
				}
			}
		}
	}
	for id, c := range found {
		if !seen[id] {
			chars = append(chars, c.char)
			profiles[id] = c.prof
		}
	}
	if len(chars) > 0 {
		st["chars"] = chars
	}
	st["profiles"] = profiles
	b, _ := json.Marshal(st)
	return string(b)
}

func (s *storage) legacy() []string {
	out := []string{filepath.Join(s.dir, "state.json")}
	if app := os.Getenv("APPDATA"); app != "" {
		out = append(out, filepath.Join(app, "AION2Helper", "state.json"))
	}
	return out
}

func fileExists(p string) bool { _, err := os.Stat(p); return err == nil }

func orEmpty(v interface{}) interface{} {
	if v == nil {
		return map[string]interface{}{}
	}
	return v
}
func orEmptyList(v interface{}) interface{} {
	if v == nil {
		return []interface{}{}
	}
	return v
}

// Портативный режим: если рядом с exe есть папка data (или файл portable.txt) — всё хранится там.
func portableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	d := filepath.Dir(exe)
	if fileExists(filepath.Join(d, "data")) || fileExists(filepath.Join(d, "portable.txt")) {
		os.MkdirAll(filepath.Join(d, "data"), 0o755)
		return filepath.Join(d, "data")
	}
	return ""
}

// файл для обмена: кладём в папку exports рядом с данными
func exportDir(dataDir string) string {
	dir := filepath.Join(filepath.Dir(dataDir), "exports")
	if filepath.Base(dataDir) != "data" { // не портативный режим — в «Документы»
		if home, err := os.UserHomeDir(); err == nil {
			dir = filepath.Join(home, "Documents", "AION2Helper exports")
		}
	}
	return dir
}

func writeExport(dataDir, name, content string) string {
	dir := exportDir(dataDir)
	os.MkdirAll(dir, 0o755)
	p := filepath.Join(dir, safeName(strings.TrimSuffix(name, ".json"))+".json")
	if os.WriteFile(p, []byte(content), 0o644) != nil {
		return ""
	}
	return p
}
