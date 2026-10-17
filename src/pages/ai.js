import { h, toast, modal, confirmBox, icon } from '../ui.js';
import { glyph } from '../art.js';
import { state, save } from '../store.js';
import { rerender } from '../router.js';
import * as AI from '../ai.js';

let dialog = [];           // вопросы и ответы текущего сеанса (в памяти)
let busy = false;
const readyListeners = [];   // кнопки, которым нужно знать, подключён ли сервис
const notifyReady = () => readyListeners.forEach((fn) => fn());

export function aiPage() {
  readyListeners.length = 0;
  const root = h('div');
  root.append(h('a', { class: 'back', href: '#/more' }, icon('back', 16), 'Ещё'),
    h('h1', null, 'Тренер-нейросеть'),
    h('p', { class: 'lead' }, 'Нейросеть читает твою сводку за период и пишет разбор: что получается, что поправить в тренировках и питании. Предложения по ПМ и калориям применяются только после твоего подтверждения. Это не врач и не замена консультации.'));
  root.append(connectionCard(), privacyCard(), analysisCard(), askCard(), historyCard());
  return root;
}

// ---------- подключение ----------
function connectionCard() {
  const c = AI.aiConfig();
  const preset = AI.PROVIDERS[c.provider] || AI.PROVIDERS.custom;
  const status = h('span', { class: 'badge' });
  const refreshStatus = () => {
    const ok = AI.aiReady();
    status.className = 'badge ' + (ok ? 'ok' : 'warn'); status.textContent = ok ? 'подключено' : (AI.PROVIDERS[AI.aiConfig().provider]?.noKey ? 'укажи адрес' : 'нужен ключ');
    notifyReady();
  };
  const setAi = (patch) => { state.settings.ai = { ...AI.aiConfig(), ...patch }; delete state.settings.ai.key; save('settings'); refreshStatus(); };

  const provider = h('select', { 'aria-label': 'Сервис', onchange: (e) => { AI.setProvider(e.target.value); rerender(); } },
    Object.entries(AI.PROVIDERS).map(([id, p]) => h('option', { value: id, selected: c.provider === id }, p.label || p.name)));
  const key = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: preset.noKey ? 'ключ не нужен' : 'вставь ключ', value: c.key,
    oninput: (e) => {
      const raw = e.target.value, clean = raw.replace(/[\s"'“”«»]/g, '');
      if (clean !== raw) e.target.value = clean;   // пробелы, кавычки и переносы из буфера обмена убираем сами
      keyWarn.textContent = clean && !/^[\x21-\x7E]+$/.test(clean) ? 'В ключе есть русские или другие недопустимые символы. Проверь раскладку и вставь ключ заново.' : '';
      state.secrets.aiKey = clean; save('secrets'); refreshStatus();
      result.replaceChildren();   // старый результат проверки больше не актуален
    } });
  const keyWarn = h('div', { class: 'small', style: { color: 'var(--bad)', marginTop: '4px' } });
  const model = h('input', { type: 'text', autocapitalize: 'off', spellcheck: 'false', value: c.model, oninput: (e) => setAi({ model: e.target.value.trim() }) });
  const base = h('input', { type: 'text', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', value: c.baseUrl, oninput: (e) => setAi({ baseUrl: e.target.value.trim() }) });
  const result = h('div', { class: 'small', style: { marginTop: '8px' } });
  const setModelInput = (id) => { model.value = id; setAi({ model: id }); };
  const test = h('button', { class: 'btn block', style: { marginTop: '10px' }, onclick: async () => {
    test.disabled = true; result.className = 'small muted'; result.textContent = 'Проверяю…';
    try { const t = await AI.testConnection({ onSwitch: (x) => { if (!x.temporary) setModelInput(x.to); toast(switchText(x)); }, onRetry: (r) => { result.textContent = `Сервис занят (код ${r.status}), пробую ещё раз: ${r.attempt} из ${r.of}…`; } }); result.className = 'small'; result.style.color = 'var(--ok)'; result.textContent = `Работает. Ответ сервиса: «${t}»`; }
    catch (e) { result.className = 'small'; result.style.color = 'var(--bad)'; result.replaceChildren(e.message, errorExtras(e, setModelInput)); }
    test.disabled = false;
  } }, icon('check', 16), 'Проверить подключение');
  refreshStatus();

  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h3', null, 'Подключение'), status),
    h('label', { class: 'field' }, 'Сервис', provider),
    h('p', { class: 'muted small' }, preset.note),
    preset.keyUrl ? h('a', { class: 'small', href: preset.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, preset.noKey ? 'Скачать Ollama' : 'Где взять ключ →') : null,
    preset.noKey ? null : h('label', { class: 'field' }, 'Ключ доступа', key), keyWarn,
    preset.noKey ? null : h('p', { class: 'muted small', style: { margin: '2px 0 0' } }, 'Ключ хранится только на этом телефоне и не попадает в резервную копию.'),
    h('details', { style: { marginTop: '8px' } }, h('summary', null, 'Модель и адрес'),
      h('label', { class: 'field' }, 'Модель', model),
      h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => pickModel(setModelInput) }, 'Выбрать модель из списка сервиса'),
      h('label', { class: 'field' }, 'Адрес сервиса', base)),
    test, result);
}

