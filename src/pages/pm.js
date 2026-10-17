import { h, num, modal, toast, lineChart, icon } from '../ui.js';
import { state, save } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { rerender } from '../router.js';
import { EXERCISES, MAIN, MAIN_NAMES } from '../exercises.js';

const currentAbs = () => { const d = S.nextWorkout(); return E.absMc(d.cycle, d.mc); };
const BASE_NAMES = { squat: 'приседа', bench: 'жима лёжа', deadlift: 'становой' };
const COLORS = { squat: '#5b9dff', bench: '#f5b942', deadlift: '#3ddc97' };
const pct = (g) => String(Math.round(g * 10000) / 100);
const parseNum = (v) => parseFloat(String(v).replace(',', '.'));

export function pmPage() {
  const root = h('div');
  root.append(h('h1', null, 'Повторные максимумы'),
    h('p', { class: 'lead' }, 'Весь расчёт идёт от трёх базовых ПМ. У остальных упражнений ПМ = базовый × коэффициент, поэтому они растут вместе с базовыми.'));
  const abs = S.isSetUp() ? currentAbs() : 0;
  const cycle = Math.floor(abs / E.MICROCYCLES);

  // ----- базовые -----
  const main = h('div', { class: 'card' }, h('h3', null, 'Базовые упражнения'));
  for (const k of MAIN) {
    const pm = E.mainPm(state.pm, k, abs);
    main.append(h('div', { class: 'list-item' },
      h('span', { class: 'dot', style: { background: COLORS[k] } }),
      h('div', { class: 'grow' }, h('b', null, MAIN_NAMES[k]), h('div', { class: 'muted small' }, state.pm.main[k] ? `введён ${num(state.pm.main[k].value, 1)} кг` : 'не задан')),
      h('b', { class: 'big' }, pm == null ? '—' : `${num(pm, 1)} кг`),
      h('button', { class: 'btn small', onclick: () => editMain(k, abs) }, 'Изменить')));
  }
  root.append(main);

  // ----- прирост за микроцикл -----
  root.append(growthCard(abs, cycle));

  // ----- подсказки -----
  const sug = S.pmSuggestions();
  if (sug.length) {
    const box = h('div', { class: 'card' }, h('h3', null, 'Можно поднять ПМ'),
      h('p', { class: 'muted small' }, 'Расчётный максимум по лучшему подходу (формула Эпли) выше текущего ПМ.'));
    for (const x of sug) {
      box.append(h('div', { class: 'list-item' },
        h('div', { class: 'grow' }, h('b', null, MAIN_NAMES[x.exId]), h('div', { class: 'muted small' }, `${num(x.w, 1)} кг × ${x.r} → ~${num(x.est, 1)} кг (сейчас ${num(x.pm, 1)})`)),
        h('button', { class: 'btn small primary', onclick: () => { applyMain(x.exId, Math.floor(x.est * 2) / 2, abs); toast('ПМ обновлён'); rerender(); } }, 'Принять')));
    }
    root.append(box);
  }

  // ----- история -----
  const hist = state.pm.history;
  if (new Set(hist.map((x) => x.date)).size > 1) {
    const series = MAIN.map((k) => ({ points: hist.filter((x) => x.key === k).map((x) => ({ x: E.parseDate(x.date).getTime() / 86400000, y: x.value })), color: COLORS[k], dots: true })).filter((s) => s.points.length);
    root.append(h('div', { class: 'card' }, h('h3', null, 'История ПМ'), lineChart({ series, yFmt: (v) => num(v, 0) }),
      h('div', { class: 'legend' }, MAIN.map((k) => h('span', null, h('i', { style: { background: COLORS[k] } }), MAIN_NAMES[k])))));
  }

  // ----- производные -----
  const tbl = h('div', { class: 'card' }, h('h3', null, 'Остальные упражнения'),
    h('p', { class: 'muted small' }, 'Коэффициент можно поменять вручную или уточнить по пробному подходу. Значок «оценка» означает приблизительный коэффициент.'));
  for (const ex of EXERCISES.filter((e) => !e.pm.main)) {
    const pm = E.exercisePm(ex.id, state.pm, abs);
    const isReps = ex.type === 'reps';
    const coef = state.pm.coefs[ex.id] ?? ex.pm.coef;
    const own = !ex.pm.own && state.pm.own[ex.id] != null;
    const how = ex.pm.own ? 'твой максимум повторов' : own ? 'фиксированный ПМ (устаревший режим)' : `${num(coef, 3)} × ПМ ${BASE_NAMES[ex.pm.base]}`;
    tbl.append(h('div', { class: 'list-item tap', onclick: () => editDerived(ex, abs) },
      h('div', { class: 'grow' }, h('div', null, ex.name, ex.estimated ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'оценка') : null),
        h('div', { class: 'muted small' }, how + (E.isOff(ex.id, state.settings.disabled) ? ' · выключено' : ''))),
      h('b', null, pm == null ? '—' : isReps ? `${num(pm, 0)} повт.` : `${num(pm, 1)} кг`), h('span', { class: 'chev' }, icon('chevron', 16))));
  }
  root.append(tbl);
  return root;
}

