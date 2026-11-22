// Reglas de negocio puras: periodicidad efectiva según el modo, estado "hecha" por periodo y marcado.
// Una tarea guarda un registro (`log`) con sus realizaciones; "hecha" se CALCULA para el periodo actual,
// por eso los reinicios (lunes, mes, trimestre...) ocurren solos al abrir la app.
import { addDays, dayKey, diffDays, isoDow, periodEnd, periodStart, weekDays } from './periods.js';

export const RECURRENCE_TYPES = ['weekdays', 'weekly', 'monthly', 'quarterly', 'semester', 'yearly', 'once'];
export const PERIOD_OF = { weekly: 'week', monthly: 'month', quarterly: 'quarter', semester: 'semester', yearly: 'year' };
export const LOG_LIMIT = 500;

export const RECURRENCE_LABELS = {
  weekdays: 'Días de la semana',
  weekly: 'Semanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semester: 'Semestral',
  yearly: 'Anual',
  once: 'Pendiente (una vez)',
};
export const DOW_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DOW_LETTERS = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Normaliza una periodicidad; devuelve null si no es válida. */
export function normalizeRecurrence(rec) {
  if (!rec || !RECURRENCE_TYPES.includes(rec.type)) return null;
  if (rec.type === 'weekdays') {
    const days = [...new Set((rec.days ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    return days.length ? { type: 'weekdays', days } : null;
  }
  return { type: rec.type };
}

export function createTask({ title, notes = '', category = '', recurrence, overrides = {}, now = Date.now() }) {
  const rec = normalizeRecurrence(recurrence);
  const clean = String(title ?? '').trim();
  if (!clean) throw new Error('La tarea necesita un título.');
  if (!rec) throw new Error('La periodicidad no es válida.');
  return {
    id: newId(),
    title: clean.slice(0, 200),
    notes: String(notes ?? '').slice(0, 2000),
    category: String(category ?? '').trim().slice(0, 40),
    recurrence: rec,
    overrides: cleanOverrides(overrides),
    log: [],
    archived: false,
    createdAt: now,
  };
}

export function cleanOverrides(overrides) {
  const out = {};
  for (const [modeId, ov] of Object.entries(overrides ?? {})) {
    if (ov?.disabled) out[modeId] = { disabled: true };
    else {
      const rec = normalizeRecurrence(ov?.recurrence);
      if (rec) out[modeId] = { recurrence: rec };
    }
  }
  return out;
}

/** Periodicidad que aplica en el modo dado, o null si la tarea está desactivada en ese modo. */
export function effectiveRecurrence(task, modeId) {
  const ov = task.overrides?.[modeId];
  if (ov?.disabled) return null;
  if (ov?.recurrence) return ov.recurrence;
  return task.recurrence;
}

export function lastDone(task) {
  let best = null;
  for (const e of task.log ?? []) if (!e.skipped && (best === null || e.day > best)) best = e.day;
  return best;
}

/**
 * Ocurrencias de la tarea relevantes hoy.
 * kind: 'today' (día de hoy), 'overdue' (día pasado de esta semana sin hacer), 'upcoming' (día futuro de esta semana),
 *       'period' (semanal/mensual/…), 'once' (pendiente puntual).
 */
export function occurrences(task, rec, today) {
  if (!rec) return [];
  const log = task.log ?? [];
  if (rec.type === 'weekdays') {
    return weekDays(today)
      .filter((d) => rec.days.includes(isoDow(d)))
      .map((d) => {
        const hit = log.find((e) => e.occ === d);
        return {
          taskId: task.id,
          occKey: d,
          day: d,
          kind: d === today ? 'today' : d < today ? 'overdue' : 'upcoming',
          done: Boolean(hit),
          skipped: Boolean(hit?.skipped),
          doneOn: hit?.day ?? null,
        };
      });
  }
  if (rec.type === 'once') {
    const hit = log[log.length - 1];
    return [{ taskId: task.id, occKey: 'once', day: null, kind: 'once', done: Boolean(hit), skipped: false, doneOn: hit?.day ?? null }];
  }
  const type = PERIOD_OF[rec.type];
  const start = periodStart(type, today);
  const hit = [...log].reverse().find((e) => e.day >= start && e.day <= periodEnd(type, today));
  return [{ taskId: task.id, occKey: start, day: null, kind: 'period', done: Boolean(hit), skipped: Boolean(hit?.skipped), doneOn: hit?.day ?? null }];
}

function withLog(task, log) {
  return { ...task, log: log.slice(-LOG_LIMIT) };
}

/** Marca una ocurrencia como hecha (o "saltada" esta vez). Devuelve la tarea nueva. */
export function markDone(task, rec, occKey, today, { skipped = false } = {}) {
  const log = (task.log ?? []).filter((e) => !(rec.type === 'weekdays' ? e.occ === occKey : sameOccurrence(e, rec, occKey)));
  const entry = { day: today };
  if (rec.type === 'weekdays') entry.occ = occKey;
  if (skipped) entry.skipped = true;
  return withLog(task, [...log, entry].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)));
}

/** Desmarca una ocurrencia. */
export function unmark(task, rec, occKey) {
  return withLog(task, (task.log ?? []).filter((e) => !(rec.type === 'weekdays' ? e.occ === occKey : sameOccurrence(e, rec, occKey))));
}

function sameOccurrence(entry, rec, occKey) {
  if (rec.type === 'once') return true;
  const type = PERIOD_OF[rec.type];
  return entry.day >= occKey && entry.day <= periodEnd(type, occKey);
}

export function toggle(task, rec, occurrence, today) {
  return occurrence.done ? unmark(task, rec, occurrence.occKey) : markDone(task, rec, occurrence.occKey, today);
}

/** Texto "hace N días" / "hoy" / "ayer" para una fecha pasada. */
export function agoLabel(day, today) {
  const n = diffDays(today, day);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 14) return `hace ${n} días`;
  if (n < 60) return `hace ${Math.round(n / 7)} semanas`;
  if (n < 700) return `hace ${Math.round(n / 30)} meses`;
  return `hace ${Math.round(n / 365)} años`;
}

