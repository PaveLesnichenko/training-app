import { h, num, dateRu, modal, toast, confirmBox, minutesRu, icon } from '../ui.js';
import { state, save } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { go, rerender } from '../router.js';
import { EX_BY_ID, MUSCLE_OF } from '../exercises.js';
import { MUSCLES, ring, celebrate } from '../art.js';
import { muscleChips } from './today.js';
import { DAY_NOTES } from '../data/notes.js';

const stepText = (e, s) => {
  if (e.isReps) return `${s.sets} × ${s.reps} повт.`;
  if (s.weight == null || s.weight === '') return `${s.sets} × ${s.reps} повт. (нужен ПМ)`;
  return `${num(s.weight, 1)} кг × ${s.reps} × ${s.sets}`;
};

export function dayPage({ key }) {
  const [cycle, mc, day] = key.split('.').map(Number);
  const info = S.dayInfo(E.dayIndex(cycle, mc, day));
  const plan = S.planFor(cycle, mc, day);
  const wk = state.workouts[key];
  const st = S.dayStatus(info, plan);
  const si = S.STATUS[st];
  const root = h('div');

  const ad = S.adherence(plan, wk);
  root.append(h('a', { class: 'back', href: '#/plan' }, icon('back', 16), 'План'));
  root.append(h('div', { class: 'card day-hero' },
    h('div', { class: 'row between' },
      h('div', { class: 'eyebrow', style: { margin: 0 } }, dateRu(info.date) + (cycle ? ` · цикл ${cycle + 1}` : '')),
      h('span', { class: `badge ${si.cls}` }, si.text)),
    h('div', { class: 'row gap', style: { marginTop: '8px' } },
      h('div', { class: 'grow' }, h('h1', null, `Микроцикл ${mc} · день ${day}`), muscleChips(plan)),
      ring({ value: ad.marked, max: Math.max(1, ad.total), size: 78, stroke: 8, color: 'var(--ok)', label: 'Отмечено упражнений', children: [h('b', { style: { fontSize: '19px' } }, `${ad.marked}/${ad.total}`), h('span', null, 'сделано')] })),
    h('div', { class: 'row between', style: { marginTop: '12px' } },
      h('span', { class: 'muted small' }, `${plan.exercises.length} упражнений`),
      h('button', { class: 'btn small', onclick: () => changeDate(info) }, icon('calendar', 16), 'Перенести'))));

  // итоги: план и факт
  const fact = S.factDayMetrics(plan, wk);
  root.append(h('div', { class: 'card' },
    h('table', { class: 't' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Тоннаж, кг'), h('th', null, 'КПШ'), h('th', null, 'ОИ'), h('th', null, 'Время'))),
      h('tbody', null,
        h('tr', null, h('td', null, 'План'), h('td', null, num(plan.metrics.tonnage, 0)), h('td', null, plan.metrics.kpsh), h('td', null, num(plan.metrics.oi * 100, 0) + ' %'), h('td', null, minutesRu(plan.metrics.minutes))),
        h('tr', null, h('td', null, 'Факт'), h('td', null, fact.kpsh ? num(fact.tonnage, 0) : '—'), h('td', null, fact.kpsh || '—'), h('td', null, fact.kpsh ? num(fact.oi * 100, 0) + ' %' : '—'), h('td', null, '')))),
    h('button', { class: 'link small', style: { marginTop: '6px' }, onclick: explainTerms }, 'Что значат эти цифры?'),
    plan.frozen ? h('p', { class: 'muted small' }, 'Веса зафиксированы на момент начала тренировки.', !hasMarks(wk) ? h('button', { class: 'link', style: { marginLeft: '6px' }, onclick: () => { S.unfreezePlan(cycle, mc, day); rerender(); } }, 'Пересчитать по текущим ПМ') : null) : null));

  // упражнения
  const left = plan.exercises.filter((e) => !wk?.ex?.[e.slotId]?.status);
  const exCard = h('div', { class: 'card' }, h('div', { class: 'row between' },
    h('span', { class: 'muted small' }, 'Формат: вес × повторы × подходы'),
    left.length > 1 ? h('button', { class: 'btn small ok', title: 'Отметить все упражнения без отметки как выполненные по плану', onclick: () => {
      const w = S.freezePlan(cycle, mc, day);
      for (const e of left) w.ex[e.slotId] = { exId: e.exId, status: 'done' };
      save('workouts'); toast('Все упражнения отмечены'); rerender();
    } }, icon('check', 16), 'Все по плану') : null));
  plan.exercises.forEach((e, i) => exCard.append(exerciseBlock(e, wk, { cycle, mc, day }, i + 1)));
  root.append(exCard);

  if (DAY_NOTES[day]) root.append(h('div', { class: 'banner' }, h('b', null, 'Вспомогательная работа без весов: '), DAY_NOTES[day]));

  // кардио
  const cp = S.cardioPlan(info);
  if (cp) root.append(cardioBlock(info, cp, { cycle, mc, day }));

  // самочувствие
  const rpe = h('select', { onchange: (ev) => { const w = S.ensureWorkout(key); w.rpe = Number(ev.target.value) || null; save('workouts'); } },
    h('option', { value: '' }, '—'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => h('option', { value: n, selected: wk?.rpe === n }, n)));
  const note = h('textarea', { placeholder: 'Как прошла тренировка, самочувствие, что запомнить', onchange: (ev) => { const w = S.ensureWorkout(key); w.comment = ev.target.value; save('workouts'); } }, wk?.comment || '');
  note.value = wk?.comment || '';
  root.append(h('div', { class: 'card' }, h('h3', null, 'Итог дня'),
    h('label', { class: 'field' }, 'Насколько тяжело (1 — легко, 10 — предел)', rpe), h('label', { class: 'field' }, 'Комментарий', note)));

  root.append(h('div', { class: 'row gap' },
    h('button', { class: 'btn grow', onclick: restTimer }, icon('timer'), 'Таймер отдыха'),
    !wk?.closed ? h('button', { class: 'btn primary grow', onclick: () => finish(plan, { cycle, mc, day }) }, 'Завершить') : h('button', { class: 'btn grow', onclick: () => { wk.closed = false; save('workouts'); rerender(); } }, 'Открыть снова')));
  return root;
}

const hasMarks = (wk) => !!wk && Object.values(wk.ex).some((r) => r.status);

function exerciseBlock(e, wk, ctx, n) {
  const ex = EX_BY_ID[e.exId];
  const rec = wk?.ex?.[e.slotId];
  const mcol = MUSCLES[MUSCLE_OF[e.exId]]?.color || '#8f9bb3';
  const box = h('div', { class: 'ex', style: { '--mc': mcol } });
  box.append(h('div', { class: 'ex-head' }, h('span', { class: 'ex-num' }, n),
    h('div', { class: 'grow' }, h('div', { class: 'ex-name' }, ex.name),
      h('div', { class: 'muted small' }, `${MUSCLES[MUSCLE_OF[e.exId]]?.name ? MUSCLES[MUSCLE_OF[e.exId]].name + ' · ' : ''}${e.load.toLowerCase()} · ПМ ${e.pm == null ? '—' : e.isReps ? num(e.pm, 0) + ' повт.' : num(e.pm, 1) + ' кг'}${ex.hint ? ' · ' + ex.hint : ''}`)),
    h('div', null, e.estimated ? h('span', { class: 'badge warn', title: 'Коэффициент и профиль нагрузки — оценка, не из файла' }, 'оценка') : null)));
  e.steps.forEach((s) => box.append(h('div', { class: 'set-line' }, h('b', null, stepText(e, s)), h('span', { class: 'muted small' }, e.isReps ? '' : `  ${Math.round(s.pct * 100)} %`))));

  if (!rec?.status) {
    box.append(h('div', { class: 'actions' },
      h('button', { class: 'btn ok', onclick: () => mark(ctx, e, { status: 'done' }) }, icon('check'), 'Сделал'),
      h('button', { class: 'btn warn', title: 'Сделал по-другому: ввести реальные вес и повторы', onclick: () => factForm(ctx, e, rec) }, icon('edit'), 'Иначе'),
      h('button', { class: 'btn bad', title: 'Не делал это упражнение', onclick: () => mark(ctx, e, { status: 'skipped' }) }, icon('skip'), 'Пропуск')));
    return box;
  }
  const steps = S.actualSteps(e, rec);
  const planned = e.metrics.tonnage, actual = steps.length ? E.factMetrics(e, steps).tonnage : 0;
  const cls = rec.status === 'done' ? 'ok' : rec.status === 'skipped' ? 'bad' : 'warn';
  const label = rec.status === 'done' ? 'Выполнено по плану' : rec.status === 'skipped' ? 'Не выполнено' : 'Выполнено иначе';
  const fb = h('div', { class: `fact ${cls}` }, h('b', null, label));
  if (rec.status === 'partial') {
    steps.forEach((s) => fb.append(h('div', { class: 'set-line' }, stepText(e, s))));
    if (!e.isReps && planned) fb.append(h('div', { class: 'small' }, `Тоннаж ${num(actual, 0)} из ${num(planned, 0)} кг (${num((actual / planned - 1) * 100, 0)} %)`));
  }
  if (rec.comment) fb.append(h('div', { class: 'small note' }, icon('note', 14), rec.comment));
  fb.append(h('div', { class: 'row gap', style: { marginTop: '6px' } },
    h('button', { class: 'btn small', onclick: () => factForm(ctx, e, rec) }, 'Изменить'),
    h('button', { class: 'btn small', onclick: () => { delete wk.ex[e.slotId]; save('workouts'); rerender(); } }, 'Сбросить')));
  box.append(fb);
  return box;
}

function mark(ctx, e, patch) {
  const wk = S.freezePlan(ctx.cycle, ctx.mc, ctx.day);
  wk.ex[e.slotId] = { exId: e.exId, ...(wk.ex[e.slotId] || {}), ...patch };
  if (patch.status === 'done') delete wk.ex[e.slotId].steps;
  save('workouts'); rerender();
}

function factForm(ctx, e, rec) {
  const base = (rec?.steps || e.steps).map((s) => ({ weight: s.weight, reps: s.reps, sets: s.sets }));
  const rows = base.length ? base : [{ weight: '', reps: '', sets: '' }];
  modal(EX_BY_ID[e.exId].name, (body, close) => {
    const list = h('div');
    const comment = h('textarea', { placeholder: 'Что получилось, почему (необязательно)' }, rec?.comment || '');
    comment.value = rec?.comment || '';
    const inputs = [];
    const draw = () => {
      list.replaceChildren(); inputs.length = 0;
      body.querySelector('.hdr')?.remove();
      rows.forEach((r, i) => {
        const w = h('input', { type: 'text', inputmode: 'decimal', value: r.weight ?? '', placeholder: e.isReps ? 'доп. кг' : 'кг', oninput: (ev) => { r.weight = ev.target.value === '' ? null : parseFloat(ev.target.value.replace(',', '.')); } });
        const rp = h('input', { type: 'text', inputmode: 'numeric', value: r.reps ?? '', oninput: (ev) => { r.reps = parseInt(ev.target.value, 10) || 0; } });
        const sd = h('input', { type: 'text', inputmode: 'numeric', value: r.sets ?? '', oninput: (ev) => { r.sets = parseInt(ev.target.value, 10) || 0; } });
        list.append(h('div', { class: 'edit-grid' },
          h('div', null, i === 0 ? h('small', null, e.isReps ? 'Доп. вес, кг' : 'Вес, кг') : null, w),
          h('div', null, i === 0 ? h('small', null, 'Повторы') : null, rp),
          h('div', null, i === 0 ? h('small', null, 'Подходы') : null, sd),
          h('button', { class: 'icon-btn', onclick: () => { rows.splice(i, 1); draw(); }, 'aria-label': 'Убрать строку' }, icon('x'))));
      });
    };
    draw();
    body.append(h('p', { class: 'muted small' }, 'Поля заполнены планом. Поправь на то, что реально сделал.'), list,
      h('button', { class: 'btn small', onclick: () => { rows.push({ weight: rows[rows.length - 1]?.weight ?? '', reps: rows[rows.length - 1]?.reps ?? '', sets: 1 }); draw(); } }, '+ Ещё подход'),
      h('label', { class: 'field' }, 'Комментарий', comment),
      h('div', { class: 'row gap', style: { marginTop: '12px' } },
        h('button', { class: 'btn grow', onclick: () => { close(); mark(ctx, e, { status: 'skipped', steps: undefined, comment: comment.value }); } }, 'Пропустить'),
        h('button', { class: 'btn primary grow', onclick: () => {
          const clean = rows.filter((r) => r.reps > 0 && r.sets > 0).map((r) => ({ weight: r.weight, reps: r.reps, sets: r.sets }));
          if (!clean.length) { toast('Укажи повторы и подходы'); return; }
          const same = clean.length === e.steps.length && clean.every((r, i) => r.reps === e.steps[i].reps && r.sets === e.steps[i].sets && (e.isReps || Number(r.weight) === Number(e.steps[i].weight)));
          close(); mark(ctx, e, same ? { status: 'done', comment: comment.value } : { status: 'partial', steps: clean, comment: comment.value });
        } }, 'Сохранить факт')));
  });
}

function cardioBlock(info, cp, ctx) {
  const c = info.wk?.cardio || {};
  const age = state.settings.profile.age;
  const zone = age ? E.hrZone2(age) : null;
  const box = h('div', { class: 'card' }, h('h3', null, 'Кардио'),
    h('p', null, `${E.CARDIO_TYPES[cp.type].name}, ${cp.minutes} мин (~${cp.kcal} ккал)` + (zone ? ` · пульс ${zone[0]}–${zone[1]}` : '')),
    h('p', { class: 'muted small' }, 'После силовой части, в спокойном темпе: можно разговаривать.'));
  if (c.done == null) {
    box.append(h('div', { class: 'actions' },
      h('button', { class: 'btn ok', onclick: () => setCardio(ctx, { done: true }) }, icon('check'), 'Сделал'),
      h('button', { class: 'btn warn', onclick: () => cardioForm(ctx, cp, c) }, icon('edit'), 'Иначе'),
      h('button', { class: 'btn bad', onclick: () => setCardio(ctx, { done: false }) }, icon('skip'), 'Пропуск')));
  } else {
    const real = c.done ? E.cardioKcal(c.type || cp.type, c.minutes ?? cp.minutes, S.latestWeight() || 80) : 0;
    box.append(h('div', { class: `fact ${c.done ? (c.minutes && c.minutes !== cp.minutes ? 'warn' : 'ok') : 'bad'}` },
      h('b', null, c.done ? `Сделано: ${c.minutes ?? cp.minutes} мин, ~${real} ккал` : 'Не сделано'),
      c.type && c.type !== cp.type ? h('div', { class: 'small' }, E.CARDIO_TYPES[c.type].name) : null,
      c.comment ? h('div', { class: 'small note' }, icon('note', 14), c.comment) : null,
      h('div', { class: 'row gap', style: { marginTop: '6px' } },
        h('button', { class: 'btn small', onclick: () => cardioForm(ctx, cp, c) }, 'Изменить'),
        h('button', { class: 'btn small', onclick: () => { delete S.ensureWorkout(S_key(ctx)).cardio; save('workouts'); rerender(); } }, 'Сбросить'))));
  }
  return box;
}
const S_key = (ctx) => E.workoutKey(ctx.cycle, ctx.mc, ctx.day);
function setCardio(ctx, patch) {
  const wk = S.ensureWorkout(S_key(ctx));
  wk.cardio = { ...(wk.cardio || {}), ...patch };
  save('workouts'); rerender();
}
function cardioForm(ctx, cp, c) {
  modal('Кардио', (body, close) => {
    const type = h('select', null, ...Object.entries(E.CARDIO_TYPES).map(([k, v]) => h('option', { value: k, selected: (c.type || cp.type) === k }, v.name)));
    const minutes = h('input', { type: 'text', inputmode: 'numeric', value: c.minutes ?? cp.minutes });
    const comment = h('textarea', { placeholder: 'Скорость, наклон, самочувствие' }, c.comment || '');
    comment.value = c.comment || '';
    body.append(h('label', { class: 'field' }, 'Вид', type), h('label', { class: 'field' }, 'Минут', minutes), h('label', { class: 'field' }, 'Комментарий', comment),
      h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => {
        close(); setCardio(ctx, { done: true, type: type.value, minutes: parseInt(minutes.value, 10) || cp.minutes, comment: comment.value });
      } }, 'Сохранить'));
  });
}

