import { h, num, dateRu, progressBar, kg, icon, toast, notice } from '../ui.js';
import { state, save } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { go, rerender } from '../router.js';
import { EX_BY_ID, MAIN_NAMES, MUSCLE_OF } from '../exercises.js';
import { illustration, ring, MUSCLES } from '../art.js';
import { eatenTotals } from '../nutrition.js';
import { setFoodTab } from './food.js';

function nextMonday(from) {
  let d = from;
  while (E.weekday(d) !== 1) d = E.addDays(d, 1);
  return d;
}

function setupCard() {
  const vals = {};
  const inputs = [];
  const field = (key, label) => {
    const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'кг', oninput: (e) => { vals[key] = parseFloat(e.target.value.replace(',', '.')); e.target.classList.remove('invalid'); } });
    inputs.push(input);
    return h('label', { class: 'field' }, label, input);
  };
  const start = h('input', { type: 'date', value: nextMonday(E.todayStr()) });
  return h('div', { class: 'card' },
    h('div', { class: 'empty', style: { paddingBottom: 0 } }, illustration('barbell')),
    h('h3', null, 'Начни с двух шагов'),
    h('p', { class: 'muted' }, 'Введи повторные максимумы (ПМ) в трёх базовых упражнениях. План и веса остальных упражнений рассчитаются сами. ПМ потом можно менять в любой момент.'),
    field('squat', 'ПМ в приседе, кг'), field('bench', 'ПМ в жиме лёжа, кг'), field('deadlift', 'ПМ в становой тяге, кг'),
    h('label', { class: 'field' }, 'Дата первой тренировки (дни: пн / ср / пт)', start),
    h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => {
      const ok = ['squat', 'bench', 'deadlift'].every((k) => vals[k] > 0);
      if (!ok || !start.value) {
        inputs.forEach((i, k) => i.classList.toggle('invalid', !(vals[['squat', 'bench', 'deadlift'][k]] > 0)));
        notice('Введи повторные максимумы в приседе, жиме и становой тяге (в килограммах) и выбери дату первой тренировки.', 'Не все поля заполнены');
        return;
      }
      const today = E.todayStr();
      for (const k of ['squat', 'bench', 'deadlift']) {
        state.pm.main[k] = { value: vals[k], at: 0 };
        state.pm.history.push({ date: today, key: k, value: vals[k] });
      }
      state.settings.startDate = start.value;
      save('pm'); save('settings'); rerender();
    } }, 'Сохранить и начать'));
}

const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
}

// Неделя одной строкой: дни тренировок, выполненные и пропущенные.
function weekStrip(today) {
  const monday = E.addDays(today, -((E.weekday(today) + 6) % 7));
  const strip = h('div', { class: 'week' });
  for (let i = 0; i < 7; i++) {
    const date = E.addDays(monday, i);
    const info = S.workoutOnDate(date);
    let cls = '';
    if (info) {
      const st = S.dayStatus(info, S.planFor(info.cycle, info.mc, info.day));
      cls = st === 'done' || st === 'partial' ? 'done' : st === 'missed' ? 'missed' : 'train';
    }
    const day = h(info ? 'a' : 'div', { class: `wk ${cls}${date === today ? ' today' : ''}`, href: info ? `#/day/${info.key}` : null, 'aria-label': date },
      WD_SHORT[i], h('b', null, Number(date.slice(8))), h('i', { class: 'mark' }));
    strip.append(day);
  }
  return strip;
}

// Название и подпись дня по главному упражнению.
function dayTitle(plan) {
  const lead = plan.exercises.find((e) => MAIN_NAMES[e.exId] && e.load !== 'Легкая') || plan.exercises[0];
  const kind = { Тяжелая: 'Тяжёлый день', Средняя: 'Средний день', Легкая: 'Лёгкий день' }[lead.load] || '';
  return { title: MAIN_NAMES[lead.exId] || EX_BY_ID[lead.exId].name, kind };
}
export function muscleChips(plan) {
  const seen = [];
  for (const e of plan.exercises) { const m = MUSCLE_OF[e.exId]; if (m && !seen.includes(m)) seen.push(m); }
  return h('div', { class: 'chips' }, seen.map((m) => h('span', { class: 'muscle-chip' }, h('i', { style: { background: MUSCLES[m].color, color: MUSCLES[m].color } }), MUSCLES[m].name)));
}