export const SECTION_ORDER = ['today', 'overdue', 'weekly', 'monthly', 'quarterly', 'semester', 'yearly', 'once'];
export const SECTION_LABELS = {
  today: 'Hoy',
  overdue: 'Atrasadas',
  weekly: 'Esta semana',
  monthly: 'Este mes',
  quarterly: 'Este trimestre',
  semester: 'Este semestre',
  yearly: 'Este año',
  once: 'Pendientes',
};

/** Elementos de la vista "Hoy", agrupados por sección. Respeta archivadas y desactivadas por modo. */
export function buildToday(tasks, modeId, today) {
  const sections = Object.fromEntries(SECTION_ORDER.map((s) => [s, []]));
  for (const task of tasks) {
    if (task.archived) continue;
    const rec = effectiveRecurrence(task, modeId);
    for (const occ of occurrences(task, rec, today)) {
      let section;
      if (occ.kind === 'today') section = 'today';
      else if (occ.kind === 'overdue') {
        if (occ.done) continue;
        section = 'overdue';
      } else if (occ.kind === 'upcoming') continue;
      else if (occ.kind === 'once') section = 'once';
      else section = rec.type;
      sections[section].push({ task, rec, occ });
    }
  }
  for (const s of SECTION_ORDER) {
    sections[s].sort((a, b) => Number(a.occ.done) - Number(b.occ.done) || a.task.title.localeCompare(b.task.title, 'es'));
  }
  return sections;
}

/** Vista de la semana: por cada día, lo que toca (solo tareas de días concretos). */
export function buildWeek(tasks, modeId, today) {
  return weekDays(today).map((day) => ({
    day,
    items: tasks
      .filter((t) => !t.archived)
      .flatMap((task) => {
        const rec = effectiveRecurrence(task, modeId);
        return occurrences(task, rec, today)
          .filter((o) => o.day === day)
          .map((occ) => ({ task, rec, occ }));
      })
      .sort((a, b) => a.task.title.localeCompare(b.task.title, 'es')),
  }));
}

/** Progreso de la vista Hoy: hechas / total (sin contar pendientes futuras). */
export function progress(sections) {
  let done = 0;
  let total = 0;
  for (const items of Object.values(sections)) {
    for (const { occ } of items) {
      total += 1;
      if (occ.done) done += 1;
    }
  }
  return { done, total };
}

/** Realizaciones por día en los últimos `days` días (para el historial). */
export function activityByDay(tasks, today, days = 30) {
  const from = addDays(today, -(days - 1));
  const map = new Map();
  for (const t of tasks) {
    for (const e of t.log ?? []) {
      if (e.skipped || e.day < from || e.day > today) continue;
      map.set(e.day, (map.get(e.day) ?? 0) + 1);
    }
  }
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    return { day, count: map.get(day) ?? 0 };
  });
}

/** Racha de días consecutivos (hasta hoy o ayer) con al menos una tarea hecha. */
export function streak(tasks, today) {
  const days = new Set(tasks.flatMap((t) => (t.log ?? []).filter((e) => !e.skipped).map((e) => e.day)));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export { dayKey };
