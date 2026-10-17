import { h, num, dateRu, modal, toast, confirmBox, barChart, lineChart, kg, icon } from '../ui.js';
import { state, save, exportAll, importAll, resetAll, storageMode } from '../store.js';
import * as E from '../engine.js';
import * as S from '../session.js';
import { rerender } from '../router.js';
import { SLOTS, EX_BY_ID, EXERCISES, MAIN_NAMES } from '../exercises.js';
import { eatenTotals } from '../nutrition.js';
import { tile, illustration } from '../art.js';
import { buildReport } from '../report.js';

export function morePage() {
  const link = (href, title, sub, g, color) => h('a', { class: 'menu-item', href }, tile({ glyph: g, color }, 44), h('div', { class: 'mi-text' }, h('b', null, title), h('div', { class: 'muted small' }, sub)), h('span', { class: 'chev', style: { color: 'var(--faint)' } }, icon('chevron', 16)));
  return h('div', null, h('h1', null, 'Ещё'),
    h('div', { class: 'card' },
      link('#/more/progress', 'Прогресс', 'тоннаж, выполнение плана, силовые показатели, кардио', 'trophy', '#fbbf24'),
      link('#/more/ai', 'Тренер-нейросеть', 'разбор недели и советы: Gemini, DeepSeek, Groq и другие', 'bolt', '#6aa7ff'),
      link('#/more/report', 'Отчёт для чата', 'сводка за период, которую можно вставить в любой чат', 'file', '#a78bfa'),
      link('#/more/exercises', 'Упражнения', 'какие включены, профили нагрузки по микроциклам', 'dumbbell', '#6aa7ff'),
      link('#/more/settings', 'Настройки', 'расписание, кардио, резервная копия', 'gear', '#34d399')));
}

// ---------- прогресс ----------
export function progressPage() {
  const root = h('div');
  root.append(h('a', { class: 'back', href: '#/more' }, icon('back', 16), 'Ещё'), h('h1', null, 'Прогресс'));
  if (!S.isSetUp()) { root.append(h('p', { class: 'muted' }, 'Сначала настрой программу на вкладке «Сегодня».')); return root; }
  const cur = S.nextWorkout();
  const cycle = cur.cycle;

  const groups = [];
  let doneDays = 0, closedDays = 0, marked = { done: 0, partial: 0, skipped: 0 }, cardioMin = 0, cardioDone = 0, cardioTotal = 0;
  const perMc = [];
  for (let mc = 1; mc <= E.MICROCYCLES; mc++) {
    const sum = S.microcycleSummary(cycle, mc);
    groups.push({ label: String(mc), values: [{ v: sum.plan.tonnage, color: '#4d5f80' }, { v: sum.fact.tonnage, color: '#5b9dff' }] });
    let rpeSum = 0, rpeN = 0, cm = 0;
    for (let day = 1; day <= E.DAYS_PER_MC; day++) {
      const info = S.dayInfo(E.dayIndex(cycle, mc, day));
      const plan = S.planFor(cycle, mc, day);
      const st = S.dayStatus(info, plan);
      if (st === 'done' || st === 'partial') doneDays++;
      const a = S.adherence(plan, info.wk);
      marked.done += a.done; marked.partial += a.partial; marked.skipped += a.skipped;
      if (info.wk?.rpe) { rpeSum += info.wk.rpe; rpeN++; }
      const c = info.wk?.cardio;
      if (state.settings.cardioOn && c?.done != null) { cardioTotal++; if (c.done) { cardioDone++; cm += c.minutes ?? S.cardioPlan(info).minutes; } }
    }
    cardioMin += cm;
    perMc.push({ mc, sum, rpe: rpeN ? rpeSum / rpeN : null, cm });
  }
  const totalMarked = marked.done + marked.partial + marked.skipped;
  root.append(h('div', { class: 'card' }, h('h3', null, `Макроцикл ${cycle + 1}`),
    h('div', { class: 'grid3' },
      stat(doneDays + ' / 36', 'тренировок'), stat(totalMarked ? Math.round(((marked.done + marked.partial) / totalMarked) * 100) + ' %' : '—', 'упражнений сделано'),
      stat(totalMarked ? Math.round((marked.done / totalMarked) * 100) + ' %' : '—', 'точно по плану')),
    h('p', { class: 'muted small' }, `Полностью: ${marked.done} · иначе: ${marked.partial} · пропущено: ${marked.skipped}`)));

  root.append(h('div', { class: 'card' }, h('h3', null, 'Тоннаж по микроциклам, кг'), barChart({ groups }),
    h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: '#4d5f80' } }), 'план'), h('span', null, h('i', { style: { background: '#5b9dff' } }), 'факт'))));

  root.append(h('div', { class: 'card' }, h('h3', null, 'Микроциклы'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, ['№', 'КПШ пл.', 'КПШ факт', 'ОИ факт', 'RPE', 'Кардио'].map((x) => h('th', null, x)))),
      h('tbody', null, perMc.map((r) => h('tr', null, h('td', null, r.mc), h('td', null, r.sum.plan.kpsh), h('td', null, r.sum.fact.kpsh || '—'),
        h('td', null, r.sum.fact.kpsh ? Math.round(r.sum.fact.oi * 100) + ' %' : '—'), h('td', null, r.rpe ? num(r.rpe, 1) : '—'), h('td', null, r.cm ? r.cm + ' мин' : '—')))))));

  if (state.settings.cardioOn) root.append(h('div', { class: 'card' }, h('h3', null, 'Кардио'), h('p', null, `Сделано ${cardioDone} из ${cardioTotal} отмеченных, всего ${cardioMin} мин в этом макроцикле.`)));

  // прогресс по упражнению
  root.append(exerciseProgress());
  return root;
}

