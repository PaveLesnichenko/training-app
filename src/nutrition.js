// Продукты, универсальное меню (несколько вариантов на каждый приём) и учёт съеденного.
import { FOODS } from './data/foods.js';
import { state } from './store.js';

// ---------- база продуктов ----------
// Базовые продукты из файла получают ключ 'f:<индекс>', свои — 'c:<id>'. Значения — на 100 г СЫРОГО / сухого продукта.
export function allFoods() {
  const base = FOODS.map(([group, name, p, f, c, kcal, gi], i) => ({ key: `f:${i}`, group, name, p, f, c, kcal, gi }));
  const custom = state.foods.custom.map((x) => ({ ...x, key: `c:${x.id}`, group: 'Мои продукты' }));
  return [...custom, ...base];
}
export const foodByKey = (key) => allFoods().find((x) => x.key === key);

// Поиск по названию: сначала совпадения с начала слова, потом остальные; короткие названия выше.
// Синонимы: человек ищет «курица» или «грудка», а в базе «Куры» и «Филе куриное».
const SYNONYMS = {
  'курица': ['куры', 'филе куриное'], 'куриная': ['куры', 'филе куриное'], 'куриное': ['филе куриное', 'куры'], 'грудка': ['филе куриное'],
  'лосось': ['семга', 'горбуша'], 'форель': ['семга', 'горбуша'], 'рыба': ['горбуша', 'минтай', 'треска', 'тунец', 'семга'],
  'овсянка': ['крупа овсяная', 'геркулес'], 'овсяные': ['геркулес', 'крупа овсяная'], 'гречневая': ['гречка'], 'греча': ['гречка'],
  'картошка': ['картофель'], 'макароны': ['макаронные изделия'], 'паста': ['макаронные изделия'],
  'мясо': ['говядина', 'индейка', 'куры'], 'банан': ['бананы'], 'яблоко': ['яблоки'], 'яйца': ['яйцо куриное'], 'яичница': ['яйцо куриное'],
  'сухофрукты': ['курага', 'изюм', 'чернослив'], 'протеин': ['ксб'], 'масло': ['масло оливковое', 'масло сливочное'],
};
const normQuery = (q) => q.trim().toLowerCase().replace(/ё/g, 'е');
export function searchFoods(query, limit = 40) {
  const q = normQuery(query);
  if (!q) return [];
  const variants = [q, ...(SYNONYMS[q] || [])];
  const score = (name) => {
    const n = normQuery(name);
    let best = 9;
    variants.forEach((v, i) => {
      const bonus = i === 0 ? 0 : 0.5;
      if (n.startsWith(v)) best = Math.min(best, 0 + bonus);
      else if (n.split(/[\s"(]+/).some((w) => w.startsWith(v))) best = Math.min(best, 1 + bonus);
      else if (n.includes(v)) best = Math.min(best, 2 + bonus);
    });
    return best;
  };
  return allFoods().map((f) => [score(f.name), f]).filter(([sc]) => sc < 9)
    .sort((a, b) => a[0] - b[0] || displayName(a[1]).length - displayName(b[1]).length).slice(0, limit).map(([, f]) => f);
}

// ---------- роль продукта ----------
const VEG_GROUPS = new Set(['Овощи', 'Грибы, соления', 'Приправы, зелень']);
const FRUIT_GROUPS = new Set(['Фрукты']);
export const ROLE_NAMES = { protein: 'Белок', carb: 'Углеводы', fat: 'Жиры', veg: 'Овощи', fruit: 'Фрукты', side: 'Напиток / добавка' };

export function roleOf(food) {
  const forced = state.foods.roles?.[food.key] ?? food.role;
  if (forced) return forced;
  if (/картоф|картошк|батат/i.test(food.name) && !/суп|борщ|щи\b/i.test(food.name)) return 'carb';
  if (food.group === 'Первые блюда') return 'side';                 // супы: готовое блюдо, отдельная порция
  if (food.group === 'Мясо, птица, колбаса' || food.group === 'Рыба, суши, морепродукты') return /масл|жир\b|сало/i.test(food.name) ? 'fat' : 'protein';
  if (/яйц|омлет/i.test(food.name) && !/порошок/i.test(food.name)) return 'protein';
  if (food.group === 'Молочные продукты' && food.p >= 8) return 'protein';   // творог, сыр
  if (VEG_GROUPS.has(food.group)) return 'veg';
  if (FRUIT_GROUPS.has(food.group)) return 'fruit';
  const kcal = food.p * 4 + food.f * 9 + food.c * 4 || 1;
  const sp = (food.p * 4) / kcal, sf = (food.f * 9) / kcal, sc = (food.c * 4) / kcal;
  if (food.group === 'Молочные продукты' && food.p < 8 && food.kcal < 120) return 'side'; // кефир, молоко: напиток к приёму
  if (sp >= 0.3 && food.p < 8) return 'side';
  if (sp >= 0.3) return 'protein';
  if (sf >= 0.55) return 'fat';
  if (sc >= 0.5) return 'carb';
  const m = Math.max(sp, sf, sc);
  return m === sp ? 'protein' : m === sf ? 'fat' : 'carb';
}

// ---------- сырой / готовый вес ----------
// Калорийность в базе указана на сырой или сухой продукт. Для круп и мяса показываем ещё вес после приготовления.
const READY_MEAT = /колбас|ветчин|сосиск|сардел|буженин|паштет|балык|окорок|бекон|салями|тушенк|консерв|заливн|холодец/i;
const READY_FISH = /копчен|солен|консерв|икра|суши|шпрот|сельд|селёд|селед|вялен|слабосол|пресерв/i;
const READY_VEG = /солен|маринован|квашен|консерв/i;
export function prepOf(food) {
  const n = food.name.toLowerCase(), g = food.group;
  if (g === 'Первые блюда' || /суп|борщ|бульон/.test(n)) return { state: 'ready', label: 'как есть', yield: null };
  if (/картоф|картошк/.test(n)) return /жарен|пюре|варен|чипс|фри|запечен/.test(n) ? { state: 'ready', label: 'как есть', yield: null } : { state: 'raw', label: 'сырой', yield: 0.97 };
  if (g === 'Крупы, хлопья, макаронные изделия' || /овсян|геркулес|гречк|рис\b|макарон|спагетти|булгур|кус-?кус|пшен|перлов/.test(n)) {
    const y = /рис/.test(n) ? 2.8 : /греч/.test(n) ? 2.4 : /овсян|геркулес|хлоп/.test(n) ? 2.5 : /макарон|спагетти|лапш|вермишел/.test(n) ? 2.3 : /пшен/.test(n) ? 2.8 : /перлов/.test(n) ? 3 : 2.5;
    return { state: 'dry', label: 'сухой', yield: y };
  }
  if (g === 'Мясо, птица, колбаса') return READY_MEAT.test(n) ? { state: 'ready', label: 'как есть', yield: null } : { state: 'raw', label: 'сырое', yield: 0.72 };
  if (g === 'Рыба, суши, морепродукты') return READY_FISH.test(n) ? { state: 'ready', label: 'как есть', yield: null } : { state: 'raw', label: 'сырая', yield: 0.8 };
  if (VEG_GROUPS.has(g)) return READY_VEG.test(n) ? { state: 'ready', label: 'как есть', yield: null } : { state: 'raw', label: 'сырые', yield: null };
  if (g === 'Бобовые, семечки') return /семя|семеч|консерв|зелен|стручок/.test(n) ? { state: 'ready', label: 'как есть', yield: null } : { state: 'dry', label: 'сухие', yield: 2.5 };
  return { state: 'ready', label: 'как есть', yield: null };
}
export const cookedGrams = (food, grams) => { const p = prepOf(food); return p.yield ? Math.round((grams * p.yield) / 5) * 5 : null; };

// ---------- штучные продукты ----------
// «Яйцо куриное (1 шт - 60 гр)» → штука весит 60 г. Для частых продуктов вес штуки известен по названию,
// для своих продуктов его можно указать вручную (поле unit).
const PIECE_RULES = [
  [/яйцо перепелиное/i, 10, 'шт'],
  [/^яйц(?!.*(порошок|белок|желток))/i, 60, 'шт'],        // «Яйцо», «Яйца вареные»: если вес штуки не указан в названии
  [/^банан/i, 120, 'шт'], [/^яблок/i, 150, 'шт'], [/^апельсин/i, 150, 'шт'], [/^груш/i, 150, 'шт'],
  [/^мандарин/i, 80, 'шт'], [/^персик/i, 100, 'шт'],
];
export function unitOf(food) {
  if (food.unit > 0) return Number(food.unit);
  const m = /\((\d+)\s*шт\s*-\s*(\d+)\s*гр\)/i.exec(food.name || '');
  if (m) return Number(m[2]);
  for (const [re, g] of PIECE_RULES) if (re.test(food.name || '')) return g;
  return null;
}
// Название без служебной пометки «(1 шт - 60 гр)».
export const displayName = (food) => (food.name || '').replace(/\s*\(\d+\s*шт\s*-\s*\d+\s*гр\)/i, '').trim();
// Количество для показа: штучные продукты — в штуках («2 шт»), остальные — в граммах.
export function qtyText(food, grams) {
  const u = food ? unitOf(food) : null;
  if (!u) return { main: `${grams} г`, sub: '' };
  const n = Math.round((grams / u) * 10) / 10;
  return { main: `${String(n).replace('.', ',')} шт`, sub: `${grams} г` };
}

export const macrosOf = (food, grams) => ({
  p: (food.p * grams) / 100, f: (food.f * grams) / 100, c: (food.c * grams) / 100, kcal: (food.kcal * grams) / 100,
});
const addM = (a, b) => ({ p: a.p + b.p, f: a.f + b.f, c: a.c + b.c, kcal: a.kcal + b.kcal });
const ZERO = () => ({ p: 0, f: 0, c: 0, kcal: 0 });
export function sumItems(items, { onlyEaten = false } = {}) {
  return items.reduce((s, it) => {
    const food = foodByKey(it.key);
    if (!food || (onlyEaten && !it.eaten)) return s;
    return addM(s, macrosOf(food, onlyEaten ? (it.actual ?? it.grams) : it.grams));
  }, ZERO());
}

// ---------- приоритеты продуктов по приёмам ----------
export const MEAL_NAMES = ['Завтрак', 'Обед', 'Полдник', 'Ужин'];
export const MEAL_SHORT = ['З', 'О', 'П', 'У'];

// Приоритет продукта в приёме: 3 — основное место, 2 — подходит, 1 — допустимо, 0 — не ставить.
// Порядок: [завтрак, обед, полдник, ужин]. Первое подходящее правило побеждает.
const RULES = [
  [(f) => /ксб|протеин|гейнер|казеин/i.test(f.name) || f.group === 'Спортпит', [1, 0, 3, 0]],
  [(f) => /овсян|геркулес|хлопья|мюсли|гранол/i.test(f.name), [3, 0, 0, 0]],
  [(f) => /яйц|омлет/i.test(f.name), [3, 1, 1, 1]],
  [(f) => /творог/i.test(f.name), [3, 0, 3, 2]],
  [(f) => f.group === 'Молочные продукты', [2, 0, 3, 1]],
  [(f) => /хлеб|тост|батон|лаваш|булочк|сухар|галет/i.test(f.name), [3, 2, 2, 1]],
  [(f) => /гречк|пшен/i.test(f.name), [2, 3, 0, 3]],
  [(f) => /картоф|картошк|батат/i.test(f.name), [0, 3, 0, 2]],
  [(f) => f.group === 'Крупы, хлопья, макаронные изделия' || /рис\b|макарон|спагетти|булгур|кус-?кус|перлов|лапш/i.test(f.name), [1, 3, 0, 3]],
  [(f) => f.group === 'Мясо, птица, колбаса' && /колбас|ветчин|сосиск|сардел|бекон|салями/i.test(f.name), [2, 1, 1, 0]],
  [(f) => f.group === 'Мясо, птица, колбаса' || f.group === 'Рыба, суши, морепродукты', [0, 3, 0, 3]],
  [(f) => f.group === 'Бобовые, семечки' && !/семя|семеч/i.test(f.name), [0, 3, 0, 2]],
  [(f) => f.group === 'Орехи, сухофрукты' || /семя|семеч/i.test(f.name), [2, 0, 3, 0]],
  [(f) => f.group === 'Фрукты', [2, 1, 3, 0]],
  [(f) => VEG_GROUPS.has(f.group), [1, 3, 1, 3]],
  [(f) => f.group === 'Масло, жиры, майонез', [1, 2, 0, 2]],
];
export function defaultAffinity(food) {
  for (const [test, aff] of RULES) if (test(food)) return aff;
  return [1, 1, 1, 1];
}
// Пользовательский выбор приёмов (state.foods.meals[key] = [индексы]) важнее правил.
export function affinityOf(food) {
  const own = state.foods.meals?.[food.key];
  if (Array.isArray(own) && own.length) return [0, 1, 2, 3].map((i) => (own.includes(i) ? 3 : 0));
  return defaultAffinity(food);
}
export function activeMeals(food) {
  const a = affinityOf(food);
  const strong = [0, 1, 2, 3].filter((i) => a[i] >= 2);
  return strong.length ? strong : [0, 1, 2, 3].filter((i) => a[i] >= 1);
}

// ---------- составление меню ----------
// Наборы приёмов пищи на 3–6 приёмов. kind: b — завтрак, l — обед, s — перекус, d — ужин (приоритеты продуктов
// задаются для этих четырёх видов). art — индекс иконки. p / c / f — доли белка, углеводов и жиров дня.
const ROLES_BY_KIND = {
  b: ['protein', 'carb', 'fruit', 'fat'],
  l: ['protein', 'carb', 'veg', 'fat'],
  d: ['protein', 'carb', 'veg', 'fat'],
  s: ['protein', 'carb', 'fruit', 'side', 'fat'],
};
const KIND_INDEX = { b: 0, l: 1, s: 2, d: 3 };
const mealOf = (name, kind, art, p, c, f, roles) => ({ name, kind, art, p, c, f, roles: roles || ROLES_BY_KIND[kind] });
const SMALL_SNACK = ['protein', 'fruit', 'side'];
export const MEAL_SETS = {
  3: [mealOf('Завтрак', 'b', 0, 0.30, 0.30, 0.30), mealOf('Обед', 'l', 1, 0.35, 0.40, 0.35), mealOf('Ужин', 'd', 3, 0.35, 0.30, 0.35)],
  4: [mealOf('Завтрак', 'b', 0, 0.25, 0.28, 0.28), mealOf('Обед', 'l', 1, 0.30, 0.30, 0.30), mealOf('Полдник', 's', 2, 0.15, 0.17, 0.12), mealOf('Ужин', 'd', 3, 0.30, 0.25, 0.30)],
  5: [mealOf('Завтрак', 'b', 0, 0.22, 0.24, 0.25), mealOf('Перекус', 's', 2, 0.10, 0.12, 0.10, SMALL_SNACK), mealOf('Обед', 'l', 1, 0.26, 0.26, 0.25), mealOf('Полдник', 's', 2, 0.12, 0.12, 0.10, SMALL_SNACK), mealOf('Ужин', 'd', 3, 0.30, 0.26, 0.30)],
  6: [mealOf('Завтрак', 'b', 0, 0.20, 0.22, 0.22), mealOf('Перекус', 's', 2, 0.10, 0.12, 0.10, SMALL_SNACK), mealOf('Обед', 'l', 1, 0.24, 0.24, 0.24), mealOf('Полдник', 's', 2, 0.10, 0.12, 0.10, SMALL_SNACK), mealOf('Ужин', 'd', 3, 0.24, 0.20, 0.24), mealOf('Перед сном', 's', 4, 0.12, 0.10, 0.10, ['protein', 'side'])],
};
const MAIN_PROTEIN_GROUPS = new Set(['Мясо, птица, колбаса', 'Рыба, суши, морепродукты', 'Консервы']);
const FIXED = { veg: 150, fruit: 120, side: 200 };
const MAX_GRAMS = { protein: 400, carb: 450, fat: 40 };
const MIN_GRAMS = { protein: 60, carb: 40, fat: 5 };
const ROLE_ORDER = { protein: 0, carb: 1, veg: 2, fruit: 3, fat: 4, side: 5 };

const stepOf = (food) => unitOf(food) || 5;
// Минимальная порция: мясо и рыба — не меньше 100 г, порошок белка — 10 г, масло — 5 г, орехи — 15 г.
const minOf = (food, role) => {
  const u = unitOf(food); if (u) return u;
  if (role === 'protein') return food.p >= 60 ? 10 : MAIN_PROTEIN_GROUPS.has(food.group) ? 100 : MIN_GRAMS.protein;
  if (role === 'fat') return food.f >= 90 ? 5 : 15;
  return MIN_GRAMS[role] ?? 5;
};
// Максимальная порция: малокалорийные гарниры (картофель) можно есть больше, чем крупы.
const maxOf = (role, food) => (role === 'carb' && food && food.kcal < 120 ? 650 : MAX_GRAMS[role] ?? 500);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Начальные граммы приёма: подбор под Б/Ж/У (Гаусс–Зейдель с отсечением по нулю).
function solveGrams(foods, target) {
  const x = foods.map(() => 0);
  const need = { protein: 'p', carb: 'c', fat: 'f' };
  for (let iter = 0; iter < 60; iter++) {
    foods.forEach((fd, i) => {
      const key = need[fd.role]; if (!key) return;
      let rest = target[key];
      foods.forEach((o, j) => { if (j !== i) rest -= (o[key] * x[j]) / 100; });
      x[i] = Math.max(0, (rest * 100) / (fd[key] || 1));
    });
  }
  return x;
}
const macroOf = (it, key) => (it.food[key] * it.grams) / 100;
const totalOf = (items, key) => items.reduce((s, it) => s + macroOf(it, key), 0);
const kcalOf = (items) => items.reduce((s, it) => s + (it.food.kcal * it.grams) / 100, 0);

// Подгонка приёма: масштабируем источники белка, углеводов и жиров, пока итог не совпадёт с целью приёма.
function calibrate(items, target) {
  const roles = [['protein', 'p', 'protein'], ['carb', 'c', 'carbs'], ['fat', 'f', 'fat']];
  for (let iter = 0; iter < 80; iter++) {
    for (const [role, key, tkey] of roles) {
      const group = items.filter((it) => it.role === role && !it.fixed);
      if (!group.length) continue;
      const own = totalOf(group, key);
      if (own <= 0) continue;
      const want = target[tkey] - (totalOf(items, key) - own);
      const k = clamp(want / own, 0.7, 1.4);
      for (const it of group) it.grams = clamp(it.grams * k, minOf(it.food, role), maxOf(role, it.food));
    }
  }
}

// Округляем до шага порции и добираем калории шагами по углеводам (затем по белку).
function roundAndFit(items, targetKcal, proteinCapG = Infinity) {
  for (const it of items) {
    if (it.fixed) continue;
    const st = stepOf(it.food);
    it.grams = clamp(Math.round(it.grams / st) * st, Math.max(st, minOf(it.food, it.role)), maxOf(it.role, it.food));
  }
  for (let i = 0; i < 60; i++) {
    const diff = targetKcal - kcalOf(items);
    if (Math.abs(diff) <= 15) break;
    const sign = Math.sign(diff);
    const movable = (it) => !it.fixed && (sign > 0 ? it.grams + stepOf(it.food) <= maxOf(it.role, it.food) : it.grams - stepOf(it.food) >= Math.max(stepOf(it.food), minOf(it.food, it.role)));
    const canGrow = (it) => it.role !== 'protein' || sign < 0 || totalOf(items.filter((x) => x.role === 'protein'), 'p') < proteinCapG;
    const pool = ['carb', 'protein'].map((r) => items.filter((it) => it.role === r && movable(it) && canGrow(it))).find((l) => l.length);
    if (!pool) break;
    const it = pool.reduce((a, b) => (sign > 0 ? (a.grams <= b.grams ? a : b) : (a.grams >= b.grams ? a : b)));
    it.grams += sign * stepOf(it.food);
  }
}

// Один вариант приёма из выбранных продуктов под цель приёма { protein, carbs, fat }.
function buildOption(foods, target, fixedScale = 1) {
  const items = foods.map((f) => ({ food: f, role: f.role, grams: 0, fixed: FIXED[f.role] != null }));
  const rest = { p: target.protein, c: target.carbs, f: target.fat };
  for (const it of items) if (it.fixed) {
    it.grams = unitOf(it.food) || Math.max(50, Math.round((FIXED[it.role] * fixedScale) / 10) * 10);
    const m = macrosOf(it.food, it.grams); rest.p -= m.p; rest.c -= m.c; rest.f -= m.f;
  }
  const flexible = items.filter((it) => !it.fixed);
  const grams = solveGrams(flexible.map((it) => ({ ...it.food, role: it.role })), rest);
  flexible.forEach((it, i) => { it.grams = clamp(grams[i], minOf(it.food, it.role), maxOf(it.role, it.food)); });
  calibrate(items, target);
  roundAndFit(items, target.protein * 4 + target.carbs * 4 + target.fat * 9, target.protein * 1.35);
  return items.filter((it) => it.grams > 0).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .map((it) => ({ key: it.food.key, grams: Math.round(it.grams) }));
}

// Кандидаты на роль в приёме: сначала продукты с приоритетом 2–3, если таких нет — с приоритетом 1.
// Продукты с приоритетом 0 в этот приём не ставятся никогда (овсянка не попадёт на ужин).
function candidates(mine, role, mi) {
  const list = mine.filter((f) => f.role === role).map((f) => ({ food: f, aff: affinityOf(f)[mi] }))
    .sort((a, b) => b.aff - a.aff || a.food.name.localeCompare(b.food.name, 'ru'));
  const strong = list.filter((c) => c.aff >= 2);
  return strong.length ? strong : list.filter((c) => c.aff === 1);
}

// Выбираем count сочетаний продуктов (по одному на роль), каждое следующее максимально отличается от выбранных.
function pickCombos(lists, count) {
  const caps = lists.map((l) => l.slice(0, 5));
  let combos = [[]];
  for (const l of caps) combos = combos.flatMap((c) => l.map((x, i) => [...c, { food: x.food, rank: i }]));
  combos = combos.slice(0, 400);
  const out = [];
  while (out.length < count && combos.length) {
    let best = -1, bestScore = -Infinity;
    combos.forEach((c, i) => {
      const diff = out.length ? Math.min(...out.map((o) => c.filter((x, k) => x.food.key !== o[k].food.key).length)) : 0;
      const quality = -c.reduce((s2, x) => s2 + x.rank, 0);
      const score = diff * 100 + quality;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    const [pick] = combos.splice(best, 1);
    if (out.length && Math.min(...out.map((o) => pick.filter((x, k) => x.food.key !== o[k].food.key).length)) === 0) continue;   // дубль
    out.push(pick);
  }
  return out.map((c) => c.map((x) => x.food));
}

// Универсальное меню: для каждого приёма несколько равноценных вариантов (каждый укладывается в цель приёма).
export function generateMenu(targets, { variants = 3, mealsPerDay = 4 } = {}) {
  const set = MEAL_SETS[mealsPerDay] || MEAL_SETS[4];
  const mine = state.foods.mine.map(foodByKey).filter(Boolean).map((f) => ({ ...f, role: roleOf(f) }));
  // Доли макронутриентов по приёмам. Если в приёме нет подходящего источника (например, на полдник нет круп),
  // его долю получают остальные приёмы пропорционально.
  const shares = (macro, role) => {
    const raw = set.map((m) => (candidates(mine, role, KIND_INDEX[m.kind]).length ? m[macro] : 0));
    const sum = raw.reduce((a, b) => a + b, 0);
    return sum > 0 ? raw.map((x) => x / sum) : set.map((m) => m[macro]);
  };
  const sp = shares('p', 'protein'), sc = shares('c', 'carb');
  const sf = set.map((m) => m.f);   // жиры не перераспределяем: лучше недобрать жиры, чем набить ими один приём
  const base = set.map((m, mi) => ({ protein: targets.protein * sp[mi], carbs: targets.carbs * sc[mi], fat: targets.fat * sf[mi] }));
  const mealKcal = (t2) => t2.protein * 4 + t2.carbs * 4 + t2.fat * 9;
  // Строим все приёмы при заданных множителях целей. Маленькие приёмы упираются в минимальные порции и дают перебор,
  // поэтому ниже большие приёмы подстраиваются так, чтобы сумма дня сошлась с целью.
  const buildAll = (scales) => set.map((meal, mi) => {
    const k = scales[mi];
    const target = { protein: base[mi].protein * k, carbs: base[mi].carbs * k, fat: base[mi].fat * k };
    const lists = meal.roles.map((role) => candidates(mine, role, KIND_INDEX[meal.kind])).filter((l) => l.length);
    const fixedScale = Math.min(1, Math.max(0.5, mealKcal(base[mi]) / (targets.kcal * 0.25)));
    let options = lists.length ? pickCombos(lists, variants + 3).map((foods) => ({ items: buildOption(foods, target, fixedScale) })) : [];
    // Варианты, которые из-за предельных порций заметно не дотягивают до цели приёма, оставляем только если лучших нет.
    const goal = mealKcal(target);
    const good = options.filter((o) => Math.abs(optionMacros(o).kcal - goal) <= 0.1 * goal);
    options = (good.length ? good : options.slice().sort((a, b) => Math.abs(optionMacros(a).kcal - goal) - Math.abs(optionMacros(b).kcal - goal)).slice(0, 1)).slice(0, variants);
    return { meal, target, options };
  });
  let scales = set.map(() => 1);
  let built = buildAll(scales);
  for (let pass = 0; pass < 3; pass++) {
    const avg = built.map((b) => (b.options.length ? b.options.reduce((s2, o) => s2 + optionMacros(o).kcal, 0) / b.options.length : 0));
    const err = avg.reduce((a2, b2) => a2 + b2, 0) - targets.kcal;
    if (Math.abs(err) / targets.kcal < 0.02) break;
    const flex = built.map((b, i) => (b.options.length && Math.abs(avg[i] - mealKcal(b.target)) <= 0.06 * mealKcal(b.target) ? i : -1)).filter((i) => i >= 0);
    const flexSum = flex.reduce((a2, i) => a2 + avg[i], 0);
    if (!flexSum) break;
    const f = clamp(1 - err / flexSum, 0.6, 1.4);
    flex.forEach((i) => { scales[i] *= f; });
    built = buildAll(scales);
  }
  const meals = built.map(({ meal, options }) => ({ name: meal.name, kind: meal.kind, art: meal.art, options }));
  return { generatedAt: Date.now(), variants, mealsPerDay: set.length, targets: { kcal: targets.kcal, protein: targets.protein, fat: targets.fat, carbs: targets.carbs }, meals };
}

export const optionMacros = (option) => sumItems(option.items);

// ---------- учёт съеденного ----------
// state.foodlog[дата][приём] = { opt, items: [{ key, grams, eaten, actual?, extra? }] }
// Позиции копируются из меню в момент первой отметки, поэтому смена меню не меняет прошлые дни.
export const mealEntry = (date, mi) => state.foodlog[date]?.[mi] || null;

export function ensureMealEntry(date, mi, opt) {
  state.foodlog[date] ??= [];
  const log = state.foodlog[date];
  while (log.length <= mi) log.push(null);
  const option = state.menu?.meals?.[mi]?.options?.[opt];
  if (!log[mi] || log[mi].opt !== opt || !log[mi].items.some((it) => !it.extra)) {
    const extra = (log[mi]?.items || []).filter((it) => it.extra);
    log[mi] = { opt, items: [...(option ? option.items.map((it) => ({ key: it.key, grams: it.grams, eaten: false })) : []), ...extra] };
  }
  return log[mi];
}

export function eatenTotals(date) {
  const log = state.foodlog[date];
  if (!log) return ZERO();
  return log.reduce((s, e) => (e ? addM(s, sumItems(e.items, { onlyEaten: true })) : s), ZERO());
}

// Цель, с которой составлено меню, отличается от текущей больше чем на 3 %?
export function menuIsStale(menu, baseKcal) {
  return !!menu && !!baseKcal && Math.abs(menu.targets.kcal - baseKcal) / baseKcal > 0.03;
}

// ---------- быстрый выбор продуктов ----------
// Запросы к базе: первая находка и есть продукт. Набор подобран для набора мышечной массы.
export const QUICK = [
  ['Мясо и рыба', ['Филе куриное', 'Индейка', 'Говядина', 'Горбуша', 'Минтай', 'Тунец']],
  ['Яйца и молочное', ['Яйцо куриное', 'Творог "Простоквашино" 5%', 'Кефир "Заречье" 1%', 'Йогурт натуральный']],
  ['Крупы и гарниры', ['Рис', 'Гречка', 'Крупа овсяная', 'Картофель', 'Макаронные изделия', 'Хлеб ржаной']],
  ['Овощи и фрукты', ['Огурцы', 'Помидоры', 'Капуста белокочанная', 'Морковь', 'Бананы', 'Яблоки']],
  ['Жиры и орехи', ['Масло оливковое', 'Арахис', 'Миндаль', 'Грецкий орех']],
];
export const STARTER_PACK = ['Филе куриное', 'Горбуша', 'Яйцо куриное', 'Творог "Простоквашино" 5%', 'Йогурт натуральный', 'Рис', 'Гречка', 'Крупа овсяная', 'Картофель', 'Огурцы', 'Помидоры', 'Бананы', 'Масло оливковое', 'Арахис'];
export const quickFood = (q) => searchFoods(q, 1)[0] || null;
export function foodGroups() {
  const g = new Map();
  for (const f of allFoods()) if (f.group && !['Первые блюда', 'Напитки безалкогольные', 'Кондитерские изделия'].includes(f.group)) g.set(f.group, (g.get(f.group) || 0) + 1);
  return [...g.entries()];
}
export const foodsOfGroup = (group) => allFoods().filter((f) => f.group === group).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