// Прирост за микроцикл: черновик → предпросмотр → явное сохранение.
function growthCard(abs, cycle) {
  const saved = state.pm.growth ?? E.DEFAULT_GROWTH;
  const input = h('input', { type: 'text', inputmode: 'decimal', value: pct(saved), 'aria-label': 'Прирост за микроцикл, %' });
  const preview = h('div');
  const saveBtn = h('button', { class: 'btn primary block', disabled: true }, 'Сохранить и пересчитать');
  const draft = () => parseNum(input.value) / 100;
  const valid = () => { const g = draft(); return isFinite(g) && g >= 0 && g <= 0.1; };

  const drawPreview = () => {
    const g = valid() ? draft() : saved;
    const state2 = { ...state.pm, growth: g };
    const rows = [1, 4, 8, 12].map((mc) => {
      const a = E.absMc(cycle, mc);
      return h('tr', null, h('td', null, `Микроцикл ${mc}`), ...MAIN.map((k) => h('td', null, num(E.mainPm(state2, k, a), 1))));
    });
    preview.replaceChildren(h('table', { class: 't' },
      h('thead', null, h('tr', null, h('th', null, ''), ...MAIN.map((k) => h('th', null, MAIN_NAMES[k])))), h('tbody', null, rows)));
    const changed = valid() && Math.abs(draft() - saved) > 1e-9;
    saveBtn.disabled = !changed;
    input.classList.toggle('invalid', !valid());
  };
  input.addEventListener('input', drawPreview);
  saveBtn.addEventListener('click', () => {
    if (!valid()) { toast('Введи число от 0 до 10'); return; }
    state.pm.growth = draft(); save('pm');
    toast('Сохранено: будущие тренировки пересчитаны'); rerender();
  });
  drawPreview();
  return h('div', { class: 'card' }, h('h3', null, 'Прирост ПМ за микроцикл'),
    h('p', { class: 'muted small' }, 'На сколько процентов ПМ базовых упражнений растёт с каждым микроциклом (в твоём файле 0,5 %). Меняет веса всех будущих тренировок; выполненные дни остаются как были.'),
    h('div', { class: 'row gap' }, h('div', { class: 'grow' }, input), h('span', { class: 'muted' }, '% за микроцикл')),
    h('div', { style: { margin: '10px 0' } }, preview), saveBtn);
}

function applyMain(k, value, abs) {
  state.pm.main[k] = { value, at: abs };
  state.pm.history.push({ date: E.todayStr(), key: k, value, at: abs });
  save('pm');
}

function editMain(k, abs) {
  modal(`ПМ: ${MAIN_NAMES[k]}`, (body, close) => {
    const cur = E.mainPm(state.pm, k, abs);
    const input = h('input', { type: 'text', inputmode: 'decimal', value: cur ? String(Math.round(cur * 10) / 10) : '' });
    body.append(h('p', { class: 'muted small' }, 'Это ПМ на текущий микроцикл. Будущие тренировки пересчитаются, выполненные останутся как были.'),
      h('label', { class: 'field' }, 'ПМ, кг', input),
      h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => {
        const v = parseNum(input.value);
        if (!(v > 0 && v < 600)) { toast('Введи число'); return; }
        applyMain(k, v, abs); close(); rerender();
      } }, 'Сохранить и пересчитать'));
  });
}

