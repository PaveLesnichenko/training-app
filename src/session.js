// Состояние тренировочного процесса: расписание, снимки планов, факт, статусы, сводки.
import { state, save } from './store.js';
import * as E from './engine.js';
import { SLOTS, EX_BY_ID, MAIN } from './exercises.js';

export const hasPm = () => E.MAIN.every((k) => state.pm.main[k]?.value > 0);
export const isSetUp = () => hasPm() && !!state.settings.startDate;
const MAX_CYCLES = 3;

export function latestWeight() {
  const w = state.weights[state.weights.length - 1];
  return w?.kg ?? state.settings.profile.weight ?? null;
}

// ---------- расписание ----------
export function dayInfo(n) {
  const { cycle, mc, day } = E.locate(n);
  const key = E.workoutKey(cycle, mc, day);
  const wk = state.workouts[key];
  const date = wk?.date || E.scheduleDate(state.settings.startDate || E.todayStr(), state.settings.weekdays, n);
  return { n, cycle, mc, day, key, date, wk };
}

export function allDays(cycles = MAX_CYCLES) {
  const out = [];
  for (let n = 0; n < cycles * E.DAYS_PER_CYCLE; n++) out.push(dayInfo(n));
  return out;
}

// Перед сменой дней недели или даты старта «закрепляем» даты тренировок, по которым уже есть отметки:
// прошлое не должно сдвигаться вместе с расписанием.
export function freezeDates() {
  let changed = false;
  for (const info of allDays()) {
    const wk = info.wk;
    if (wk && !wk.date && Object.values(wk.ex || {}).some((r) => r.status)) { wk.date = info.date; changed = true; }
  }
  if (changed) save('workouts');
}

export function workoutOnDate(dateStr) {
  if (!state.settings.startDate) return null;
  for (let n = 0; n < MAX_CYCLES * E.DAYS_PER_CYCLE; n++) {
    const info = dayInfo(n);
    if (info.date === dateStr) return info;
  }
  return null;
}

// Когда тренировка реально выполнялась: день первой отметки. Если её сделали раньше срока (или позже), плановая дата не совпадает.
export function performedDate(info) {
  const marked = info.wk && Object.values(info.wk.ex || {}).some((r) => r.status);
  return marked && info.wk.snapshotAt ? E.dateOf(info.wk.snapshotAt) : info.date;
}

// ---------- план дня ----------
export function planFor(cycle, mc, day) {
  const key = E.workoutKey(cycle, mc, day);
  const wk = state.workouts[key];
  if (wk?.snapshot) {
    const exercises = wk.snapshot.map((e) => {
      const copy = { ...e, steps: e.steps.map((s) => ({ ...s })) };
      copy.metrics = { ...E.exerciseMetrics(copy), k: copy.k };
      return copy;
    });
    return { cycle, mc, day, exercises, metrics: E.dayMetrics(exercises.map((x) => x.metrics), true), frozen: true };
  }
  return { ...E.planDay({ cycle, mc, day, pmState: state.pm, disabled: state.settings.disabled }), frozen: false };
}

export function ensureWorkout(key) {
  state.workouts[key] ??= { ex: {} };
  return state.workouts[key];
}

// Фиксируем веса дня на момент первой отметки: смена ПМ позже не меняет прошедшие тренировки.
export function freezePlan(cycle, mc, day) {
  const key = E.workoutKey(cycle, mc, day);
  const wk = ensureWorkout(key);
  if (!wk.snapshot) {
    const plan = E.planDay({ cycle, mc, day, pmState: state.pm, disabled: state.settings.disabled });
    wk.snapshot = plan.exercises.map(({ metrics, ...rest }) => rest);
    wk.snapshotAt = Date.now();
  }
  return wk;
}

export function unfreezePlan(cycle, mc, day) {
  const wk = state.workouts[E.workoutKey(cycle, mc, day)];
  if (wk && !Object.values(wk.ex).some((r) => r.status)) { delete wk.snapshot; delete wk.snapshotAt; save('workouts'); }
}

// ---------- факт ----------
export function exerciseRecord(wk, slotId) { return wk?.ex?.[slotId] || null; }

export function actualSteps(planned, rec) {
  if (!rec?.status || rec.status === 'skipped') return [];
  if (rec.status === 'done' && !rec.steps) return planned.steps;
  return rec.steps || planned.steps;
}

export function dayStatus(info, plan) {
  const wk = info.wk;
  const total = plan.exercises.length;
  const recs = plan.exercises.map((e) => wk?.ex?.[e.slotId]?.status).filter(Boolean);
  if (!recs.length && !wk?.closed) return E_PLANNED(info);
  if (recs.length < total && !wk?.closed) return 'progress';
  return recs.every((s) => s === 'done') ? 'done' : 'partial';
}
const E_PLANNED = (info) => (info.date < E.todayStr() ? 'missed' : 'planned');
export const STATUS = {
  planned: { icon: '○', text: 'впереди', cls: '' },
  missed: { icon: '!', text: 'не начата', cls: 'warn' },
  progress: { icon: '◐', text: 'в процессе', cls: 'accent' },
  done: { icon: '✓', text: 'выполнена', cls: 'ok' },
  partial: { icon: '✓', text: 'с отклонениями', cls: 'warn' },
};

