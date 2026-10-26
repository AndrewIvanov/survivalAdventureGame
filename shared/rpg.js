export const CLASSES = {
  warrior: { name: 'Воин', subtitle: 'Сталь и стойкость', description: 'Сражается мечом вблизи, выдерживает удары и защищает отряд.', hp: 120, mana: 100, damage: 24, speed: 175, cooldown: 480, armor: 3, weapon: 'sword', color: '#cfb477' },
  mage: { name: 'Маг', subtitle: 'Огонь и лед', description: 'Поражает врагов магией на расстоянии и контролирует поле боя.', hp: 85, mana: 140, damage: 23, speed: 168, cooldown: 650, armor: 0, weapon: 'staff', color: '#b0a1df' },
  archer: { name: 'Лучник', subtitle: 'Скорость и точность', description: 'Быстро выпускает стрелы, маневрирует и наносит точные удары.', hp: 100, mana: 110, damage: 19, speed: 195, cooldown: 360, armor: 1, weapon: 'bow', color: '#9abb84' },
};
export const ATTRIBUTES = { strength: 'Сила', dexterity: 'Ловкость', intelligence: 'Интеллект', vitality: 'Выносливость' };
export const ABILITIES = {
  warrior: {
    q: { name: 'Мощный удар', short: 'Удар', description: 'Удар перед собой: 260% урона.', cost: 20, cooldown: 4000, icon: 'sword' },
    e: { name: 'Вихрь стали', short: 'Вихрь', description: '170% урона всем врагам вокруг.', cost: 30, cooldown: 7000, icon: 'compass' },
    r: { name: 'Каменная стойкость', short: 'Стойкость', description: '+10 брони на 7 секунд.', cost: 40, cooldown: 18000, icon: 'shield' },
  },
  mage: {
    q: { name: 'Огненный шар', short: 'Огонь', description: 'Взрывающийся снаряд: 200% урона.', cost: 20, cooldown: 3000, icon: 'sun' },
    e: { name: 'Ледяной круг', short: 'Лёд', description: 'Зона льда на 4 секунды: урон и замедление.', cost: 35, cooldown: 8000, icon: 'compass' },
    r: { name: 'Метеоритный дождь', short: 'Метеоры', description: 'Три удара по выбранной области.', cost: 55, cooldown: 18000, icon: 'bolt' },
  },
  archer: {
    q: { name: 'Пронзающая стрела', short: 'Стрела', description: '250% урона, пробивает до трёх целей.', cost: 18, cooldown: 3500, icon: 'arrow' },
    e: { name: 'Веер стрел', short: 'Залп', description: 'Пять стрел в выбранном направлении.', cost: 30, cooldown: 6500, icon: 'sword' },
    r: { name: 'Дождь стрел', short: 'Ливень', description: 'Три волны урона в выбранной области.', cost: 45, cooldown: 16000, icon: 'bolt' },
  },
};
export const RARITIES = {
  common: { name: 'Обычный', color: '#d2d1bd', multiplier: 1 },
  uncommon: { name: 'Необычный', color: '#95bf7b', multiplier: 1.2 },
  rare: { name: 'Редкий', color: '#80b5df', multiplier: 1.5 },
  epic: { name: 'Эпический', color: '#bd94da', multiplier: 1.9 },
  legendary: { name: 'Легендарный', color: '#e5ad69', multiplier: 2.4 },
};
export const ITEMS = {
  sword: { name: 'Дорожный меч', type: 'weapon', classId: 'warrior', damage: 24, price: 35, icon: 'sword' },
  staff: { name: 'Посох искателя', type: 'weapon', classId: 'mage', damage: 23, price: 35, icon: 'bolt' },
  bow: { name: 'Охотничий лук', type: 'weapon', classId: 'archer', damage: 19, price: 35, icon: 'arrow' },
  armor: { name: 'Кожаная броня', type: 'armor', armor: 3, price: 30, icon: 'shield' },
  ring: { name: 'Кольцо ясности', type: 'ring', mana: 20, price: 45, icon: 'compass' },
  health: { name: 'Зелье здоровья', type: 'potion', heal: 65, price: 10, icon: 'heart' },
  mana: { name: 'Зелье энергии', type: 'potion', mana: 65, price: 10, icon: 'bolt' },
  hide: { name: 'Волчья шкура', type: 'material', price: 6, icon: 'shield' },
  ore: { name: 'Лесная руда', type: 'material', price: 8, icon: 'coin' },
};
export const INVENTORY_SIZE = 24;
export const NPCS = [
  { id: 'elder', name: 'Староста Эдрик', role: 'Хранитель деревни', x: 1588, y: 1260, appearance: 'sage', dialogue: 'Рад видеть ещё одного искателя. Наш дом держится на тех, кто готов помочь. Осмотрись, выбери своё призвание и поговори с жителями.' },
  { id: 'hunter', name: 'Охотница Рина', role: 'Задания леса', x: 1840, y: 1140, appearance: 'ranger', dialogue: 'Волки подбираются к тропам, а гоблины тащат наши припасы. Держись дороги и не забывай про рывок. За помощь я щедро заплачу.' },
  { id: 'merchant', name: 'Торговка Мира', role: 'Зелья и снаряжение', x: 1732, y: 1360, appearance: 'sage', dialogue: 'Зелье в рюкзаке — лишний шанс вернуться домой. Покупай припасы, а найденные материалы я приму за золото.' },
  { id: 'smith', name: 'Кузнец Борин', role: 'Оружие и улучшения', x: 1330, y: 1360, appearance: 'ranger', dialogue: 'Хорошее оружие не заменит сноровку, но поможет её проявить. Я могу улучшить оружие, которое ты держишь в руках. До трёх раз.' },
];
export const QUESTS = {
  path: { name: 'Первая тропа', npc: 'elder', description: 'Выйдите за пределы деревни и исследуйте Тёмный лес.', kind: 'explore', target: 1, xp: 35, gold: 15, reward: 'health' },
  wolves: { name: 'Серые у тропы', npc: 'hunter', description: 'Победите 5 волков. Засчитываются совместные победы поблизости.', kind: 'wolf', target: 5, xp: 100, gold: 35, reward: 'armor' },
  goblins: { name: 'Незваные соседи', npc: 'hunter', description: 'Победите 4 гоблинов в лесу.', kind: 'goblin', target: 4, xp: 140, gold: 50, reward: 'ring' },
  supplies: { name: 'Потерянный караван', npc: 'elder', description: 'Найдите 3 ящика припасов вдоль лесных дорог и вернитесь к старосте.', kind: 'supplies', target: 3, xp: 90, gold: 30, reward: 'mana' },
  defense: { name: 'До первого света', npc: 'elder', description: 'Защитите деревню во время ночного нападения: уничтожьте волну или сохраните её защиту до рассвета.', kind: 'defense', target: 1, xp: 150, gold: 50, reward: 'health' },
  guardian: { name: 'Сердце древнего леса', npc: 'hunter', description: 'Пробудите Стража у алтаря на восточной поляне и победите его. Босс пятой ночи тоже засчитывается.', kind: 'guardian', target: 1, xp: 250, gold: 75, reward: 'ring', rarity: 'rare' },
};
export const CHESTS = [
  { id: 'supply-east', x: 2180, y: 1146, supply: true },
  { id: 'supply-west', x: 830, y: 1150, supply: true },
  { id: 'supply-south', x: 1536, y: 1750, supply: true },
  { id: 'cache-north', x: 1536, y: 570, supply: false },
];