// ---------- что отправлять ----------
function privacyCard() {
  const c = AI.aiConfig();
  const set = (patch) => { state.settings.ai = { ...AI.aiConfig(), ...patch }; delete state.settings.ai.key; save('settings'); };
  const box = (id, label) => h('label', { class: 'row gap', style: { margin: '8px 0' } },
    h('input', { type: 'checkbox', checked: c.send[id], onchange: (e) => set({ send: { ...AI.aiConfig().send, [id]: e.target.checked } }) }), h('span', null, label));
  const preview = h('pre', { class: 'preview' });
  const details = h('details', { ontoggle: () => { if (details.open) preview.textContent = AI.buildContext(); } }, h('summary', null, 'Показать, что уйдёт в запрос'), preview);
  return h('div', { class: 'card' }, h('h3', null, 'Что отправлять'),
    h('p', { class: 'muted small' }, 'В запрос попадает только текстовая сводка. Имени, почты и ключа в ней нет. Отключи то, чем не хочешь делиться.'),
    box('profile', 'Профиль: пол, возраст, рост, вес'), box('training', 'Тренировки и ПМ'), box('nutrition', 'Питание'), box('weight', 'Вес тела'),
    h('label', { class: 'field' }, 'За какой период', h('select', { onchange: (e) => set({ days: Number(e.target.value) }) },
      [7, 14, 28].map((d) => h('option', { value: d, selected: c.days === d }, `${d} дней`)))),
    details);
}

// ---------- разбор ----------
function analysisCard() {
  const card = h('div', { class: 'card' }, h('h3', null, 'Разбор'));
  const out = h('div');
  const btn = h('button', { class: 'btn primary block', style: { marginTop: '8px' }, disabled: !AI.aiReady() || busy }, 'Сделать разбор');
  btn.prepend(glyph('bolt', 18));
  const last = (state.ai.history || [])[0];
  const hint = h('p', { class: 'muted small' });
  const syncHint = () => { hint.textContent = AI.aiReady() ? 'Нейросеть посмотрит план, факт, питание и вес и предложит, что поправить.' : 'Сначала подключи сервис выше: нужен ключ.'; btn.disabled = !AI.aiReady() || busy; };
  readyListeners.push(syncHint); syncHint();
  card.append(hint, btn, out);
  const draw = (r) => out.replaceChildren(r ? resultView(r, () => draw(r)) : '');
  if (last) draw(last);
  btn.addEventListener('click', async () => {
    if (busy) return; busy = true; btn.disabled = true;
    const status = h('span', { class: 'muted' }, ' Анализирую данные…');
    out.replaceChildren(h('div', { class: 'thinking' }, h('i'), h('i'), h('i'), status));
    try { const r = await AI.analyze({ onSwitch: (x) => toast(switchText(x)), onRetry: (x) => { status.textContent = ` Сервис занят (код ${x.status}), пробую ещё раз: ${x.attempt} из ${x.of}…`; } }); draw(r); toast('Разбор готов'); }
    catch (e) { out.replaceChildren(errorView(e)); }
    busy = false; btn.disabled = !AI.aiReady();
  });
  return card;
}

