// Versionado del esquema de datos. REGLAS (ver docs/datos-y-migraciones.md):
//  - Nunca se edita una migración ya publicada; se añade una nueva (N → N+1) y se sube CURRENT_SCHEMA.
//  - Cada migración es pura e idempotente sobre el documento y NO elimina datos del usuario.
//  - Antes de migrar, el almacén guarda una copia del documento original (store.js).
//  - Cada versión publicada deja un fixture en tests/fixtures/ y un test que lo migra a la actual.
import { defaultModes, normalizeMode, NORMAL_MODE_ID } from './modes.js';
import { isValidKey } from './periods.js';
import { cleanOverrides, LOG_LIMIT, normalizeRecurrence } from './tasks.js';

export const CURRENT_SCHEMA = 1;
export const APP_ID = 'task-reminder';

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system', // 'system' | 'light' | 'dark'
  activeMode: NORMAL_MODE_ID,
  autoModes: false,
  backupReminderDays: 14,
});

export function emptyDoc() {
  return { schemaVersion: CURRENT_SCHEMA, tasks: [], modes: defaultModes(), settings: { ...DEFAULT_SETTINGS }, meta: {} };
}

// Cada clave N convierte un documento de versión N en versión N+1.
const steps = {
  // 0 → 1: documento sin versión (p. ej. importado a mano). La normalización final hace el trabajo.
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
};

export function migrate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('El documento de datos no es válido.');
  let doc = { ...input };
  const from = Number.isInteger(doc.schemaVersion) ? doc.schemaVersion : 0;
  if (from > CURRENT_SCHEMA) {
    throw new Error(`Los datos son de una versión más nueva de la app (esquema ${from}). Actualiza la app antes de abrirlos.`);
  }
  doc.schemaVersion = from;
  for (let v = from; v < CURRENT_SCHEMA; v++) {
    if (!steps[v]) throw new Error(`Falta la migración del esquema ${v} al ${v + 1}.`);
    doc = steps[v](doc);
  }
  return { doc: sanitize(doc), from, to: CURRENT_SCHEMA };
}

/** Normaliza y descarta lo irrecuperable, sin tocar lo válido. Se aplica también a las importaciones. */
export function sanitize(doc) {
  const modes = (Array.isArray(doc.modes) ? doc.modes : []).map(normalizeMode).filter(Boolean);
  if (!modes.some((m) => m.id === NORMAL_MODE_ID)) modes.unshift(...defaultModes());
  const seen = new Set();
  const tasks = [];
  for (const t of Array.isArray(doc.tasks) ? doc.tasks : []) {
    const recurrence = normalizeRecurrence(t?.recurrence);
    const title = String(t?.title ?? '').trim();
    if (!t?.id || !title || !recurrence || seen.has(t.id)) continue;
    seen.add(t.id);
    tasks.push({
      id: String(t.id),
      title: title.slice(0, 200),
      notes: String(t.notes ?? '').slice(0, 2000),
      category: String(t.category ?? '').trim().slice(0, 40),
      recurrence,
      overrides: cleanOverrides(t.overrides),
      log: (Array.isArray(t.log) ? t.log : [])
        .filter((e) => isValidKey(e?.day))
        .map((e) => ({ day: e.day, ...(isValidKey(e.occ) ? { occ: e.occ } : {}), ...(e.skipped ? { skipped: true } : {}) }))
        .slice(-LOG_LIMIT),
      archived: Boolean(t.archived),
      createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
    });
  }
  const s = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  s.autoModes = Boolean(s.autoModes);
  s.backupReminderDays = Number.isInteger(s.backupReminderDays) && s.backupReminderDays > 0 ? s.backupReminderDays : 14;
  if (!modes.some((m) => m.id === s.activeMode)) s.activeMode = NORMAL_MODE_ID;
  const meta = {};
  for (const k of ['lastExport', 'lastAutoBackup']) if (Number.isFinite(doc.meta?.[k])) meta[k] = doc.meta[k];
  return { schemaVersion: CURRENT_SCHEMA, tasks, modes, settings: s, meta };
}