function changeDate(info) {
  modal('Перенести тренировку', (body, close) => {
    const d = h('input', { type: 'date', value: info.date });
    body.append(h('label', { class: 'field' }, 'Новая дата', d), h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => {
      if (!d.value) return;
      S.ensureWorkout(info.key).date = d.value; save('workouts'); close(); rerender();
    } }, 'Сохранить'),
    state.workouts[info.key]?.date ? h('button', { class: 'btn block', style: { marginTop: '8px' }, onclick: () => { delete state.workouts[info.key].date; save('workouts'); close(); rerender(); } }, 'Вернуть по расписанию') : null);
  });
}

async function finish(plan, ctx) {
  const wk = S.freezePlan(ctx.cycle, ctx.mc, ctx.day);
  const open = plan.exercises.filter((e) => !wk.ex[e.slotId]?.status);
  if (open.length && !(await confirmBox(`Упражнений без отметки: ${open.length}. Считать их пропущенными?`, 'Завершить'))) return;
  for (const e of open) wk.ex[e.slotId] = { exId: e.exId, status: 'skipped' };
  wk.closed = true;
  save('workouts');
  const a = S.adherence(plan, wk);
  await celebrate('Тренировка завершена', `Сделано упражнений: ${a.done + a.partial} из ${a.total}`);
  go('/plan');
}

