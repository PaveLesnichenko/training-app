// Меню питания: варианты приёмов, приоритеты по приёмам, сырой / готовый вес, учёт съеденного.
import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/store.js';
import { nutritionTargets } from '../src/engine.js';
import {
  generateMenu, optionMacros, searchFoods, foodByKey, roleOf, unitOf, prepOf, cookedGrams, activeMeals,
  ensureMealEntry, eatenTotals, mealEntry, affinityOf, displayName, qtyText, quickFood, QUICK, STARTER_PACK, MEAL_SETS,
} from '../src/nutrition.js';

const LIST = ['Рис', 'Картофель', 'Гречка', 'Филе куриное', 'Палтус', 'Салат', 'Яйцо куриное', 'Капуста белокочанная', 'Йогурт натуральный 1.5%', 'Крупа овсяная', 'Арахис'];
const key = (q) => searchFoods(q)[0].key;
state.foods.mine = LIST.map(key);
const food = (q) => foodByKey(key(q));
const T = nutritionTargets({ sex: 'm', weight: 73, height: 175, age: 29, activity: 'low', goal: 'gain', pace: 'fast' });
const namesIn = (menu, mi) => menu.meals[mi].options.flatMap((o) => o.items.map((it) => foodByKey(it.key).name));

test('роли и сырой / готовый вес', () => {
  assert.equal(roleOf(food('Картофель')), 'carb');
  assert.equal(unitOf(food('Яйцо куриное')), 60);
  assert.deepEqual([prepOf(food('Рис')).state, prepOf(food('Рис')).label], ['dry', 'сухой']);
  assert.deepEqual([prepOf(food('Филе куриное')).state, prepOf(food('Палтус')).state], ['raw', 'raw']);
  assert.equal(prepOf(food('Йогурт натуральный 1.5%')).state, 'ready');
  assert.equal(cookedGrams(food('Рис'), 100), 280);      // 100 г сухого риса ≈ 280 г готового
  assert.equal(cookedGrams(food('Филе куриное'), 100), 70);
  assert.equal(cookedGrams(food('Арахис'), 30), null);
});

test('приоритеты: овсянка только на завтрак, мясо и рыба на обед и ужин', () => {
  assert.deepEqual(activeMeals(food('Крупа овсяная')), [0]);
  assert.deepEqual(activeMeals(food('Филе куриное')), [1, 3]);
  assert.deepEqual(activeMeals(food('Палтус')), [1, 3]);
  assert.deepEqual(activeMeals(food('Рис')), [1, 3]);
  // пользовательский выбор важнее правил
  state.foods.meals[key('Крупа овсяная')] = [2];
  assert.deepEqual(activeMeals(food('Крупа овсяная')), [2]);
  assert.deepEqual(affinityOf(food('Крупа овсяная')), [0, 0, 3, 0]);
  delete state.foods.meals[key('Крупа овсяная')];
});

test('меню: у приёмов есть варианты, продукты стоят на своих местах', () => {
  const menu = generateMenu(T, { variants: 3 });
  assert.equal(menu.meals.length, 4);
  assert.ok(menu.meals[1].options.length >= 2 && menu.meals[3].options.length >= 2, 'у обеда и ужина несколько вариантов');
  for (const mi of [1, 2, 3]) assert.ok(!namesIn(menu, mi).some((n) => /овсян/i.test(n)), `овсянка не в приёме ${mi}`);
  for (const mi of [0, 2]) assert.ok(!namesIn(menu, mi).some((n) => /Филе|Палтус/.test(n)), `мясо и рыба не в приёме ${mi}`);
  assert.ok(namesIn(menu, 0).some((n) => /овсян/i.test(n)), 'овсянка на завтраке');
  assert.ok(menu.meals.every((m) => m.options.length > 0), 'нет пустых приёмов');
  // варианты внутри приёма различаются
  for (const m of menu.meals) {
    const sigs = m.options.map((o) => o.items.map((it) => it.key).sort().join('|'));
    assert.equal(new Set(sigs).size, sigs.length, `варианты ${m.name} одинаковы`);
  }
});

test('меню: любая комбинация вариантов даёт цель дня (±8 %), порции осмысленные', () => {
  const menu = generateMenu(T, { variants: 3 });
  const combos = (i, acc) => (i === menu.meals.length ? [acc] : menu.meals[i].options.flatMap((o) => combos(i + 1, [...acc, o])));
  for (const c of combos(0, [])) {
    const kcal = c.reduce((s, o) => s + optionMacros(o).kcal, 0);
    assert.ok(Math.abs(kcal - T.kcal) / T.kcal < 0.03, `комбинация даёт ${Math.round(kcal)} из ${T.kcal}`);
  }
  for (const m of menu.meals) for (const o of m.options) for (const it of o.items) {
    const f = foodByKey(it.key), u = unitOf(f);
    assert.ok(Number.isInteger(it.grams) && it.grams > 0 && it.grams <= (f.kcal < 120 ? 650 : 500), `${f.name} ${it.grams}`);
    if (u) assert.equal(it.grams % u, 0, `${f.name}: кратно штуке`);
    if (roleOf(f) === 'protein' && !u) assert.ok(it.grams >= 60, `${f.name} ${it.grams} г мало`);
  }
});