function errorView(e) {
  return h('div', { class: 'banner warn', style: { marginTop: '10px' } }, h('b', null, 'Не получилось. '), e.message || String(e), errorExtras(e));
}

function resultView(r, redraw) {
  const box = h('div', { class: 'ai-result' });
  box.append(h('div', { class: 'muted small', style: { margin: '10px 0 4px' } }, `${r.date} · модель ${r.model} · период ${r.days} дн.`));
  if (r.summary) box.append(h('p', { class: 'ai-summary' }, r.summary));
  const list = (title, items) => items.length ? h('div', null, h('h3', { style: { margin: '12px 0 4px' } }, title), h('ul', { class: 'ai-list' }, items.map((x) => h('li', null, x)))) : null;
  box.append(list('Тренировки', r.training), list('Питание и вес', r.nutrition));
  if (r.suggestions.length) {
    box.append(h('h3', { style: { margin: '14px 0 6px' } }, 'Предложения'));
    r.suggestions.forEach((s) => box.append(suggestionCard(s, redraw)));
  } else box.append(h('p', { class: 'muted small' }, 'Менять в плане ничего не предлагается.'));
  box.append(h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'Это подсказки по данным дневника, а не медицинская рекомендация.'));
  return box;
}

function suggestionCard(s, redraw) {
  const done = s.state === 'applied', skipped = s.state === 'dismissed';
  return h('div', { class: 'sugg' + (done ? ' applied' : skipped ? ' skipped' : '') },
    h('div', { class: 'grow' }, h('b', null, AI.describeSuggestion(s)), s.reason ? h('div', { class: 'muted small' }, s.reason) : null),
    done ? h('span', { class: 'badge ok' }, 'применено') : skipped ? h('span', { class: 'badge' }, 'отклонено') :
      h('div', { class: 'row gap sugg-actions' },
        h('button', { class: 'btn small primary', onclick: async () => {
          if (!(await confirmBox(`Применить: ${AI.describeSuggestion(s)}? Будущие тренировки пересчитаются, выполненные не изменятся.`, 'Применить'))) return;
          const msg = AI.applySuggestion(s); s.state = 'applied'; save('ai'); toast(msg); redraw();
        } }, 'Применить'),
        h('button', { class: 'btn small', onclick: () => { s.state = 'dismissed'; save('ai'); redraw(); } }, 'Нет')));
}

// ---------- вопрос ----------
function askCard() {
  const card = h('div', { class: 'card' }, h('h3', null, 'Спросить тренера'));
  const log = h('div', { class: 'chat' });
  const input = h('textarea', { placeholder: 'Например: почему вес растёт медленно? Стоит ли добавить день отдыха?', maxlength: 600 });
  const btn = h('button', { class: 'btn block', style: { marginTop: '8px' }, disabled: !AI.aiReady() }, 'Спросить');
  readyListeners.push(() => { btn.disabled = !AI.aiReady() || busy; });
  const draw = () => log.replaceChildren(...dialog.map((m) => h('div', { class: 'bubble ' + (m.role === 'user' ? 'me' : 'ai') }, m.content)));
  draw();
  btn.addEventListener('click', async () => {
    const q = input.value.trim(); if (!q || busy) return;
    busy = true; btn.disabled = true; input.value = '';
    dialog.push({ role: 'user', content: q }); draw();
    const wait = h('div', { class: 'bubble ai' }, h('div', { class: 'thinking' }, h('i'), h('i'), h('i'))); log.append(wait);
    try { const a = await AI.ask(q, dialog.slice(0, -1), { onSwitch: (x) => toast(switchText(x)), onRetry: (x) => { wait.title = `Повтор ${x.attempt} из ${x.of}`; } }); dialog.push({ role: 'assistant', content: a }); }
    catch (e) { dialog.push({ role: 'assistant', content: `Не получилось: ${e.message}` }); }
    busy = false; btn.disabled = !AI.aiReady(); draw();
  });
  card.append(log, input, btn);
  if (dialog.length) card.append(h('button', { class: 'link small', style: { marginTop: '8px' }, onclick: () => { dialog = []; rerender(); } }, 'Очистить диалог'));
  return card;
}

