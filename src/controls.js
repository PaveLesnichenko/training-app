// Свои элементы вместо системных: список выбора и календарь открываются шторкой в стиле приложения.
// Исходные <select> и <input type="date"> остаются в разметке скрытыми: страницы продолжают читать .value и слушать change.
import { h, modal, icon } from './ui.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WD_FULL = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
const fmtDate = (s) => { if (!s) return ''; const { y, m, d } = parse(s); return `${d} ${MONTHS_SHORT[m]} ${y}, ${WD_FULL[new Date(Date.UTC(y, m, d)).getUTCDay()]}`; };

// ---------- список выбора ----------
function labelOf(sel) {
  const l = sel.closest('label');
  const t = l ? [...l.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())?.textContent.trim() : '';
  return t || sel.getAttribute('aria-label') || 'Выбери вариант';
}

function enhanceSelect(sel) {
  if (sel.dataset.enh) return; sel.dataset.enh = '1';
  const wrap = h('div', { class: 'sel' });
  const text = h('span', { class: 'sel-text' });
  const face = h('button', { type: 'button', class: 'sel-face', 'aria-haspopup': 'listbox', 'aria-label': sel.getAttribute('aria-label') || labelOf(sel) }, text, icon('chevron', 16));
  if (sel.style.width === 'auto') wrap.style.width = 'auto';
  for (const k of ['minHeight', 'padding', 'fontSize']) if (sel.style[k]) face.style[k] = sel.style[k];
  sel.parentNode.insertBefore(wrap, sel);
  wrap.append(face, sel);
  sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const sync = () => { text.textContent = sel.selectedOptions[0]?.textContent || '—'; face.classList.toggle('disabled', sel.disabled); };
  sync();
  sel.addEventListener('change', sync);
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true });
  face.addEventListener('click', () => {
    if (sel.disabled) return;
    modal(labelOf(sel), (body, close) => {
      const list = h('div', { class: 'opts', role: 'listbox' });
      [...sel.options].forEach((o) => {
        const on = o.value === sel.value;
        list.append(h('button', { type: 'button', class: 'opt' + (on ? ' on' : '') + (o.disabled ? ' disabled' : ''), role: 'option', 'aria-selected': on, disabled: o.disabled, onclick: () => {
          if (!on) { sel.value = o.value; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
          close();
        } }, h('span', null, o.textContent), on ? icon('check', 18) : null));
      });
      body.append(list);
      requestAnimationFrame(() => list.querySelector('.opt.on')?.scrollIntoView({ block: 'center' }));
    });
  });
}

// ---------- календарь ----------
function enhanceDate(input) {
  if (input.dataset.enh) return; input.dataset.enh = '1';
  const wrap = h('div', { class: 'sel date' });
  const text = h('span', { class: 'sel-text' });
  const face = h('button', { type: 'button', class: 'sel-face', 'aria-haspopup': 'dialog', 'aria-label': 'Выбрать дату' }, icon('calendar', 18), text);
  input.parentNode.insertBefore(wrap, input);
  wrap.append(face, input);
  input.tabIndex = -1; input.setAttribute('aria-hidden', 'true');
  const sync = () => { text.textContent = fmtDate(input.value) || 'Выбрать дату'; text.classList.toggle('placeholder', !input.value); };
  sync();
  input.addEventListener('input', sync); input.addEventListener('change', sync);
  new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['value', 'min', 'max'] });
  face.addEventListener('click', () => openCalendar(input, sync));
}

function openCalendar(input, sync) {
  const min = input.min || '', max = input.max || '';
  const start = parse(input.value || todayIso());
  let y = start.y, m = start.m;
  const lockedOut = (s) => (min && s < min) || (max && s > max);
  modal('Выбери дату', (body, close) => {
    const title = h('div', { class: 'cal-title' });
    const grid = h('div', { class: 'cal-grid' });
    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Предыдущий месяц', onclick: () => { m--; if (m < 0) { m = 11; y--; } draw(); } }, icon('back', 20));
    const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Следующий месяц', onclick: () => { m++; if (m > 11) { m = 0; y++; } draw(); } }, icon('chevron', 20));
    const pick = (s) => {
      if (lockedOut(s)) return;
      input.value = s; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      sync(); close();
    };
    function draw() {
      title.textContent = `${MONTHS[m]} ${y}`;
      grid.replaceChildren(...WEEKDAYS.map((d) => h('div', { class: 'cal-wd' }, d)));
      const offset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
      const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let i = 0; i < offset; i++) grid.append(h('div'));
      const sel = input.value, now = todayIso();
      for (let d = 1; d <= days; d++) {
        const s = iso(y, m, d), off = lockedOut(s);
        grid.append(h('button', { type: 'button', class: 'cal-day' + (s === sel ? ' sel' : '') + (s === now ? ' today' : ''), disabled: off, 'aria-label': fmtDate(s), onclick: () => pick(s) }, d));
      }
      prev.disabled = !!(min && iso(y, m, 1) <= min);
      next.disabled = !!(max && iso(y, m, days) >= max);
    }
    body.append(h('div', { class: 'cal-head' }, prev, title, next), grid,
      h('div', { class: 'cal-foot' },
        h('button', { type: 'button', class: 'btn small', disabled: lockedOut(todayIso()), onclick: () => pick(todayIso()) }, 'Сегодня'),
        h('button', { type: 'button', class: 'btn small', onclick: close }, 'Закрыть')));
    draw();
  });
}

// ---------- подключение ----------
function enhanceAll(root) {
  root.querySelectorAll?.('select:not([data-enh])').forEach(enhanceSelect);
  root.querySelectorAll?.('input[type="date"]:not([data-enh])').forEach(enhanceDate);
}

export function initControls() {
  enhanceAll(document.body);
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches?.('select:not([data-enh])')) enhanceSelect(n);
      else if (n.matches?.('input[type="date"]:not([data-enh])')) enhanceDate(n);
      enhanceAll(n);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
