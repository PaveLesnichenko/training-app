// Нейросеть-помощник: запросы к любому сервису с форматом OpenAI (Gemini, DeepSeek, Groq, OpenRouter, Ollama).
// Без DOM: тестируется в Node. Ключ лежит отдельно (state.secrets) и не попадает в экспорт.
import { state, save } from './store.js';
import * as E from './engine.js';
import * as S from './session.js';
import { buildReport } from './report.js';
import { MAIN_NAMES } from './exercises.js';

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini', label: 'Google Gemini · бесплатно', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest', json: true,
    keyUrl: 'https://aistudio.google.com/apikey', free: true, fallbackModels: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
    note: 'Есть бесплатный тариф. На бесплатном тарифе Google может использовать запросы для улучшения своих продуктов.',
  },
  deepseek: {
    name: 'DeepSeek', label: 'DeepSeek · дёшево', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', json: true,
    keyUrl: 'https://platform.deepseek.com/api_keys', free: false,
    note: 'Платный, но очень дешёвый (пополнение баланса). Серверы находятся в Китае.',
  },
  groq: {
    name: 'Groq', label: 'Groq · бесплатно', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', json: true,
    keyUrl: 'https://console.groq.com/keys', free: true, fallbackModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], note: 'Бесплатный тариф с дневными лимитами, очень быстрый.',
  },
  openrouter: {
    name: 'OpenRouter', label: 'OpenRouter · есть free', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', json: false,
    keyUrl: 'https://openrouter.ai/keys', free: true, note: 'Часть моделей бесплатна (с пометкой :free), лимиты небольшие.',
  },
  ollama: {
    name: 'Ollama (на твоём компьютере)', label: 'Ollama · на компьютере', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', json: false, noKey: true,
    keyUrl: 'https://ollama.com/download', free: true, note: 'Без отправки данных в интернет. Работает, только пока включён компьютер с Ollama; страница должна открываться по http в той же сети.',
  },
  custom: { name: 'Другой сервис (формат OpenAI)', label: 'Другой сервис', baseUrl: '', model: '', json: false, keyUrl: '', free: false, note: 'Любой сервис с адресом вида …/v1/chat/completions.' },
};

export const defaultAiSettings = () => ({
  provider: 'gemini', baseUrl: PROVIDERS.gemini.baseUrl, model: PROVIDERS.gemini.model,
  send: { profile: true, training: true, nutrition: true, weight: true }, days: 14,
});

export function aiConfig() {
  const a = { ...defaultAiSettings(), ...(state.settings.ai || {}) };
  a.send = { ...defaultAiSettings().send, ...(a.send || {}) };
  return { ...a, key: state.secrets?.aiKey || '' };
}
export const aiReady = () => { const c = aiConfig(); return !!(c.baseUrl && c.model && (c.key || PROVIDERS[c.provider]?.noKey)); };

export function setProvider(id) {
  const p = PROVIDERS[id]; if (!p) return;
  state.settings.ai = { ...aiConfig(), provider: id, baseUrl: p.baseUrl || aiConfig().baseUrl, model: p.model || aiConfig().model };
  delete state.settings.ai.key;
  save('settings');
}

// ---------- запрос ----------
export class AiError extends Error {
  // detail: технические подробности для окна «Что именно пошло не так» (без ключа)
  constructor(kind, message, status, detail) { super(message); this.kind = kind; this.status = status; this.detail = detail || null; }
}

function errorText(body) {
  // Gemini возвращает массив [{error}], остальные — {error: {message}} или {error: "..."}
  const first = Array.isArray(body) ? body[0] : body;
  const e = first?.error;
  return (typeof e === 'string' ? e : e?.message) || first?.message || '';
}

