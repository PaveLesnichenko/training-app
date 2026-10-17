import { h, num, dateRu, kg, toast, lineChart, modal, icon } from '../ui.js';
import { illustration } from '../art.js';
import { state, save } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { rerender } from '../router.js';

const dayNum = (s) => E.parseDate(s).getTime() / 86400000;

export function weightPage() {
  const root = h('div');
  root.append(h('h1', null, 'Вес'));
  const today = E.todayStr();
  const todayRec = state.weights.find((x) => x.date === today);

  const kgIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'кг', value: todayRec?.kg ?? '' });
  const sleepIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'ч', value: todayRec?.sleep ?? '' });
  const waistIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'см', value: todayRec?.waist ?? '' });
  const date = h('input', { type: 'date', value: today, max: today });
  root.append(h('div', { class: 'card' }, h('h3', null, 'Внести замер'),
    h('label', { class: 'field' }, 'Дата', date),
    h('div', { class: 'grid3' }, h('label', { class: 'field' }, 'Вес, кг', kgIn), h('label', { class: 'field' }, 'Сон, ч', sleepIn), h('label', { class: 'field' }, 'Талия, см', waistIn)),
    h('p', { class: 'muted small' }, 'Лучше взвешиваться утром после туалета, до еды.'),
    h('button', { class: 'btn primary block', onclick: () => {
      const v = parseFloat(String(kgIn.value).replace(',', '.'));
      if (!(v > 20 && v < 400)) { toast('Введи вес'); return; }
      const rec = { date: date.value, kg: v };
      const s = parseFloat(String(sleepIn.value).replace(',', '.')); if (s > 0) rec.sleep = s;
      const wa = parseFloat(String(waistIn.value).replace(',', '.')); if (wa > 0) rec.waist = wa;
      state.weights = state.weights.filter((x) => x.date !== rec.date).concat(rec).sort((a, b) => a.date.localeCompare(b.date));
      state.settings.profile.weight = v;
      save('weights'); save('settings'); toast('Записано'); rerender();
    } }, 'Сохранить')));

  const pts = state.weights.map((x) => ({ date: x.date, kg: x.kg }));
  if (!pts.length) { root.append(h('div', { class: 'card empty' }, illustration('scale'), h('h3', null, 'Пока нет замеров'), h('p', { class: 'muted small' }, 'Взвешивайся по утрам. Через пару недель здесь появится график и темп набора.'))); return root; }

  const ma = E.movingAvg(pts);
  const rate = E.weeklyRate(pts);
  const first = pts[0], last = pts[pts.length - 1];
  const w = last.kg;
  const stats = h('div', { class: 'grid3' },
    stat(num(last.kg, 1), 'сейчас, кг'), stat(num(last.kg - first.kg, 1), 'с начала, кг'), stat(rate == null ? '—' : (rate > 0 ? '+' : '') + num(rate, 2), 'кг в неделю'));
  const adv = rate != null ? E.calorieAdvice(rate, w, state.settings.profile.goal) : null;

  const ticks = [];
  const x0 = dayNum(pts[0].date), x1 = dayNum(pts[pts.length - 1].date);
  const span = Math.max(1, x1 - x0);
  for (let i = 0; i <= 3; i++) { const x = x0 + (span * i) / 3; ticks.push({ x, label: dateRu(E.fmtDate(new Date(x * 86400000)), false) }); }

  root.append(h('div', { class: 'card' }, h('h3', null, 'Динамика'), stats,
    lineChart({ series: [{ points: pts.map((p) => ({ x: dayNum(p.date), y: p.kg })), color: '#6b7a94', dots: true, width: 1.5 },
      { points: ma.map((p) => ({ x: dayNum(p.date), y: p.kg })), color: '#6aa7ff', width: 2.8, area: true }], xTicks: ticks }),
    h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: '#6b7a94' } }), 'замеры'), h('span', null, h('i', { style: { background: '#6aa7ff' } }), 'среднее за 7 дней')),
    adv ? h('p', { style: { marginTop: '8px' } }, adv.text) : h('p', { class: 'muted small' }, 'Темп появится после 3 замеров за 2 недели.')));

  // недели
  const byWeek = new Map();
  for (const p of ma) {
    const d = E.parseDate(p.date); const mon = E.addDays(p.date, -((d.getUTCDay() + 6) % 7));
    byWeek.set(mon, p.kg);
  }
  const weeks = [...byWeek.entries()].reverse().slice(0, 8);
  root.append(h('div', { class: 'card' }, h('h3', null, 'По неделям (среднее за 7 дней)'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Неделя с'), h('th', null, 'Вес'), h('th', null, 'Δ'))),
      h('tbody', null, weeks.map(([mon, kgv], i) => {
        const prev = weeks[i + 1]; const delta = prev ? kgv - prev[1] : null;
        return h('tr', null, h('td', null, dateRu(mon, false)), h('td', null, num(kgv, 1)), h('td', null, delta == null ? '—' : (delta > 0 ? '+' : '') + num(delta, 2)));
      })))));

  // последние записи
  const recent = [...state.weights].reverse().slice(0, 14);
  root.append(h('div', { class: 'card' }, h('h3', null, 'Последние записи'), ...recent.map((r) =>
    h('div', { class: 'list-item' }, h('div', { class: 'grow' }, dateRu(r.date), h('div', { class: 'muted small' }, [r.sleep ? `сон ${num(r.sleep, 1)} ч` : '', r.waist ? `талия ${num(r.waist, 1)} см` : ''].filter(Boolean).join(' · '))),
      h('b', null, kg(r.kg)), h('button', { class: 'icon-btn', 'aria-label': 'Удалить', onclick: () => { state.weights = state.weights.filter((x) => x !== r); save('weights'); rerender(); } }, icon('x'))))));
  return root;
}
const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));
