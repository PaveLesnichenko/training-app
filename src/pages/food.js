import { h, num, dateRu, modal, toast, progressBar, confirmBox, icon } from '../ui.js';
import { state, save } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { go, rerender } from '../router.js';
import { illustration, ring, tile, foodArt, MEAL_ART, glyph } from '../art.js';
import {
  foodByKey, searchFoods, roleOf, ROLE_NAMES, macrosOf, unitOf, prepOf, cookedGrams, MEAL_NAMES, MEAL_SHORT,
  activeMeals, generateMenu, optionMacros, sumItems, mealEntry, ensureMealEntry, eatenTotals, menuIsStale,
  displayName, qtyText, QUICK, STARTER_PACK, quickFood, foodGroups, foodsOfGroup,
} from '../nutrition.js';

let tab = 'day';
export const setFoodTab = (name) => { tab = name; };

export function foodPage({ date } = {}) {
  const day = date || E.todayStr();
  const root = h('div');
  root.append(h('h1', null, 'Питание'));
  root.append(h('div', { class: 'tabs2' }, [['day', 'День'], ['foods', 'Продукты'], ['profile', 'Профиль']].map(([id, label]) =>
    h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; rerender(); } }, label))));
  if (tab === 'day') root.append(dayTab(day));
  else if (tab === 'foods') root.append(foodsTab());
  else root.append(profileTab());
  return root;
}