const KIND_TEXT = {
  auth: 'Ключ не подошёл. Проверь, что он скопирован целиком и что выбран тот сервис.',
  key: 'В ключе есть недопустимые символы: пробел, перенос строки или русская буква. Скопируй ключ заново и вставь целиком.',
  region: 'Сервис не работает из твоей страны или региона. Нужен VPN, либо выбери другой сервис (DeepSeek, Groq, OpenRouter).',
  quota: 'Бесплатная квота этого ключа для выбранной модели закончилась (или равна нулю). Подожди до завтра, выбери другую модель (у каждой модели свой лимит) или включи оплату в аккаунте сервиса.',
  rate: 'Лимит запросов исчерпан. Подожди минуту, а если не помогло, то до завтра, или выбери другую модель.',
  model: 'Эта модель недоступна: сервис её не нашёл или больше не выдаёт новым пользователям. Выбери другую из списка (для Gemini лучше всего gemini-flash-latest).',
  server: 'Сервис перегружен или временно недоступен (у Gemini код 503 так и значит). Я уже повторял запрос несколько раз. Подожди минуту и попробуй снова, либо выбери другую, менее загруженную модель, например Flash-Lite.',
  network: 'Не удалось связаться с сервисом. Проверь интернет и адрес (для Ollama — что компьютер включён).',
  timeout: 'Сервис слишком долго отвечает. Попробуй ещё раз или выбери модель быстрее.',
  format: 'Нейросеть вернула ответ не в том формате. Нажми «Сделать разбор» ещё раз.',
  other: 'Сервис вернул ошибку.',
};

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// Временные сбои (перегрузка 503, 500, лимит в минуту 429) повторяем с паузами; остальное — сразу ошибка.
// retryDelays можно подменить в тестах: window.__aiRetryDelays = [0, 0].
export async function chat({ baseUrl, key, model, messages, json = false, maxTokens = 3000, temperature = 0.3, timeoutMs = 60000, fetchImpl = globalThis.fetch, signal, retryDelays, onRetry } = {}) {
  if (!baseUrl || !model) throw new AiError('other', 'Не заполнены адрес сервиса или модель.');
  if (key && !/^[\x21-\x7E]+$/.test(key)) throw new AiError('key', KIND_TEXT.key);
  const delays = retryDelays ?? globalThis.__aiRetryDelays ?? [1000, 3000, 6000];
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await chatOnce({ baseUrl, key, model, messages, json, maxTokens, temperature, timeoutMs, fetchImpl, signal });
      return r;
    } catch (e) {
      if (!(e instanceof AiError) || !e.retryable || attempt >= delays.length) {
        if (e instanceof AiError && attempt > 0) e.attempts = attempt + 1;
        throw e;
      }
      const wait = Math.min(10000, e.retryAfterMs ?? delays[attempt]);
      onRetry?.({ attempt: attempt + 1, of: delays.length, status: e.status });
      await sleepMs(wait);
    }
  }
}

