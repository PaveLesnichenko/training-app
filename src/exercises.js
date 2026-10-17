// Каталог упражнений: 11 из файла + добавленные (с выведенными профилями нагрузки).
import { BASE_SLOTS } from './data/program.js';

export const MAIN = ['squat', 'bench', 'deadlift'];
export const MAIN_NAMES = { squat: 'Присед', bench: 'Жим лёжа', deadlift: 'Становая тяга' };

// pm: { base, coef } — ПМ = ПМ основного × coef; { own: true } — ПМ задаёт пользователь.
// Для упражнений на повторения (type 'reps') ПМ = максимум повторов.
// estimated: коэффициент / профиль — оценка, а не данные файла.
export const EXERCISES = [
  // ---- из файла ----
  { id: 'squat', name: 'Присед', group: 'ПР', k: 1.2, mult: 1, step: 2.5, pm: { main: true } },
  { id: 'bench', name: 'Жим лёжа', group: 'ЖМ', k: 1, mult: 1, step: 2.5, pm: { main: true } },
  { id: 'deadlift', name: 'Становая тяга', group: 'ТГ', k: 1.4, mult: 1, step: 2.5, pm: { main: true } },
  { id: 'front_squat', name: 'Присед на груди', group: 'ПР', k: 1.2, mult: 1, step: 2.5, pm: { base: 'squat', coef: 0.75 } },
  { id: 'db_bench', name: 'Жим гантелей', group: 'ЖМ', k: 1, mult: 2, step: 1, pm: { base: 'bench', coef: 0.32 }, hint: 'вес одной гантели' },
  { id: 'db_tri_ext', name: 'Разгибание с гантелью из-за головы', group: 'ОФП', k: 0.3, mult: 2, step: 1, pm: { base: 'bench', coef: 0.13 } },
  { id: 'good_morning', name: 'Наклоны со штангой', group: 'ТГ', k: 1, mult: 1, step: 2.5, pm: { base: 'deadlift', coef: 0.55 } },
  { id: 'ohp', name: 'Жим стоя', group: 'ОФП', k: 0.8, mult: 1, step: 2.5, pm: { base: 'bench', coef: 0.6 } },
  { id: 'wide_squat', name: 'Присед в широкой постановке', group: 'ПР', k: 1.2, mult: 1, step: 2.5, pm: { base: 'squat', coef: 0.875 } },
  { id: 'french_press', name: 'Французский жим', group: 'ОФП', k: 0.5, mult: 1, step: 2.5, pm: { base: 'bench', coef: 0.46 } },
  { id: 'bb_curl', name: 'Бицепс стоя', group: 'ОФП', k: 0.5, mult: 1, step: 2.5, pm: { base: 'bench', coef: 0.35 } },
  // ---- добавленные: ПМ — оценка по типичным соотношениям, уточняется пробным подходом ----
  { id: 'leg_curl', name: 'Сгибание ног лёжа', group: 'НГ', k: 0.3, mult: 1, step: 2.5, pm: { base: 'squat', coef: 0.35 }, estimated: true },
  { id: 'lat_pulldown', name: 'Тяга верхнего блока', group: 'СП', k: 0.5, mult: 1, step: 2.5, pm: { base: 'bench', coef: 0.65 }, estimated: true },
  { id: 'calf_raise', name: 'Подъём на икры', group: 'НГ', k: 0.3, mult: 1, step: 2.5, pm: { base: 'squat', coef: 0.6 }, estimated: true },
  { id: 'pullup', name: 'Подтягивания', group: 'СП', k: 1.2, mult: 1, step: 1, type: 'reps', pm: { own: true, default: 8 }, estimated: true, hint: 'ПМ = максимум повторов' },
  { id: 'db_row', name: 'Тяга гантели к животу', group: 'СП', k: 1.1, mult: 1, step: 1, pm: { base: 'bench', coef: 0.35 }, estimated: true, hint: 'вес одной гантели' },
  { id: 'db_ohp_seated', name: 'Жим гантелей сидя', group: 'ПЛ', k: 0.8, mult: 2, step: 1, pm: { base: 'bench', coef: 0.32 }, hint: 'вес одной гантели', defaultOff: true },
  { id: 'back_ext', name: 'Гиперэкстензия', group: 'КОР', k: 0.3, mult: 1, step: 1, type: 'reps', pm: { own: true, default: 20 }, estimated: true, hint: 'ПМ = максимум повторов' },
  { id: 'leg_press', name: 'Жим ногами', group: 'НГ', k: 1, mult: 1, step: 5, pm: { base: 'squat', coef: 1.8 }, estimated: true },
  { id: 'lunge', name: 'Выпады с гантелями', group: 'НГ', k: 1, mult: 2, step: 1, pm: { base: 'squat', coef: 0.27 }, estimated: true, hint: 'вес одной гантели' },
  { id: 'lateral_raise', name: 'Махи гантелями в стороны', group: 'ПЛ', k: 0.3, mult: 2, step: 1, pm: { base: 'bench', coef: 0.11 }, estimated: true, hint: 'вес одной гантели' },
  { id: 'upright_row', name: 'Тяга к подбородку', group: 'ПЛ', k: 0.5, mult: 1, step: 2.5, pm: { base: 'bench', coef: 0.42 }, estimated: true },
  { id: 'abs', name: 'Пресс', group: 'КОР', k: 0.3, mult: 1, step: 1, type: 'reps', pm: { own: true, default: 25 }, estimated: true, hint: 'ПМ = максимум повторов' },
];