export function factDayMetrics(plan, wk) {
  const list = plan.exercises.map((e) => {
    const steps = actualSteps(e, exerciseRecord(wk, e.slotId));
    return steps.length ? E.factMetrics(e, steps) : null;
  }).filter(Boolean);
  return E.dayMetrics(list, false);
}

export function adherence(plan, wk) {
  const total = plan.exercises.length;
  let done = 0, partial = 0, skipped = 0;
  for (const e of plan.exercises) {
    const s = exerciseRecord(wk, e.slotId)?.status;
    if (s === 'done') done++; else if (s === 'partial') partial++; else if (s === 'skipped') skipped++;
  }
  return { total, done, partial, skipped, marked: done + partial + skipped };
}

// ---------- текущая позиция ----------
export function nextWorkout() {
  const today = E.todayStr();
  const days = allDays();
  const open = (d) => {
    const plan = planFor(d.cycle, d.mc, d.day);
    const st = dayStatus(d, plan);
    return st === 'planned' || st === 'missed' || st === 'progress';
  };
  return days.find((d) => d.date === today && open(d)) || days.find(open) || days[days.length - 1];
}

// ---------- кардио ----------
export function cardioPlan(info) {
  const s = state.settings;
  if (!s.cardioOn) return null;
  const wk = info.wk?.cardio || {};
  const minutes = wk.plannedMinutes ?? E.cardioMinutes(info.mc, s.cardioBase);
  const type = wk.type || s.cardioType;
  return { minutes, type, kcal: E.cardioKcal(type, minutes, latestWeight() || 80) };
}
export function cardioKcalOn(dateStr) {
  const info = workoutOnDate(dateStr);
  if (!info || !state.settings.cardioOn) return 0;
  const c = info.wk?.cardio;
  const plan = cardioPlan(info);
  if (c?.done === false) return 0;
  const minutes = c?.done ? (c.minutes ?? plan.minutes) : plan.minutes;
  return E.cardioKcal(c?.type || plan.type, minutes, latestWeight() || 80);
}

// ---------- питание: цели на дату ----------
export function targetsFor(dateStr) {
  const p = { ...state.settings.profile, weight: latestWeight() };
  if (!(p.weight > 0 && p.height > 0 && p.age > 0)) return null;
  const trainingDay = !!workoutOnDate(dateStr) || state.settings.weekdays.includes(E.weekday(dateStr));
  return E.nutritionTargets(p, { trainingDay, cardioKcalToday: cardioKcalOn(dateStr), cardioShare: state.settings.cardioShare, adjust: state.settings.kcalAdjust || 0, dayBoost: !!state.settings.dayBoost });
}

// Базовая цель без кардио и без разделения по дням: от неё считается универсальное меню.
export function baseTargets() {
  const p = { ...state.settings.profile, weight: latestWeight() };
  if (!(p.weight > 0 && p.height > 0 && p.age > 0)) return null;
  return E.nutritionTargets(p, { adjust: state.settings.kcalAdjust || 0 });
}

// ---------- подсказки по ПМ ----------
export function pmSuggestions() {
  const best = {};
  for (const info of allDays()) {
    const wk = info.wk; if (!wk) continue;
    for (const rec of Object.values(wk.ex)) {
      if (!rec.exId || !MAIN.includes(rec.exId) || !rec.status || rec.status === 'skipped') continue;
      const sn = wk.snapshot?.find((e) => e.exId === rec.exId);
      const steps = rec.steps || sn?.steps || [];
      for (const s of steps) {
        const w = Number(s.weight), r = Number(s.reps);
        if (!w || !r || r > 8) continue;
        const est = E.e1rm(w, r);
        const abs = E.absMc(info.cycle, info.mc);
        const pm = E.exercisePm(rec.exId, state.pm, abs);
        if (pm && est > pm * 1.03 && (!best[rec.exId] || est > best[rec.exId].est)) best[rec.exId] = { exId: rec.exId, est, w, r, pm, date: info.date, abs };
      }
    }
  }
  return Object.values(best);
}

// ---------- сводка микроцикла ----------
export function microcycleSummary(cycle, mc) {
  const plans = [], facts = [];
  let done = 0, total = 0;
  for (let day = 1; day <= E.DAYS_PER_MC; day++) {
    const info = dayInfo(E.dayIndex(cycle, mc, day));
    const plan = planFor(cycle, mc, day);
    plans.push(plan.metrics);
    facts.push(factDayMetrics(plan, info.wk));
    const a = adherence(plan, info.wk);
    done += a.done + a.partial; total += a.total;
  }
  return { plan: E.sumMetrics(plans), fact: E.sumMetrics(facts), done, total };
}

export { SLOTS, EX_BY_ID };