async function chatOnce({ baseUrl, key, model, messages, json, maxTokens, temperature, timeoutMs, fetchImpl, signal }) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('timeout')), timeoutMs);
  if (signal) signal.addEventListener('abort', () => ctl.abort(signal.reason));
  const post = async (withJson) => {
    const body = { model, messages, temperature, max_tokens: maxTokens };
    if (withJson) body.response_format = { type: 'json_object' };
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    return fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
  };
  try {
    let res;
    try { res = await post(json); } catch (e) {
      if (ctl.signal.aborted && /timeout/.test(String(ctl.signal.reason?.message || ctl.signal.reason))) throw new AiError('timeout', KIND_TEXT.timeout);
      if (ctl.signal.aborted) throw new AiError('other', 'Запрос отменён.');
      throw new AiError('network', KIND_TEXT.network, 0, { status: 0, url, model, message: String(e?.message || e) });
    }
    let data = null;
    try { data = await res.json(); } catch { /* пустой или не JSON */ }
    // не все сервисы понимают response_format: повторяем без него
    if (!res.ok && json && /response_format|json_object|json mode/i.test(errorText(data))) {
      res = await post(false);
      try { data = await res.json(); } catch { data = null; }
    }
    if (!res.ok) {
      const msg = errorText(data);
      const st = res.status;
      const kind = /location is not supported|not available in your (country|region)|unsupported.{0,20}(country|region)/i.test(msg) ? 'region'
        : st === 429 && /limit:\s*0/i.test(msg) ? 'quota'
        : st === 429 && /retry (in|after)\s*[\d.]+\s*s/i.test(msg) ? 'rate'
        : st === 429 && /free_tier|free tier|exceeded your current quota|billing/i.test(msg) ? 'quota'
        : st === 401 || st === 403 || (st === 400 && /api key|apikey|credential|auth/i.test(msg)) ? 'auth'
        : st === 429 ? 'rate' : st === 404 ? 'model' : st >= 500 ? 'server' : 'other';
      const err = new AiError(kind, `${KIND_TEXT[kind]}${msg ? ` (${msg.slice(0, 160)})` : ''}`, st, { status: st, url, model, message: msg || '(пустой ответ)' });
      err.retryable = kind === 'server' || kind === 'rate';
      const ra = Number(res.headers?.get?.('retry-after'));
      const hint = /retry (?:in|after)\s*([\d.]+)\s*s/i.exec(msg);   // Gemini: «Please retry in 25.4s»
      if (isFinite(ra) && ra > 0) err.retryAfterMs = ra * 1000;
      else if (hint) err.retryAfterMs = Math.ceil(Number(hint[1])) * 1000;
      throw err;
    }
    const content = data?.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((p) => p.text || '').join('') : String(content ?? '');
    if (!text.trim()) throw new AiError('format', 'Нейросеть вернула пустой ответ. Попробуй ещё раз.');
    return { text: text.trim(), usage: data?.usage || null };
  } finally { clearTimeout(timer); }
}

// ---------- разбор JSON из ответа ----------
export function parseJsonLoose(text) {
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AiError('format', KIND_TEXT.format);
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { throw new AiError('format', KIND_TEXT.format); }
  }
}

// ---------- подсказки: проверка и применение ----------
export const LIMITS = { pmPercent: 5, kcalDelta: 300, kcalTotal: 400, max: 4 };
const round05 = (x) => Math.round(x * 2) / 2;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function currentAbs() { const d = S.nextWorkout(); return d ? E.absMc(d.cycle, d.mc) : 0; }

// Нейросеть предлагает, приложение проверяет границы. Всё, что вне допустимого, отбрасывается или обрезается.
export function normalizeSuggestions(raw) {
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= LIMITS.max) break;
    if (r?.type === 'pm' && ['squat', 'bench', 'deadlift'].includes(r.exercise)) {
      let pct = Number(r.percent);
      if (!isFinite(pct) || Math.abs(pct) < 0.5) continue;
      pct = Math.max(-LIMITS.pmPercent, Math.min(LIMITS.pmPercent, pct));
      const cur = E.mainPm(state.pm, r.exercise, currentAbs());
      if (!cur) continue;
      const next = round05(cur * (1 + pct / 100));
      if (next === round05(cur)) continue;
      out.push({ type: 'pm', exercise: r.exercise, percent: Math.round(pct * 10) / 10, from: round05(cur), to: next, reason: clip(r.reason, 220) });
    } else if (r?.type === 'kcal') {
      let d = Number(r.delta);
      if (!isFinite(d)) continue;
      d = Math.round(Math.max(-LIMITS.kcalDelta, Math.min(LIMITS.kcalDelta, d)) / 50) * 50;
      if (!d) continue;
      out.push({ type: 'kcal', delta: d, reason: clip(r.reason, 220) });
    }
  }
  return out;
}

export function applySuggestion(s) {
  if (s.type === 'pm') {
    const abs = currentAbs();
    state.pm.main[s.exercise] = { value: s.to, at: abs };
    state.pm.history.push({ date: E.todayStr(), key: s.exercise, value: s.to, at: abs });
    save('pm');
    return `ПМ ${MAIN_NAMES[s.exercise].toLowerCase()}: ${s.from} → ${s.to} кг`;
  }
  if (s.type === 'kcal') {
    const next = Math.max(-LIMITS.kcalTotal, Math.min(LIMITS.kcalTotal, (state.settings.kcalAdjust || 0) + s.delta));
    state.settings.kcalAdjust = next; state.settings.kcalAdjustAt = Date.now();
    save('settings');
    return `Коррекция калорий: ${next > 0 ? '+' : ''}${next} ккал`;
  }
  return '';
}

