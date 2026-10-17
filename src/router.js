// Маршрутизатор на hash: '#/day/0.3.2' → page({ key: '0.3.2' })
import { enter } from './art.js';
const routes = [];
let root = null, current = null;

export function route(pattern, fn, tab) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, fn, tab });
}
export const go = (path) => { location.hash = '#' + path; };
export const here = () => location.hash.replace(/^#/, '') || '/today';

export function rerender() {
  const y = window.scrollY;
  draw();
  window.scrollTo(0, y);
}

function draw() {
  const path = here();
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    current = r;
    let el;
    try { el = r.fn(params); } catch (e) { el = document.createElement('pre'); el.textContent = 'Ошибка: ' + (e.stack || e); console.error(e); }
    root.replaceChildren(el);
    enter(el);
    document.dispatchEvent(new CustomEvent('routechange', { detail: { tab: r.tab } }));
    return;
  }
  go('/today');
}

export function start(container) {
  root = container;
  window.addEventListener('hashchange', () => { draw(); window.scrollTo(0, 0); });
  draw();
}