export function itemStats(item) {
  const base = ITEMS[item?.baseId];
  if (!base) return {};
  const multiplier = RARITIES[item.rarity]?.multiplier || 1;
  return { ...base, damage: base.damage ? Math.round(base.damage * multiplier + (item.upgrade || 0) * 4) : 0, armor: base.armor ? Math.round(base.armor * multiplier) : 0 };
}

export function effectiveStats(player) {
  const cls = CLASSES[player.classId] || CLASSES.warrior;
  const attributes = player.attributes || { strength: 5, dexterity: 5, intelligence: 5, vitality: 5 };
  const items = (player.inventory || []).filter(i => Object.values(player.equipment || {}).includes(i.id)).map(itemStats);
  const weapon = items.find(i => i.type === 'weapon' && i.classId === (player.classId || 'warrior'));
  const main = player.classId === 'mage' ? 'intelligence' : player.classId === 'archer' ? 'dexterity' : 'strength';
  return {
    damage: (weapon?.damage || cls.damage) + (player.level - 1) * 4 + (attributes[main] - 5) * 2,
    maxHp: cls.hp + (player.level - 1) * 12 + (attributes.vitality - 5) * 8,
    maxMana: cls.mana + (attributes.intelligence - 5) * 5 + items.filter(i => i.type === 'ring').reduce((sum, i) => sum + (i.mana || 0), 0),
    armor: cls.armor + items.reduce((sum, i) => sum + (i.armor || 0), 0),
    speed: cls.speed + (attributes.dexterity - 5) * 1.5,
    critical: Math.min(.45, .12 + (attributes.dexterity - 5) * .006), cooldown: cls.cooldown,
  };
}
