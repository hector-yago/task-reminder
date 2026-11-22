// Interfaz de Task Reminder: vistas Hoy, Semana, Tareas y Ajustes. Sin dependencias ni paso de build.
import { VERSION } from './version.js';
import { dayKey, daysLeft, isoDow } from './periods.js';
import {
  activityByDay, agoLabel, buildToday, buildWeek, createTask, DOW_LETTERS, DOW_NAMES, effectiveRecurrence, lastDone, markDone,
  newId, normalizeRecurrence, occurrences, PERIOD_OF, progress, RECURRENCE_LABELS, RECURRENCE_TYPES, SECTION_LABELS, SECTION_ORDER, streak, toggle, unmark,
} from './tasks.js';
import { NORMAL_MODE_ID, normalizeMode, resolveMode } from './modes.js';
import { createStore, indexedDbAdapter, memoryAdapter } from './store.js';
import { parseTaskText } from './text-import.js';

/* ---------- utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (k) => (k ? `${k.slice(8)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '');
const longDate = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtStamp = (ms) => new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

// En localhost se puede fijar el día con ?hoy=AAAA-MM-DD (pruebas). En producción siempre es el día real.
const params = new URLSearchParams(location.search);
const FAKE_OK = ['localhost', '127.0.0.1'].includes(location.hostname);
let fakeToday = FAKE_OK && /^\d{4}-\d{2}-\d{2}$/.test(params.get('hoy') ?? '') ? params.get('hoy') : null;
const today = () => fakeToday ?? dayKey(new Date());
if (FAKE_OK) window.__setToday = (k) => { fakeToday = k; render(); };

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

/* ---------- estado ---------- */
const ui = { view: 'today', search: '', category: '', persisted: null, storageWarning: '' };
let store;
let toastTimer;

const modeNow = () => resolveMode(store.state.modes, store.state.settings, today());
const recLabel = (rec) => (rec.type === 'weekdays' ? rec.days.map((d) => DOW_NAMES[d].slice(0, 3)).join(', ') : RECURRENCE_LABELS[rec.type]);

function toast(text, actionLabel, onAction) {
  $('#toast-root')?.remove();
  const el = document.createElement('div');
  el.id = 'toast-root';
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').addEventListener('click', () => { clearTimeout(toastTimer); el.remove(); onAction(); });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), actionLabel ? 6000 : 3000);
}

