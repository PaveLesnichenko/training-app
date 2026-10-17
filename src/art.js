// Графика интерфейса: иконки, иллюстрации, кольца прогресса, анимации. Всё на SVG и CSS, без картинок и сети.
import { svg, h } from './ui.js';

let uidN = 0;
const uid = () => `g${(uidN++).toString(36)}`;

// ---------- иконки (24×24, линия) ----------
const G = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M8 14h2M12 14h2M8 17h2"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  utensils: '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M17 3c-2.2 1.6-2.2 6.4 0 8.2V21"/>',
  scale: '<rect x="3.5" y="4" width="17" height="16" rx="3.5"/><path d="M8 9.5a5.2 5.2 0 0 1 8 0"/><path d="m12 9.5 1.8-2"/>',
  dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  sunrise: '<path d="M12 3.5v3M5 7.5l2 2M19 7.5l-2 2M2.5 18h19"/><path d="M7 18a5 5 0 0 1 10 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  cup: '<path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z"/><path d="M17 10h1.4a2.4 2.4 0 0 1 0 4.8H17M8 3.5v2M12 3.5v2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  meat: '<path d="M4.5 14c-.9-4.2 2.3-9 8.5-9 4.6 0 6.8 2.7 6 6.5-.9 4.2-4.8 7.5-9.800 7.500-3.200 0-4.200-2-4.700-5Z"/><circle cx="14" cy="11" r="2"/>',
  fish: '<path d="M2.5 12c3-5 9.500-6.200 13.500-3l5.500-3v12L16 15c-4 3.200-10.500 2-13.500-3Z"/><circle cx="8" cy="11" r=".9" fill="currentColor"/>',
  egg: '<path d="M12 3c-4 0-7 6.500-7 10.500a7 7 0 0 0 14 0C19 9.500 16 3 12 3Z"/>',
  dairy: '<path d="M8.500 3h7L14.500 7 17 10.500V20a1.200 1.200 0 0 1-1.200 1.200H8.200A1.200 1.200 0 0 1 7 20v-9.500L9.500 7Z"/><path d="M7 14h10"/>',
  grain: '<path d="M12 21V9"/><path d="M12 9c0-3 1.500-4.500 3-5.500 0 3-1 5-3 5.500ZM12 9c0-3-1.500-4.500-3-5.500 0 3 1 5 3 5.500ZM12 14c0-3 2-4.500 4-5.500 0 3-1.200 5-4 5.500ZM12 14c0-3-2-4.500-4-5.500 0 3 1.200 5 4 5.500ZM12 19c0-3 2-4.500 4-5.500 0 3-1.200 5-4 5.500ZM12 19c0-3-2-4.500-4-5.500 0 3 1.200 5 4 5.500Z"/>',
  leaf: '<path d="M5 19C5 10 10 5 20 4c0 9-4 15-13 15Z"/><path d="m5 19 8-8"/>',
  apple: '<path d="M12 7.500c-3-2.200-7.500-.5-7.500 4.500 0 4.200 3 8.500 5.500 8.500 1 0 1.300-.6 2-.6s1 .6 2 .6c2.500 0 5.500-4.300 5.500-8.500 0-5-4.500-6.700-7.500-4.500Z"/><path d="M12 7.500c0-2 1-3.500 3-4.500"/>',
  nut: '<path d="M12 3c4 0 7 3 7 8 0 6-3 10-7 10s-7-4-7-10c0-5 3-8 7-8Z"/><path d="M9 10.500l6 5"/>',
  bottle: '<path d="M10 2.500h4v3l2 3V20a1.200 1.200 0 0 1-1.200 1.200H9.200A1.200 1.200 0 0 1 8 20V8.500l2-3Z"/><path d="M8 13h8"/>',
  bowl: '<path d="M3 11.500h18a9 9 0 0 1-18 0Z"/><path d="M8.500 7.500c0-2 2-2 2-4M13.500 7.500c0-2 2-2 2-4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H4.500v1A3.500 3.500 0 0 0 8 10.500M16 6h3.500v1a3.500 3.500 0 0 1-3.500 3.500M12 13v4M8 21h8M10 17h4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.200" fill="currentColor"/>',
  flame: '<path d="M12 3c1 3.500 5.500 5.500 5.500 10.500a5.500 5.500 0 0 1-11 0c0-2.200 1-3.500 2.200-4.700.2 2 1 3 2.300 3 0-3.300-1.200-5.300 1-8.800Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.500" cy="6" r="1"/><circle cx="3.500" cy="12" r="1"/><circle cx="3.500" cy="18" r="1"/>',
  walk: '<circle cx="13" cy="4.500" r="1.800"/><path d="m9 21 2.500-6-2-3 1.500-4.500 3 1.500 2.500 3M8 12l-2.500 2M15 8.500 18 10"/>',
  bolt: '<path d="M13 2.500 4.500 13.500H11L10 21.500 19.500 10H13Z"/>',
};
export function glyph(name, size = 22) {
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'ic glyph', 'aria-hidden': 'true' });
  el.innerHTML = G[name] || '';
  return el;
}