// ---------- день ----------
function dayTab(day) {
  const box = h('div');
  const today = E.todayStr();
  box.append(h('div', { class: 'row between' },
    h('button', { class: 'btn small', onclick: () => go(`/food/${E.addDays(day, -1)}`) }, icon('back', 16)),
    h('b', null, day === today ? `Сегодня, ${dateRu(day, false)}` : dateRu(day)),
    h('button', { class: 'btn small', onclick: () => go(`/food/${E.addDays(day, 1)}`) }, icon('chevron', 16))));

  const t = S.targetsFor(day);
  if (!t) {
    box.append(h('div', { class: 'banner warn' }, 'Чтобы рассчитать калории, заполни профиль: пол, возраст, рост и вес. ',
      h('button', { class: 'link', onclick: () => { tab = 'profile'; rerender(); } }, 'Заполнить')));
    return box;
  }
  const menu = state.menu;
  const eaten = eatenTotals(day);
  const cardio = S.cardioKcalOn(day);
  const training = !!S.workoutOnDate(day);

  box.append(h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h3', null, 'Цель на день'), h('span', { class: 'badge' + (training ? ' accent' : '') }, training ? 'тренировочный день' : 'день отдыха')),
    h('div', { class: 'dash', style: { margin: '12px 0 4px' } },
      h('div', { style: { position: 'relative' } },
        ring({ value: eaten.kcal, max: t.kcal, size: 128, stroke: 12, label: 'Калории', children: [h('b', { 'data-count': Math.round(eaten.kcal) }, num(eaten.kcal, 0)), h('span', null, `из ${t.kcal} ккал`)] }),
        h('span', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' } }, `Калории ${num(eaten.kcal, 0)} / ${t.kcal} ккал`)),
      h('div', { class: 'macros' }, macroRow('Белки', eaten.p, t.protein, 'г', 'p'), macroRow('Жиры', eaten.f, t.fat, 'г', 'f'), macroRow('Углеводы', eaten.c, t.carbs, 'г', 'c'))),
    h('p', { class: 'muted small' }, 'Съедено / цель.' +
      (cardio ? ` Кардио добавило ${t.cardio} ккал к цели: прибавь их к любому приёму.` : '') +
      (state.settings.kcalAdjust ? ` Коррекция по весу: ${state.settings.kcalAdjust > 0 ? '+' : ''}${state.settings.kcalAdjust} ккал.` : ''))));

  if (!menu) {
    box.append(menuCard(null, t));
    return box;
  }
  const base = S.baseTargets();
  if (base && menuIsStale(menu, base.kcal)) {
    box.append(h('div', { class: 'banner warn' }, `Цель изменилась (меню на ${menu.targets.kcal} ккал, сейчас ${base.kcal}). `,
      h('button', { class: 'link', onclick: () => regenerate(base) }, 'Пересоставить меню')));
  }
  box.append(h('div', { class: 'banner' }, h('b', null, 'Как читать меню. '), 'Выбери вариант приёма и отмечай съеденное. ',
    'Вес указан в сыром или сухом виде (до приготовления), если не написано «как есть». Рядом показан примерный вес готового блюда.'));

  menu.meals.forEach((meal, mi) => box.append(mealCard(day, meal, mi)));
  box.append(menuCard(menu, t));
  return box;
}

function macroRow(label, v, target, unit, cls = '') {
  return h('div', { class: `mstack ${cls}` }, h('div', { class: 'ml' }, h('span', null, label), h('span', { class: 'mv' }, `${num(v, 0)} / ${num(target, 0)} ${unit}`)), progressBar(v / target));
}

// Карточка управления меню: число приёмов, число вариантов и (пере)составление.
// Смена любого из двух чисел сразу пересоставляет меню.
function menuCard(menu, t) {
  const mine = state.foods.mine.length;
  const regen = () => { const base = S.baseTargets() || t; if (state.menu) regenerate(base); };
  const mealsSel = h('select', { 'aria-label': 'Приёмов пищи в день', onchange: (e) => { state.settings.mealsPerDay = Number(e.target.value); save('settings'); regen(); } },
    [3, 4, 5, 6].map((n) => h('option', { value: n, selected: (state.settings.mealsPerDay || 4) === n }, `${n} ${n < 5 ? 'приёма' : 'приёмов'}`)));
  const varSel = h('select', { 'aria-label': 'Вариантов на приём', onchange: (e) => { state.settings.menuVariants = Number(e.target.value); save('settings'); regen(); } },
    [1, 2, 3, 4].map((n) => h('option', { value: n, selected: (state.settings.menuVariants || 3) === n }, `${n} ${n === 1 ? 'вариант' : n < 5 ? 'варианта' : 'вариантов'}`)));
  const card = h('div', { class: 'card' }, menu ? null : h('div', { class: 'empty', style: { paddingBottom: 0 } }, illustration('bowl')), h('h3', null, menu ? 'Меню' : 'Универсальное меню'),
    h('p', { class: 'muted small' }, menu
      ? `Составлено ${new Date(menu.generatedAt).toLocaleDateString('ru-RU')} под ${menu.targets.kcal} ккал, приёмов: ${menu.meals.length}. Одно меню на все дни: ты просто выбираешь вариант и отмечаешь съеденное.`
      : mine ? 'Составлю меню на выбранное число приёмов, в каждом по нескольку равноценных вариантов. Одно меню на все дни.'
        : 'Сначала отметь продукты, которые ты ешь, на вкладке «Продукты»: нужны источники белка, крупы или гарниры, овощи.'));
  if (mine) card.append(h('div', { class: 'grid2' }, h('label', { class: 'field' }, 'Приёмов в день', mealsSel), h('label', { class: 'field' }, 'Вариантов', varSel)));
  // если из продуктов не получается столько вариантов, сколько просили
  if (menu) {
    const want = state.settings.menuVariants || 3;
    const short = menu.meals.filter((m) => m.options.length < want);
    if (short.length) card.append(h('div', { class: 'banner warn' }, h('b', null, 'Вариантов меньше, чем просили. '),
      short.map((m) => `${m.name}: ${m.options.length} из ${want}`).join(', '), '. Чтобы вариантов стало больше, добавь продукты на вкладке «Продукты» или разреши существующим больше приёмов (буквы З О П У).'));
  }
  card.append(h('button', { class: 'btn primary block', style: { marginTop: '10px' }, onclick: () => {
    if (!mine) { tab = 'foods'; rerender(); return; }
    const base = S.baseTargets() || t;
    if (menu) confirmBox('Меню будет составлено заново. Уже сделанные отметки в прошлых днях сохранятся.', 'Пересоставить').then((ok) => ok && regenerate(base));
    else regenerate(base);
  } }, menu ? 'Пересоставить меню' : mine ? 'Составить меню' : 'К моим продуктам'));
  return card;
}

function regenerate(base) {
  const roles = new Set(state.foods.mine.map(foodByKey).filter(Boolean).map(roleOf));
  if (!roles.has('protein')) toast('Добавь хотя бы один источник белка (мясо, рыба, яйца, творог)');
  state.menu = generateMenu(base, { variants: state.settings.menuVariants || 3, mealsPerDay: state.settings.mealsPerDay || 4 });
  const count = state.menu.meals.length;
  // Сегодняшние и будущие отметки: съеденное остаётся в учёте как «вне меню», остальное берётся из нового меню.
  // Если приёмов стало меньше, съеденное из лишних приёмов переносится в последний. Прошлые дни не трогаем: это история.
  const today = E.todayStr();
  for (const [date, log] of Object.entries(state.foodlog)) {
    if (date < today) continue;
    const next = Array.from({ length: count }, () => null);
    log.forEach((e, i) => {
      if (!e) return;
      const eaten = e.items.filter((it) => it.eaten).map((it) => ({ ...it, extra: true }));
      if (!eaten.length) return;
      const to = Math.min(i, count - 1);
      next[to] = next[to] ? { opt: 0, items: [...next[to].items, ...eaten] } : { opt: 0, items: eaten };
    });
    state.foodlog[date] = next;
  }
  save('menu'); save('foodlog'); toast('Меню пересоставлено'); rerender();
}

// ---------- приём пищи ----------
function mealCard(day, meal, mi) {
  const entry = mealEntry(day, mi);
  const chosen = Math.min(entry?.opt ?? 0, Math.max(0, meal.options.length - 1));
  const option = meal.options[chosen];
  const art = MEAL_ART[meal.art ?? mi] || MEAL_ART[0];
  const card = h('div', { class: 'card mc-card', style: { '--mc': art.color } });
  if (!option) {
    card.append(h('h3', null, meal.name), h('p', { class: 'muted' }, 'В этом приёме нет продуктов. Добавь продукты и пересоставь меню.'));
    return card;
  }
  const virtual = option.items.map((it) => ({ key: it.key, grams: it.grams, eaten: false }));
  // Если в записи нет позиций меню (после пересоставления остались только съеденные «вне меню»), показываем новое меню плюс эти позиции.
  const items = entry && entry.items.some((it) => !it.extra) ? entry.items : [...virtual, ...(entry ? entry.items.filter((it) => it.extra) : [])];
  const om = optionMacros(option);
  const doneKcal = sumItems(items, { onlyEaten: true }).kcal;
  card.append(h('div', { class: 'meal-head' }, tile({ glyph: art.glyph, color: art.color, tint: art.tint }, 42),
    h('div', { class: 'mt' }, h('h3', null, meal.name),
      h('div', { class: 'sub' }, `${num(om.kcal, 0)} ккал · Б ${num(om.p, 0)} Ж ${num(om.f, 0)} У ${num(om.c, 0)}`)),
    doneKcal > 0 ? h('span', { class: 'badge ok' }, `${num(doneKcal, 0)} ккал`) : null));

  if (meal.options.length > 1) {
    card.append(h('div', { class: 'chips opts' }, meal.options.map((o, i) => h('button', {
      class: 'chip' + (i === chosen ? ' accent' : ''), 'aria-pressed': i === chosen,
      onclick: async () => {
        if (i === chosen) return;
        if (entry?.items.some((x) => x.eaten && !x.extra) && !(await confirmBox('Отметки этого приёма сбросятся. Сменить вариант?', 'Сменить'))) return;
        ensureMealEntry(day, mi, i); save('foodlog'); rerender();
      },
    }, h('b', null, `Вариант ${i + 1}`), `${num(optionMacros(o).kcal, 0)} ккал`))));
  }

  items.forEach((it, ii) => card.append(foodRow(day, mi, chosen, it, ii)));

  const all = items.length > 0 && items.every((x) => x.eaten);
  card.append(h('div', { class: 'row gap', style: { marginTop: '8px' } },
    h('button', { class: 'btn small grow' + (all ? '' : ' ok'), onclick: () => {
      const e = ensureMealEntry(day, mi, chosen);
      e.items.forEach((x) => { x.eaten = !all; });
      save('foodlog'); rerender();
    } }, icon('check', 16), all ? 'Снять отметки' : 'Съел весь вариант'),
    h('button', { class: 'btn small grow', onclick: () => addExtra(day, mi, chosen) }, icon('plus', 16), 'Другой продукт')));
  return card;
}

function foodRow(day, mi, opt, it, ii) {
  const food = foodByKey(it.key);
  const grams = it.eaten ? (it.actual ?? it.grams) : it.grams;
  const prep = food ? prepOf(food) : null;
  const cooked = food ? cookedGrams(food, grams) : null;
  const m = food ? macrosOf(food, grams) : null;
  const q = qtyText(food, grams);
  return h('div', { class: 'food' + (it.eaten ? ' eaten' : '') },
    h('input', { type: 'checkbox', checked: it.eaten, 'aria-label': 'Съел', onchange: (e) => {
      const entry = ensureMealEntry(day, mi, opt); entry.items[ii].eaten = e.target.checked; save('foodlog'); rerender();
    } }),
    food ? tile(foodArt(food), 36) : null,
    h('div', { class: 'name' }, h('div', null, food ? displayName(food) : 'Удалённый продукт', it.extra ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'вне меню') : null),
      food ? h('div', { class: 'muted small' },
        h('span', { class: `prep ${prep.state}` }, prep.label), ` · ${num(m.kcal, 0)} ккал · Б ${num(m.p, 0)}`,
        q.sub ? ` · ${q.sub}` : '', cooked ? ` · ≈ ${cooked} г готового` : '') : null),
    h('button', { class: 'g', onclick: () => editGrams(day, mi, opt, ii, it) }, q.main),
    it.extra ? h('button', { class: 'icon-btn', 'aria-label': 'Убрать', onclick: () => { const e = ensureMealEntry(day, mi, opt); e.items.splice(ii, 1); save('foodlog'); rerender(); } }, icon('x')) : null);
}

