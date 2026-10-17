// Хранилище: IndexedDB (ключ → JSON), всё держим в памяти, пишем сразу после изменения.
// Если IndexedDB недоступна (приватный режим и т. п.) — откат на localStorage, затем на память.
import { DEFAULT_GROWTH } from './engine.js';

const DB_NAME = 'training-app', STORE = 'kv';

export const defaults = () => ({
  settings: {
    startDate: null, weekdays: [1, 3, 5],
    cardioOn: true, cardioBase: 20, cardioType: 'incline', cardioShare: 0.5,
    disabled: {},
    profile: { sex: 'm', age: null, height: null, weight: null, activity: 'medium', goal: 'gain', pace: 'moderate' },
    kcalAdjust: 0, kcalAdjustAt: null, dayBoost: false, menuVariants: 3, mealsPerDay: 4,
  },
  pm: { main: {}, growth: DEFAULT_GROWTH, coefs: {}, own: {}, history: [] },
  workouts: {},
  weights: [],
  foods: { custom: [], mine: [], roles: {}, meals: {} },
  menu: null,       // универсальное меню: приёмы × варианты
  foodlog: {},      // дата → приём → отметки съеденного
  ai: { history: [] },   // последние разборы нейросети
  secrets: { aiKey: '' }, // ключ доступа: хранится отдельно и не попадает в экспорт
});

let db = null, mode = 'memory';
export const state = defaults();
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idbGetAll = () => new Promise((resolve, reject) => {
  const out = {}; const tx = db.transaction(STORE).objectStore(STORE).openCursor();
  tx.onsuccess = () => { const c = tx.result; if (c) { out[c.key] = c.value; c.continue(); } else resolve(out); };
  tx.onerror = () => reject(tx.error);
});
const idbPut = (key, val) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key);
  tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
});

export async function load() {
  let saved = {};
  try {
    db = await idbOpen(); mode = 'idb'; saved = await idbGetAll();
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    try {
      const raw = localStorage.getItem(DB_NAME); if (raw) saved = JSON.parse(raw); mode = 'ls';
    } catch { mode = 'memory'; }
  }
  merge(saved);
  return mode;
}

function merge(saved) {
  const d = defaults();
  for (const key of Object.keys(d)) {
    if (saved[key] === undefined) { state[key] = d[key]; continue; }
    state[key] = d[key] === null || Array.isArray(d[key]) || typeof d[key] !== 'object' ? saved[key] : deepFill(d[key], saved[key]);
  }
}
function deepFill(def, val) {
  if (val === null || typeof val !== 'object' || Array.isArray(val)) return val;
  const out = { ...val };
  for (const k of Object.keys(def)) if (out[k] === undefined) out[k] = def[k];
  return out;
}

export const storageMode = () => mode;

// save('workouts') после изменения state.workouts
export function save(key) {
  const val = JSON.parse(JSON.stringify(state[key]));
  if (mode === 'idb') idbPut(key, val).catch(() => {});
  else if (mode === 'ls') { try { localStorage.setItem(DB_NAME, JSON.stringify(state)); } catch { /* квота */ } }
  listeners.forEach((fn) => fn(key));
}

export function exportAll() {
  const { secrets, ...data } = state;   // ключ нейросети в резервную копию не кладём
  if (data.settings?.ai && 'key' in data.settings.ai) data.settings = { ...data.settings, ai: { ...data.settings.ai, key: undefined } };   // страховка: ключ не должен попасть в настройки
  return JSON.stringify({ app: 'training-app', version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
}

export async function importAll(text) {
  const obj = JSON.parse(text);
  if (obj.app !== 'training-app' || !obj.data) throw new Error('Это не файл резервной копии приложения');
  const keep = state.secrets;
  merge({ ...obj.data, secrets: keep });
  for (const key of Object.keys(defaults())) save(key);
}

export async function resetAll() {
  merge({});
  for (const key of Object.keys(defaults())) save(key);
}
