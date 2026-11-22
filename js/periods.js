// Lógica pura de fechas y periodos. Trabaja con "claves de día" (YYYY-MM-DD) y aritmética UTC,
// así no le afectan los cambios de horario. Semana = lunes a domingo.

const pad = (n) => String(n).padStart(2, '0');

/** Clave de día local de un Date. */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function toUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUtc(t) {
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addDays(key, n) {
  const t = toUtc(key);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUtc(t);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoDow(key) {
  return toUtc(key).getUTCDay() || 7;
}

export function diffDays(later, earlier) {
  return Math.round((toUtc(later) - toUtc(earlier)) / 86400000);
}

export const PERIOD_TYPES = ['week', 'month', 'quarter', 'semester', 'year'];

/** Primer día (inclusive) del periodo que contiene `key`. */
export function periodStart(type, key) {
  const [y, m] = key.split('-').map(Number);
  switch (type) {
    case 'week':
      return addDays(key, -(isoDow(key) - 1));
    case 'month':
      return `${y}-${pad(m)}-01`;
    case 'quarter':
      return `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
    case 'semester':
      return `${y}-${m <= 6 ? '01' : '07'}-01`;
    case 'year':
      return `${y}-01-01`;
    default:
      throw new Error(`Periodo desconocido: ${type}`);
  }
}

/** Último día (inclusive) del periodo que contiene `key`. */
export function periodEnd(type, key) {
  const start = periodStart(type, key);
  const [y, m] = start.split('-').map(Number);
  switch (type) {
    case 'week':
      return addDays(start, 6);
    case 'month':
      return fromUtc(new Date(Date.UTC(y, m, 0)));
    case 'quarter':
      return fromUtc(new Date(Date.UTC(y, m + 2, 0)));
    case 'semester':
      return fromUtc(new Date(Date.UTC(y, m + 5, 0)));
    case 'year':
      return `${y}-12-31`;
    default:
      throw new Error(`Periodo desconocido: ${type}`);
  }
}

/** Días que quedan del periodo, contando hoy (1 = último día). */
export function daysLeft(type, key) {
  return diffDays(periodEnd(type, key), key) + 1;
}

/** Los 7 días (lunes a domingo) de la semana que contiene `key`. */
export function weekDays(key) {
  const start = periodStart('week', key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Compara día MM-DD dentro de un rango anual que puede cruzar fin de año (p. ej. 11-01 → 03-31). */
export function inYearRange(key, from, to) {
  if (!/^\d{2}-\d{2}$/.test(from ?? '') || !/^\d{2}-\d{2}$/.test(to ?? '')) return false;
  const md = key.slice(5);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}
