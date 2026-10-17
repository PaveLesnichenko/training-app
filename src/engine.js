// Расчётное ядро: веса, показатели (тоннаж, КПШ, ОИ, Инт.Ф+Б, время), расписание, кардио, питание.
// Без DOM и хранилища — тестируется в Node (tests/engine.test.mjs) по значениям из Excel.
import { INT_TABLE, TIME_K, TIME_ROWS, WARMUP_MIN, TIME_CORR } from './data/tables.js';
import { EX_BY_ID, SLOTS, MAIN, repsForStep } from './exercises.js';

export const MICROCYCLES = 12;
export const DAYS_PER_MC = 3;
export const DAYS_PER_CYCLE = MICROCYCLES * DAYS_PER_MC;
export const DEFAULT_GROWTH = 0.005; // прирост ПМ за микроцикл (ячейка AH в заголовке микроцикла)

// ---------- числа ----------
// Как MROUND в Excel: до ближайшего кратного, половина — от нуля.
export function mround(x, step) {
  if (!isFinite(x)) return 0;
  const q = x / step;
  const r = Math.sign(q) * Math.floor(Math.abs(q) + 0.5 + 1e-9);
  return Math.round(r * step * 1000) / 1000;
}
const round = (x, d = 1) => { const f = 10 ** d; return Math.round(x * f) / f; };

// VLOOKUP(x, таблица, 2, ИСТИНА): последнее значение ≤ x
function lookupApprox(table, x) {
  let res = null;
  for (const [a, b] of table) { if (a <= x + 1e-12) res = b; else break; }
  return res;
}

export const intCoef = (ratio) => lookupApprox(INT_TABLE, ratio) ?? 0;

export function setMinutes(ratio, k) {
  const ri = TIME_ROWS.reduce((acc, [thr], i) => (thr <= ratio + 1e-12 ? i : acc), -1);
  const ci = TIME_K.reduce((acc, thr, i) => (thr <= k + 1e-12 ? i : acc), -1);
  if (ri < 0 || ci < 0) return 0;
  return TIME_ROWS[ri][1][ci] * TIME_CORR;
}

export const e1rm = (w, reps) => (reps <= 1 ? w : w * (1 + reps / 30)); // формула Эпли

// ---------- ПМ ----------
// pmState = { main: {squat:{value, at}, bench:{...}, deadlift:{...}}, growth, coefs:{exId:number}, own:{exId:number} }
// at — абсолютный индекс микроцикла (0 = 1-й микроцикл 1-го цикла), для которого введено value.
export function absMc(cycle, mc) { return cycle * MICROCYCLES + (mc - 1); }

export function mainPm(pmState, key, abs) {
  const e = pmState.main?.[key];
  if (!e || !e.value) return null;
  const g = pmState.growth ?? DEFAULT_GROWTH;
  return e.value * (1 + g) ** (abs - (e.at ?? 0));
}

export function exercisePm(exId, pmState, abs) {
  const ex = EX_BY_ID[exId];
  if (ex.pm.main) return mainPm(pmState, exId, abs);
  if (ex.pm.own) return pmState.own?.[exId] ?? ex.pm.default ?? null;
  if (pmState.own?.[exId]) return pmState.own[exId]; // пробный подход перекрывает коэффициент
  const base = mainPm(pmState, ex.pm.base, abs);
  if (base == null) return null;
  const coef = pmState.coefs?.[exId] ?? ex.pm.coef;
  return base * coef;
}

// ---------- упражнение в дне ----------
export function planExercise(slot, mcIdx, pm, opts = {}) {
  const ex = EX_BY_ID[slot.exId];
  const profile = slot.profile[mcIdx] || [];
  const isReps = ex.type === 'reps' || slot.mode === 'reps';
  const steps = profile.map(([pct, reps, sets]) => {
    if (isReps) {
      const r = pm ? repsForStep(pct, pm, slot.repsRange) : reps;
      return { pct, reps: r, sets, weight: null };
    }
    const weight = pm ? mround(pm * pct, ex.step) : null;
    return { pct, reps, sets, weight };
  });
  return { slotId: slot.slotId, exId: slot.exId, load: slot.load, k: slot.k, mult: slot.mult, step: ex.step,
    pm, steps, isReps, estimated: !!slot.estimated };
}

