// Modos (Normal, Verano…): activación manual o automática por rango anual de fechas (MM-DD → MM-DD).
import { inYearRange } from './periods.js';

export const NORMAL_MODE_ID = 'normal';

export function defaultModes() {
  return [{ id: NORMAL_MODE_ID, name: 'Normal', icon: '🏠', range: null }];
}

export function normalizeMode(m) {
  const id = String(m?.id ?? '').trim();
  const name = String(m?.name ?? '').trim().slice(0, 40);
  if (!id || !name) return null;
  const range = m.range && /^\d{2}-\d{2}$/.test(m.range.from ?? '') && /^\d{2}-\d{2}$/.test(m.range.to ?? '') ? { from: m.range.from, to: m.range.to } : null;
  return { id, name, icon: String(m.icon ?? '').slice(0, 4), range };
}

/**
 * Modo vigente en `today`. Con `autoModes` activado manda el primer modo cuyo rango contenga la fecha;
 * si no, el elegido a mano; si éste ya no existe, Normal.
 */
export function resolveMode(modes, settings, today) {
  if (settings.autoModes) {
    const auto = modes.find((m) => m.range && inYearRange(today, m.range.from, m.range.to));
    if (auto) return auto;
  }
  return modes.find((m) => m.id === settings.activeMode) ?? modes.find((m) => m.id === NORMAL_MODE_ID) ?? modes[0];
}