export function todayPage() {
  const root = h('div');
  const today = E.todayStr();
  if (!S.isSetUp()) {
    root.append(h('h1', null, 'Сегодня'), setupCard());
    return root;
  }
  root.append(h('div', { class: 'greeting' }, h('small', null, dateRu(today)), h('h1', null, greeting())), weekStrip(today), checklist());

  const d = S.nextWorkout();
  const plan = S.planFor(d.cycle, d.mc, d.day);
  const st = S.dayStatus(d, plan);
  const stInfo = S.STATUS[st];
  const isToday = d.date === today;
  const { title, kind } = dayTitle(plan);
  const tonn = h('b', { 'data-count': Math.round(plan.metrics.tonnage) }, num(plan.metrics.tonnage, 0));
  const kps = h('b', { 'data-count': plan.metrics.kpsh }, plan.metrics.kpsh);

  root.append(h('div', { class: 'card hero' },
    illustration('barbell'),
    h('div', { class: 'hero-body' },
      h('div', { class: 'row between' },
        h('div', { class: 'eyebrow' }, isToday ? 'Тренировка сегодня' : (d.date < today ? 'Ближайшая невыполненная' : 'Следующая тренировка')),
        h('span', { class: `badge ${stInfo.cls}` }, stInfo.text)),
      h('h2', null, title, kind ? h('span', { class: 'muted', style: { display: 'block', fontSize: '15px', fontWeight: 550 } }, kind) : null),
      h('div', { class: 'when' }, `${dateRu(d.date)} · микроцикл ${d.mc}, день ${d.day}` + (d.cycle ? ` · цикл ${d.cycle + 1}` : '')),
      muscleChips(plan),
      h('div', { class: 'grid3', style: { marginTop: '12px' } },
        h('div', { class: 'stat' }, tonn, h('span', null, 'тоннаж, кг')), h('div', { class: 'stat' }, kps, h('span', null, 'КПШ')),
        stat(plan.metrics.minutes ? String(plan.metrics.minutes) : '—', 'мин, время')),
      h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => go(`/day/${d.key}`) }, st === 'progress' ? 'Продолжить' : 'Открыть тренировку', icon('chevron', 16)))));
  root.querySelector('.hero > svg')?.classList.add('hero-art');

  // подсказки по ПМ
  const sug = S.pmSuggestions();
  if (sug.length) {
    root.append(h('div', { class: 'banner' },
      `Есть повод обновить ПМ: ${sug.map((x) => `${MAIN_NAMES[x.exId]} — расчётный ${num(x.est, 1)} кг`).join('; ')}. `,
      h('button', { class: 'link', onclick: () => go('/pm') }, 'Открыть')));
  }
  if (E.locate(d.n).cycle > 0 && !state.pm.history.some((x) => x.date >= d.date)) {
    root.append(h('div', { class: 'banner warn' }, 'Начался новый макроцикл. Проверь ПМ: ', h('button', { class: 'link', onclick: () => go('/pm') }, 'обновить')));
  }

  // питание: кольцо калорий
  const targets = S.targetsFor(today);
  const nut = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Питание сегодня'), h('a', { href: '#/food' }, 'Открыть')));
  if (!targets) {
    nut.append(h('p', { class: 'muted' }, 'Заполни профиль (пол, возраст, рост, вес), и я рассчитаю калории и составлю меню.'));
  } else {
    const eaten = eatenTotals(today);
    nut.append(h('div', { class: 'dash', style: { marginTop: '10px' } },
      ring({ value: eaten.kcal, max: targets.kcal, size: 104, stroke: 10, label: 'Калории', children: [h('b', { style: { fontSize: '22px' }, 'data-count': Math.round(eaten.kcal) }, num(eaten.kcal, 0)), h('span', null, `из ${targets.kcal}`)] }),
      h('div', { class: 'macros' },
        h('div', { class: 'muted small' }, `${num(eaten.kcal, 0)} / ${targets.kcal} ккал`),
        macroLine('Б', eaten.p, targets.protein, 'p'), macroLine('Ж', eaten.f, targets.fat, 'f'), macroLine('У', eaten.c, targets.carbs, 'c'))));
  }
  root.append(nut);

  // вес: быстрый ввод прямо здесь
  const w = state.weights[state.weights.length - 1];
  const todayRec = state.weights.find((x) => x.date === today);
  const quick = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'кг', 'aria-label': 'Вес сегодня' });
  root.append(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Вес'), h('a', { href: '#/weight' }, 'График')),
    h('p', null, w ? `${kg(w.kg)} · ${dateRu(w.date, false)}` : 'Пока нет записей. Взвесься утром и внеси вес.'),
    todayRec ? null : h('div', { class: 'row gap' }, h('div', { class: 'grow' }, quick),
      h('button', { class: 'btn primary', onclick: () => {
        const v = parseFloat(String(quick.value).replace(',', '.'));
        if (!(v > 20 && v < 400)) { toast('Введи вес в килограммах'); return; }
        state.weights = [...state.weights, { date: today, kg: v }].sort((a, b) => a.date.localeCompare(b.date));
        state.settings.profile.weight = v; save('weights'); save('settings'); toast('Вес записан'); rerender();
      } }, 'Записать'))));

  // резервная копия
  const last = state.settings.lastBackup;
  const hasData = state.weights.length > 0 || Object.values(state.workouts).some((w) => Object.keys(w.ex || {}).length) || Object.keys(state.foodlog).length > 0;
  if (hasData && (!last || (Date.now() - last) / 86400000 > 14)) {
    root.append(h('div', { class: 'banner warn' }, 'Данные хранятся только на этом телефоне. Сделай резервную копию: ', h('a', { href: '#/more/settings' }, 'Настройки → Экспорт')));
  }
  return root;
}