// ---------- мышечные группы и категории продуктов ----------
export const MUSCLES = {
  legs: { name: 'Ноги', color: '#5b9dff' }, chest: { name: 'Грудь', color: '#fbbf24' }, back: { name: 'Спина', color: '#34d399' },
  shoulders: { name: 'Плечи', color: '#a78bfa' }, arms: { name: 'Руки', color: '#fb7185' }, core: { name: 'Корпус', color: '#22d3ee' },
};
export const MEAL_ART = [
  { glyph: 'sunrise', color: '#fbbf24', tint: 'rgba(251,191,36,.14)' },
  { glyph: 'sun', color: '#fb923c', tint: 'rgba(251,146,60,.14)' },
  { glyph: 'cup', color: '#34d399', tint: 'rgba(52,211,153,.14)' },
  { glyph: 'utensils', color: '#818cf8', tint: 'rgba(129,140,248,.16)' },
  { glyph: 'moon', color: '#a78bfa', tint: 'rgba(167,139,250,.16)' },
];
export function foodArt(food) {
  const g = food?.group || '', n = (food?.name || '').toLowerCase();
  if (/яйц/.test(n)) return { glyph: 'egg', color: '#fbbf24' };
  if (g === 'Мясо, птица, колбаса') return { glyph: 'meat', color: '#fb7185' };
  if (g === 'Рыба, суши, морепродукты') return { glyph: 'fish', color: '#22d3ee' };
  if (g === 'Молочные продукты') return { glyph: 'dairy', color: '#93c5fd' };
  if (g === 'Крупы, хлопья, макаронные изделия' || g === 'Мучное') return { glyph: 'grain', color: '#fbbf24' };
  if (g === 'Овощи' || g === 'Грибы, соления' || g === 'Приправы, зелень') return { glyph: 'leaf', color: '#34d399' };
  if (g === 'Фрукты') return { glyph: 'apple', color: '#f472b6' };
  if (g === 'Орехи, сухофрукты' || g === 'Бобовые, семечки') return { glyph: 'nut', color: '#fb923c' };
  if (g === 'Масло, жиры, майонез') return { glyph: 'bottle', color: '#facc15' };
  if (g === 'Спортпит') return { glyph: 'bolt', color: '#a78bfa' };
  return { glyph: 'bowl', color: '#94a3b8' };
}
export function tile(art, size = 36) {
  return h('span', { class: 'tile', style: { width: size + 'px', height: size + 'px', color: art.color, background: art.tint || `color-mix(in srgb, ${art.color} 15%, transparent)` } }, glyph(art.glyph, Math.round(size * 0.55)));
}