/* ---------- hojas modales ---------- */
function openSheet(html, mount) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'sheet-root';
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  document.body.append(overlay);
  const sheet = overlay.firstElementChild;
  mount?.(sheet);
  sheet.querySelector('[autofocus], input[type=text], input[type=search]')?.focus({ preventScroll: true });
  return sheet;
}
function closeSheet() {
  $('#sheet-root')?.remove();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------- acciones sobre datos ---------- */
async function mutateTask(id, fn) {
  await store.update((d) => {
    const i = d.tasks.findIndex((t) => t.id === id);
    if (i >= 0) d.tasks[i] = fn(d.tasks[i]) ?? d.tasks[i];
  });
}

async function doToggle(id, occKey) {
  const task = store.state.tasks.find((t) => t.id === id);
  if (!task) return;
  const rec = effectiveRecurrence(task, modeNow().id);
  const occ = occurrencesFor(task, rec).find((o) => o.occKey === occKey);
  if (!occ || occ.kind === 'upcoming') return;
  await mutateTask(id, (t) => toggle(t, rec, occ, today()));
}

const occurrencesFor = (task, rec) => occurrences(task, rec, today());

/* ---------- vistas ---------- */
function rowHtml({ task, rec, occ }, { showMore = true } = {}) {
  const t = today();
  const last = lastDone(task);
  let meta = '';
  let warn = false;
  if (occ.kind === 'overdue') {
    meta = `Atrasada · tocaba el ${DOW_NAMES[isoDow(occ.day)].toLowerCase()}`;
    warn = true;
  } else if (occ.done) {
    meta = occ.skipped ? 'Saltada esta vez' : `Hecha ${occ.doneOn === t ? 'hoy' : `el ${fmtDate(occ.doneOn)}`}`;
  } else if (occ.kind === 'period') {
    meta = last ? `Última vez: ${fmtDate(last)} · ${agoLabel(last, t)}` : 'Aún sin hacer';
    const left = daysLeft(PERIOD_OF[rec.type], t);
    if (left <= 3) { meta += ` · ${left === 1 ? 'último día' : `quedan ${left} días`}`; warn = left === 1; }
  } else if (occ.kind === 'once') {
    meta = task.notes ? task.notes.split('\n')[0] : 'Pendiente';
  } else {
    meta = [task.category, last ? `Última vez: ${fmtDate(last)}` : ''].filter(Boolean).join(' · ');
  }
  const disabled = occ.kind === 'upcoming';
  return `<li class="row${occ.done ? ' done' : ''}${occ.skipped ? ' skipped' : ''}">
    <button class="check" data-action="toggle" data-id="${esc(task.id)}" data-occ="${esc(occ.occKey)}" aria-label="${occ.done ? 'Desmarcar' : 'Marcar como hecha'}: ${esc(task.title)}" aria-pressed="${occ.done}" ${disabled ? 'disabled' : ''}>${ICON.check}</button>
    <button class="body" data-action="edit" data-id="${esc(task.id)}"><span class="title">${esc(task.title)}</span><span class="meta${warn ? ' warn' : ''}">${esc(meta)}</span></button>
    ${showMore ? `<button class="more" data-action="menu" data-id="${esc(task.id)}" data-occ="${esc(occ.occKey)}" aria-label="Más acciones">⋯</button>` : ''}
  </li>`;
}

function viewToday() {
  const t = today();
  const mode = modeNow();
  const sections = buildToday(store.state.tasks, mode.id, t);
  const { done, total } = progress(sections);
  const pct = total ? done / total : 0;
  const C = 2 * Math.PI * 24;
  const pending = total - done;
  try { navigator.setAppBadge?.(pending > 0 ? pending : 0); } catch { /* sin soporte */ }
  const groups = SECTION_ORDER.filter((s) => sections[s].length)
    .map((s) => {
      const label = s === 'today' ? `Hoy · ${esc(DOW_NAMES[isoDow(t)])}` : SECTION_LABELS[s];
      const left = sections[s].filter((i) => !i.occ.done).length;
      return `<section class="group"><h2 class="${s === 'overdue' ? 'overdue' : ''}"><span>${label}</span><span>${left ? `${left} por hacer` : 'todo hecho'}</span></h2><ul class="list">${sections[s].map((i) => rowHtml(i)).join('')}</ul></section>`;
    })
    .join('');
  const banner = store.backupDue() ? `<div class="banner" role="alert"><span>Hace tiempo que no exportas una copia de tus tareas.</span><button class="btn small" data-action="export">Exportar</button></div>` : '';
  const warn = ui.storageWarning ? `<div class="banner" role="alert">${esc(ui.storageWarning)}</div>` : '';
  const empty = store.state.tasks.length === 0
    ? `<div class="empty"><b>Aún no hay tareas</b>Pulsa + para añadir la primera, o impórtalas desde Ajustes (texto del bot de Telegram).</div>`
    : !groups ? `<div class="empty"><b>Nada para hoy 🎉</b>No hay tareas activas en el modo ${esc(mode.name)}.</div>` : '';
  return `<header class="top">
    <div class="titles"><h1>Hoy</h1><div class="sub">${esc(longDate(t))}</div></div>
    ${store.state.modes.length > 1 ? `<button class="mode-chip" data-action="pick-mode" aria-label="Cambiar de modo">${esc(mode.icon)} ${esc(mode.name)}</button>` : ''}
    <div class="ring" role="img" aria-label="${done} de ${total} hechas"><svg viewBox="0 0 56 56"><circle class="track" cx="28" cy="28" r="24" fill="none" stroke-width="6"/><circle class="bar" cx="28" cy="28" r="24" fill="none" stroke-width="6" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/></svg><span>${done}/${total}</span></div>
  </header>${warn}${banner}${groups}${empty}`;
}

function viewWeek() {
  const t = today();
  const days = buildWeek(store.state.tasks, modeNow().id, t);
  const body = days.map(({ day, items }) => `<div class="dayhead">${esc(DOW_NAMES[isoDow(day)])} ${day.slice(8)}${day === t ? '<span class="tag warn">hoy</span>' : ''}</div>${items.length ? `<ul class="list">${items.map((i) => rowHtml(i, { showMore: false })).join('')}</ul>` : '<p class="meta" style="margin:0 4px;color:var(--muted)">Sin tareas fijas este día.</p>'}`).join('');
  return `<header class="top"><div class="titles"><h1>Semana</h1><div class="sub">Tareas de días concretos</div></div></header>${body}`;
}

function viewTasks() {
  const mode = modeNow();
  const q = ui.search.trim().toLowerCase();
  const cats = [...new Set(store.state.tasks.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const match = (t) => (!q || `${t.title} ${t.notes} ${t.category}`.toLowerCase().includes(q)) && (!ui.category || t.category === ui.category);
  const active = store.state.tasks.filter((t) => !t.archived && match(t));
  const groups = new Map();
  const off = [];
  for (const t of active) {
    const rec = effectiveRecurrence(t, mode.id);
    if (!rec) { off.push(t); continue; }
    const key = rec.type === 'weekdays' ? '0-weekdays' : `${RECURRENCE_TYPES.indexOf(rec.type)}-${rec.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ t, rec });
  }
  const line = (t, rec) => {
    const last = lastDone(t);
    return `<li class="row"><button class="body" data-action="edit" data-id="${esc(t.id)}"><span class="title">${esc(t.title)}</span><span class="meta">${esc([rec ? recLabel(rec) : 'Desactivada en este modo', t.category, last ? `última vez ${fmtDate(last)}` : 'sin hacer'].filter(Boolean).join(' · '))}</span></button></li>`;
  };
  const sections = [...groups.keys()].sort().map((k) => {
    const items = groups.get(k).sort((a, b) => a.t.title.localeCompare(b.t.title, 'es'));
    return `<section class="group"><h2><span>${esc(RECURRENCE_LABELS[k.split('-')[1]])}</span><span>${items.length}</span></h2><ul class="list">${items.map(({ t, rec }) => line(t, rec)).join('')}</ul></section>`;
  }).join('');
  const offHtml = off.length ? `<section class="group"><h2><span>Desactivadas en el modo ${esc(mode.name)}</span><span>${off.length}</span></h2><ul class="list">${off.map((t) => line(t, null)).join('')}</ul></section>` : '';
  const archived = store.state.tasks.filter((t) => t.archived && match(t));
  const archHtml = archived.length ? `<section class="group"><h2><span>Archivadas</span><span>${archived.length}</span></h2><ul class="list">${archived.map((t) => line(t, t.recurrence)).join('')}</ul></section>` : '';
  const empty = !sections && !offHtml && !archHtml ? '<div class="empty"><b>Sin resultados</b>Prueba otro filtro o añade una tarea con +.</div>' : '';
  return `<header class="top"><div class="titles"><h1>Tareas</h1><div class="sub">${store.state.tasks.filter((t) => !t.archived).length} activas</div></div></header>
  <div class="toolbar"><input type="search" id="q" placeholder="Buscar…" value="${esc(ui.search)}" aria-label="Buscar tareas" />
  ${cats.length ? `<select id="cat" aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>${cats.map((c) => `<option ${c === ui.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}</div>
  ${sections}${offHtml}${archHtml}${empty}`;
}

function viewSettings() {
  const s = store.state.settings;
  const act = activityByDay(store.state.tasks, today(), 30);
  const max = Math.max(1, ...act.map((a) => a.count));
  const heat = act.map((a) => `<i class="${a.count ? `l${Math.min(3, Math.ceil((a.count / max) * 3))}` : ''}" title="${fmtDate(a.day)}: ${a.count}"></i>`).join('');
  const modes = store.state.modes.map((m) => `<div class="line"><span>${esc(m.icon)} <b>${esc(m.name)}</b>${m.range ? ` <span class="tag">${m.range.from.split('-').reverse().join('/')} → ${m.range.to.split('-').reverse().join('/')}</span>` : ''}${m.id === s.activeMode ? ' <span class="tag warn">elegido</span>' : ''}</span><span><button class="btn small" data-action="edit-mode" data-id="${esc(m.id)}">Editar</button></span></div>`).join('');
  return `<header class="top"><div class="titles"><h1>Ajustes</h1><div class="sub">Task Reminder ${esc(VERSION)}</div></div></header>
  <div class="card"><h3>Apariencia</h3><div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button data-action="theme" data-v="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}</div></div>
  <div class="card"><h3>Modos</h3><p>Un modo cambia la periodicidad de las tareas que lo indiquen (p. ej. regar más en verano). Se configura en cada tarea.</p>${modes}
    <div class="line"><label><input type="checkbox" data-action="auto" ${s.autoModes ? 'checked' : ''}/> Activar modos automáticamente según sus fechas</label></div>
    <div class="actions"><button class="btn" data-action="add-mode">+ Nuevo modo</button></div></div>
  <div class="card"><h3>Copias de seguridad</h3><p>Tus datos solo están en este dispositivo. Última exportación: ${store.state.meta.lastExport ? fmtStamp(store.state.meta.lastExport) : 'nunca'}.</p>
    <div class="actions"><button class="btn primary" data-action="export">Exportar a un fichero</button><button class="btn" data-action="import">Importar fichero</button><button class="btn" data-action="backups">Copias automáticas</button></div></div>
  <div class="card"><h3>Importar desde texto</h3><p>Pega la lista del bot de Telegram: cabeceras (Lunes, Mensual…) y una tarea por línea.</p><div class="actions"><button class="btn" data-action="import-text">Pegar texto</button></div></div>
  <div class="card"><h3>Actividad (30 días)</h3><div class="heat" aria-hidden="true">${heat}</div><p>Racha actual: <b>${streak(store.state.tasks, today())}</b> días seguidos con alguna tarea hecha.</p></div>
  <div class="card"><h3>Instalar en el iPhone</h3><p>En Safari: Compartir → «Añadir a pantalla de inicio». Ábrela siempre desde ese icono para que iOS conserve tus datos.</p><p>Almacenamiento protegido: ${ui.persisted === true ? 'sí' : ui.persisted === false ? 'no solicitado/denegado (exporta copias a menudo)' : 'desconocido'}.</p></div>`;
}

const TABS = [['today', 'Hoy', ICON.today], ['week', 'Semana', ICON.week], ['tasks', 'Tareas', ICON.tasks], ['settings', 'Ajustes', ICON.settings]];

function render() {
  if (!store) return;
  const y = window.scrollY;
  const view = { today: viewToday, week: viewWeek, tasks: viewTasks, settings: viewSettings }[ui.view]();
  const focusId = document.activeElement?.id;
  $('#app').innerHTML = `${view}
    <button class="fab" data-action="add" aria-label="Añadir tarea">+</button>
    <nav class="tabs" aria-label="Secciones"><div class="inner">${TABS.map(([id, label, icon]) => `<button data-action="tab" data-v="${id}" ${ui.view === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('')}</div></nav>`;
  if (focusId === 'q') { const q = $('#q'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
  window.scrollTo(0, y);
  applyTheme();
}

function applyTheme() {
  const th = store.state.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('tr-theme', th); } catch { /* sin almacenamiento */ }
}

/* ---------- selector de periodicidad ---------- */
function recPicker(name, current, { inherit = false, disabled = false } = {}) {
  const sel = current?.disabled ? 'disabled' : current?.recurrence ? current.recurrence.type : current?.type ?? (inherit ? 'inherit' : 'weekdays');
  const days = current?.recurrence?.days ?? current?.days ?? [];
  return `<div class="rp" data-rp="${name}"><select name="${name}-type" aria-label="Periodicidad">
    ${inherit ? `<option value="inherit" ${sel === 'inherit' ? 'selected' : ''}>Igual que en el modo Normal</option>` : ''}
    ${disabled ? `<option value="disabled" ${sel === 'disabled' ? 'selected' : ''}>No aplica en este modo</option>` : ''}
    ${RECURRENCE_TYPES.map((t) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${RECURRENCE_LABELS[t]}</option>`).join('')}</select>
    <div class="chips days ${sel === 'weekdays' ? '' : 'hidden'}" role="group" aria-label="Días">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="chip" title="${DOW_NAMES[d]}"><input type="checkbox" name="${name}-day" value="${d}" ${days.includes(d) ? 'checked' : ''}/><span>${DOW_LETTERS[d]}</span></label>`).join('')}</div></div>`;
}
function wirePicker(form) {
  form.querySelectorAll('.rp').forEach((rp) => {
    const sel = rp.querySelector('select');
    sel.addEventListener('change', () => rp.querySelector('.days').classList.toggle('hidden', sel.value !== 'weekdays'));
  });
}
function readPicker(form, name) {
  const type = form.elements[`${name}-type`].value;
  if (type === 'inherit') return { inherit: true };
  if (type === 'disabled') return { disabled: true };
  const days = [...form.querySelectorAll(`input[name="${name}-day"]:checked`)].map((i) => Number(i.value));
  const rec = normalizeRecurrence({ type, days });
  return rec ? { recurrence: rec } : { invalid: true };
}

/* ---------- hoja: tarea ---------- */
function taskSheet(id) {
  const task = id ? store.state.tasks.find((t) => t.id === id) : null;
  const others = store.state.modes.filter((m) => m.id !== NORMAL_MODE_ID);
  const cats = [...new Set(store.state.tasks.map((t) => t.category).filter(Boolean))];
  const base = task?.recurrence ?? { type: 'weekdays', days: [isoDow(today())] };
  const last = task && lastDone(task);
  const html = `<h2>${task ? 'Editar tarea' : 'Nueva tarea'}</h2>
  <form id="task-form" novalidate>
    <div class="field"><label for="f-title">Título</label><input id="f-title" name="title" type="text" required maxlength="200" value="${esc(task?.title)}" autocomplete="off" autofocus /></div>
    <div class="field"><span class="lbl">${others.length ? 'Periodicidad (modo Normal)' : 'Periodicidad'}</span>${recPicker('base', base)}</div>
    ${others.map((m) => `<fieldset class="ov"><legend>${esc(m.icon)} En modo ${esc(m.name)}</legend>${recPicker(`ov-${m.id}`, task?.overrides?.[m.id], { inherit: true, disabled: true })}</fieldset>`).join('')}
    <div class="field"><label for="f-cat">Categoría (opcional)</label><input id="f-cat" name="category" type="text" list="cats" maxlength="40" value="${esc(task?.category)}" /><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="field"><label for="f-notes">Notas (opcional)</label><textarea id="f-notes" name="notes" maxlength="2000">${esc(task?.notes)}</textarea></div>
    ${task ? `<p class="meta" style="color:var(--muted);font-size:.85rem">${last ? `Última vez hecha: ${fmtDate(last)} (${agoLabel(last, today())}).` : 'Aún no se ha hecho.'}</p>` : ''}
    <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div>
    ${task ? `<div class="actions"><button class="btn small" type="button" data-sheet="dup">Duplicar</button><button class="btn small" type="button" data-sheet="archive">${task.archived ? 'Desarchivar' : 'Archivar'}</button><button class="btn small danger" type="button" data-sheet="delete">Eliminar</button></div>` : ''}
  </form>`;
  openSheet(html, (sheet) => {
    const form = $('#task-form', sheet);
    wirePicker(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = form.elements.title.value.trim();
      const b = readPicker(form, 'base');
      if (!title) return toast('Escribe un título.');
      if (!b.recurrence) return toast('Elige al menos un día de la semana.');
      const overrides = {};
      for (const m of others) {
        const r = readPicker(form, `ov-${m.id}`);
        if (r.invalid) return toast(`Elige al menos un día para el modo ${m.name}.`);
        if (r.disabled) overrides[m.id] = { disabled: true };
        else if (r.recurrence) overrides[m.id] = { recurrence: r.recurrence };
      }
      const fields = { title, notes: form.elements.notes.value, category: form.elements.category.value.trim(), recurrence: b.recurrence, overrides };
      if (task) await mutateTask(task.id, (t) => ({ ...t, ...createTask({ ...fields, now: t.createdAt }), id: t.id, log: t.log, archived: t.archived, createdAt: t.createdAt }));
      else await store.update((d) => { d.tasks.push(createTask(fields)); });
      closeSheet();
      toast(task ? 'Tarea guardada.' : 'Tarea añadida.');
    });
    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-sheet]')?.dataset.sheet;
      if (!act) return;
      if (act === 'close') closeSheet();
      if (act === 'dup') {
        await store.update((d) => { d.tasks.push({ ...structuredClone(task), id: newId(), title: `${task.title} (copia)`, log: [], createdAt: Date.now() }); });
        closeSheet(); toast('Tarea duplicada.');
      }
      if (act === 'archive') { await mutateTask(task.id, (t) => ({ ...t, archived: !t.archived })); closeSheet(); toast(task.archived ? 'Tarea desarchivada.' : 'Tarea archivada.'); }
      if (act === 'delete') {
        const snapshot = structuredClone(task);
        await store.update((d) => { d.tasks = d.tasks.filter((t) => t.id !== task.id); });
        closeSheet();
        toast('Tarea eliminada.', 'Deshacer', () => store.update((d) => { d.tasks.push(snapshot); }));
      }
    });
  });
}

/* ---------- hoja: acciones de una fila ---------- */
function rowMenu(id, occKey) {
  const task = store.state.tasks.find((t) => t.id === id);
  if (!task) return;
  const rec = effectiveRecurrence(task, modeNow().id);
  const occ = occurrencesFor(task, rec).find((o) => o.occKey === occKey);
  if (!occ) return;
  const t = today();
  const min = rec.type === 'weekdays' ? occ.day : rec.type === 'once' ? '' : occKey;
  openSheet(`<h2>${esc(task.title)}</h2>
    <div class="actions" style="flex-direction:column;align-items:stretch">
      <button class="btn" data-sheet="edit">Editar tarea</button>
      ${occ.done ? '<button class="btn" data-sheet="unmark">Quitar la marca</button>' : '<button class="btn" data-sheet="skip">Saltar esta vez</button>'}
    </div>
    <form id="when-form" class="field" style="margin-top:14px"><label for="when">Marcar como hecha otro día</label>
      <input id="when" type="date" required max="${t}" ${min ? `min="${min}"` : ''} value="${t}" />
      <button class="btn primary" type="submit" style="margin-top:8px">Marcar en esa fecha</button></form>
    <div class="actions"><button class="btn" data-sheet="close">Cerrar</button></div>`, (sheet) => {
    $('#when-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = $('#when', sheet).value;
      if (!d || d > t || (min && d < min)) return toast('Esa fecha no cuenta para este periodo.');
      await mutateTask(id, (tk) => markDone(tk, rec, occKey, d));
      closeSheet(); toast(`Marcada el ${fmtDate(d)}.`);
    });
    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-sheet]')?.dataset.sheet;
      if (act === 'close') closeSheet();
      if (act === 'edit') taskSheet(id);
      if (act === 'unmark') { await mutateTask(id, (tk) => unmark(tk, rec, occKey)); closeSheet(); }
      if (act === 'skip') { await mutateTask(id, (tk) => markDone(tk, rec, occKey, t, { skipped: true })); closeSheet(); toast('Saltada esta vez.'); }
    });
  });
}

