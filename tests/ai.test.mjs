// Нейросеть-помощник: запросы, обработка ошибок, проверка предложений, приватность. Сеть подменяется заглушкой.
import test from 'node:test';
import assert from 'node:assert/strict';
import { state, exportAll, importAll } from '../src/store.js';
import * as AI from '../src/ai.js';

globalThis.__aiRetryDelays = [0, 0, 0];   // в тестах паузы между повторами не нужны
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const reply = (content) => jsonRes(200, { choices: [{ message: { content } }], usage: { total_tokens: 10 } });
const base = { baseUrl: 'https://api.example.com/v1/', model: 'm1', key: 'K', messages: [{ role: 'user', content: 'hi' }] };

function seed() {
  state.pm.main = { squat: { value: 150, at: 0 }, bench: { value: 130, at: 0 }, deadlift: { value: 170, at: 0 } };
  state.settings.startDate = '2026-10-05';
  state.settings.profile = { sex: 'm', age: 29, height: 175, weight: 73, activity: 'low', goal: 'gain', pace: 'moderate' };
  state.settings.kcalAdjust = 0; state.settings.ai = undefined; state.secrets.aiKey = ''; state.ai.history = [];
  state.weights = [{ date: '2026-10-12', kg: 73 }, { date: '2026-10-15', kg: 73.4 }, { date: '2026-10-17', kg: 73.6 }];
}

test('chat: адрес, заголовки, тело запроса и разбор ответа', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return reply(' привет '); };
  const r = await AI.chat({ ...base, json: true, fetchImpl });
  assert.equal(r.text, 'привет');
  assert.equal(seen.url, 'https://api.example.com/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, 'Bearer K');
  assert.equal(seen.body.model, 'm1');
  assert.deepEqual(seen.body.response_format, { type: 'json_object' });
  // без ключа заголовка нет; ответ из частей
  const r2 = await AI.chat({ ...base, key: '', fetchImpl: async (u, i) => { assert.equal(i.headers.Authorization, undefined); return reply([{ text: 'а' }, { text: 'б' }]); } });
  assert.equal(r2.text, 'аб');
});