// Показатели по набору подходов [{weight, reps, sets}] (вес — на один снаряд, множитель учитывается здесь)
export function exerciseMetrics({ steps, pm, k, mult, isReps }) {
  const m = { tonnage: 0, kpsh: 0, intFB: 0, minutes: 0, avgWeight: 0, oi: 0 };
  for (const s of steps) {
    const sets = Number(s.sets) || 0, reps = Number(s.reps) || 0;
    if (!sets || !reps) continue;
    if (isReps || s.weight == null || s.weight === '') {
      m.minutes += sets * setMinutes(0.6, k);
      continue;
    }
    const w = Number(s.weight);
    m.tonnage += w * reps * sets * mult;
    m.kpsh += reps * sets;
    if (pm) {
      m.intFB += intCoef(w / pm) * w * reps * sets * k * mult;
      m.minutes += sets * setMinutes(w / pm, k);
    }
  }
  if (m.kpsh) {
    m.avgWeight = m.tonnage / m.kpsh;
    m.oi = pm ? m.avgWeight / (pm * mult) : 0;
  }
  return m;
}

export function sumMetrics(list) {
  const out = { tonnage: 0, kpsh: 0, intFB: 0, minutes: 0, oi: 0, avgK: 0, avgWeight: 0 };
  let oiW = 0, kW = 0;
  for (const m of list) {
    out.tonnage += m.tonnage; out.kpsh += m.kpsh; out.intFB += m.intFB; out.minutes += m.minutes;
    oiW += (m.oi || 0) * m.kpsh; kW += (m.k || 0) * m.kpsh;
  }
  if (out.kpsh) { out.oi = oiW / out.kpsh; out.avgK = round(kW / out.kpsh, 3); out.avgWeight = out.tonnage / out.kpsh; }
  return out;
}

// ---------- день ----------
// Упражнение выключено явно (true) или по умолчанию (defaultOff), пока пользователь не включил его (false).
export const isOff = (exId, disabled = {}) => disabled[exId] === true || (disabled[exId] === undefined && !!EX_BY_ID[exId]?.defaultOff);

export function slotsForDay(day, disabled = {}, extraSlots = []) {
  return [...SLOTS, ...extraSlots].filter((s) => s.day === day && !isOff(s.exId, disabled));
}

export function planDay({ cycle, mc, day, pmState, disabled, extraSlots }) {
  const abs = absMc(cycle, mc);
  const slots = slotsForDay(day, disabled, extraSlots);
  const exercises = slots.map((slot) => {
    const pm = exercisePm(slot.exId, pmState, abs);
    const e = planExercise(slot, mc - 1, pm);
    e.metrics = { ...exerciseMetrics(e), k: e.k };
    return e;
  });
  return { cycle, mc, day, exercises, metrics: dayMetrics(exercises.map((e) => e.metrics), true) };
}

export function dayMetrics(list, withWarmup) {
  const s = sumMetrics(list);
  if (withWarmup && s.minutes > 0) s.minutes += WARMUP_MIN;
  s.minutes = Math.round(s.minutes);
  return s;
}

// Факт: actual — [{weight, reps, sets}] по упражнению
export function factMetrics(planned, actualSteps) {
  const m = exerciseMetrics({ steps: actualSteps, pm: planned.pm, k: planned.k, mult: planned.mult, isReps: planned.isReps });
  return { ...m, k: planned.k };
}