const comma = (x) => String(x).replace('.', ',');
export const describeSuggestion = (s) => (s.type === 'pm'
  ? `${MAIN_NAMES[s.exercise]}: ПМ ${s.percent > 0 ? '+' : ''}${comma(s.percent)} % (${comma(s.from)} → ${comma(s.to)} кг)`
  : `Калории ${s.delta > 0 ? '+' : ''}${s.delta} ккал в день`);

// ---------- запросы к тренеру ----------
export const SYSTEM_PROMPT = `Ты — спокойный и внимательный тренер-аналитик в личном дневнике силовых тренировок и питания. Пользователь занимается по программе из 12 микроциклов (3 тренировки в неделю), у программы есть план и фактические отметки.
Правила:
- Отвечай по-русски, коротко и по делу, без воды. Опирайся только на присланные данные. Если данных мало, прямо скажи об этом.
- Не ставь диагнозов, не советуй лекарства, добавки, гормоны и стероиды. При боли, травме, головокружении или других симптомах посоветуй обратиться к врачу.
- Не предлагай резких изменений. Повторный максимум (ПМ) меняй не более чем на 5 % за раз, калории не более чем на 300 ккал за раз.
- Прогресс веса оценивай по тренду за 2 недели, а не по отдельным дням.`;

const JSON_SCHEMA = `Верни ТОЛЬКО JSON без пояснений и без markdown, строго такого вида:
{
  "summary": "общий вывод, 2–4 предложения",
  "training": ["наблюдение или совет по тренировкам", "..."],
  "nutrition": ["наблюдение или совет по питанию и весу", "..."],
  "suggestions": [
    { "type": "pm", "exercise": "squat | bench | deadlift", "percent": число от -5 до 5, "reason": "почему" },
    { "type": "kcal", "delta": число от -300 до 300, "reason": "почему" }
  ]
}
Поле suggestions может быть пустым массивом, если менять нечего. Не больше 4 предложений.`;

// Если выбранная модель недоступна (404) или перегружена (503 после повторов), пробуем запасные модели сервиса.
// Недоступную (404) заменяем насовсем, перегруженную — только для этого запроса.
async function chatSmart(c, opts = {}) {
  const { onSwitch, ...rest } = opts;
  const fallbacks = (PROVIDERS[c.provider]?.fallbackModels || []).filter((m) => m !== c.model);
  let first = null;
  for (let i = 0; i <= fallbacks.length; i++) {
    const model = i === 0 ? c.model : fallbacks[i - 1];
    try {
      const r = await chat({ ...c, ...rest, model, ...(i > 0 ? { retryDelays: [1000, 2500] } : {}) });
      if (i > 0) {
        const permanent = first.kind === 'model';
        if (permanent) { state.settings.ai = { ...aiConfig(), model }; delete state.settings.ai.key; save('settings'); }
        onSwitch?.({ from: c.model, to: model, temporary: !permanent });
      }
      return r;
    } catch (e) {
      first ??= e;
      if (!['model', 'server', 'quota', 'rate'].includes(e.kind)) throw e;
      if (i === fallbacks.length) throw first;
    }
  }
}

export function buildContext() {
  const c = aiConfig();
  return buildReport(c.days, c.send, { questions: false });
}

export async function analyze({ fetchImpl, onRetry, onSwitch } = {}) {
  const c = aiConfig();
  const context = buildContext();
  const { text } = await chatSmart(c, {
    fetchImpl, onRetry, onSwitch, json: !!PROVIDERS[c.provider]?.json,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `Вот данные за последние ${c.days} дней.\n\n${context}\n\n${JSON_SCHEMA}` }],
  });
  const data = parseJsonLoose(text);
  const result = {
    date: E.todayStr(), at: Date.now(), model: aiConfig().model, days: c.days,
    summary: clip(data.summary, 900),
    training: (Array.isArray(data.training) ? data.training : []).map((x) => clip(x, 400)).filter(Boolean).slice(0, 6),
    nutrition: (Array.isArray(data.nutrition) ? data.nutrition : []).map((x) => clip(x, 400)).filter(Boolean).slice(0, 6),
    suggestions: normalizeSuggestions(data.suggestions).map((s) => ({ ...s, state: 'new' })),
  };
  if (!result.summary && !result.training.length && !result.nutrition.length) throw new AiError('format', KIND_TEXT.format);
  state.ai.history = [result, ...(state.ai.history || [])].slice(0, 10);
  save('ai');
  return result;
}