function editGrams(day, mi, opt, ii, it) {
  const food = foodByKey(it.key);
  const prep = food ? prepOf(food) : null;
  const u = food ? unitOf(food) : null;
  modal(food ? displayName(food) : 'Сколько съел', (body, close) => {
    const cur = it.actual ?? it.grams;
    const input = h('input', { type: 'text', inputmode: 'decimal', value: u ? String(Math.round((cur / u) * 10) / 10).replace('.', ',') : cur });
    const hint = u ? `По меню: ${qtyText(food, it.grams).main} (${it.grams} г). Вводи количество в штуках.`
      : `По меню: ${it.grams} г${prep ? ` (${prep.label}${prep.yield ? ', до приготовления' : ''})` : ''}. Вводи вес в том же виде.`;
    body.append(h('p', { class: 'muted small' }, hint), h('label', { class: 'field' }, u ? 'Сколько штук' : 'Сколько граммов', input),
      h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => {
        const raw = parseFloat(String(input.value).replace(',', '.'));
        if (!(raw >= 0 && raw < 5000)) return;
        const v = u ? Math.round(raw * u) : Math.round(raw);
        const e = ensureMealEntry(day, mi, opt); const row = e.items[ii];
        if (v === row.grams) delete row.actual; else row.actual = v;
        row.eaten = true; save('foodlog'); close(); rerender();
      } }, 'Сохранить'));
  });
}