/* ---------- modos ---------- */
function pickModeSheet() {
  const s = store.state.settings;
  const current = modeNow();
  openSheet(`<h2>Modo activo</h2>
    <div class="actions" style="flex-direction:column;align-items:stretch">${store.state.modes.map((m) => `<button class="btn ${m.id === current.id ? 'primary' : ''}" data-mode="${esc(m.id)}">${esc(m.icon)} ${esc(m.name)}</button>`).join('')}</div>
    ${s.autoModes ? '<p style="color:var(--muted);font-size:.85rem">Los modos automáticos tienen prioridad cuando la fecha cae dentro de su rango; fuera de él se usa el que elijas aquí.</p>' : ''}
    <div class="actions"><button class="btn" data-sheet="close">Cerrar</button></div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      if (e.target.closest('[data-sheet="close"]')) return closeSheet();
      const id = e.target.closest('[data-mode]')?.dataset.mode;
      if (!id) return;
      await store.update((d) => { d.settings.activeMode = id; });
      closeSheet();
    });
  });
}

function modeSheet(id) {
  const m = id ? store.state.modes.find((x) => x.id === id) : null;
  const md = (v) => (v ? `2026-${v}` : '');
  openSheet(`<h2>${m ? 'Editar modo' : 'Nuevo modo'}</h2>
    <form id="mode-form" novalidate>
      <div class="field"><label for="m-name">Nombre</label><input id="m-name" type="text" maxlength="40" value="${esc(m?.name)}" autofocus /></div>
      <div class="field"><label for="m-icon">Icono (emoji)</label><input id="m-icon" type="text" maxlength="4" value="${esc(m?.icon ?? '☀️')}" /></div>
      ${m?.id === NORMAL_MODE_ID ? '' : `<div class="field"><span class="lbl">Activación automática (opcional; solo cuentan día y mes)</span>
        <div class="toolbar"><input id="m-from" type="date" value="${md(m?.range?.from)}" aria-label="Desde" /><input id="m-to" type="date" value="${md(m?.range?.to)}" aria-label="Hasta" /></div></div>`}
      <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div>
      ${m && m.id !== NORMAL_MODE_ID ? '<div class="actions"><button class="btn small danger" type="button" data-sheet="delete">Eliminar modo</button></div>' : ''}
    </form>`, (sheet) => {
    $('#mode-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const from = $('#m-from', sheet)?.value.slice(5);
      const to = $('#m-to', sheet)?.value.slice(5);
      const next = normalizeMode({ id: m?.id ?? `m-${newId().slice(0, 8)}`, name: $('#m-name', sheet).value, icon: $('#m-icon', sheet).value, range: from && to ? { from, to } : null });
      if (!next) return toast('Escribe un nombre.');
      await store.update((d) => {
        const i = d.modes.findIndex((x) => x.id === next.id);
        if (i >= 0) d.modes[i] = next; else d.modes.push(next);
      });
      closeSheet();
    });
    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-sheet]')?.dataset.sheet;
      if (act === 'close') closeSheet();
      if (act === 'delete') {
        if (!sheet.dataset.confirm) {
          sheet.dataset.confirm = '1';
          e.target.textContent = 'Confirmar: se quitan sus ajustes en las tareas';
          return;
        }
        await store.update((d) => {
          d.modes = d.modes.filter((x) => x.id !== m.id);
          for (const t of d.tasks) delete t.overrides[m.id];
          if (d.settings.activeMode === m.id) d.settings.activeMode = NORMAL_MODE_ID;
        });
        closeSheet();
      }
    });
  });
}

/* ---------- copias, exportar e importar ---------- */
async function doExport() {
  const json = store.exportJson();
  const name = `task-reminder-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Copia de Task Reminder' });
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    await store.markExported();
    toast('Copia exportada.');
  } catch (err) {
    if (err?.name !== 'AbortError') toast(`No se pudo exportar: ${err.message}`);
  }
}

