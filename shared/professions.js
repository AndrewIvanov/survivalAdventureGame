export const MAX_SKILL_RANK = 100;
export const PROFESSION_LEVEL = 10;
export const skillScale = rank => 1 + (Math.max(1, Math.min(MAX_SKILL_RANK, rank || 1)) - 1) * .01;
export const bladeCount = rank => 1 + Math.floor((Math.max(1, Math.min(100, rank || 1)) - 1) / 25);
export const PROFESSIONS = {
  healer: { classId: 'mage', name: 'Целитель', skill: 'Исцеляющий свет', short: 'Лечение', description: 'Лечит себя и живого напарника рядом. Урон не получает бонусов.', cost: 40, cooldown: 14000, icon: 'heart' },
  fire: { classId: 'mage', name: 'Маг огня', skill: 'Пламенная волна', short: 'Пламя', description: 'Огненный взрыв. Попадания поджигают врага на 3 секунды; горение не складывается.', cost: 35, cooldown: 10000, icon: 'sun' },
  ice: { classId: 'mage', name: 'Маг льда', skill: 'Ледяные оковы', short: 'Заморозка', description: 'Замораживает врагов вокруг цели. Обычные попадания иногда тоже замораживают. Боссы устойчивее.', cost: 35, cooldown: 12000, icon: 'compass' },
  dark: { classId: 'archer', name: 'Тёмный лучник', skill: 'Зов костей', short: 'Скелеты', description: 'Убийства призывают скелетов на 25 секунд. Ранг стрелы Q открывает 1–4 помощников на рангах 1/26/51/76. T пополняет отряд.', cost: 35, cooldown: 18000, icon: 'people' },
  assassin: { classId: 'archer', name: 'Ассасин', skill: 'Тень охотника', short: 'Невидимость', description: 'Невидимость на 4–7 секунд. Первое попадание после выхода — гарантированный критический удар.', cost: 30, cooldown: 18000, icon: 'compass' },
  sniper: { classId: 'archer', name: 'Снайпер', skill: 'Тяжёлая стрела', short: 'Выстрел', description: 'Широкая стрела: 400% урона, дальность 1400, пробивает до четырёх целей.', cost: 45, cooldown: 16000, icon: 'arrow' },
  aggressor: { classId: 'warrior', name: 'Агрессор', skill: 'Ответный щит', short: 'Отражение', description: 'В течение 6 секунд возвращает врагу 35–70% полученного урона.', cost: 30, cooldown: 16000, icon: 'shield' },
  squire: { classId: 'warrior', name: 'Оруженосец', skill: 'Круг клинков', short: 'Клинки', description: 'На 8 секунд призывает 1–4 вращающихся меча. Новые мечи на рангах T 26/51/76.', cost: 35, cooldown: 16000, icon: 'sword' },
  braveheart: { classId: 'warrior', name: 'Храброе сердце', skill: 'Второе дыхание', short: 'Дыхание', description: 'Каждый ранг T даёт здоровье и регенерацию. Активация восстанавливает 10–15% здоровья.', cost: 30, cooldown: 22000, icon: 'heart' },
};
export const professionOf = player => PROFESSIONS[player?.profession] || null;
export const skillRank = (player, key) => key === 't' ? player.professionRank || 1 : player.abilityRanks?.[key] || 1;