export async function ask(question, dialog = [], { fetchImpl, onRetry, onSwitch } = {}) {
  const c = aiConfig();
  const context = buildContext();
  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\nОтвечай обычным текстом (не JSON), не длиннее 200 слов.` },
    { role: 'user', content: `Контекст: данные пользователя за последние ${c.days} дней.\n\n${context}` },
    { role: 'assistant', content: 'Данные получил. Задавай вопрос.' },
    ...dialog.slice(-6), { role: 'user', content: clip(question, 1000) },
  ];
  const { text } = await chatSmart(c, { fetchImpl, onRetry, onSwitch, messages, json: false, maxTokens: 1500 });
  return text;
}

export async function testConnection({ fetchImpl, onRetry, onSwitch } = {}) {
  const c = aiConfig();
  const { text } = await chatSmart(c, { fetchImpl, onRetry, onSwitch, json: false, maxTokens: 300, timeoutMs: 25000, messages: [{ role: 'user', content: 'Ответь одним словом: ок' }] });
  return text.slice(0, 60);
}

// ---------- список моделей ----------
// Помогает, когда названия моделей изменились: спрашиваем у сервиса, какие модели доступны для этого ключа.
export async function listModels({ fetchImpl } = {}) {
  const c = aiConfig();
  fetchImpl = fetchImpl || globalThis.fetch;
  if (!c.baseUrl) throw new AiError('other', 'Не заполнен адрес сервиса.');
  if (c.key && !/^[\x21-\x7E]+$/.test(c.key)) throw new AiError('key', KIND_TEXT.key);
  const url = c.baseUrl.replace(/\/+$/, '') + '/models';
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    let res;
    try { res = await fetchImpl(url, { headers: c.key ? { Authorization: `Bearer ${c.key}` } : {}, signal: ctl.signal }); }
    catch (e) { throw new AiError('network', KIND_TEXT.network, 0, { status: 0, url, message: String(e?.message || e) }); }
    let data = null; try { data = await res.json(); } catch { /* не JSON */ }
    if (!res.ok) {
      const msg = errorText(data);
      const kind = res.status === 401 || res.status === 403 || (res.status === 400 && /api key|credential|auth/i.test(msg)) ? 'auth' : res.status >= 500 ? 'server' : 'other';
      throw new AiError(kind, `${KIND_TEXT[kind]}${msg ? ` (${msg.slice(0, 160)})` : ''}`, res.status, { status: res.status, url, message: msg || '(пустой ответ)' });
    }
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const ids = list.map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
    if (!ids.length) throw new AiError('other', 'Сервис не вернул список моделей. Введи название модели вручную.');
    return [...new Set(ids)].sort();
  } finally { clearTimeout(timer); }
}

// Из сырого списка модели сервиса оставляем только текстовые и ставим вперёд «-latest» и новые версии.
const JUNK = /(tts|image|embedding|veo|lyria|live|transcribe|native-audio|robotics|aqa|nano-banana|deep-research|antigravity|computer-use|omni|argon|imagen|whisper|guard|moderation|vision)/i;
export function rankModels(ids) {
  const version = (id) => parseFloat((id.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]) || 0;
  const score = (id) => (/-latest$/.test(id) ? 1000 : 0) + version(id) * 10 - (/^gemini-2\.5/.test(id) ? 500 : 0) - (/preview/.test(id) ? 5 : 0);
  return ids.filter((id) => !JUNK.test(id)).sort((a, b) => score(b) - score(a) || a.localeCompare(b));
}