// Как выводится профиль нагрузки добавленного упражнения.
// ref — слот из файла (день + упражнение), от него берём «волну» процентов и число подходов.
// repShift — на сколько повторов больше, чем в образце. Процент пересчитывается так, чтобы
// усилие подхода не изменилось: p' = p × (1 + r/30) / (1 + r'/30)  (формула Эпли).
export const ADDED = [
  { day: 1, exId: 'leg_curl', load: 'Средняя', ref: [1, 'db_tri_ext'], repShift: 4 },
  { day: 1, exId: 'lat_pulldown', load: 'Средняя', ref: [2, 'good_morning'], repShift: 2 },
  { day: 1, exId: 'calf_raise', load: 'Легкая', ref: [3, 'french_press'], repShift: 7 },
  { day: 2, exId: 'pullup', load: 'Средняя', ref: [2, 'good_morning'], mode: 'reps' },
  { day: 2, exId: 'db_row', load: 'Средняя', ref: [1, 'db_bench'], repShift: 3 },
  { day: 2, exId: 'db_ohp_seated', load: 'Легкая', ref: [2, 'ohp'], repShift: 1 },
  { day: 2, exId: 'back_ext', load: 'Легкая', ref: [2, 'ohp'], mode: 'reps' },
  { day: 3, exId: 'leg_press', load: 'Средняя', ref: [3, 'wide_squat'], repShift: 4 },
  { day: 2, exId: 'lunge', load: 'Легкая', ref: [3, 'wide_squat'], repShift: 4 },
  { day: 3, exId: 'lateral_raise', load: 'Легкая', ref: [3, 'bb_curl'], repShift: 6 },
  { day: 3, exId: 'upright_row', load: 'Легкая', ref: [3, 'french_press'], repShift: 4 },
  { day: 3, exId: 'abs', load: 'Легкая', ref: [3, 'french_press'], mode: 'reps' },
];

// Порядок упражнений в каждом дне. Принципы:
//  1) сначала базовые движения, как в файле (ноги и жим чередуются);
//  2) тяга (подтягивания, блок) ставится после жима: антагонист, плечи отдыхают;
//  3) односуставная работа и мелкие группы идут в конце, икры и пресс последними;
//  4) тяга к подбородку — после махов и подальше от тяжёлого жима.
export const DAY_ORDER = {
  1: ['squat', 'bench', 'front_squat', 'lat_pulldown', 'db_bench', 'db_tri_ext', 'leg_curl', 'calf_raise'],
  2: ['deadlift', 'bench', 'pullup', 'good_morning', 'ohp', 'db_ohp_seated', 'db_row', 'lunge', 'back_ext'],
  3: ['squat', 'bench', 'wide_squat', 'leg_press', 'french_press', 'bb_curl', 'lateral_raise', 'upright_row', 'abs'],
};