function macroLine(label, v, target, cls) {
  const names = { p: 'Белки', f: 'Жиры', c: 'Углеводы' };
  return h('div', { class: `mstack ${cls}` }, h('div', { class: 'ml' }, h('span', null, names[cls] || label), h('span', { class: 'mv' }, `${num(v, 0)} / ${num(target, 0)} г`)), progressBar(v / target));
}

const stat = (value, label) => h('div', { class: 'stat' }, h('b', null, value), h('span', null, label));

// Первые шаги: что ещё не настроено. Исчезает, когда всё готово.
function checklist() {
  const p = state.settings.profile;
  const steps = [
    { ok: S.isSetUp(), text: 'ПМ и дата старта', go: () => {} },
    { ok: p.age > 0 && p.height > 0 && S.latestWeight() > 0, text: 'Профиль для расчёта калорий', go: () => { setFoodTab('profile'); go('/food'); } },
    { ok: state.foods.mine.length >= 3, text: 'Выбрать продукты, которые ешь', go: () => { setFoodTab('foods'); go('/food'); } },
    { ok: !!state.menu, text: 'Составить меню', go: () => { setFoodTab('day'); go('/food'); } },
  ];
  if (steps.every((x) => x.ok)) return h('div');
  const next = steps.find((x) => !x.ok);
  return h('div', { class: 'card' }, h('h3', null, 'Первые шаги'),
    ...steps.map((x) => h('div', { class: 'step' + (x.ok ? ' done' : '') }, h('span', { class: 'tick' }, x.ok ? icon('check', 14) : ''), x.text)),
    S.isSetUp() ? h('button', { class: 'btn primary block', style: { marginTop: '10px' }, onclick: next.go }, next.text) : null);
}