function addExtra(day, mi, opt) {
  modal('Другой продукт', (body, close) => {
    const list = h('div'), q = h('input', { type: 'search', placeholder: 'Поиск по всем продуктам' });
    const amount = h('input', { type: 'text', inputmode: 'decimal', value: 100 });
    const label = h('label', { class: 'field' }, 'Граммы (в сыром виде, если продукт сырой)', amount);
    const show = () => {
      const text = q.value.trim();
      const pool = text ? searchFoods(text) : state.foods.mine.map(foodByKey).filter(Boolean);
      list.replaceChildren(...pool.slice(0, 40).map((f) => {
        const u = unitOf(f);
        return h('button', { class: 'btn block', style: { marginBottom: '6px', justifyContent: 'flex-start', textAlign: 'left' }, onclick: () => {
          const raw = parseFloat(String(amount.value).replace(',', '.')) || (u ? 1 : 100);
          const grams = Math.round(u && raw <= 20 ? raw * u : raw);   // для штучных небольшие числа — штуки
          const e = ensureMealEntry(day, mi, opt); e.items.push({ key: f.key, grams, eaten: true, extra: true });
          save('foodlog'); close(); rerender();
        } }, `${displayName(f)} · ${num(f.kcal, 0)} ккал/100 г · ${prepOf(f).label}${u ? ` · ${u} г за шт` : ''}`);
      }));
    };
    q.oninput = show; show();
    body.append(label, h('p', { class: 'muted small' }, 'Для яиц, бананов и других штучных продуктов число до 20 считается штуками.'), q, h('div', { style: { marginTop: '8px' } }, list));
  });
}