// ---------- иллюстрации ----------
function art(markup, cls) {
  const el = svg('svg', { viewBox: '0 0 200 140', class: 'art ' + (cls || ''), 'aria-hidden': 'true' });
  el.innerHTML = markup;
  return el;
}
export function illustration(name) {
  const a = uid(), b = uid(), c = uid();
  if (name === 'barbell') return art(`
    <defs>
      <linearGradient id="${a}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cb2ff"/><stop offset="1" stop-color="#6f5cff"/></linearGradient>
      <linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe6ff"/><stop offset="1" stop-color="#8e9cc2"/></linearGradient>
      <radialGradient id="${c}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#6aa7ff" stop-opacity=".45"/><stop offset="1" stop-color="#6aa7ff" stop-opacity="0"/></radialGradient>
    </defs>
    <circle cx="100" cy="70" r="66" fill="url(#${c})"/>
    <rect x="24" y="64" width="152" height="12" rx="6" fill="url(#${b})"/>
    <g class="art-float"><rect x="46" y="30" width="16" height="80" rx="7" fill="url(#${a})"/><rect x="138" y="30" width="16" height="80" rx="7" fill="url(#${a})"/></g>
    <rect x="64" y="42" width="12" height="56" rx="5" fill="url(#${a})" opacity=".8"/><rect x="124" y="42" width="12" height="56" rx="5" fill="url(#${a})" opacity=".8"/>
    <rect x="26" y="52" width="14" height="36" rx="6" fill="#fbbf24"/><rect x="160" y="52" width="14" height="36" rx="6" fill="#fbbf24"/>
    <circle cx="170" cy="22" r="2" fill="#fff" opacity=".8" class="art-twinkle"/><circle cx="28" cy="34" r="1.5" fill="#fff" opacity=".7" class="art-twinkle"/>`, 'art-barbell');
  if (name === 'bowl') return art(`
    <defs><linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a73"/><stop offset="1" stop-color="#1c2540"/></linearGradient>
    <radialGradient id="${c}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#34d399" stop-opacity=".35"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></radialGradient></defs>
    <circle cx="100" cy="78" r="64" fill="url(#${c})"/>
    <g class="art-float"><circle cx="78" cy="62" r="15" fill="#fb7185"/><circle cx="104" cy="54" r="17" fill="#fbbf24"/><circle cx="126" cy="66" r="13" fill="#34d399"/><circle cx="96" cy="70" r="11" fill="#fb923c"/></g>
    <path d="M36 78h128a64 52 0 0 1-128 0Z" fill="url(#${a})" stroke="#5b6c99" stroke-width="2"/>
    <path d="M62 112h76" stroke="#5b6c99" stroke-width="2" stroke-linecap="round" opacity=".6"/>
    <path d="M86 34c0-8 8-8 8-16M110 30c0-8 8-8 8-16" fill="none" stroke="#8f9bb3" stroke-width="2.5" stroke-linecap="round" opacity=".5" class="art-steam"/>`, 'art-bowl');
  if (name === 'scale') return art(`
    <defs><linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3b63"/><stop offset="1" stop-color="#18213b"/></linearGradient>
    <radialGradient id="${c}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#a78bfa" stop-opacity=".35"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient></defs>
    <circle cx="100" cy="72" r="64" fill="url(#${c})"/>
    <rect x="38" y="30" width="124" height="86" rx="22" fill="url(#${a})" stroke="#5b6c99" stroke-width="2"/>
    <path d="M64 70a36 36 0 0 1 72 0" fill="none" stroke="#7c6cff" stroke-width="6" stroke-linecap="round" opacity=".35"/>
    <path d="M64 70a36 36 0 0 1 46-34" fill="none" stroke="#6aa7ff" stroke-width="6" stroke-linecap="round"/>
    <g class="art-needle"><path d="M100 78 124 52" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/></g><circle cx="100" cy="78" r="6" fill="#fbbf24"/>
    <rect x="70" y="92" width="60" height="8" rx="4" fill="#2a3659"/>`, 'art-scale');
  if (name === 'chart') return art(`
    <defs><linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6aa7ff" stop-opacity=".5"/><stop offset="1" stop-color="#6aa7ff" stop-opacity="0"/></linearGradient></defs>
    <path d="M20 108 64 78 98 92 140 48 180 30V120H20Z" fill="url(#${a})"/>
    <path class="art-line" d="M20 108 64 78 98 92 140 48 180 30" fill="none" stroke="#6aa7ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
    <circle cx="180" cy="30" r="6" fill="#fbbf24"/>`, 'art-chart');
  return art('');
}

