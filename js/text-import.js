// Importa tareas desde texto pegado (p. ej. copiado del bot de Telegram): cabeceras de periodicidad y una tarea por línea.
//   Lunes            → días de la semana
//   Semanal / Mensual / Trimestral / Semestral / Anual / Pendientes
// Líneas bajo una cabecera = tareas. Se ignoran viñetas, casillas (☑ ✅ ✔ ⬜ [x] -) y líneas vacías.
import { DOW_NAMES } from './tasks.js';

const strip = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const DOW_BY_NAME = Object.fromEntries(DOW_NAMES.slice(1).map((n, i) => [strip(n), i + 1]));
const TYPE_BY_NAME = {
  semanal: 'weekly',
  semanales: 'weekly',
  'una vez a la semana': 'weekly',
  mensual: 'monthly',
  mensuales: 'monthly',
  'una vez al mes': 'monthly',
  trimestral: 'quarterly',
  trimestrales: 'quarterly',
  'una vez al trimestre': 'quarterly',
  semestral: 'semester',
  semestrales: 'semester',
  'una vez al semestre': 'semester',
  anual: 'yearly',
  anuales: 'yearly',
  'una vez al ano': 'yearly',
  pendiente: 'once',
  pendientes: 'once',
  'tareas pendientes': 'once',
  'una vez': 'once',
};

function headerOf(line) {
  const core = strip(line)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!core) return null;
  const days = core.split(' ').filter((w) => w in DOW_BY_NAME);
  const words = core.split(' ').filter((w) => !['y', 'e', 'los', 'las', 'dias', 'de', 'cada'].includes(w));
  if (days.length && days.length === words.length) return { type: 'weekdays', days: days.map((d) => DOW_BY_NAME[d]) };
  if (core in TYPE_BY_NAME) return { type: TYPE_BY_NAME[core] };
  return null;
}

const BULLET = /^\s*(?:[-*•·▪◦►>]|\[[ xX✓✔]?\]|[☐☑☒✅✔✓⬜⬛🔲✔️❌☑️])+\s*/u;

/** Devuelve [{title, recurrence}] y las líneas que no se pudieron asignar. */
export function parseTaskText(text) {
  const tasks = [];
  const ignored = [];
  let current = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = headerOf(line.replace(/:$/, ''));
    if (head && !BULLET.test(line)) {
      current = head;
      continue;
    }
    const title = line.replace(BULLET, '').trim();
    if (!title) continue;
    if (!current) {
      ignored.push(line);
      continue;
    }
    tasks.push({ title, recurrence: current.type === 'weekdays' ? { type: 'weekdays', days: current.days } : { type: current.type } });
  }
  return { tasks, ignored };
}
