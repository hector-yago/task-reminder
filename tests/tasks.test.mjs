import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToday, buildWeek, createTask, effectiveRecurrence, lastDone, markDone, occurrences, progress, streak, toggle, unmark, agoLabel } from '../js/tasks.js';
import { defaultModes, resolveMode } from '../js/modes.js';

const mk = (title, recurrence, extra = {}) => createTask({ title, recurrence, ...extra });
const first = (task, today, modeId = 'normal') => occurrences(task, effectiveRecurrence(task, modeId), today)[0];

test('semanal: marcada esta semana, se "desmarca" sola al llegar el lunes', () => {
  let t = mk('Limpiar baños', { type: 'weekly' });
  const rec = t.recurrence;
  t = markDone(t, rec, first(t, '2026-11-18').occKey, '2026-11-18'); // miércoles
  assert.ok(first(t, '2026-11-22').done); // domingo: sigue hecha
  assert.ok(!first(t, '2026-11-23').done); // lunes: nueva semana
  assert.equal(lastDone(t), '2026-11-18');
});

test('mensual, trimestral, semestral y anual se reinician al inicio de su periodo', () => {
  for (const [type, doneDay, still, reset] of [
    ['monthly', '2026-11-05', '2026-11-30', '2026-12-01'],
    ['quarterly', '2026-10-05', '2026-12-31', '2027-01-01'],
    ['semester', '2026-07-05', '2026-12-31', '2027-01-01'],
    ['yearly', '2026-03-05', '2026-12-31', '2027-01-01'],
  ]) {
    let t = mk('x', { type });
    t = markDone(t, t.recurrence, first(t, doneDay).occKey, doneDay);
    assert.ok(first(t, still).done, `${type} sigue hecha ${still}`);
    assert.ok(!first(t, reset).done, `${type} se reinicia ${reset}`);
  }
});

test('abrir la app tras semanas sin usarla: lo antiguo no cuenta como hecho', () => {
  let t = mk('x', { type: 'weekly' });
  t = markDone(t, t.recurrence, first(t, '2026-10-01').occKey, '2026-10-01');
  assert.ok(!first(t, '2026-11-22').done);
});

test('desmarcar quita la marca y conserva la fecha anterior como última vez', () => {
  let t = mk('x', { type: 'monthly' });
  t = markDone(t, t.recurrence, first(t, '2026-10-10').occKey, '2026-10-10');
  t = markDone(t, t.recurrence, first(t, '2026-11-10').occKey, '2026-11-10');
  assert.equal(lastDone(t), '2026-11-10');
  t = unmark(t, t.recurrence, first(t, '2026-11-12').occKey);
  assert.ok(!first(t, '2026-11-12').done);
  assert.equal(lastDone(t), '2026-10-10');
});

test('toggle alterna', () => {
  let t = mk('x', { type: 'weekly' });
  const rec = t.recurrence;
  t = toggle(t, rec, first(t, '2026-11-18'), '2026-11-18');
  assert.ok(first(t, '2026-11-18').done);
  t = toggle(t, rec, first(t, '2026-11-18'), '2026-11-18');
  assert.ok(!first(t, '2026-11-18').done);
});

test('días de la semana: hoy, atrasada y próxima', () => {
  const t = mk('Basura', { type: 'weekdays', days: [1, 3, 5] });
  const occ = occurrences(t, t.recurrence, '2026-11-25'); // miércoles
  assert.deepEqual(
    occ.map((o) => [o.day, o.kind]),
    [['2026-11-23', 'overdue'], ['2026-11-25', 'today'], ['2026-11-27', 'upcoming']],
  );
});

test('días de la semana: marcar el lunes tarde no marca el miércoles y se reinicia la semana siguiente', () => {
  let t = mk('Basura', { type: 'weekdays', days: [1, 3] });
  const rec = t.recurrence;
  t = markDone(t, rec, '2026-11-23', '2026-11-25'); // hecha el miércoles, pero era la del lunes
  const occ = occurrences(t, rec, '2026-11-25');
  assert.equal(occ[0].done, true);
  assert.equal(occ[0].doneOn, '2026-11-25');
  assert.equal(occ[1].done, false);
  assert.ok(occurrences(t, rec, '2026-11-30').every((o) => !o.done));
});