// ---------- продукты ----------
// Все действия обновляют список на месте, без перерисовки страницы: поиск и прокрутка не сбрасываются.
function foodsTab() {
  const box = h('div');
  const cta = h('div'), mineCard = h('div', { class: 'card' }), addCard = h('div', { class: 'card' });
  const searchBox = h('input', { type: 'search', placeholder: 'Найти продукт: курица, рис, творог…', autocomplete: 'off' });
  const results = h('div'), quick = h('div'), groupChips = h('div', { class: 'chips groups' });
  let group = null;

  const has = (key) => state.foods.mine.includes(key);
  const toggle = (f) => {
    state.foods.mine = has(f.key) ? state.foods.mine.filter((k) => k !== f.key) : [...state.foods.mine, f.key];
    save('foods'); refresh();
  };

  function drawCta() {
    const mine = state.foods.mine.map(foodByKey).filter(Boolean);
    const roles = new Set(mine.map(roleOf));
    if (mine.length < 3 || !roles.has('protein') || !roles.has('carb')) { cta.replaceChildren(); return; }
    cta.replaceChildren(h('div', { class: 'banner' }, h('b', null, `Выбрано продуктов: ${mine.length}. `), state.menu ? 'Если список изменился, пересоставь меню. ' : 'Теперь можно составить меню. ',
      h('button', { class: 'link', onclick: () => { tab = 'day'; rerender(); } }, state.menu ? 'К меню' : 'Составить меню')));
  }

  function drawMine() {
    const mine = state.foods.mine.map(foodByKey).filter(Boolean);
    mineCard.replaceChildren(h('h3', null, `Мои продукты (${mine.length})`),
      h('p', { class: 'muted small' }, 'Меню собирается только из них. Тип и приёмы пищи подобраны автоматически. Буквы: З — завтрак, О — обед, П — полдник, У — ужин. Нажми на букву, чтобы разрешить или запретить продукт в этом приёме.'));
    if (!mine.length) mineCard.append(h('p', { class: 'muted' }, 'Пока пусто. Нажми «Добавить базовый набор» или выбери продукты ниже.'));
    for (const f of mine) {
      const sel = h('select', { style: { width: 'auto', minHeight: '34px', padding: '4px 28px 4px 8px', fontSize: '13px' }, onchange: (e) => { state.foods.roles[f.key] = e.target.value; save('foods'); drawCta(); } },
        Object.entries(ROLE_NAMES).map(([k, v]) => h('option', { value: k, selected: roleOf(f) === k }, v)));
      const active = activeMeals(f);
      const chips = h('div', { class: 'mealchips' }, MEAL_SHORT.map((c, i) => h('button', {
        class: 'mc' + (active.includes(i) ? ' on' : ''), title: MEAL_NAMES[i], 'aria-pressed': active.includes(i),
        onclick: () => {
          const next = active.includes(i) ? active.filter((x) => x !== i) : [...active, i].sort();
          if (next.length) state.foods.meals[f.key] = next; else delete state.foods.meals[f.key];
          save('foods'); drawMine();
        },
      }, c)));
      const prep = prepOf(f), u = unitOf(f);
      mineCard.append(h('div', { class: 'food stack' },
        h('div', { class: 'row gap' }, tile(foodArt(f), 38),
          h('div', { class: 'name' }, displayName(f), h('div', { class: 'muted small' }, h('span', { class: `prep ${prep.state}` }, prep.label), ` · Б ${num(f.p, 0)} · Ж ${num(f.f, 0)} · У ${num(f.c, 0)} · ${num(f.kcal, 0)} ккал/100 г${u ? ` · ${u} г за шт` : ''}`)),
          h('button', { class: 'icon-btn', 'aria-label': 'Убрать', onclick: () => toggle(f) }, icon('x'))),
        h('div', { class: 'row gap between' }, sel, chips)));
    }
    const roles = new Set(mine.map(roleOf));
    const need = ['protein', 'carb'].filter((r) => !roles.has(r));
    if (mine.length && need.length) mineCard.append(h('div', { class: 'banner warn' }, `Не хватает: ${need.map((r) => ROLE_NAMES[r].toLowerCase()).join(', ')}.`));
  }

  function drawQuick() {
    quick.replaceChildren(...QUICK.map(([title, names]) => h('div', { class: 'qgroup' }, h('div', { class: 'qtitle' }, title),
      h('div', { class: 'chips qchips' }, names.map((q) => {
        const f = quickFood(q); if (!f) return null;
        return h('button', { class: 'qchip' + (has(f.key) ? ' on' : ''), 'aria-pressed': has(f.key), onclick: () => toggle(f) }, has(f.key) ? icon('check', 14) : icon('plus', 14), displayName(f).replace(/^Творог "Простоквашино" /, 'Творог ').replace(/^Кефир "Заречье" /, 'Кефир ').replace(/ жирности$/, ''));
      })))));
  }

  function drawResults() {
    const text = searchBox.value.trim();
    groupChips.style.display = text ? 'none' : '';
    groupChips.replaceChildren(...foodGroups().map(([g, n]) => h('button', { class: 'qchip' + (group === g && !text ? ' on' : ''), onclick: () => { group = group === g ? null : g; searchBox.value = ''; drawResults(); } }, `${g} · ${n}`)));
    let pool;
    if (text) pool = searchFoods(text);
    else if (group) pool = foodsOfGroup(group);
    else { results.replaceChildren(h('p', { class: 'muted small' }, 'Введи название или открой раздел. В базе 350 продуктов из твоего файла. Калорийность указана на сырой или сухой продукт.')); return; }
    results.replaceChildren(...(pool.length ? pool.slice(0, 60).map((f) => {
      const on = has(f.key), u = unitOf(f);
      return h('div', { class: 'food' }, tile(foodArt(f), 38), h('div', { class: 'name' }, displayName(f), h('div', { class: 'muted small' }, `${f.group} · ${prepOf(f).label} · Б ${num(f.p, 0)} Ж ${num(f.f, 0)} У ${num(f.c, 0)} · ${num(f.kcal, 0)} ккал${u ? ` · ${u} г за шт` : ''}`)),
        h('button', { class: 'btn small' + (on ? '' : ' primary'), 'aria-label': on ? 'Убрать' : 'Добавить', onclick: () => toggle(f) }, on ? icon('check', 16) : icon('plus', 16)));
    }) : [h('p', { class: 'muted' }, 'Не нашёл. Попробуй другое слово или добавь свой продукт.')]));
  }

  function refresh() { drawCta(); drawMine(); drawQuick(); drawResults(); }

  searchBox.addEventListener('input', () => { group = null; drawResults(); });
  const starter = h('button', { class: 'btn primary block', onclick: () => {
    const before = state.foods.mine.length;
    for (const q of STARTER_PACK) { const f = quickFood(q); if (f && !has(f.key)) state.foods.mine.push(f.key); }
    save('foods'); toast(`Добавлено продуктов: ${state.foods.mine.length - before}`); refresh();
  } }, icon('plus', 16), 'Добавить базовый набор');

  addCard.append(h('h3', null, 'Добавить продукты'),
    h('p', { class: 'muted small' }, 'Нажимай на продукты: они сразу попадут в твой список. Лишнее потом убери крестиком.'),
    starter, h('div', { style: { marginTop: '10px' } }, quick),
    h('h3', { style: { marginTop: '14px' } }, 'Найти другой'), searchBox, groupChips, results,
    h('button', { class: 'btn block', style: { marginTop: '10px' }, onclick: () => customFood(refresh) }, icon('plus', 16), 'Свой продукт'));
  box.append(cta, addCard, mineCard);
  refresh();
  return box;
}

