import { load, onChange } from './store.js';
import { start, route, rerender } from './router.js';
import { h } from './ui.js';
import { glyph } from './art.js';
import { initControls } from './controls.js';
import { todayPage } from './pages/today.js';
import { planPage } from './pages/plan.js';
import { dayPage } from './pages/day.js';
import { pmPage } from './pages/pm.js';
import { foodPage } from './pages/food.js';
import { weightPage } from './pages/weight.js';
import { morePage, progressPage, exercisesPage, settingsPage, reportPage } from './pages/more.js';
import { aiPage } from './pages/ai.js';

const TABS = [
  ['today', 'Сегодня', 'home'], ['plan', 'План', 'calendar'], ['pm', 'ПМ', 'dumbbell'],
  ['food', 'Питание', 'utensils'], ['weight', 'Вес', 'scale'], ['more', 'Ещё', 'dots'],
];

function buildTabs() {
  const nav = document.getElementById('tabs');
  TABS.forEach(([id, label, g]) => {
    nav.append(h('a', { href: `#/${id}`, 'data-tab': id }, glyph(g, 22), label));
  });
  document.addEventListener('routechange', (e) => {
    nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.tab === e.detail.tab));
  });
}

async function boot() {
  await load();
  route('/today', todayPage, 'today');
  route('/plan', planPage, 'plan');
  route('/plan/:cycle', planPage, 'plan');
  route('/day/:key', dayPage, 'plan');
  route('/pm', pmPage, 'pm');
  route('/food', foodPage, 'food');
  route('/food/:date', foodPage, 'food');
  route('/weight', weightPage, 'weight');
  route('/more', morePage, 'more');
  route('/more/progress', progressPage, 'more');
  route('/more/exercises', exercisesPage, 'more');
  route('/more/settings', settingsPage, 'more');
  route('/more/report', reportPage, 'more');
  route('/more/ai', aiPage, 'more');
  buildTabs();
  initControls();
  start(document.getElementById('app'));
  onChange(() => { /* страницы сами вызывают rerender() после действий */ });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
export { rerender };