// ---------- прошлые разборы ----------
function historyCard() {
  const rest = (state.ai.history || []).slice(1);
  if (!rest.length) return h('div');
  return h('div', { class: 'card' }, h('h3', null, 'Прошлые разборы'),
    ...rest.map((r) => h('details', { style: { marginTop: '8px' } }, h('summary', null, `${r.date}: ${r.summary.slice(0, 70)}${r.summary.length > 70 ? '…' : ''}`), resultView(r, rerender))));
}

// Подробности ошибки и подсказки: что именно ответил сервис, как исправить.
function errorExtras(e, setModel) {
  const box = h('div', { style: { marginTop: '8px' } });
  if (e.kind === 'model' || e.kind === 'other' || e.kind === 'server') {
    box.append(h('button', { class: 'btn small', style: { marginRight: '6px' }, onclick: () => pickModel(setModel || ((id) => { state.settings.ai = { ...AI.aiConfig(), model: id }; delete state.settings.ai.key; save('settings'); rerender(); })) }, 'Выбрать модель из списка'));
  }
  if (e.detail) {
    const d = e.detail;
    box.append(h('details', { style: { marginTop: '6px' } }, h('summary', { class: 'small' }, 'Подробности для отладки'),
      h('pre', { class: 'preview' }, [`Код ответа: ${d.status || 'нет связи'}`, `Адрес: ${d.url}`, d.model ? `Модель: ${d.model}` : null, `Сообщение сервиса: ${d.message}`].filter(Boolean).join('\n'))));
  }
  return box;
}

// Окно выбора модели: спрашиваем у сервиса список доступных для этого ключа.
function pickModel(onPick) {
  modal('Модели сервиса', (body, close) => {
    const list = h('div'), q = h('input', { type: 'search', placeholder: 'Поиск: gemini, flash, llama…' });
    body.append(h('p', { class: 'muted small' }, 'Нажми на модель, чтобы выбрать её.'), q, h('div', { style: { marginTop: '8px' } }, h('div', { class: 'thinking' }, h('i'), h('i'), h('i'), h('span', { class: 'muted' }, ' Загружаю список…'))));
    const holder = body.lastChild;
    AI.listModels().then((all) => {
      const ranked = AI.rankModels(all);
      let showAll = false;
      const more = h('button', { class: 'link small', style: { marginTop: '8px' }, onclick: () => { showAll = !showAll; more.textContent = showAll ? 'Показать только подходящие' : `Показать все модели (${all.length})`; draw(); } }, `Показать все модели (${all.length})`);
      const draw = () => {
        const ids = showAll ? all : (ranked.length ? ranked : all);
        const t = q.value.trim().toLowerCase();
        const shown = ids.filter((x) => !t || x.toLowerCase().includes(t)).slice(0, 80);
        list.replaceChildren(...(shown.length ? shown.map((id) => h('button', { class: 'btn block', style: { marginBottom: '6px', justifyContent: 'space-between', textAlign: 'left' }, onclick: () => { onPick(id); close(); toast(`Модель: ${id}`); } },
          id, /-latest$/.test(id) ? h('span', { class: 'badge ok' }, 'рекомендуется') : null)) : [h('p', { class: 'muted' }, 'Ничего не найдено.')]));
      };
      q.oninput = draw; holder.replaceChildren(h('p', { class: 'muted small' }, 'Показаны текстовые модели. Те, что с пометкой «latest», сервис обновляет сам, поэтому они не устаревают.'), list, more); draw();
    }).catch((e) => holder.replaceChildren(h('div', { class: 'banner warn' }, e.message, errorExtras(e))));
  });
}

const switchText = (x) => (x.temporary ? `Модель ${x.from} перегружена: этот запрос выполнен на ${x.to}` : `Модель ${x.from} недоступна, переключился на ${x.to}`);