function customFood(onDone) {
  modal('Свой продукт (на 100 г)', (body, close) => {
    const f = { name: '', p: '', f: '', c: '', kcal: '', unit: '' };
    const inp = (key, label, mode = 'decimal') => h('label', { class: 'field' }, label, h('input', { type: 'text', inputmode: mode, oninput: (e) => { f[key] = e.target.value; } }));
    body.append(inp('name', 'Название (добавь «сырой» или «готовый», если важно)', 'text'), h('div', { class: 'grid3' }, inp('p', 'Белки, г'), inp('f', 'Жиры, г'), inp('c', 'Углеводы, г')),
      inp('kcal', 'Ккал на 100 г (пусто — посчитаю)'), inp('unit', 'Вес одной штуки, г (для яиц, фруктов; необязательно)', 'numeric'),
      h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => {
        const n = (v) => parseFloat(String(v).replace(',', '.')) || 0;
        if (!f.name.trim()) { toast('Укажи название'); return; }
        const item = { id: Date.now().toString(36), name: f.name.trim(), p: n(f.p), f: n(f.f), c: n(f.c), kcal: f.kcal === '' ? Math.round(n(f.p) * 4 + n(f.f) * 9 + n(f.c) * 4) : n(f.kcal), gi: 0 };
        if (n(f.unit) > 0) item.unit = n(f.unit);
        state.foods.custom.push(item); state.foods.mine.push(`c:${item.id}`); save('foods'); close();
        if (onDone) onDone(); else rerender();
      } }, 'Добавить'));
  });
}