test('chat: классификация ошибок', async () => {
  const kind = async (res) => { try { await AI.chat({ ...base, fetchImpl: async () => res }); return 'нет ошибки'; } catch (e) { return e.kind; } };
  assert.equal(await kind(jsonRes(400, [{ error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' } }])), 'auth'); // формат Gemini
  assert.equal(await kind(jsonRes(401, { error: { message: 'Invalid API Key' } })), 'auth');
  assert.equal(await kind(jsonRes(401, { error: 'Missing Authentication header' })), 'auth');
  assert.equal(await kind(jsonRes(429, { error: { message: 'rate' } })), 'rate');
  assert.equal(await kind(jsonRes(404, { error: { message: 'no model' } })), 'model');
  assert.equal(await kind(jsonRes(503, {})), 'server');
  assert.equal(await kind(jsonRes(200, { choices: [{ message: { content: '  ' } }] })), 'format');
  assert.equal(await kind(jsonRes(200, {})), 'format');
  try { await AI.chat({ ...base, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }); assert.fail(); } catch (e) { assert.equal(e.kind, 'network'); assert.match(e.message, /интернет/); }
  try { await AI.chat({ ...base, baseUrl: '', fetchImpl: async () => reply('x') }); assert.fail(); } catch (e) { assert.match(e.message, /адрес/); }
});

test('chat: таймаут и повтор без response_format', async () => {
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  try { await AI.chat({ ...base, timeoutMs: 30, fetchImpl: hang }); assert.fail(); } catch (e) { assert.equal(e.kind, 'timeout'); }
  let calls = 0;
  const fetchImpl = async (u, init) => {
    calls++;
    const b = JSON.parse(init.body);
    return b.response_format ? jsonRes(400, { error: { message: "'response_format' of type 'json_object' is not supported" } }) : reply('{"a":1}');
  };
  const r = await AI.chat({ ...base, json: true, fetchImpl });
  assert.equal(r.text, '{"a":1}'); assert.equal(calls, 2);
});

test('parseJsonLoose: ограждения, лишний текст, запятые', () => {
  assert.deepEqual(AI.parseJsonLoose('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(AI.parseJsonLoose('Вот ответ: {"a": [1, 2,],} спасибо'), { a: [1, 2] });
  assert.throws(() => AI.parseJsonLoose('никакого json'), (e) => e.kind === 'format');
  assert.throws(() => AI.parseJsonLoose('{сломано'), (e) => e.kind === 'format');
});

test('предложения: границы, округление, отбраковка', () => {
  seed();
  const out = AI.normalizeSuggestions([
    { type: 'pm', exercise: 'squat', percent: 12, reason: 'слишком много' },       // обрезается до +5 %
    { type: 'pm', exercise: 'bench', percent: -2, reason: 'не вышло' },
    { type: 'pm', exercise: 'legpress', percent: 3 },                                // чужое упражнение
    { type: 'pm', exercise: 'deadlift', percent: 0.1 },                              // слишком мелко
    { type: 'kcal', delta: 1000, reason: 'много' },                                  // обрезается до +300
    { type: 'kcal', delta: -120 },                                                   // округляется до -100
    { type: 'kcal', delta: 'abc' }, { type: 'drug', dose: 5 }, null,
    { type: 'kcal', delta: 50 }, { type: 'kcal', delta: 50 },                        // больше 4 не берём
  ]);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { type: 'pm', exercise: 'squat', percent: 5, from: 150, to: 157.5, reason: 'слишком много' });
  assert.equal(out[1].to, 127.5);   // 130 × 0,98 = 127,4 → 127,5
  assert.equal(out[2].delta, 300);
  assert.equal(out[3].delta, -100);
  assert.deepEqual(AI.normalizeSuggestions('нет'), []);
});

test('применение предложений меняет ПМ и калории в пределах лимитов', () => {
  seed();
  const [s] = AI.normalizeSuggestions([{ type: 'pm', exercise: 'bench', percent: 4 }]);
  const msg = AI.applySuggestion(s);
  assert.match(msg, /130 → 135/);
  assert.match(AI.describeSuggestion({ type: 'pm', exercise: 'squat', percent: 3, from: 150, to: 154.5 }), /150 → 154,5 кг/);
  assert.equal(state.pm.main.bench.value, 135);
  assert.equal(state.pm.history.at(-1).key, 'bench');
  AI.applySuggestion({ type: 'kcal', delta: 300 }); AI.applySuggestion({ type: 'kcal', delta: 300 });
  assert.equal(state.settings.kcalAdjust, AI.LIMITS.kcalTotal, 'суммарная коррекция не больше ±400');
  AI.applySuggestion({ type: 'kcal', delta: -300 });
  assert.equal(state.settings.kcalAdjust, 100);
});

test('приватность: ключ не попадает ни в запрос, ни в экспорт; блоки отключаются', async () => {
  seed(); state.secrets.aiKey = 'SECRET-KEY-123';
  const full = AI.buildContext();
  assert.match(full, /Профиль: м, 29 лет/); assert.match(full, /## Вес/); assert.match(full, /## Тренировки/);
  assert.ok(!full.includes('SECRET-KEY-123'));
  state.settings.ai = { ...AI.aiConfig(), send: { profile: false, training: false, nutrition: false, weight: false } };
  const empty = AI.buildContext();
  assert.ok(!/Профиль:|## Вес|## Тренировки|## Питание/.test(empty), 'отключённые блоки не отправляются: ' + empty);
  assert.ok(!/29 лет|175|73/.test(empty));
  // экспорт и импорт
  const dump = exportAll();
  assert.ok(!dump.includes('SECRET-KEY-123') && !dump.includes('secrets'));
  await importAll(dump);
  assert.equal(state.secrets.aiKey, 'SECRET-KEY-123', 'импорт не стирает ключ');
});

test('разбор: запрос с данными, нормализованные предложения, история', async () => {
  seed(); state.secrets.aiKey = 'K';
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return reply('```json\n' + JSON.stringify({
      summary: 'Идёшь по плану.', training: ['Жим идёт хорошо'], nutrition: ['Вес растёт медленно'],
      suggestions: [{ type: 'kcal', delta: 150, reason: 'темп ниже цели' }, { type: 'pm', exercise: 'squat', percent: 20, reason: 'легко' }],
    }) + '\n```');
  };
  const r = await AI.analyze({ fetchImpl });
  assert.equal(sent.messages[0].role, 'system');
  assert.match(sent.messages[0].content, /не более чем на 5 %/);
  assert.match(sent.messages[1].content, /Профиль: м/);
  assert.match(sent.messages[1].content, /Верни ТОЛЬКО JSON/);
  assert.equal(sent.response_format.type, 'json_object');
  assert.equal(r.suggestions.length, 2);
  assert.equal(r.suggestions[1].percent, 5, 'ПМ ограничен 5 %');
  assert.equal(state.ai.history.length, 1);
  assert.equal(state.ai.history[0].summary, 'Идёшь по плану.');
  // сломанный ответ не пишется в историю
  await assert.rejects(AI.analyze({ fetchImpl: async () => reply('это не json') }), (e) => e.kind === 'format');
  assert.equal(state.ai.history.length, 1);
  // пустой разбор
  await assert.rejects(AI.analyze({ fetchImpl: async () => reply('{"summary":"","training":[],"nutrition":[],"suggestions":[]}') }), (e) => e.kind === 'format');
});

test('вопрос тренеру: контекст и диалог в запросе', async () => {
  seed(); state.secrets.aiKey = 'K';
  let sent;
  const a = await AI.ask('Почему вес растёт медленно?', [{ role: 'user', content: 'привет' }, { role: 'assistant', content: 'здравствуй' }], { fetchImpl: async (u, i) => { sent = JSON.parse(i.body); return reply('Добавь 150 ккал.'); } });
  assert.equal(a, 'Добавь 150 ккал.');
  assert.ok(!sent.response_format, 'в обычном чате JSON не требуется');
  assert.equal(sent.messages.at(-1).content, 'Почему вес растёт медленно?');
  assert.ok(sent.messages.some((m) => m.content === 'здравствуй'));
  assert.match(sent.messages[1].content, /Профиль/);
});

test('провайдеры: пресеты подставляют адрес и модель, готовность определяется ключом', () => {
  seed();
  assert.equal(AI.aiReady(), false);
  state.secrets.aiKey = 'K'; assert.equal(AI.aiReady(), true);
  AI.setProvider('deepseek');
  assert.equal(AI.aiConfig().baseUrl, 'https://api.deepseek.com'); assert.equal(AI.aiConfig().model, 'deepseek-chat');
  AI.setProvider('groq'); assert.match(AI.aiConfig().baseUrl, /groq/);
  AI.setProvider('ollama'); state.secrets.aiKey = ''; assert.equal(AI.aiReady(), true, 'для Ollama ключ не нужен');
  AI.setProvider('custom'); assert.equal(AI.aiConfig().provider, 'custom');
  for (const [id, p] of Object.entries(AI.PROVIDERS)) if (id !== 'custom') assert.ok(p.baseUrl.startsWith('http') && p.model, id);
});

test('ключ с русскими буквами или переносом не уходит в сеть и объясняется понятно', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return reply('x'); };
  for (const bad of ['ключ123', 'abc def', 'abc\ndef', 'AIza xyz']) {
    called = false;
    await assert.rejects(AI.chat({ ...base, key: bad, fetchImpl }), (e) => e.kind === 'key' && /недопустимые символы/.test(e.message));
    assert.equal(called, false, 'запрос не отправлялся: ' + JSON.stringify(bad));
  }
  state.settings.ai = { ...AI.aiConfig(), baseUrl: 'https://x.test/v1' }; delete state.settings.ai.key; state.secrets.aiKey = 'ключ';
  await assert.rejects(AI.listModels({ fetchImpl }), (e) => e.kind === 'key');
});

test('ошибки сервиса: регион, нулевая квота, подробности для отладки', async () => {
  const err = async (status, body) => { try { await AI.chat({ ...base, fetchImpl: async () => jsonRes(status, body) }); } catch (e) { return e; } };
  const region = await err(400, [{ error: { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } }]);
  assert.equal(region.kind, 'region'); assert.match(region.message, /страны или региона/);
  const quota = await err(429, { error: { message: 'You exceeded your current quota. ... limit: 0, model: gemini-flash' } });
  assert.equal(quota.kind, 'quota'); assert.match(quota.message, /квот/);
  const plain = await err(429, { error: { message: 'Rate limit reached, retry in 20s' } });
  assert.equal(plain.kind, 'rate');
  assert.deepEqual([region.detail.status, region.detail.model, region.detail.url], [400, 'm1', 'https://api.example.com/v1/chat/completions']);
  assert.match(region.detail.message, /location is not supported/);
  assert.ok(!JSON.stringify(region.detail).includes('"K"'), 'в подробностях нет ключа');
  try { await AI.chat({ ...base, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }); } catch (e) { assert.equal(e.detail.message, 'Failed to fetch'); assert.equal(e.detail.status, 0); }
});

test('список моделей: префикс models/, сортировка, ошибки', async () => {
  seed(); state.secrets.aiKey = 'K'; state.settings.ai = { ...AI.aiConfig(), baseUrl: 'https://x.test/v1/' }; delete state.settings.ai.key;
  let url, headers;
  const ids = await AI.listModels({ fetchImpl: async (u, init) => { url = u; headers = init.headers; return jsonRes(200, { data: [{ id: 'models/gemini-3.6-flash' }, { id: 'models/gemini-3.8-flash' }, { id: 'models/gemini-3.6-flash' }] }); } });
  assert.deepEqual(ids, ['gemini-3.6-flash', 'gemini-3.8-flash']);
  assert.equal(url, 'https://x.test/v1/models'); assert.equal(headers.Authorization, 'Bearer K');
  assert.deepEqual(await AI.listModels({ fetchImpl: async () => jsonRes(200, { models: [{ name: 'models/b' }, { name: 'models/a' }] }) }), ['a', 'b']);
  await assert.rejects(AI.listModels({ fetchImpl: async () => jsonRes(401, { error: { message: 'bad key' } }) }), (e) => e.kind === 'auth' && e.detail.status === 401);
  await assert.rejects(AI.listModels({ fetchImpl: async () => jsonRes(200, { data: [] }) }), /не вернул список/);
  await assert.rejects(AI.listModels({ fetchImpl: async () => { throw new TypeError('offline'); } }), (e) => e.kind === 'network');
});

test('перегрузка сервиса (503) и лимит в минуту (429): повторы, потом понятная ошибка', async () => {
  // 503, 503, затем успех: пользователь ничего не замечает
  let calls = 0;
  const flaky = async () => (++calls < 3 ? jsonRes(503, [{ error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } }]) : reply('привет'));
  const retries = [];
  const r = await AI.chat({ ...base, fetchImpl: flaky, onRetry: (x) => retries.push(x) });
  assert.equal(r.text, 'привет'); assert.equal(calls, 3);
  assert.deepEqual(retries.map((x) => [x.attempt, x.of, x.status]), [[1, 3, 503], [2, 3, 503]]);
  // всё время 503: после всех повторов ошибка с подсказкой и числом попыток
  calls = 0;
  const dead = async () => { calls++; return jsonRes(503, { error: { message: 'overloaded' } }); };
  await assert.rejects(AI.chat({ ...base, fetchImpl: dead }), (e) => e.kind === 'server' && e.status === 503 && e.attempts === 4 && /Flash-Lite/.test(e.message) && e.detail.status === 503);
  assert.equal(calls, 4, '1 запрос + 3 повтора');
  // 429 без признаков квоты тоже повторяется
  calls = 0;
  const limited = async () => (++calls < 2 ? jsonRes(429, { error: { message: 'Rate limit reached, retry in 2s' } }) : reply('ok'));
  assert.equal((await AI.chat({ ...base, fetchImpl: limited })).text, 'ok'); assert.equal(calls, 2);
  // а это повторять бессмысленно: ровно один запрос
  for (const [status, body] of [[401, { error: { message: 'bad key' } }], [404, { error: { message: 'no model' } }], [429, { error: { message: 'limit: 0' } }], [400, [{ error: { message: 'User location is not supported' } }]]]) {
    calls = 0;
    await assert.rejects(AI.chat({ ...base, fetchImpl: async () => { calls++; return jsonRes(status, body); } }));
    assert.equal(calls, 1, `код ${status} не повторяется`);
  }
});

test('Retry-After учитывается, но не дольше 10 секунд', async () => {
  const waits = [];
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => { waits.push(ms); return realSet(fn, 0, ...a); };
  try {
    let calls = 0;
    const res = (ra) => ({ ok: false, status: 503, headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? String(ra) : null) }, json: async () => ({ error: { message: 'busy' } }) });
    await AI.chat({ ...base, retryDelays: [100, 100], fetchImpl: async () => (++calls === 1 ? res(3) : calls === 2 ? res(120) : reply('ok')) });
    const retryWaits = waits.filter((w) => w === 3000 || w === 10000);
    assert.deepEqual(retryWaits, [3000, 10000]);
  } finally { globalThis.setTimeout = realSet; }
});

test('недоступная модель (404): переход на запасную и запоминание рабочей', async () => {
  seed(); state.secrets.aiKey = 'K'; AI.setProvider('gemini'); state.settings.ai = { ...AI.aiConfig(), model: 'gemini-2.5-flash' }; delete state.settings.ai.key;
  const tried = [];
  const fetchImpl = async (url, init) => {
    const m = JSON.parse(init.body).model; tried.push(m);
    return m === 'gemini-flash-latest' ? reply('Ок') : jsonRes(404, [{ error: { code: 404, message: 'This model models/gemini-2.5-flash is no longer available to new users.', status: 'NOT_FOUND' } }]);
  };
  let switched;
  const t = await AI.testConnection({ fetchImpl, onSwitch: (x) => { switched = x; } });
  assert.equal(t, 'Ок');
  assert.deepEqual(tried, ['gemini-2.5-flash', 'gemini-flash-latest']);
  assert.deepEqual(switched, { from: 'gemini-2.5-flash', to: 'gemini-flash-latest', temporary: false });
  assert.equal(AI.aiConfig().model, 'gemini-flash-latest', 'рабочая модель сохранена');
  assert.equal(state.settings.ai.key, undefined, 'ключ не записан в настройки');
  // все модели недоступны: ошибка про модель; другие ошибки сразу пробрасываются без перебора
  state.settings.ai = { ...AI.aiConfig(), model: 'x' }; delete state.settings.ai.key;
  await assert.rejects(AI.testConnection({ fetchImpl: async () => jsonRes(404, { error: { message: 'nope' } }) }), (e) => e.kind === 'model' && /недоступна/.test(e.message));
  let calls = 0;
  await assert.rejects(AI.testConnection({ fetchImpl: async () => { calls++; return jsonRes(401, { error: { message: 'bad key' } }); } }), (e) => e.kind === 'auth');
  assert.equal(calls, 1);
  // для своего сервиса запасных моделей нет
  AI.setProvider('custom'); state.settings.ai = { ...AI.aiConfig(), baseUrl: 'https://x.test/v1', model: 'm' }; delete state.settings.ai.key; calls = 0;
  await assert.rejects(AI.testConnection({ fetchImpl: async () => { calls++; return jsonRes(404, {}); } }), (e) => e.kind === 'model');
  assert.equal(calls, 1);
});

test('список моделей: оставляем текстовые, «latest» и новые версии вперёд, 2.5 в конец', () => {
  const all = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-preview-tts', 'gemma-4-26b-a4b-it', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest',
    'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-image', 'gemini-embedding-001', 'veo-3.1-generate-preview', 'lyria-3.5', 'gemini-3.8-live', 'aqa', 'nano-banana-pro-preview'];
  const r = AI.rankModels(all);
  assert.deepEqual(r.slice(0, 3).sort(), ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest']);
  for (const junk of ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-image', 'gemini-embedding-001', 'veo-3.1-generate-preview', 'lyria-3.5', 'gemini-3.8-live', 'aqa', 'nano-banana-pro-preview']) assert.ok(!r.includes(junk), junk);
  assert.ok(r.indexOf('gemini-3.8-flash') < r.indexOf('gemini-3.6-flash'), 'новее выше');
  assert.ok(r.indexOf('gemini-3.6-flash') < r.indexOf('gemini-2.5-flash'), '2.5 ниже 3.x');
  assert.equal(r.at(-1).startsWith('gemini-2.5') || r.at(-2).startsWith('gemini-2.5'), true);
  assert.deepEqual(AI.rankModels(['llama-3.3-70b-versatile', 'whisper-large-v3', 'llama-3.1-8b-instant']).includes('whisper-large-v3'), false);
});

test('перегрузка основной модели: запрос уходит на облегчённую, настройка не меняется', async () => {
  seed(); state.secrets.aiKey = 'K'; AI.setProvider('gemini');
  state.settings.ai = { ...AI.aiConfig(), model: 'gemini-flash-latest' }; delete state.settings.ai.key;
  const tried = [];
  const fetchImpl = async (url, init) => {
    const m = JSON.parse(init.body).model; tried.push(m);
    return m === 'gemini-flash-lite-latest' ? reply('Ок') : jsonRes(503, [{ error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }]);
  };
  let sw;
  assert.equal(await AI.testConnection({ fetchImpl, onSwitch: (x) => { sw = x; } }), 'Ок');
  assert.deepEqual(sw, { from: 'gemini-flash-latest', to: 'gemini-flash-lite-latest', temporary: true });
  assert.equal(AI.aiConfig().model, 'gemini-flash-latest', 'при перегрузке настройка модели не меняется');
  assert.ok(tried.filter((m) => m === 'gemini-flash-latest').length >= 2, 'основную модель сначала повторяли');
  // перегружены все: пользователь видит ошибку основной модели
  await assert.rejects(AI.testConnection({ fetchImpl: async () => jsonRes(503, { error: { message: 'busy' } }) }), (e) => e.kind === 'server' && /Flash-Lite/.test(e.message));
});

test('лимит модели (429): подсказка «повтори через N секунд» — это лимит в минуту; запасная модель имеет свой лимит', async () => {
  const err = async (body) => { try { await AI.chat({ ...base, retryDelays: [], fetchImpl: async () => jsonRes(429, body) }); } catch (e) { return e; } };
  const perMinute = await err({ error: { message: 'You exceeded your current quota. Please retry in 25.4s.' } });
  assert.equal(perMinute.kind, 'rate'); assert.equal(perMinute.retryAfterMs, 26000);
  const zero = await err({ error: { message: 'You exceeded your current quota, limit: 0, model: gemini-flash' } });
  assert.equal(zero.kind, 'quota');
  const daily = await err({ error: { message: 'You exceeded your current quota, please check your plan and billing details.' } });
  assert.equal(daily.kind, 'quota'); assert.match(daily.message, /у каждой модели свой лимит/);

  seed(); state.secrets.aiKey = 'K'; AI.setProvider('gemini'); state.settings.ai = { ...AI.aiConfig(), model: 'gemini-flash-latest' }; delete state.settings.ai.key;
  const tried = [];
  const fetchImpl = async (u, init) => {
    const m = JSON.parse(init.body).model; tried.push(m);
    return m === 'gemini-flash-lite-latest' ? reply('Ок') : jsonRes(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.' } });
  };
  let sw;
  assert.equal(await AI.testConnection({ fetchImpl, onSwitch: (x) => { sw = x; } }), 'Ок');
  assert.deepEqual(tried, ['gemini-flash-latest', 'gemini-flash-lite-latest']);
  assert.equal(sw.temporary, true); assert.equal(AI.aiConfig().model, 'gemini-flash-latest');
});

test('сводка учитывает тренировку, выполненную раньше плановой даты', async () => {
  const S = await import('../src/session.js'); const E = await import('../src/engine.js');
  seed();
  const today = E.todayStr();
  state.settings.startDate = E.addDays(today, 8);              // первая тренировка по плану — в будущем
  state.workouts = {}; state.foodlog = {};
  const info = S.dayInfo(0); assert.ok(info.date > today, 'плановая дата в будущем');
  const plan = S.planFor(0, 1, 1);
  const wk = S.freezePlan(0, 1, 1);
  plan.exercises.forEach((e) => { wk.ex[e.slotId] = { exId: e.exId, status: 'done' }; });
  const { buildReport } = await import('../src/report.js');
  const rep = buildReport(7, {}, { questions: false });
  assert.ok(!rep.includes('Тренировок за период нет'), 'выполненная тренировка в отчёте:\n' + rep.slice(0, 600));
  assert.ok(rep.includes(`### ${today} (по плану ${info.date})`), 'указаны фактическая и плановая даты');
  assert.match(rep, /Присед: план .* — выполнено/);
  // тренировка, которую не начинали и срок которой в будущем, в отчёт не попадает
  state.workouts = {};
  assert.ok(buildReport(7, {}, { questions: false }).includes('Тренировок за период нет'));
});
