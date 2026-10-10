/* Классы AION 2: одно место для названий, иконок и синонимов (для всех разделов программы) */
(function () {
  const LIST = [
    { id: "gladiator", ru: "Гладиатор", gen: "гладиатора", en: "Gladiator", icon: 11020000, weapon: ["Двуручный меч", "Greatsword"], role: ["Танк и урон", "Tank / DPS"], alias: ["гладиатор", "глад", "gladiator", "glad"] },
    { id: "templar", ru: "Страж", gen: "стража", en: "Templar", icon: 12010000, weapon: ["Длинный меч", "Longsword"], role: ["Танк", "Tank"], alias: ["страж", "темплар", "тамплиер", "templar", "танк"] },
    { id: "assassin", ru: "Убийца", gen: "убийцы", en: "Assassin", icon: 13010000, weapon: ["Кинжалы", "Daggers"], role: ["Урон", "DPS"], alias: ["убийца", "сина", "ассасин", "assassin", "sin"] },
    { id: "ranger", ru: "Стрелок", gen: "стрелка", en: "Ranger", icon: 14020000, weapon: ["Лук", "Bow"], role: ["Урон", "DPS"], alias: ["стрелок", "рейнджер", "ренджер", "лучник", "ranger"] },
    { id: "sorcerer", ru: "Волшебник", gen: "волшебника", en: "Sorcerer", icon: 15210000, weapon: ["Гримуар", "Spellbook"], role: ["Урон", "DPS"], alias: ["волшебник", "маг", "сорк", "sorcerer", "sorc"] },
    { id: "spiritmaster", ru: "Заклинатель", gen: "заклинателя", en: "Spiritmaster", icon: 16010000, weapon: ["Сфера", "Orb"], role: ["Урон", "DPS"], alias: ["заклинатель", "заклинатель духов", "спиритмастер", "сум", "spiritmaster", "sm"] },
    { id: "cleric", ru: "Целитель", gen: "целителя", en: "Cleric", icon: 17010000, weapon: ["Булава", "Mace"], role: ["Лекарь", "Healer"], alias: ["целитель", "клирик", "хил", "жрец", "cleric", "healer"] },
    { id: "chanter", ru: "Чародей", gen: "чародея", en: "Chanter", icon: 18010000, weapon: ["Посох", "Staff"], role: ["Лекарь и урон", "Support / DPS"], alias: ["чародей", "чантер", "чант", "chanter"] },
  ];
  const byId = Object.fromEntries(LIST.map((c) => [c.id, c]));
  const en = () => (window.A2I18n && window.A2I18n.lang === "en");
  window.A2CLS = {
    list: LIST,
    ids: LIST.map((c) => c.id),
    get: (id) => byId[id] || byId.ranger,
    name: (id) => { const c = byId[id]; return c ? (en() ? c.en : c.ru) : String(id || ""); },
    gen: (id) => { const c = byId[id]; return c ? (en() ? c.en : c.gen) : ""; },
    icon: (id) => "icons/s" + ((byId[id] || byId.ranger).icon) + ".webp",
    // «рейнджер», «клирик», «glad» → id класса
    find(text) {
      const t = String(text || "").toLowerCase().replace(/ё/g, "е");
      for (const c of LIST) if (c.alias.some((a) => new RegExp("(^|[^а-яa-z])" + a + "([^а-яa-z]|$)").test(t) || t.includes(a + "а") || t.includes(a + "у"))) return c.id;
      return null;
    },
    // ключ класса в Armory (импорт персонажа)
    armory: (id) => (byId[id] || {}).en,
    fromArmory: (key) => (LIST.find((c) => c.en.toLowerCase() === String(key || "").toLowerCase()) || {}).id || null,
  };
})();