test('Hoy: secciones, atrasadas solo si no se hicieron, futuras ocultas, archivadas fuera', () => {
  const a = mk('Lunes', { type: 'weekdays', days: [1] });
  const b = mk('Hoy', { type: 'weekdays', days: [3] });
  const c = mk('Viernes', { type: 'weekdays', days: [5] });
  const d = mk('Mes', { type: 'monthly' });
  const e = mk('Arch', { type: 'weekly' });
  e.archived = true;
  const s = buildToday([a, b, c, d, e], 'normal', '2026-11-25');
  assert.equal(s.overdue.length, 1);
  assert.equal(s.today.length, 1);
  assert.equal(s.monthly.length, 1);
  assert.equal(s.weekly.length, 0);
  const done = markDone(a, a.recurrence, '2026-11-23', '2026-11-24');
  assert.equal(buildToday([done], 'normal', '2026-11-25').overdue.length, 0);
});

test('modos: periodicidad distinta o desactivada por modo', () => {
  const t = mk('Regar plantas', { type: 'weekly' }, { overrides: { verano: { recurrence: { type: 'weekdays', days: [1, 3, 5] } }, vacaciones: { disabled: true } } });
  assert.equal(effectiveRecurrence(t, 'normal').type, 'weekly');
  assert.deepEqual(effectiveRecurrence(t, 'verano').days, [1, 3, 5]);
  assert.equal(effectiveRecurrence(t, 'vacaciones'), null);
  assert.equal(buildToday([t], 'vacaciones', '2026-11-25').weekly.length, 0);
  assert.equal(buildToday([t], 'verano', '2026-11-25').today.length, 1);
});

test('cambiar de modo no pierde el historial', () => {
  let t = mk('Planchar', { type: 'weekly' }, { overrides: { verano: { recurrence: { type: 'monthly' } } } });
  t = markDone(t, t.recurrence, first(t, '2026-11-18').occKey, '2026-11-18');
  assert.equal(lastDone(t), '2026-11-18');
  assert.ok(first(t, '2026-11-20', 'verano').done); // mensual: hecha este mes
});

test('resolveMode: manual, automático por fechas y modo borrado', () => {
  const modes = [...defaultModes(), { id: 'verano', name: 'Verano', icon: '☀️', range: { from: '06-15', to: '09-15' } }];
  assert.equal(resolveMode(modes, { activeMode: 'normal', autoModes: true }, '2026-07-01').id, 'verano');
  assert.equal(resolveMode(modes, { activeMode: 'normal', autoModes: true }, '2026-11-01').id, 'normal');
  assert.equal(resolveMode(modes, { activeMode: 'verano', autoModes: false }, '2026-11-01').id, 'verano');
  assert.equal(resolveMode(modes, { activeMode: 'borrado', autoModes: false }, '2026-11-01').id, 'normal');
});

test('pendiente puntual: una vez hecha queda hecha; progreso y racha', () => {
  let t = mk('Llamar al seguro', { type: 'once' });
  assert.ok(!first(t, '2026-11-22').done);
  t = markDone(t, t.recurrence, 'once', '2026-11-22');
  assert.ok(first(t, '2027-05-01').done);
  assert.deepEqual(progress(buildToday([t], 'normal', '2026-11-22')), { done: 1, total: 1 });
  assert.equal(streak([t], '2026-11-23'), 1);
  assert.equal(streak([t], '2026-11-25'), 0);
});

test('saltar esta vez cuenta como hecha pero no como última realización', () => {
  let t = mk('x', { type: 'weekly' });
  t = markDone(t, t.recurrence, first(t, '2026-11-18').occKey, '2026-11-18', { skipped: true });
  assert.ok(first(t, '2026-11-18').skipped);
  assert.equal(lastDone(t), null);
});

test('vista semana y etiquetas', () => {
  const t = mk('Basura', { type: 'weekdays', days: [2, 4] });
  const w = buildWeek([t], 'normal', '2026-11-25');
  assert.equal(w.length, 7);
  assert.deepEqual(w.map((d) => d.items.length), [0, 1, 0, 1, 0, 0, 0]);
  assert.equal(agoLabel('2026-11-21', '2026-11-22'), 'ayer');
  assert.equal(agoLabel('2026-11-12', '2026-11-22'), 'hace 10 días');
});

test('validación al crear', () => {
  assert.throws(() => mk('  ', { type: 'weekly' }));
  assert.throws(() => mk('x', { type: 'cada-dos-lunas' }));
  assert.throws(() => mk('x', { type: 'weekdays', days: [] }));
});
