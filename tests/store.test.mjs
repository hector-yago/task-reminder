import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, memoryAdapter, BACKUP_KEEP } from '../js/store.js';
import { CURRENT_SCHEMA, migrate } from '../js/migrations.js';
import { createTask, markDone } from '../js/tasks.js';
import { parseTaskText } from '../js/text-import.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const clock = (start = 1_800_000_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
};

test('primer arranque crea el documento y los cambios persisten entre sesiones', async () => {
  const adapter = memoryAdapter();
  const s1 = createStore(adapter);
  assert.equal((await s1.load()).created, true);
  await s1.update((d) => {
    d.tasks.push(createTask({ title: 'Regar', recurrence: { type: 'weekly' } }));
  });
  const s2 = createStore(adapter);
  const info = await s2.load();
  assert.equal(info.created, false);
  assert.equal(s2.state.tasks.length, 1);
});

test('migración: fixture de la v1 publicada se abre sin perder nada', async () => {
  const v1 = fixture('v1.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v1);
  const s = createStore(adapter);
  const info = await s.load();
  assert.equal(info.migratedFrom, null);
  assert.equal(s.state.schemaVersion, CURRENT_SCHEMA);
  assert.equal(s.state.tasks.length, v1.tasks.length);
  assert.deepEqual(s.state.tasks[0].log, v1.tasks[0].log);
  assert.deepEqual(s.state.tasks[0].overrides, v1.tasks[0].overrides);
  assert.equal(s.state.modes.length, v1.modes.length);
});

test('migración: documento sin versión se migra y deja copia previa intacta', async () => {
  const legacy = { tasks: [{ id: 'a', title: 'Vieja', recurrence: { type: 'weekly' }, log: [{ day: '2026-01-05' }] }] };
  const adapter = memoryAdapter();
  await adapter.put('doc', legacy);
  const s = createStore(adapter);
  const info = await s.load();
  assert.equal(info.migratedFrom, 0);
  assert.equal(s.state.tasks[0].title, 'Vieja');
  assert.deepEqual(s.state.tasks[0].log, [{ day: '2026-01-05' }]);
  const backups = await s.listBackups();
  assert.equal(backups.length, 1);
  assert.match(backups[0].reason, /antes de migrar/);
  const raw = await adapter.get(backups[0].key);
  assert.deepEqual(raw.doc, legacy); // la copia es el original sin tocar
});

test('datos de una versión más nueva: error claro y no se modifica nada', async () => {
  const future = { schemaVersion: CURRENT_SCHEMA + 1, tasks: [] };
  const adapter = memoryAdapter();
  await adapter.put('doc', future);
  const s = createStore(adapter);
  await assert.rejects(() => s.load(), /versión más nueva/);
  assert.deepEqual(await adapter.get('doc'), future);
});

test('datos corruptos: se descarta lo irrecuperable y se conserva lo válido', () => {
  const { doc } = migrate({
    schemaVersion: 1,
    tasks: [
      { id: '1', title: 'ok', recurrence: { type: 'monthly' }, log: [{ day: '2026-02-30' }, { day: '2026-02-10' }] },
      { id: '1', title: 'duplicada', recurrence: { type: 'monthly' } },
      { id: '2', title: '', recurrence: { type: 'monthly' } },
      { id: '3', title: 'sin periodicidad' },
      null,
    ],
    settings: { theme: 'neon', activeMode: 'borrado' },
  });
  assert.equal(doc.tasks.length, 1);
  assert.deepEqual(doc.tasks[0].log, [{ day: '2026-02-10' }]);
  assert.equal(doc.settings.theme, 'system');
  assert.equal(doc.settings.activeMode, 'normal');
});

test('exportar → importar (reemplazar) recupera todo', async () => {
  const a = createStore(memoryAdapter());
  await a.load();
  await a.update((d) => {
    const t = createTask({ title: 'Plancha', recurrence: { type: 'weekdays', days: [2, 4] }, overrides: { verano: { disabled: true } } });
    d.tasks.push(markDone(t, t.recurrence, '2026-11-24', '2026-11-24'));
    d.modes.push({ id: 'verano', name: 'Verano', icon: '☀️', range: { from: '06-15', to: '09-15' } });
  });
  const json = a.exportJson();
  const b = createStore(memoryAdapter());
  await b.load();
  const r = await b.importJson(json, 'replace');
  assert.equal(r.tasks, 1);
  assert.deepEqual(b.state.tasks, a.state.tasks);
  assert.deepEqual(b.state.modes, a.state.modes);
});

test('importar (fusionar) no duplica y no pisa lo existente', async () => {
  const a = createStore(memoryAdapter());
  await a.load();
  await a.update((d) => d.tasks.push(createTask({ title: 'Una', recurrence: { type: 'weekly' } })));
  const json = a.exportJson();
  await a.update((d) => d.tasks.push(createTask({ title: 'Dos', recurrence: { type: 'monthly' } })));
  await a.importJson(json, 'merge');
  assert.deepEqual(a.state.tasks.map((t) => t.title), ['Una', 'Dos']);
});

test('importar: rechaza ficheros ajenos o rotos y no toca los datos', async () => {
  const s = createStore(memoryAdapter());
  await s.load();
  await s.update((d) => d.tasks.push(createTask({ title: 'Una', recurrence: { type: 'weekly' } })));
  await assert.rejects(() => s.importJson('no es json'), /JSON/);
  await assert.rejects(() => s.importJson('{"app":"otra"}'), /exportación/);
  assert.equal(s.state.tasks.length, 1);
});

test('copia automática diaria, límite de copias y restauración', async () => {
  const c = clock();
  const s = createStore(memoryAdapter(), { now: c.now });
  await s.load();
  assert.equal(await s.autoBackup(), false); // sin tareas no hay nada que copiar
  await s.update((d) => d.tasks.push(createTask({ title: 'Una', recurrence: { type: 'weekly' }, now: c.now() })));
  assert.equal(await s.autoBackup(), true);
  assert.equal(await s.autoBackup(), false); // ya hay una de hoy
  for (let i = 0; i < BACKUP_KEEP + 3; i++) {
    c.advance(25 * 3600 * 1000);
    await s.autoBackup();
  }
  const backups = await s.listBackups();
  assert.equal(backups.length, BACKUP_KEEP);
  await s.update((d) => {
    d.tasks = [];
  });
  await s.restoreBackup(backups[0].key);
  assert.equal(s.state.tasks.length, 1);
});

test('recordatorio de copia manual', async () => {
  const c = clock();
  const s = createStore(memoryAdapter(), { now: c.now });
  await s.load();
  assert.equal(s.backupDue(), false);
  await s.update((d) => d.tasks.push(createTask({ title: 'x', recurrence: { type: 'weekly' }, now: c.now() })));
  assert.equal(s.backupDue(), false); // recién creada: sin aviso
  c.advance(15 * 86400000);
  assert.equal(s.backupDue(), true);
  await s.markExported();
  assert.equal(s.backupDue(), false);
  c.advance(15 * 86400000);
  assert.equal(s.backupDue(), true);
});

test('importar texto de Telegram', () => {
  const { tasks, ignored } = parseTaskText(`Lunes
✅ Poner lavadora
- Sacar basura

Martes y jueves:
Pasar la fregona

Una vez al mes
Limpiar nevera
Semestral
Cambiar ropa de armario
Tareas pendientes
Pedir cita médico`);
  assert.equal(tasks.length, 6);
  assert.deepEqual(tasks[0], { title: 'Poner lavadora', recurrence: { type: 'weekdays', days: [1] } });
  assert.deepEqual(tasks[2].recurrence, { type: 'weekdays', days: [2, 4] });
  assert.deepEqual(tasks[3].recurrence, { type: 'monthly' });
  assert.deepEqual(tasks[4].recurrence, { type: 'semester' });
  assert.deepEqual(tasks[5].recurrence, { type: 'once' });
  assert.equal(parseTaskText('suelta\nLunes\nx').ignored[0], 'suelta');
  void ignored;
});