// ---------- профиль ----------
const parseNum = (v) => parseFloat(String(v).replace(',', '.'));
const RANGES = { age: [14, 90], height: [120, 230], weight: [35, 250] };

// Вес — единый источник правды: журнал взвешиваний. Правка в профиле пишет замер на сегодня.
function setWeightToday(v) {
  const date = E.todayStr();
  const rec = state.weights.find((x) => x.date === date);
  if (rec) rec.kg = v; else state.weights = [...state.weights, { date, kg: v }].sort((a, b) => a.date.localeCompare(b.date));
  state.settings.profile.weight = v;
  save('weights'); save('settings');
}

function profileTab() {
  const p = state.settings.profile;
  const box = h('div');
  const results = h('div');
  const advice = h('div');
  const refresh = () => { results.replaceChildren(resultsCard()); advice.replaceChildren(adviceCard(refresh)); };

  const sel = (key, label, opts) => h('label', { class: 'field' }, label, h('select', { onchange: (e) => { p[key] = e.target.value; save('settings'); refresh(); } },
    Object.entries(opts).map(([k, v]) => h('option', { value: k, selected: p[key] === k }, v))));
  const numIn = (key, label, ph, initial) => {
    const [lo, hi] = RANGES[key];
    const input = h('input', { type: 'text', inputmode: 'decimal', value: initial ?? p[key] ?? '', placeholder: ph });
    input.addEventListener('input', () => {
      const v = parseNum(input.value);
      const ok = isFinite(v) && v >= lo && v <= hi;
      input.classList.toggle('invalid', input.value !== '' && !ok);
      if (!ok) return;
      if (key === 'weight') setWeightToday(v); else { p[key] = v; save('settings'); }
      refresh();
    });
    return h('label', { class: 'field' }, label, input);
  };
  const w = S.latestWeight();
  box.append(h('div', { class: 'card' }, h('h3', null, 'Данные для расчёта'),
    h('p', { class: 'muted small' }, 'Хранятся только на телефоне. Расчёт обновляется сразу при изменении любого поля. Вес записывается в журнал взвешиваний на сегодня.'),
    sel('sex', 'Пол', { m: 'Мужской', f: 'Женский' }), numIn('age', 'Возраст, лет', '30'), numIn('height', 'Рост, см', '180'), numIn('weight', 'Вес, кг', '80', w ?? ''),
    sel('activity', 'Активность вне тренировок', { low: 'Малая (сидячая работа)', medium: 'Средняя', high: 'Высокая (много ходьбы / физический труд)' }),
    sel('goal', 'Цель', { gain: 'Набор мышечной массы', maintain: 'Поддержание', cut: 'Похудение' }),
    sel('pace', 'Темп набора (профицит над суточным расходом)', { slow: 'Медленный: +250 ккал в день', moderate: 'Умеренный: +350 ккал в день', fast: 'Быстрый: +450 ккал в день' })));
  box.append(results, advice);
  refresh();

  box.append(h('details', { class: 'card' }, h('summary', null, 'Откуда цифры'),
    h('p', { class: 'small' }, 'Основной обмен: формула Миффлина — Сан Жеора (10·вес + 6,25·рост − 5·возраст ± константа). Суточный расход = обмен × коэффициент активности (1,35 / 1,45 / 1,55).'),
    h('p', { class: 'small' }, 'Цель по калориям = суточный расход + профицит выбранного темпа (ровно столько ккал, сколько указано) + коррекция по весу + доля расхода на кардио. Для набора массы разумный профицит 250–450 ккал в сутки, ориентир роста — 0,25–0,5 % массы тела в неделю.'),
    h('p', { class: 'small' }, 'Белок 1,8 г/кг (2,0 при похудении), жиры около 0,9 г/кг и не менее 20 % калорий, остаток калорий — углеводы.'),
    h('p', { class: 'small muted' }, 'Это ориентиры, а не медицинская рекомендация. Реальный расход у людей отличается на ±10–15 %, поэтому раз в две недели сверяй цель с динамикой веса (карточка «Проверка по весу»).')));
  return box;
}