function editDerived(ex, abs) {
  modal(ex.name, (body, close) => {
    const isReps = ex.type === 'reps';
    const pm = E.exercisePm(ex.id, state.pm, abs);
    const base = ex.pm.base ? E.mainPm(state.pm, ex.pm.base, abs) : null;
    body.append(h('p', { class: 'muted small' }, ex.hint || ''),
      h('p', null, h('b', null, 'Сейчас: '), pm == null ? '—' : isReps ? `${num(pm, 0)} повт.` : `${num(pm, 1)} кг`));

    if (!ex.pm.own) {
      const coef = h('input', { type: 'text', inputmode: 'decimal', value: String(state.pm.coefs[ex.id] ?? ex.pm.coef) });
      const hint = h('div', { class: 'muted small' });
      const upd = () => { const v = parseNum(coef.value); hint.textContent = v > 0 && base ? `ПМ станет ${num(base * v, 1)} кг при текущем ПМ ${BASE_NAMES[ex.pm.base]} ${num(base, 1)} кг` : ''; };
      coef.oninput = upd; upd();
      body.append(h('label', { class: 'field' }, `Коэффициент (доля от ПМ ${BASE_NAMES[ex.pm.base]})`, coef), hint,
        h('div', { class: 'row gap', style: { marginTop: '8px' } },
          h('button', { class: 'btn primary grow', onclick: () => {
            const v = parseNum(coef.value);
            if (!(v > 0 && v < 5)) { toast('Введи коэффициент'); return; }
            state.pm.coefs[ex.id] = v; delete state.pm.own[ex.id]; save('pm'); close(); rerender();
          } }, 'Сохранить'),
          h('button', { class: 'btn grow', onclick: () => { delete state.pm.coefs[ex.id]; delete state.pm.own[ex.id]; save('pm'); close(); rerender(); } }, `Стандартный (${ex.pm.coef})`)));
    }

    // пробный подход
    const w = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'кг' });
    const r = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'повторы' });
    const res = h('div', { class: 'muted small' });
    const calc = () => {
      const reps = parseInt(r.value, 10), weight = parseNum(w.value);
      if (isReps) return reps > 0 ? reps : null;
      return reps > 0 && weight > 0 ? Math.round(E.e1rm(weight, reps) * 2) / 2 : null;
    };
    const upd2 = () => {
      const v = calc();
      res.textContent = !v ? '' : isReps ? `Максимум повторов: ${v}` : base ? `Расчётный ПМ: ${num(v, 1)} кг → коэффициент ${num(v / base, 3)}` : `Расчётный ПМ: ${num(v, 1)} кг`;
    };
    w.oninput = upd2; r.oninput = upd2;
    body.append(h('h3', { style: { marginTop: '16px' } }, 'Уточнить по пробному подходу'),
      h('p', { class: 'muted small' }, isReps ? 'Сколько повторов можешь сделать за один подход до отказа?'
        : 'Сделай подход на 5–8 повторов, запиши вес и повторы. Я посчитаю ПМ и сохраню его как коэффициент, так что упражнение продолжит расти вместе с базовым ПМ.'),
      isReps ? null : h('label', { class: 'field' }, 'Вес, кг', w), h('label', { class: 'field' }, isReps ? 'Повторов до отказа' : 'Повторы', r), res,
      h('button', { class: 'btn block', style: { marginTop: '8px' }, onclick: () => {
        const v = calc(); if (!v) { toast('Заполни поля'); return; }
        if (isReps) state.pm.own[ex.id] = v;
        else { if (!base) { toast('Сначала задай базовый ПМ'); return; } state.pm.coefs[ex.id] = Math.round((v / base) * 1000) / 1000; delete state.pm.own[ex.id]; }
        save('pm'); close(); rerender();
      } }, isReps ? 'Сохранить максимум' : 'Сохранить как коэффициент'));
  });
}
