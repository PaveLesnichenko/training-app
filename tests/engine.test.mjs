// Сверка движка с кэшированными значениями Excel (tests/golden.json, из cycle1.xlsm).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOff, planDay, exercisePm, absMc, mround, dayMetrics, sumMetrics, scheduleDate, locate, bmr, nutritionTargets, weeklyRate, movingAvg } from '../src/engine.js';
import { ADDED, SLOTS, EXERCISES, sameEffortPct, DAY_ORDER, capTotalSets, MAX_ADDED_SETS } from '../src/exercises.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));
const pmState = { main: { squat: { value: 150, at: 0 }, bench: { value: 130, at: 0 }, deadlift: { value: 170, at: 0 } }, growth: 0.005 };
const disabled = Object.fromEntries(ADDED.map((a) => [a.exId, true]));
const close = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} != ${b}`);

test('mround как в Excel', () => {
  assert.equal(mround(102.0, 2.5), 102.5);
  assert.equal(mround(101.25, 2.5), 102.5); // половина — вверх
  assert.equal(mround(41.6 * 0.45, 1), 19);
  assert.equal(mround(0.5, 1), 1);
});

test('ПМ основных растёт на 0,5 % за микроцикл', () => {
  for (const [mc, v] of Object.entries(golden.pm)) {
    const abs = absMc(0, Number(mc));
    for (const key of ['squat', 'bench', 'deadlift']) close(exercisePm(key, pmState, abs), v[key], 1e-9, `${key} mc${mc}`);
  }
});

test('упражнения: ПМ, веса, тоннаж, КПШ, ОИ, Инт.Ф+Б, время', () => {
  const cache = {};
  for (const g of golden.exercises) {
    const key = `${g.mc}.${g.day}`;
    cache[key] ??= planDay({ cycle: 0, mc: g.mc, day: g.day, pmState, disabled });
    const e = cache[key].exercises.find((x) => x.exId === g.exId);
    assert.ok(e, `нет ${g.exId} в ${key}`);
    const tag = `mc${g.mc} д${g.day} ${g.exId}`;
    close(e.pm, g.pm, 1e-9, tag + ' ПМ');
    g.weights.forEach((w, i) => close(e.steps[i].weight, w, 1e-9, `${tag} вес[${i}]`));
    close(e.metrics.tonnage, g.tonnage, 1e-9, tag + ' тоннаж');
    close(e.metrics.kpsh, g.kpsh, 1e-9, tag + ' КПШ');
    close(e.metrics.intFB, g.intFB, 1e-6, tag + ' Инт.Ф+Б');
    close(e.metrics.oi, g.oi, 1e-9, tag + ' ОИ');
    close(e.metrics.minutes, g.timeDays, 1e-6, tag + ' время (мин)');
  }
});

test('дни и микроциклы: итоги', () => {
  for (const g of golden.days) {
    const d = planDay({ cycle: 0, mc: g.mc, day: g.day, pmState, disabled });
    const tag = `mc${g.mc} д${g.day}`;
    close(d.metrics.tonnage, g.tonnage, 1e-9, tag + ' тоннаж');
    close(d.metrics.kpsh, g.kpsh, 1e-9, tag + ' КПШ');
    close(d.metrics.oi, g.oi, 1e-9, tag + ' ОИ');
    close(d.metrics.intFB, g.intFB, 1e-6, tag + ' Инт.Ф+Б');
    close(d.metrics.avgK, g.avgK, 1e-9, tag + ' ср.k');
    close(d.metrics.minutes, Math.round(g.timeDays * 1440), 1, tag + ' время');
  }
  golden.microcycles.forEach((g, i) => {
    const days = [1, 2, 3].map((day) => planDay({ cycle: 0, mc: i + 1, day, pmState, disabled }).metrics);
    const s = sumMetrics(days);
    close(s.tonnage, g.tonnage, 1e-9, `mc${i + 1} тоннаж`);
    close(s.kpsh, g.kpsh, 1e-9, `mc${i + 1} КПШ`);
    close(s.oi, g.oi, 1e-9, `mc${i + 1} ОИ`);
    close(s.intFB, g.intFB, 1e-6, `mc${i + 1} Инт.Ф+Б`);
  });
});

test('первый день: цифры из ТЗ', () => {
  const d = planDay({ cycle: 0, mc: 1, day: 1, pmState, disabled });
  assert.equal(d.metrics.tonnage, 5315);
  assert.equal(d.metrics.kpsh, 88);
  assert.equal(d.exercises[0].steps[0].weight, 102.5); // 150 × 0,68
});

test('расписание Пн/Ср/Пт', () => {
  assert.equal(scheduleDate('2026-10-12', [1, 3, 5], 0), '2026-10-12');
  assert.equal(scheduleDate('2026-10-12', [1, 3, 5], 1), '2026-10-14');
  assert.equal(scheduleDate('2026-10-12', [1, 3, 5], 2), '2026-10-16');
  assert.equal(scheduleDate('2026-10-12', [1, 3, 5], 3), '2026-10-19');
  assert.equal(scheduleDate('2026-10-14', [1, 3, 5], 0), '2026-10-19'); // старт со среды -> ближайший пн
  assert.deepEqual(locate(0), { cycle: 0, mc: 1, day: 1 });
  assert.deepEqual(locate(37), { cycle: 1, mc: 1, day: 2 });
});

test('добавленные упражнения: профили выведены, веса считаются', () => {
  assert.equal(sameEffortPct(0.5, 6, 6), 0.5);
  assert.ok(sameEffortPct(0.5, 6, 12) < 0.5);
  const added = SLOTS.filter((s) => s.estimated);
  assert.equal(added.length, ADDED.length);
  for (const mc of [1, 6, 12]) {
    for (const day of [1, 2, 3]) {
      const d = planDay({ cycle: 0, mc, day, pmState });
      for (const e of d.exercises) {
        assert.ok(e.pm > 0, `ПМ ${e.exId}`);
        for (const s of e.steps) {
          assert.ok(s.reps > 0 && s.sets > 0);
          if (!e.isReps) assert.ok(s.weight > 0, `вес ${e.exId}`);
          if (!e.isReps) assert.ok(s.pct < 1, `процент <100 % у ${e.exId}: ${s.pct}`);
        }
      }
    }
  }
});

test('питание: профицит ровно по выбранному темпу, шаг между темпами 100 ккал', () => {
  const p = { sex: 'm', weight: 73, height: 175, age: 29, activity: 'low', goal: 'gain' };
  assert.equal(Math.round(bmr(p)), 1684); // 10·73 + 6,25·175 − 5·29 + 5
  const k = (pace, o) => nutritionTargets({ ...p, pace }, o);
  assert.equal(k('slow').tdee, 2273);
  assert.equal(k('slow').kcal, 2273 + 250);
  assert.equal(k('moderate').kcal, 2273 + 350);
  assert.equal(k('fast').kcal, 2273 + 450);
  assert.equal(k('moderate').kcal - k('slow').kcal, 100);
  assert.equal(k('fast').kcal - k('moderate').kcal, 100);
  assert.equal(k('moderate', { trainingDay: true }).kcal, k('moderate', { trainingDay: false }).kcal, 'по умолчанию без разницы по дням');
  const t = k('moderate');
  assert.equal(t.protein, 131);
  assert.ok(Math.abs(t.protein * 4 + t.fat * 9 + t.carbs * 4 - t.kcal) < 6);
  assert.ok(t.fat * 9 >= t.kcal * 0.195);
  // кардио: доля расхода, коррекция по весу
  assert.equal(k('moderate', { cardioKcalToday: 200, cardioShare: 0.5, adjust: -150 }).kcal, t.kcal + 100 - 150);
  // разделение по дням сохраняет недельную сумму
  const week = 3 * k('moderate', { dayBoost: true, trainingDay: true }).kcal + 4 * k('moderate', { dayBoost: true }).kcal;
  assert.ok(Math.abs(week / 7 - t.kcal) < 2);
  assert.ok(k('moderate', { dayBoost: true, trainingDay: true }).kcal > k('moderate', { dayBoost: true }).kcal);
  assert.equal(nutritionTargets({ ...p, goal: 'cut' }).kcal, 2273 - 500);
  assert.equal(nutritionTargets({ ...p, sex: 'f' }).bmr, Math.round(bmr(p) - 166));
});

test('тренд веса', () => {
  const pts = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, kg: 80 + i * 0.05 }));
  assert.equal(weeklyRate(pts), 0.35);
  assert.equal(movingAvg(pts).length, 14);
});

test('порядок упражнений: все слоты в DAY_ORDER, базовые в начале', () => {
  for (const day of [1, 2, 3]) {
    const ids = SLOTS.filter((s) => s.day === day).map((s) => s.exId);
    for (const id of ids) assert.ok(DAY_ORDER[day].includes(id), `${id} не в порядке дня ${day}`);
    const order = ids.map((id) => DAY_ORDER[day].indexOf(id));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `порядок дня ${day}`);
  }
  assert.deepEqual(SLOTS.filter((s) => s.day === 1).slice(0, 2).map((s) => s.exId), ['squat', 'bench']);
});

test('жим гантелей сидя выключен по умолчанию, но включается явно', () => {
  assert.equal(isOff('db_ohp_seated', {}), true);
  assert.equal(isOff('db_ohp_seated', { db_ohp_seated: false }), false);
  assert.equal(isOff('calf_raise', {}), false);
  assert.equal(isOff('calf_raise', { calf_raise: true }), true);
  const names = (disabled) => planDay({ cycle: 0, mc: 1, day: 2, pmState, disabled }).exercises.map((e) => e.exId);
  assert.ok(!names({}).includes('db_ohp_seated'));
  assert.ok(names({ db_ohp_seated: false }).includes('db_ohp_seated'));
});

test('прирост ПМ влияет на будущие микроциклы', () => {
  const grown = { ...pmState, growth: 0.015 };
  const w0 = planDay({ cycle: 0, mc: 12, day: 1, pmState }).exercises[0].pm;
  const w1 = planDay({ cycle: 0, mc: 12, day: 1, pmState: grown }).exercises[0].pm;
  close(w0, 150 * 1.005 ** 11, 1e-9); close(w1, 150 * 1.015 ** 11, 1e-9);
  assert.ok(w1 > w0);
});

test('добавленные упражнения: не больше 3 подходов, рабочие подходы сохраняются', () => {
  assert.deepEqual(capTotalSets([[0.5, 6, 1], [0.6, 5, 1], [0.7, 4, 4]]), [[0.7, 4, 3]]);
  assert.deepEqual(capTotalSets([[0.5, 6, 5]]), [[0.5, 6, 3]]);
  assert.deepEqual(capTotalSets([[0.5, 6, 2]]), [[0.5, 6, 2]]);
  for (const slot of SLOTS.filter((s) => s.estimated)) {
    for (const steps of slot.profile) assert.ok(steps.reduce((t, st) => t + st[2], 0) <= MAX_ADDED_SETS, slot.exId);
  }
});
