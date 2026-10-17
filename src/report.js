// Сводка за период в виде текста: для вставки в чат и для запроса к нейросети.
import { state } from './store.js';
import * as E from './engine.js';
import * as S from './session.js';
import { EX_BY_ID, MAIN_NAMES } from './exercises.js';
import { eatenTotals } from './nutrition.js';

const num = (x, d = 1) => (x == null || isNaN(x) ? '—' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
const GOALS = { gain: 'набор массы', maintain: 'поддержание', cut: 'похудение' };

// parts — какие блоки включать: { profile, training, nutrition, weight }; questions — добавить вопросы для чата.
export function buildReport(days, parts = {}, { questions = true } = {}) {
  const on = { profile: true, training: true, nutrition: true, weight: true, ...parts };
  const today = E.todayStr(), from = E.addDays(today, -days + 1);
  const p = state.settings.profile, L = [];
  L.push(`# Отчёт по тренировкам и питанию (${from} — ${today})`, '');

  if (on.profile) {
    L.push(`Профиль: ${p.sex === 'f' ? 'ж' : 'м'}, ${p.age ?? '?'} лет, ${p.height ?? '?'} см, вес ${S.latestWeight() ?? '?'} кг. Цель: ${GOALS[p.goal]}.`);
  }
  if (on.training && S.hasPm()) {
    const cur = S.nextWorkout();
    const abs = cur ? E.absMc(cur.cycle, cur.mc) : 0;
    L.push(`Текущие ПМ: ` + ['squat', 'bench', 'deadlift'].map((k) => `${MAIN_NAMES[k]} ${num(E.mainPm(state.pm, k, abs), 1)} кг`).join(', ') + `. Прирост ПМ за микроцикл ${num((state.pm.growth ?? E.DEFAULT_GROWTH) * 100, 2)} %. Сейчас микроцикл ${cur ? cur.mc : '?'} из 12.`);
  }

  if (on.training) {
    L.push('', '## Тренировки (план → факт)');
    let any = false;
    // Берём тренировки по дате выполнения: выполненную раньше срока (плановая дата в будущем) тоже учитываем.
    const days = S.allDays().map((info) => ({ info, when: S.performedDate(info) })).filter((x) => x.when >= from && x.when <= today).sort((a, b) => a.when.localeCompare(b.when));
    for (const { info, when } of days) {
      const plan = S.planFor(info.cycle, info.mc, info.day);
      const st = S.dayStatus(info, plan);
      any = true;
      L.push(`### ${when}${when !== info.date ? ` (по плану ${info.date})` : ''}, микроцикл ${info.mc}, день ${info.day}: ${S.STATUS[st].text}${info.wk?.rpe ? `, RPE ${info.wk.rpe}` : ''}`);
      for (const e of plan.exercises) {
        const rec = info.wk?.ex?.[e.slotId];
        const name = EX_BY_ID[e.exId].name;
        const fmt = (steps) => steps.map((s) => (e.isReps ? `${s.sets}×${s.reps}` : `${num(s.weight, 1)}×${s.reps}×${s.sets}`)).join(' + ');
        const planned = fmt(e.steps);
        if (!rec?.status) L.push(`- ${name}: план ${planned} — не отмечено`);
        else if (rec.status === 'done') L.push(`- ${name}: план ${planned} — выполнено`);
        else if (rec.status === 'skipped') L.push(`- ${name}: план ${planned} — пропущено${rec.comment ? ` («${rec.comment}»)` : ''}`);
        else L.push(`- ${name}: план ${planned} → факт ${fmt(rec.steps)}${rec.comment ? ` («${rec.comment}»)` : ''}`);
      }
      const c = info.wk?.cardio;
      if (c?.done != null) L.push(`- Кардио: ${c.done ? `${c.minutes ?? S.cardioPlan(info).minutes} мин` : 'не сделано'}${c.comment ? ` («${c.comment}»)` : ''}`);
      if (info.wk?.comment) L.push(`- Комментарий: ${info.wk.comment}`);
    }
    if (!any) L.push('Тренировок за период нет.');
  }

  if (on.nutrition) {
    L.push('', '## Питание (съедено / цель)');
    let anyFood = false;
    for (let i = days - 1; i >= 0; i--) {
      const d = E.addDays(today, -i), t = S.targetsFor(d);
      if (!state.foodlog[d] || !t) continue;
      const eaten = eatenTotals(d);
      if (!eaten.kcal) continue;
      anyFood = true;
      L.push(`- ${d}: ${num(eaten.kcal, 0)} / ${t.kcal} ккал, белок ${num(eaten.p, 0)} / ${t.protein} г, жиры ${num(eaten.f, 0)} / ${t.fat}, углеводы ${num(eaten.c, 0)} / ${t.carbs}`);
    }
    if (!anyFood) L.push('Отметок питания за период нет.');
    if (state.settings.kcalAdjust) L.push(`Коррекция калорий по динамике веса: ${state.settings.kcalAdjust > 0 ? '+' : ''}${state.settings.kcalAdjust} ккал.`);
  }

  if (on.weight) {
    L.push('', '## Вес');
    const w = state.weights.filter((x) => x.date >= from);
    if (w.length) {
      L.push(w.map((x) => `${x.date}: ${x.kg}`).join('; '));
      const rate = E.weeklyRate(state.weights.map((x) => ({ date: x.date, kg: x.kg })));
      if (rate != null) L.push(`Темп за последние 2 недели: ${rate} кг/нед.`);
    } else L.push('Замеров за период нет.');
  }

  if (questions) {
    L.push('', '## Вопросы', '1. Как идёт прогресс по силе? Где отклонения от плана и с чем они могут быть связаны?', '2. Нужно ли изменить ПМ, нагрузку или состав упражнений?', '3. Достаточно ли калорий и белка для набора массы при таком темпе веса?', '4. Что поправить на следующие 2 недели?');
  }
  return L.join('\n');
}