function importSheet() {
  openSheet(`<h2>Importar copia</h2><form id="imp-form"><div class="field"><label for="imp-file">Fichero .json exportado</label><input id="imp-file" type="file" accept="application/json,.json" /></div>
    <div class="field"><span class="lbl">¿Qué hacer con lo importado?</span><select id="imp-mode"><option value="merge">Fusionar: añadir lo que falte, sin tocar lo actual</option><option value="replace">Reemplazar todo (se guarda una copia antes)</option></select></div>
    <div class="actions"><button class="btn primary grow" type="submit">Importar</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div></form>`, (sheet) => {
    sheet.querySelector('[data-sheet=close]').addEventListener('click', closeSheet);
    $('#imp-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = $('#imp-file', sheet).files[0];
      if (!f) return toast('Elige un fichero.');
      try {
        const r = await store.importJson(await f.text(), $('#imp-mode', sheet).value);
        closeSheet(); toast(`Importado. Ahora hay ${r.tasks} tareas.`);
      } catch (err) { toast(err.message); }
    });
  });
}

async function backupsSheet() {
  const list = await store.listBackups();
  openSheet(`<h2>Copias automáticas</h2><p style="color:var(--muted);font-size:.9rem">Se guardan una al día y antes de migrar, importar o restaurar (las últimas 7). Restaurar guarda antes el estado actual.</p>
    ${list.length ? list.map((b) => `<div class="line"><span>${fmtStamp(b.createdAt)}<br><small style="color:var(--muted)">${esc(b.reason)} · ${b.tasks} tareas</small></span><button class="btn small" data-restore="${esc(b.key)}">Restaurar</button></div>`).join('') : '<p>Todavía no hay copias.</p>'}
    <div class="actions"><button class="btn" data-sheet="close">Cerrar</button></div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      if (e.target.closest('[data-sheet=close]')) return closeSheet();
      const key = e.target.closest('[data-restore]')?.dataset.restore;
      if (!key) return;
      try { await store.restoreBackup(key); closeSheet(); toast('Copia restaurada.'); } catch (err) { toast(err.message); }
    });
  });
}

function textImportSheet() {
  openSheet(`<h2>Importar desde texto</h2><form id="txt-form"><div class="field"><label for="txt">Pega aquí tu lista</label><textarea id="txt" style="min-height:180px" placeholder="Lunes&#10;Poner lavadora&#10;Martes&#10;…&#10;Mensual&#10;Limpiar nevera" autofocus></textarea></div>
    <div id="txt-preview"></div>
    <div class="actions"><button class="btn primary grow" type="submit" id="txt-go">Vista previa</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div></form>`, (sheet) => {
    let parsed = null;
    sheet.querySelector('[data-sheet=close]').addEventListener('click', closeSheet);
    $('#txt', sheet).addEventListener('input', () => { parsed = null; $('#txt-go', sheet).textContent = 'Vista previa'; });
    $('#txt-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!parsed) {
        parsed = parseTaskText($('#txt', sheet).value);
        $('#txt-preview', sheet).innerHTML = parsed.tasks.length
          ? `<ul style="padding-left:18px;margin:0 0 10px">${parsed.tasks.map((t) => `<li>${esc(t.title)} <span class="tag">${esc(recLabel(t.recurrence))}</span></li>`).join('')}</ul>${parsed.ignored.length ? `<p class="meta" style="color:var(--warn)">${parsed.ignored.length} línea(s) sin cabecera se han ignorado.</p>` : ''}`
          : '<p class="meta">No he encontrado tareas. Pon una cabecera (Lunes, Mensual…) antes de cada grupo.</p>';
        if (parsed.tasks.length) $('#txt-go', sheet).textContent = `Importar ${parsed.tasks.length} tareas`;
        else parsed = null;
        return;
      }
      await store.update((d) => { for (const t of parsed.tasks) d.tasks.push(createTask(t)); });
      closeSheet(); toast(`${parsed.tasks.length} tareas importadas.`);
    });
  });
}

/* ---------- eventos ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('#sheet-root')) return;
  const { action, id, occ, v } = el.dataset;
  try {
    if (action === 'tab') { ui.view = v; render(); window.scrollTo(0, 0); }
    else if (action === 'toggle') await doToggle(id, occ);
    else if (action === 'edit') taskSheet(id);
    else if (action === 'menu') rowMenu(id, occ);
    else if (action === 'add') taskSheet(null);
    else if (action === 'pick-mode') pickModeSheet();
    else if (action === 'theme') await store.update((d) => { d.settings.theme = v; });
    else if (action === 'add-mode') modeSheet(null);
    else if (action === 'edit-mode') modeSheet(id);
    else if (action === 'export') await doExport();
    else if (action === 'import') importSheet();
    else if (action === 'backups') await backupsSheet();
    else if (action === 'import-text') textImportSheet();
  } catch (err) {
    toast(`Error: ${err.message}`);
  }
});
document.addEventListener('change', async (e) => {
  if (e.target.matches('[data-action=auto]')) await store.update((d) => { d.settings.autoModes = e.target.checked; });
  if (e.target.id === 'cat') { ui.category = e.target.value; render(); }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { ui.search = e.target.value; render(); } });

/* ---------- arranque ---------- */
function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  setTimeout(() => { render(); scheduleMidnight(); }, next - now);
}

async function boot() {
  let adapter;
  try {
    adapter = indexedDbAdapter();
    await adapter.get('probe');
  } catch {
    adapter = memoryAdapter();
    ui.storageWarning = 'Este navegador no permite guardar datos (¿modo privado?). Lo que añadas se perderá al cerrar. Exporta una copia.';
  }
  store = createStore(adapter);
  try {
    const info = await store.load();
    if (info.migratedFrom !== null) toast('Datos actualizados a la nueva versión (copia previa guardada).');
  } catch (err) {
    $('#app').innerHTML = `<div class="fatal"><h1>No se pueden abrir los datos</h1><p>${esc(err.message)}</p><p>No se ha modificado nada.</p></div>`;
    return;
  }
  store.subscribe(render);
  try { ui.persisted = (await navigator.storage?.persist?.()) ?? null; } catch { ui.persisted = null; }
  render();
  store.autoBackup().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  scheduleMidnight();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
if (FAKE_OK) window.__store = () => store;