function resultsCard() {
  const today = E.todayStr();
  const t = S.targetsFor(today);
  if (!t) return h('div', { class: 'banner warn' }, 'Заполни возраст, рост и вес: тогда здесь появится расчёт.');
  const p = state.settings.profile;
  const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  const row = (label, value, cls) => h('tr', { class: cls }, h('td', null, label), h('td', null, value));
  const goalNames = { gain: 'профицит для набора', maintain: 'без профицита', cut: 'дефицит для похудения' };
  const box = h('div', { class: 'card' }, h('h3', null, 'Расчёт на сегодня'),
    h('table', { class: 't calc' }, h('tbody', null,
      row('Основной обмен', `${t.bmr} ккал`),
      row(`× активность ${ACT_FACTORS[p.activity]}  →  суточный расход`, `${t.tdee} ккал`),
      row(goalNames[p.goal], `${sign(t.surplus)} ккал` + (t.surplus ? ` (${num(Math.abs(t.surplusPct), 1)} %)` : '')),
      t.adjust ? row('коррекция по динамике веса', `${sign(t.adjust)} ккал`) : null,
      t.cardio ? row('кардио сегодня (доля расхода)', `${sign(t.cardio)} ккал`) : null,
      t.dayFactor !== 1 ? row(t.dayFactor > 1 ? 'тренировочный день' : 'день отдыха', `× ${num(t.dayFactor, 3)}`) : null,
      row('Цель на сегодня', `${t.kcal} ккал`, 'total'))),
    h('div', { class: 'grid3', style: { marginTop: '10px' } }, stat(t.protein, 'белки, г'), stat(t.fat, 'жиры, г'), stat(t.carbs, 'углеводы, г')),
    h('p', { class: 'muted small' }, `Клетчатка ~${t.fiber} г, вода ~${num(t.waterL, 1)} л.`),
    h('label', { class: 'row gap', style: { marginTop: '8px', fontSize: '14px' } },
      h('input', { type: 'checkbox', checked: !!state.settings.dayBoost, onchange: (e) => { state.settings.dayBoost = e.target.checked; save('settings'); rerender(); } }),
      h('span', null, 'Больше калорий в тренировочные дни (+5 %), меньше в дни отдыха. Недельная сумма не меняется.')));
  if (p.goal === 'gain' && t.surplusPct > 20) box.append(h('div', { class: 'banner warn' }, 'Профицит больше 20 % от расхода: заметная часть набора уйдёт в жир. Лучше выбрать темп помедленнее.'));
  return box;
}
const ACT_FACTORS = { low: '1,35', medium: '1,45', high: '1,55' };

function adviceCard(refresh) {
  const pts = state.weights.map((x) => ({ date: x.date, kg: x.kg }));
  const rate = E.weeklyRate(pts);
  const w = S.latestWeight();
  const adv = rate != null && w ? E.calorieAdvice(rate, w, state.settings.profile.goal) : null;
  const box = h('div', { class: 'card' }, h('h3', null, 'Проверка по весу'));
  if (!adv) { box.append(h('p', { class: 'muted' }, 'Нужно хотя бы 3 взвешивания за последние 2 недели: тогда я оценю темп и подскажу, что поправить в калориях.')); return box; }
  box.append(h('p', null, adv.text));
  const ago = state.settings.kcalAdjustAt ? Math.floor((Date.now() - state.settings.kcalAdjustAt) / 86400000) : null;
  if (adv.delta) {
    if (ago != null && ago < 10) box.append(h('p', { class: 'muted small' }, `Норму уже меняли ${ago} дн. назад. Подожди хотя бы 10 дней, чтобы вес успел отреагировать.`));
    else box.append(h('button', { class: 'btn primary block', onclick: () => {
      state.settings.kcalAdjust = (state.settings.kcalAdjust || 0) + adv.delta; state.settings.kcalAdjustAt = Date.now();
      save('settings'); toast('Норма изменена'); refresh();
    } }, `Применить ${adv.delta > 0 ? '+' : '−'}${Math.abs(adv.delta)} ккал`));
  }
  if (state.settings.kcalAdjust) box.append(h('button', { class: 'btn small', style: { marginTop: '8px' }, onclick: () => { state.settings.kcalAdjust = 0; state.settings.kcalAdjustAt = null; save('settings'); refresh(); } }, `Сбросить коррекцию (${state.settings.kcalAdjust > 0 ? '+' : ''}${state.settings.kcalAdjust} ккал)`));
  return box;
}
const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));