// ---------- кольцо прогресса ----------
// ring({ value, max, size, stroke, color, track }) → div.ring; центр заполняется через children.
export function ring({ value = 0, max = 1, size = 120, stroke = 10, color = 'var(--accent)', over = 'var(--warn)', children = [], label = '' } = {}) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const tone = max > 0 && value / max > 1.05 ? over : color;
  const el = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ring-svg' },
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--card3)', 'stroke-width': stroke }),
    svg('circle', { class: 'ring-arc', cx: size / 2, cy: size / 2, r, fill: 'none', stroke: tone, 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': C, 'stroke-dashoffset': C, transform: `rotate(-90 ${size / 2} ${size / 2})`, 'data-target': C * (1 - frac) }));
  const arc = el.querySelector('.ring-arc');
  requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = arc.dataset.target; }));
  return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' }, role: 'img', 'aria-label': label, 'data-value': value, 'data-max': max }, el, h('div', { class: 'ring-center' }, ...children));
}

// ---------- анимации ----------
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Плавный счётчик: element.textContent от 0 до значения.
export function countUp(el, to, { d = 0, ms = 700, suffix = '' } = {}) {
  const fmt = (v) => (d ? v.toFixed(d).replace('.', ',') : String(Math.round(v))) + suffix;
  if (reduced() || !isFinite(to)) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Вызывается после отрисовки страницы: лесенка появления, заполнение колец, полос и счётчиков.
export function enter(root) {
  if (!root || root.nodeType !== 1) return;
  root.classList.add('page');
  [...root.children].slice(0, 14).forEach((c, i) => c.style.setProperty('--i', i));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.ring-arc').forEach((a) => { a.style.strokeDashoffset = a.dataset.target; });
    root.querySelectorAll('.pbar-fill[data-w]').forEach((b) => { b.style.width = b.dataset.w; });
    root.querySelectorAll('.chart .bar').forEach((b, i) => { b.style.animationDelay = `${i * 25}ms`; });
  }));
  root.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), { d: Number(el.dataset.d || 0), suffix: el.dataset.suffix || '' }));
}

// ---------- праздник после тренировки ----------
export function celebrate(title, sub) {
  return new Promise((resolve) => {
    const colors = ['#6aa7ff', '#7c6cff', '#fbbf24', '#34d399', '#fb7185', '#22d3ee'];
    const pieces = Array.from({ length: 28 }, (_, i) => h('i', { class: 'confetti', style: {
      left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 9) * 60}ms`, animationDuration: `${1100 + (i % 5) * 160}ms`, transform: `rotate(${i * 31}deg)`,
    } }));
    const overlay = h('div', { class: 'celebrate', onclick: () => finish() },
      ...(reduced() ? [] : pieces),
      h('div', { class: 'celebrate-card' },
        svg('svg', { viewBox: '0 0 80 80', width: 84, height: 84, class: 'done-check' },
          svg('circle', { cx: 40, cy: 40, r: 34, fill: 'none', stroke: 'var(--ok)', 'stroke-width': 5, class: 'done-circle' }),
          svg('path', { d: 'M24 41l11 11 21-24', fill: 'none', stroke: 'var(--ok)', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'done-tick' })),
        h('h2', null, title), h('p', { class: 'muted' }, sub)));
    let closed = false;
    const finish = () => { if (closed) return; closed = true; overlay.classList.add('out'); setTimeout(() => { overlay.remove(); resolve(); }, 220); };
    document.body.append(overlay);
    setTimeout(finish, reduced() ? 900 : 2100);
  });
}