function exerciseProgress() {
  const box = h('div', { class: 'card' }, h('h3', null, 'Прогресс по упражнению'));
  const data = {};
  for (const info of S.allDays()) {
    if (!info.wk) continue;
    for (const rec of Object.values(info.wk.ex)) {
      if (!rec.exId || !rec.status || rec.status === 'skipped') continue;
      const planned = info.wk.snapshot?.find((e) => e.exId === rec.exId);
      const steps = rec.steps || planned?.steps || [];
      const ex = EX_BY_ID[rec.exId];
      const vals = steps.map((s) => (ex.type === 'reps' ? Number(s.reps) : E.e1rm(Number(s.weight) || 0, Number(s.reps) || 1))).filter((v) => v > 0);
      if (vals.length) (data[rec.exId] ??= []).push({ date: info.date, v: Math.max(...vals) });
    }
  }
  const ids = Object.keys(data);
  if (!ids.length) { box.append(h('p', { class: 'muted' }, 'Появится после первых отмеченных тренировок.')); return box; }
  const chart = h('div');
  const sel = h('select', { onchange: () => draw() }, ids.map((id) => h('option', { value: id }, EX_BY_ID[id].name)));
  const draw = () => {
    const pts = data[sel.value].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ x: E.parseDate(p.date).getTime() / 86400000, y: p.v }));
    const isReps = EX_BY_ID[sel.value].type === 'reps';
    chart.replaceChildren(lineChart({ series: [{ points: pts, color: '#5b9dff', dots: true }], yFmt: (v) => num(v, 1) }),
      h('p', { class: 'muted small' }, isReps ? 'Лучший подход, повторы.' : 'Расчётный максимум по лучшему подходу, кг (формула Эпли).'));
  };
  box.append(sel, chart); draw();
  return box;
}

// ---------- упражнения ----------
export function exercisesPage() {
  const root = h('div');
  root.append(h('a', { class: 'back', href: '#/more' }, icon('back', 16), 'Ещё'), h('h1', null, 'Упражнения'),
    h('p', { class: 'muted small' }, 'Выключенные упражнения пропадают из будущих тренировок. Выполненные дни не меняются. Нажми на название, чтобы увидеть, как меняется нагрузка по микроциклам.'));
  for (const day of [1, 2, 3]) {
    const card = h('div', { class: 'card' }, h('h3', null, `День ${day}`));
    for (const slot of SLOTS.filter((s) => s.day === day)) {
      const ex = EX_BY_ID[slot.exId];
      const off = E.isOff(slot.exId, state.settings.disabled);
      card.append(h('div', { class: 'list-item' },
        h('div', { class: 'grow', onclick: () => profileModal(slot) }, h('div', null, ex.name, slot.estimated ? h('span', { class: 'badge warn', style: { marginLeft: '6px' } }, 'оценка') : null),
          h('div', { class: 'muted small' }, `${slot.load.toLowerCase()} · k ${ex.k}${ex.mult === 2 ? ' · гантели' : ''}`)),
        EX_BY_ID[slot.exId].pm.main ? h('span', { class: 'badge' }, 'основное') :
          h('input', { type: 'checkbox', checked: !off, 'aria-label': 'Включено', onchange: (e) => { state.settings.disabled[slot.exId] = !e.target.checked; save('settings'); } })));
    }
    root.append(card);
  }
  return root;
}