test('учёт съеденного: копия позиций из меню, смена варианта сбрасывает отметки', () => {
  state.menu = generateMenu(T, { variants: 3 });
  const date = '2026-10-15';
  assert.equal(eatenTotals(date).kcal, 0);
  const e = ensureMealEntry(date, 1, 0);
  e.items.forEach((it) => { it.eaten = true; });
  const full = optionMacros(state.menu.meals[1].options[0]);
  assert.ok(Math.abs(eatenTotals(date).kcal - full.kcal) < 1);
  e.items[0].actual = e.items[0].grams / 2;
  assert.ok(eatenTotals(date).kcal < full.kcal);
  e.items.push({ key: key('Арахис'), grams: 20, eaten: true, extra: true });
  const before = eatenTotals(date).kcal;
  const e2 = ensureMealEntry(date, 1, 1);          // другой вариант: отметки сброшены, «вне меню» остаётся
  assert.equal(e2.opt, 1);
  assert.ok(e2.items.every((it) => it.extra || !it.eaten));
  assert.ok(eatenTotals(date).kcal < before);
  assert.ok(mealEntry(date, 1).items.some((it) => it.extra));
});

test('яйца и штучные продукты: название без служебной пометки, количество в штуках', () => {
  const egg = food('Яйцо куриное');
  assert.equal(displayName(egg), 'Яйцо куриное');
  assert.deepEqual(qtyText(egg, 180), { main: '3 шт', sub: '180 г' });
  assert.deepEqual(qtyText(egg, 90), { main: '1,5 шт', sub: '90 г' });
  assert.deepEqual(qtyText(food('Рис'), 150), { main: '150 г', sub: '' });
  assert.equal(unitOf(food('Бананы')), 120);
  assert.equal(searchFoods('яйцо')[0].name, egg.name, 'куриное яйцо первым в поиске');
  assert.equal(roleOf(searchFoods('Яйцо перепелиное')[0]), 'protein');
  assert.equal(unitOf({ name: 'Яйцо' }), 60, 'свой продукт «Яйцо» тоже считается штуками');
  assert.equal(unitOf({ name: 'Яичный порошок' }), null);
  // свой продукт с весом штуки
  assert.equal(unitOf({ name: 'Печенье', unit: 15 }), 15);
});

test('поиск понимает синонимы, роли мяса и молочного не зависят от жирности', () => {
  assert.ok(searchFoods('курица').some((f) => /Куры|куриное/.test(f.name)));
  assert.ok(searchFoods('грудка').some((f) => /Филе куриное/.test(f.name)));
  assert.ok(searchFoods('овсянка').some((f) => /овсяная|Геркулес/.test(f.name)));
  assert.equal(roleOf(searchFoods('Свинина тощая')[0]), 'protein');
  assert.equal(roleOf(searchFoods('Творог жирный')[0]), 'protein');
  assert.equal(prepOf(searchFoods('Суп с макаронными изделиями')[0]).state, 'ready');
  assert.equal(prepOf(searchFoods('Картофель жареный')[0]).state, 'ready');
});

test('быстрый набор: все продукты находятся в базе', () => {
  for (const [, names] of QUICK) for (const q of names) assert.ok(quickFood(q), `нет в базе: ${q}`);
  for (const q of STARTER_PACK) assert.ok(quickFood(q), `нет в базе: ${q}`);
  const roles = new Set(STARTER_PACK.map((q) => roleOf(quickFood(q))));
  for (const r of ['protein', 'carb', 'fat', 'veg', 'fruit']) assert.ok(roles.has(r), `в наборе нет роли ${r}`);
});

test('число приёмов пищи: 3, 4, 5 и 6 приёмов, любая комбинация вариантов даёт цель дня', () => {
  state.foods.mine = [...LIST, 'Творог "Простоквашино" 5%', 'Бананы', 'Масло оливковое'].map(key);
  for (const n of [3, 4, 5, 6]) {
    for (const variants of [1, 2, 4]) {
      const menu = generateMenu(T, { variants, mealsPerDay: n });
      assert.equal(menu.meals.length, n, `приёмов ${n}`);
      assert.equal(menu.mealsPerDay, n);
      assert.deepEqual(menu.meals.map((m) => m.name), MEAL_SETS[n].map((m) => m.name));
      for (const m of menu.meals) assert.ok(m.options.length >= 1 && m.options.length <= variants, `${m.name}: вариантов ${m.options.length}`);
      const combos = (i, acc) => (i === menu.meals.length ? [acc] : menu.meals[i].options.flatMap((o) => combos(i + 1, [...acc, o])));
      for (const c of combos(0, [])) {
        const kcal = c.reduce((s, o) => s + optionMacros(o).kcal, 0);
        assert.ok(Math.abs(kcal - T.kcal) / T.kcal < 0.08, `${n} приёмов, вариантов ${variants}: ${Math.round(kcal)} из ${T.kcal}`);
      }
    }
  }
  // доли приёмов в сумме дают весь день
  for (const n of [3, 4, 5, 6]) for (const k of ['p', 'c', 'f']) assert.ok(Math.abs(MEAL_SETS[n].reduce((s, m) => s + m[k], 0) - 1) < 1e-9, `${n} приёмов, доля ${k}`);
});

test('вариантов столько, сколько просили, пока хватает продуктов', () => {
  state.foods.mine = [...LIST, 'Творог "Простоквашино" 5%'].map(key);
  const menu = generateMenu(T, { variants: 4, mealsPerDay: 4 });
  assert.equal(menu.meals[1].options.length, 4, 'у обеда 4 варианта');
  assert.equal(menu.meals[3].options.length, 4, 'у ужина 4 варианта');
  const sigs = menu.meals[1].options.map((o) => o.items.map((it) => it.key).sort().join('|'));
  assert.equal(new Set(sigs).size, 4, 'варианты обеда различаются');
});
