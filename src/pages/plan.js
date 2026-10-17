import { h, num, dateRu, icon, progressBar } from '../ui.js';
import { state } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { go } from '../router.js';

export function planPage({ cycle } = {}) {
  const root = h('div');
  root.append(h('h1', null, 'План'));
  if (!S.isSetUp()) {
    root.append(h('div', { class: 'banner' }, 'Сначала задай ПМ и дату старта на вкладке ', h('a', { href: '#/today' }, 'Сегодня'), '.'));
    return root;
  }
  const cur = S.nextWorkout();
  const c = cycle != null ? Number(cycle) : cur.cycle;
  root.append(h('div', { class: 'row between' },
    h('button', { class: 'btn small', disabled: c <= 0, onclick: () => go(`/plan/${c - 1}`) }, icon('back', 16)),
    h('b', null, `Макроцикл ${c + 1} · 12 микроциклов`),
    h('button', { class: 'btn small', disabled: c >= 2, onclick: () => go(`/plan/${c + 1}`) }, icon('chevron', 16))));

  for (let mc = 1; mc <= E.MICROCYCLES; mc++) {
    const sum = S.microcycleSummary(c, mc);
    const isCur = cur.cycle === c && cur.mc === mc;
    const chips = h('div', { class: 'chips' });
    for (let day = 1; day <= E.DAYS_PER_MC; day++) {
      const info = S.dayInfo(E.dayIndex(c, mc, day));
      const plan = S.planFor(c, mc, day);
      const st = S.dayStatus(info, plan);
      const si = S.STATUS[st];
      chips.append(h('a', { class: `chip ${si.cls}`, href: `#/day/${info.key}` },
        h('b', null, `${si.icon} День ${day}`), dateRu(info.date), h('div', { class: 'small muted' }, `${num(plan.metrics.tonnage / 1000, 1)} т`)));
    }
    const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
    root.append(h('div', { class: 'card', id: isCur ? 'cur-mc' : null, style: isCur ? { borderColor: 'var(--accent)' } : null },
      h('div', { class: 'row between' }, h('h3', null, `Микроцикл ${mc}`),
        h('span', { class: 'badge' + (isCur ? ' accent' : '') }, isCur ? 'текущий' : `${pct} %`)),
      h('p', { class: 'muted small' }, `План: тоннаж ${num(sum.plan.tonnage, 0)} кг · КПШ ${sum.plan.kpsh}` +
        (sum.fact.kpsh ? ` · факт: ${num(sum.fact.tonnage, 0)} кг · КПШ ${sum.fact.kpsh}` : '')),
      sum.total ? h('div', { style: { margin: '2px 0 10px' } }, progressBar(sum.done / sum.total)) : null,
      chips));
  }
  // открываем сразу на текущем микроцикле
  if (cur.cycle === c && cur.mc > 2) requestAnimationFrame(() => document.getElementById('cur-mc')?.scrollIntoView({ block: 'start' }));
  return root;
}