// ---------- расписание ----------
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function fmtDate(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(s, n) { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return fmtDate(d); }
export function weekday(s) { return parseDate(s).getUTCDay(); }
// Дата (локальная, ГГГГ-ММ-ДД) по метке времени
export function dateOf(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Индекс дня внутри макроцикла (0…35) → { cycle, mc, day }
export function locate(n) {
  const cycle = Math.floor(n / DAYS_PER_CYCLE), r = n % DAYS_PER_CYCLE;
  return { cycle, mc: Math.floor(r / DAYS_PER_MC) + 1, day: (r % DAYS_PER_MC) + 1 };
}
export const dayIndex = (cycle, mc, day) => cycle * DAYS_PER_CYCLE + (mc - 1) * DAYS_PER_MC + (day - 1);
export const workoutKey = (cycle, mc, day) => `${cycle}.${mc}.${day}`;

// weekdays — например [1, 3, 5] (пн, ср, пт). startDate приводится к ближайшему такому дню вперёд.
export function scheduleDate(startDate, weekdays, n) {
  let first = startDate;
  while (weekday(first) !== weekdays[0]) first = addDays(first, 1);
  const week = Math.floor(n / weekdays.length), i = n % weekdays.length;
  const offset = (weekdays[i] - weekdays[0] + 7) % 7;
  return addDays(first, week * 7 + offset);
}

// ---------- кардио ----------
export const CARDIO_TYPES = {
  walk: { name: 'Ходьба по дорожке', met: 3.8 },
  incline: { name: 'Ходьба в горку', met: 6.0 },
  jog: { name: 'Лёгкий бег', met: 8.3 },
};
export function cardioMinutes(mc, base = 20, cap = 40) { return Math.min(cap, base + 5 * Math.floor((mc - 1) / 2)); }
export function cardioKcal(type, minutes, weightKg) {
  const met = CARDIO_TYPES[type]?.met ?? 5;
  return Math.round(met * weightKg * (minutes / 60));
}
export const hrZone2 = (age) => { const mx = 220 - age; return [Math.round(mx * 0.6), Math.round(mx * 0.7)]; };

// ---------- питание ----------
export const ACTIVITY = { low: 1.35, medium: 1.45, high: 1.55 };
export const PACE = { slow: 250, moderate: 350, fast: 450 };

export function bmr({ sex, weight, height, age }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'f' ? -161 : 5);
}

// Цель по калориям и БЖУ.
// Калории = суточный расход + профицит (по выбранному темпу, ровно столько ккал) + коррекция по весу + доля кардио.
// dayBoost (по умолчанию выключен): +5 % в тренировочные дни и меньше в дни отдыха, недельная сумма та же.
export function nutritionTargets(p, { trainingDay = false, cardioKcalToday = 0, cardioShare = 0.5, adjust = 0, dayBoost = false } = {}) {
  const tdee = bmr(p) * (ACTIVITY[p.activity] ?? 1.45);
  let surplus = 0;
  if (p.goal === 'gain') surplus = PACE[p.pace] ?? PACE.moderate;
  if (p.goal === 'cut') surplus = -500;
  const avg = tdee + surplus + adjust;
  const dayFactor = !dayBoost ? 1 : trainingDay ? 1.05 : (7 - 3 * 1.05) / 4;
  const cardio = Math.round(cardioKcalToday * cardioShare);
  const kcal = Math.round(avg * dayFactor + cardio);
  const protein = Math.round(p.weight * (p.goal === 'cut' ? 2.0 : 1.8));
  const fat = Math.round(Math.max(p.weight * (p.goal === 'cut' ? 0.8 : 0.9), (kcal * 0.2) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    kcal, protein, fat, carbs, fiber: Math.round((kcal / 1000) * 14), waterL: Math.round(p.weight * 35) / 1000,
    bmr: Math.round(bmr(p)), tdee: Math.round(tdee), surplus, adjust, cardio, dayFactor,
    surplusPct: Math.round((surplus / tdee) * 1000) / 10,
  };
}

// ---------- вес тела ----------
export function movingAvg(points, window = 7) {
  // points: [{date, kg}] по возрастанию даты
  return points.map((p, i) => {
    const from = addDays(p.date, -(window - 1));
    const slice = points.filter((q, j) => j <= i && q.date >= from);
    return { date: p.date, kg: round(slice.reduce((s, q) => s + q.kg, 0) / slice.length, 2) };
  });
}

// Недельный темп (кг/нед) — наклон прямой по последним days дням
export function weeklyRate(points, days = 14) {
  if (points.length < 2) return null;
  const last = points[points.length - 1].date;
  const from = addDays(last, -(days - 1));
  const pts = points.filter((p) => p.date >= from);
  if (pts.length < 3) return null;
  const t0 = parseDate(pts[0].date).getTime();
  const xs = pts.map((p) => (parseDate(p.date).getTime() - t0) / 86400000);
  const ys = pts.map((p) => p.kg);
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (!den) return null;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den;
  return round(slope * 7, 2);
}

// Рекомендация по калориям на основе темпа набора
export function calorieAdvice(rateKgWeek0, weight, goal) {
  if (rateKgWeek0 == null) return null;
  const pct0 = (rateKgWeek0 / weight) * 100;
  const rateKgWeek = String(rateKgWeek0).replace('.', ',');
  const pct = pct0;
  if (goal === 'gain') {
    if (pct < 0.1) return { delta: +150, text: `Набор ${rateKgWeek} кг/нед (${String(round(pct, 2)).replace('.', ',')} %) — медленнее цели. Добавь ~150 ккал.` };
    if (pct > 0.75) return { delta: -150, text: `Набор ${rateKgWeek} кг/нед (${String(round(pct, 2)).replace('.', ',')} %) — быстро, много уйдёт в жир. Убери ~150 ккал.` };
    return { delta: 0, text: `Набор ${rateKgWeek} кг/нед (${String(round(pct, 2)).replace('.', ',')} %) — в целевом диапазоне.` };
  }
  if (goal === 'cut') {
    if (pct > -0.25) return { delta: -150, text: `Снижение ${rateKgWeek} кг/нед — медленнее цели. Убери ~150 ккал.` };
    if (pct < -1) return { delta: +150, text: `Снижение ${rateKgWeek} кг/нед — слишком быстро. Добавь ~150 ккал.` };
    return { delta: 0, text: `Снижение ${rateKgWeek} кг/нед — в целевом диапазоне.` };
  }
  return { delta: 0, text: `Изменение веса ${rateKgWeek} кг/нед.` };
}

export { MAIN };