function profileModal(slot) {
  const ex = EX_BY_ID[slot.exId];
  modal(ex.name, (body) => {
    body.append(h('p', { class: 'muted small' }, slot.estimated
      ? 'Профиль выведен из упражнения-образца из твоего файла: проценты пересчитаны так, чтобы усилие подхода осталось тем же при другом числе повторов.'
      : 'Профиль нагрузки взят из твоего файла.'),
    h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, '№'), h('th', null, '% ПМ × повторы × подходы'))),
      h('tbody', null, slot.profile.map((steps, i) => h('tr', null, h('td', null, i + 1),
        h('td', null, steps.map(([p, r, s]) => (slot.mode === 'reps' ? `${r}×${s}` : `${Math.round(p * 100)}% × ${r} × ${s}`)).join(' + ')))))));
  });
}

// ---------- отчёт для Claude ----------
export function reportPage() {
  const root = h('div');
  root.append(h('a', { class: 'back', href: '#/more' }, icon('back', 16), 'Ещё'), h('h1', null, 'Отчёт для Claude'),
    h('p', { class: 'muted' }, 'Скопируй текст и вставь в чат с Claude. Попроси разобрать прогресс и предложить правки в плане, питании и ПМ.'));
  const period = h('select', { onchange: () => draw() }, [14, 28, 56].map((d) => h('option', { value: d }, `за ${d} дней`)));
  const out = h('textarea', { style: { minHeight: '320px', fontSize: '13px' }, readonly: true });
  const draw = () => { out.value = buildReport(Number(period.value)); };
  draw();
  root.append(h('label', { class: 'field' }, 'Период', period), out,
    h('div', { class: 'row gap', style: { marginTop: '8px' } },
      h('button', { class: 'btn primary grow', onclick: async () => {
        try { await navigator.clipboard.writeText(out.value); toast('Скопировано'); } catch { out.select(); document.execCommand?.('copy'); toast('Скопировано'); }
      } }, 'Скопировать'),
      navigator.share ? h('button', { class: 'btn grow', onclick: () => navigator.share({ text: out.value }).catch(() => {}) }, 'Поделиться') : null));
  return root;
}

