// Мелкие помощники интерфейса: создание DOM, форматирование, окна, графики на SVG.

// Нативный append превращает null / false / массивы в текст «null», «false», «a,b».
// Перехватываем: пустые значения пропускаем, вложенные массивы раскрываем.
if (typeof Element !== 'undefined') {
  const nativeAppend = Element.prototype.append;
  Element.prototype.append = function (...nodes) {
    nativeAppend.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false));
  };
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, props, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props || {})) if (v != null) el.setAttribute(k, v);
  append(el, children);
  return el;
}

// ---------- иконки (линейные, 24×24) ----------
const ICONS = {
  check: 'M20 6 9 17l-5-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  x: 'M18 6 6 18M6 6l12 12',
  skip: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8',
  timer: 'M10 2h4M12 14l3-3M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  note: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  run: 'M13 4a1.5 1.5 0 1 0 0 .01M4 17l5-1 2-4 3 3 1 5M10 12l4-3 3 2 3-1',
  flame: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  alert: 'M12 3 2 20h20L12 3ZM12 10v4M12 17h.01',
};
export function icon(name, size = 18) {
  return svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ic', 'aria-hidden': 'true' }, svg('path', { d: ICONS[name] }));
}

// ---------- форматирование ----------
export const num = (x, d = 1) => (x == null || isNaN(x) ? '—' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
export const kg = (x) => (x == null ? '—' : `${num(x, 2)} кг`);
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export function dateRu(s, withWd = true) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d} ${MONTHS[m - 1]}${withWd ? ', ' + wd : ''}`;
}
export const minutesRu = (m) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);

// ---------- уведомления и окна ----------
export function toast(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

// ---------- окна ----------
// Счётчик открытых окон: прокрутка страницы блокируется, пока открыто хотя бы одно.
let openLayers = 0;
const layers = [];   // стек закрывающих функций для клавиши Escape
function lock() { openLayers++; document.body.classList.add('noscroll'); }
function unlock() { openLayers = Math.max(0, openLayers - 1); if (!openLayers) document.body.classList.remove('noscroll'); }
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layers.length) layers.at(-1)(); });
}

// Шторка снизу. build(body, close). onClose вызывается при любом способе закрытия.
export function modal(title, build, { onClose } = {}) {
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    layers.splice(layers.indexOf(close), 1);
    back.classList.add('out'); setTimeout(() => back.remove(), 160);
    unlock(); onClose?.();
  };
  const body = h('div', { class: 'modal-body' });
  const back = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Закрыть' }, icon('x', 20))),
      body));
  build(body, close);
  document.body.append(back);
  layers.push(close); lock();
  return close;
}

// Диалог по центру экрана: подтверждение или сообщение. actions: [{ label, value, kind }]
function dialog({ iconName, tone, title, text, actions }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return; done = true;
      layers.splice(layers.indexOf(cancel), 1);
      back.classList.add('out'); setTimeout(() => back.remove(), 160); unlock(); resolve(v);
    };
    const cancel = () => finish(false);
    const back = h('div', { class: 'dlg-back', onclick: (e) => { if (e.target === back) cancel(); } },
      h('div', { class: 'dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
        h('div', { class: `dlg-ic ${tone || ''}` }, icon(iconName, 26)),
        h('h3', { class: 'dlg-title' }, title),
        h('p', { class: 'dlg-text' }, text),
        h('div', { class: `dlg-actions n${actions.length}` }, actions.map((a) => h('button', { class: `btn ${a.kind || ''}`, onclick: () => finish(a.value) }, a.label)))));
    document.body.append(back);
    layers.push(cancel); lock();
    back.querySelector('.dlg-actions .btn:last-child')?.focus?.({ preventScroll: true });
  });
}

// Подтверждение. Опасные действия (удалить, стереть) выделяются красным и предупреждающей иконкой.
export function confirmBox(text, okLabel = 'Да', opts = {}) {
  const danger = opts.danger ?? /удал|стер|сброс|очист/i.test(`${okLabel} ${opts.title || ''}`);
  return dialog({
    iconName: danger ? 'trash' : 'info', tone: danger ? 'bad' : 'accent',
    title: opts.title || (danger ? 'Это нельзя отменить' : 'Подтверди действие'), text,
    actions: [{ label: opts.cancelLabel || 'Отмена', value: false }, { label: okLabel, value: true, kind: danger ? 'bad solid' : 'primary' }],
  });
}

// Сообщение с одной кнопкой (вместо системного alert).
export function notice(text, title = 'Проверь данные') {
  return dialog({ iconName: 'alert', tone: 'warn', title, text, actions: [{ label: 'Понятно', value: true, kind: 'primary' }] });
}

// ---------- графики ----------
// series: [{ points: [{x:number, y:number}], color, width, dots, dashed }]
export function lineChart({ series, w = 340, hgt = 180, xTicks = [], yFmt = (v) => num(v, 1), pad = { l: 38, r: 10, t: 10, b: 22 }, hLines = [] }) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return h('div', { class: 'muted center' }, 'Пока нет данных');
  let xmin = Math.min(...all.map((p) => p.x)), xmax = Math.max(...all.map((p) => p.x));
  let ymin = Math.min(...all.map((p) => p.y), ...hLines.map((l) => l.y)), ymax = Math.max(...all.map((p) => p.y), ...hLines.map((l) => l.y));
  if (xmax === xmin) xmax = xmin + 1;
  const padY = (ymax - ymin) * 0.12 || 1; ymin -= padY; ymax += padY;
  const sx = (x) => pad.l + ((x - xmin) / (xmax - xmin)) * (w - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - ymin) / (ymax - ymin)) * (hgt - pad.t - pad.b);
  const el = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'chart', role: 'img' });
  const gid = `lc${Math.random().toString(36).slice(2, 7)}`;
  for (let i = 0; i <= 4; i++) {
    const y = ymin + ((ymax - ymin) * i) / 4;
    el.append(svg('line', { x1: pad.l, x2: w - pad.r, y1: sy(y), y2: sy(y), class: 'grid' }),
      svg('text', { x: pad.l - 5, y: sy(y) + 3, class: 'axis', 'text-anchor': 'end' }, yFmt(y)));
  }
  for (const l of hLines) {
    el.append(svg('line', { x1: pad.l, x2: w - pad.r, y1: sy(l.y), y2: sy(l.y), class: 'hline' }),
      svg('text', { x: w - pad.r, y: sy(l.y) - 3, class: 'axis', 'text-anchor': 'end' }, l.label));
  }
  for (const t of xTicks) el.append(svg('text', { x: sx(t.x), y: hgt - 6, class: 'axis', 'text-anchor': 'middle' }, t.label));
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (s.area && s.points.length > 1) {
      const id = `${gid}${series.indexOf(s)}`;
      const base = hgt - pad.b;
      const first = s.points[0], last = s.points[s.points.length - 1];
      el.append(svg('defs', null, svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0', 'stop-color': s.color, 'stop-opacity': '.32' }), svg('stop', { offset: '1', 'stop-color': s.color, 'stop-opacity': '0' }))),
        svg('path', { d: `${d}L${sx(last.x).toFixed(1)},${base}L${sx(first.x).toFixed(1)},${base}Z`, fill: `url(#${id})`, class: 'area-fade' }));
    }
    el.append(svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.5, 'stroke-dasharray': s.dashed ? '4 3' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      class: s.dashed ? '' : 'line-draw', pathLength: s.dashed ? null : 1 }));
    if (s.dots) for (const p of s.points) el.append(svg('circle', { cx: sx(p.x), cy: sy(p.y), r: 2.8, fill: s.color, class: 'dot-pop' }));
  }
  return el;
}