function restTimer() {
  modal('Таймер отдыха', (body, close) => {
    let left = 0, timer = null;
    const label = h('div', { class: 'timer' }, '0:00');
    const show = () => { label.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
    const startT = (sec) => {
      clearInterval(timer); left = sec; show();
      timer = setInterval(() => { left--; show(); if (left <= 0) { clearInterval(timer); label.textContent = 'Пора!'; navigator.vibrate?.(300); } }, 1000);
    };
    const names = { 60: '1 мин', 90: '1,5 мин', 120: '2 мин', 180: '3 мин' };
    body.append(label, h('div', { class: 'grid2' }, [60, 90, 120, 180].map((sec) => h('button', { class: 'btn', onclick: () => startT(sec) }, names[sec]))));
    const obs = new MutationObserver(() => { if (!document.body.contains(label)) { clearInterval(timer); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
  });
}

function explainTerms() {
  modal('Что значат цифры', (body) => {
    const row = (t, d) => h('div', { style: { margin: '10px 0' } }, h('b', null, t), h('div', { class: 'muted small' }, d));
    body.append(
      row('Тоннаж', 'Сколько всего килограммов поднято за тренировку: вес × повторы × подходы по всем упражнениям. Для гантелей считаются обе.'),
      row('КПШ', 'Количество подъёмов штанги: сумма всех повторений за тренировку. Показывает объём работы без учёта веса.'),
      row('ОИ', 'Относительная интенсивность: средний рабочий вес в процентах от ПМ. 50 % — лёгкая тренировка, 70 % и выше — тяжёлая.'),
      row('Время', 'Примерная длительность вместе с отдыхом между подходами и разминкой около 30 минут. Расчёт по таблице из твоего файла.'),
      row('ПМ', 'Повторный максимум: самый большой вес, который можешь поднять один раз. От него считаются все веса в плане.'));
  });
}