const round2 = (x) => Math.round(x * 100) / 100;

// Эквивалентный процент при другом числе повторов (то же усилие).
export function sameEffortPct(pct, reps, newReps) {
  return round2((pct * (1 + reps / 30)) / (1 + newReps / 30));
}

export function deriveProfile(refProfile, def) {
  return refProfile.map((steps) => {
    if (def.mode === 'reps') return steps; // процент трактуется как доля от максимума повторов (см. repsForStep)
    return steps.map(([p, r, s]) => [sameEffortPct(p, r, r + def.repShift), r + def.repShift, s]);
  });
}

// Для упражнений на повторения: доля от максимума повторов = 0.55…0.8 по «волне» образца.
export function repsForStep(pct, maxReps, range) {
  const [lo, hi] = range;
  const t = hi > lo ? (pct - lo) / (hi - lo) : 0.5;
  const q = 0.55 + 0.25 * Math.min(1, Math.max(0, t));
  return Math.max(1, Math.round(maxReps * q));
}

// Вспомогательные (добавленные) упражнения: не больше MAX_ADDED_SETS подходов за упражнение.
// Лишние подходы убираем из ранних (лёгких) ступеней, рабочие подходы остаются.
export const MAX_ADDED_SETS = 3;
export function capTotalSets(steps, cap = MAX_ADDED_SETS) {
  const out = steps.map(([p, r, s]) => [p, r, s]);
  let extra = out.reduce((t, st) => t + st[2], 0) - cap;
  for (let i = 0; i < out.length && extra > 0; i++) {
    const cut = Math.min(out[i][2], extra);
    out[i][2] -= cut; extra -= cut;
  }
  return out.filter((st) => st[2] > 0);
}

export function buildSlots() {
  const slots = BASE_SLOTS.map((s, i) => ({ ...s, slotId: `s${i}`, estimated: false }));
  ADDED.forEach((def, i) => {
    const ex = EXERCISES.find((e) => e.id === def.exId);
    const ref = BASE_SLOTS.find((s) => s.day === def.ref[0] && s.exId === def.ref[1]);
    const pcts = ref.profile.flat().map((st) => st[0]);
    const slot = {
      slotId: `a${i}`, day: def.day, exId: def.exId, load: def.load, group: ex.group, k: ex.k, mult: ex.mult,
      profile: deriveProfile(ref.profile, def).map((steps) => capTotalSets(steps)), estimated: true, mode: def.mode || 'weight',
      repsRange: [Math.min(...pcts), Math.max(...pcts)],
    };
    slots.push(slot);
  });
  const rank = (s) => { const i = DAY_ORDER[s.day].indexOf(s.exId); return i < 0 ? 99 : i; };
  return slots.sort((a, b) => a.day - b.day || rank(a) - rank(b));
}

export const SLOTS = buildSlots();
export const EX_BY_ID = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

// Основная группа мышц упражнения (для цветовых меток и подписей тренировки).
export const MUSCLE_OF = {
  squat: 'legs', front_squat: 'legs', wide_squat: 'legs', leg_curl: 'legs', calf_raise: 'legs', leg_press: 'legs', lunge: 'legs',
  bench: 'chest', db_bench: 'chest',
  deadlift: 'back', good_morning: 'back', lat_pulldown: 'back', pullup: 'back', db_row: 'back', back_ext: 'back',
  ohp: 'shoulders', db_ohp_seated: 'shoulders', lateral_raise: 'shoulders', upright_row: 'shoulders',
  db_tri_ext: 'arms', french_press: 'arms', bb_curl: 'arms',
  abs: 'core',
};