// groups: [{ label, values: [{v, color}] }]
export function barChart({ groups, w = 340, hgt = 180, yFmt = (v) => num(v, 0), pad = { l: 42, r: 8, t: 10, b: 24 } }) {
  const vals = groups.flatMap((g) => g.values.map((x) => x.v || 0));
  if (!vals.some((v) => v > 0)) return h('div', { class: 'muted center' }, 'Пока нет данных');
  const ymax = Math.max(...vals) * 1.1;
  const el = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'chart', role: 'img' });
  const sy = (y) => pad.t + (1 - y / ymax) * (hgt - pad.t - pad.b);
  for (let i = 0; i <= 4; i++) {
    const y = (ymax * i) / 4;
    el.append(svg('line', { x1: pad.l, x2: w - pad.r, y1: sy(y), y2: sy(y), class: 'grid' }),
      svg('text', { x: pad.l - 5, y: sy(y) + 3, class: 'axis', 'text-anchor': 'end' }, yFmt(y)));
  }
  const gw = (w - pad.l - pad.r) / groups.length;
  groups.forEach((g, gi) => {
    const bw = Math.min(16, (gw * 0.8) / g.values.length);
    const x0 = pad.l + gi * gw + (gw - bw * g.values.length) / 2;
    g.values.forEach((b, bi) => {
      const y = sy(b.v || 0);
      el.append(svg('rect', { x: x0 + bi * bw, y, width: bw - 1, height: Math.max(0, hgt - pad.b - y), fill: b.color, rx: 3, class: 'bar' }));
    });
    el.append(svg('text', { x: pad.l + gi * gw + gw / 2, y: hgt - 8, class: 'axis', 'text-anchor': 'middle' }, g.label));
  });
  return el;
}

export function progressBar(frac, label) {
  const f = Math.max(0, Math.min(1.2, frac || 0));
  const fill = h('div', { class: 'pbar-fill' + (f > 1.05 ? ' over' : ''), style: { width: '0%' } });
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = Math.min(100, f * 100) + '%'; }));
  return h('div', { class: 'pbar', title: label }, fill);
}