// ---------- настройки ----------
export function settingsPage() {
  const s = state.settings;
  const root = h('div');
  root.append(h('a', { class: 'back', href: '#/more' }, icon('back', 16), 'Ещё'), h('h1', null, 'Настройки'));

  const start = h('input', { type: 'date', value: s.startDate || '', onchange: (e) => {
    if (!e.target.value) return;
    S.freezeDates();   // уже начатые тренировки остаются на своих датах
    s.startDate = e.target.value; save('settings'); toast('Даты будущих тренировок пересчитаны'); rerender();
  } });
  const DAY_NAMES = { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота', 0: 'Воскресенье' };
  const DAY_SHORT = { 1: 'пн', 2: 'вт', 3: 'ср', 4: 'чт', 5: 'пт', 6: 'сб', 0: 'вс' };
  const order = [1, 2, 3, 4, 5, 6, 0];
  const changeDay = (slot, day) => {
    const next = s.weekdays.map((d, k) => (k === slot ? day : d));
    if (new Set(next).size !== next.length) { toast('Этот день уже занят другой тренировкой'); rerender(); return; }
    S.freezeDates();
    s.weekdays = order.filter((x) => next.includes(x)); save('settings'); toast('Расписание изменено'); rerender();
  };
  // Три слота: каждый выбирается отдельно, занятые другими слотами дни недоступны. Тупика «нужно ровно 3» нет.
  const slots = s.weekdays.map((day, i) => {
    const taken = s.weekdays.filter((_, k) => k !== i);
    const sel = h('select', { onchange: (e) => changeDay(i, Number(e.target.value)) },
      order.map((n) => h('option', { value: n, selected: n === day, disabled: taken.includes(n) }, DAY_NAMES[n] + (taken.includes(n) ? ' (занят)' : ''))));
    return h('label', { class: 'field' }, `Тренировка ${i + 1} в неделе`, sel);
  });
  const strip = h('div', { class: 'week mini' }, order.map((n) => h('div', { class: 'wk' + (s.weekdays.includes(n) ? ' on' : '') }, DAY_SHORT[n], h('i', { class: 'mark' }))));
  root.append(h('div', { class: 'card' }, h('h3', null, 'Расписание'),
    h('p', { class: 'muted small' }, 'Тренировок в неделю три. Выбери день для каждой из них: по порядку это день 1, день 2 и день 3 программы.'),
    h('label', { class: 'field' }, 'Дата первой тренировки', start),
    ...slots, strip,
    h('p', { class: 'muted small' }, 'Даты уже начатых тренировок не меняются, пересчитываются только будущие. Отдельную тренировку можно перенести на её странице.')));

  root.append(h('div', { class: 'card' }, h('h3', null, 'Кардио'),
    h('label', { class: 'row gap', style: { margin: '6px 0' } }, h('input', { type: 'checkbox', checked: s.cardioOn, onchange: (e) => { s.cardioOn = e.target.checked; save('settings'); rerender(); } }), 'Кардио после тренировки'),
    h('label', { class: 'field' }, 'Вид по умолчанию', h('select', { onchange: (e) => { s.cardioType = e.target.value; save('settings'); } },
      Object.entries(E.CARDIO_TYPES).map(([k, v]) => h('option', { value: k, selected: s.cardioType === k }, v.name)))),
    h('label', { class: 'field' }, 'Минут в начале цикла (+5 каждые 2 микроцикла, максимум 40)', h('input', { type: 'text', inputmode: 'numeric', value: s.cardioBase, onchange: (e) => { const v = parseInt(e.target.value, 10); if (v >= 5 && v <= 60) { s.cardioBase = v; save('settings'); } } })),
    h('label', { class: 'field' }, 'Какую долю расхода кардио добавлять в норму калорий, %', h('input', { type: 'text', inputmode: 'numeric', value: Math.round(s.cardioShare * 100), onchange: (e) => { const v = parseInt(e.target.value, 10); if (v >= 0 && v <= 100) { s.cardioShare = v / 100; save('settings'); } } }))));

  root.append(h('div', { class: 'card' }, h('h3', null, 'Резервная копия'),
    h('p', { class: 'muted small' }, `Все данные лежат только в памяти этого браузера (${{ idb: 'IndexedDB', ls: 'localStorage', memory: 'только оперативная память — после закрытия пропадут' }[storageMode()]}). Если удалишь приложение или сбросишь Safari, они исчезнут. Делай экспорт раз в пару недель.`),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn primary grow', onclick: doExport }, 'Экспорт'),
      h('button', { class: 'btn grow', onclick: doImport }, 'Импорт')),
    s.lastBackup ? h('p', { class: 'muted small' }, `Последний экспорт: ${new Date(s.lastBackup).toLocaleDateString('ru-RU')}`) : null));

  root.append(h('div', { class: 'card' }, h('h3', null, 'Опасная зона'),
    h('button', { class: 'btn bad block', onclick: async () => { if (await confirmBox('Будут удалены ПМ, тренировки, меню, питание, вес и ключ нейросети. Если нужна копия, сначала сделай экспорт.', 'Стереть всё', { title: 'Стереть все данные?' })) { await resetAll(); location.hash = '#/today'; rerender(); } } }, 'Стереть все данные')));
  return root;
}

async function doExport() {
  const text = exportAll();
  const name = `training-backup-${E.todayStr()}.json`;
  const file = new File([text], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
    else { const a = h('a', { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); a.remove(); }
    state.settings.lastBackup = Date.now(); save('settings'); toast('Экспорт готов'); rerender();
  } catch (e) { if (e.name !== 'AbortError') toast('Не получилось: ' + e.message); }
}

function doImport() {
  const inp = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (!(await confirmBox('Текущие данные будут заменены данными из файла. Это нельзя отменить.', 'Заменить', { title: 'Загрузить копию?', danger: true }))) return;
    try { await importAll(await f.text()); toast('Данные загружены'); rerender(); } catch (e) { toast('Ошибка: ' + e.message); }
  };
  document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}

const stat = (v, l) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, l));
