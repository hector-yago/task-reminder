// Prueba de extremo a extremo en Edge/Chrome headless (sin dependencias: CDP por WebSocket de Node 22).
// Uso: node tests/e2e/e2e.mjs [--shots=carpeta]   (por defecto no guarda capturas)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) throw new Error('No hay Edge ni Chrome instalados.');
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
if (shots) mkdirSync(shots, { recursive: true });

const PORT = 8197;
const CDP = 9333;
const profile = mkdtempSync(join(tmpdir(), 'tr-e2e-'));
const server = spawn(process.execPath, ['serve.mjs', String(PORT)], { stdio: 'ignore' });
const proc = spawn(browser, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { proc.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* en uso */ } };
process.on('exit', cleanup);

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* aún arrancando */ }
    await sleep(250);
  }
  throw new Error('No se pudo conectar con el navegador.');
}

const ws = new WebSocket(await connect());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const goto = async (url) => { await send('Page.navigate', { url }); await sleep(900); };
const shot = async (name) => {
  if (!shots) return;
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
};
const click = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
const text = () => evaluate('document.body.innerText');

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const base = `http://localhost:${PORT}/`;
  await goto(`${base}?hoy=2026-11-25`); // miércoles
  assert.match(await text(), /Aún no hay tareas/i);

  // Semilla: datos de ejemplo ficticios
  await evaluate(`(async () => {
    const m = await import('./js/tasks.js');
    const st = window.__store();
    await st.update((d) => {
      d.modes.push({ id: 'verano', name: 'Verano', icon: '☀️', range: { from: '06-15', to: '09-15' } });
      d.tasks.push(
        m.createTask({ title: 'Sacar la basura', recurrence: { type: 'weekdays', days: [1, 3, 5] }, category: 'Casa' }),
        m.createTask({ title: 'Poner lavadora', recurrence: { type: 'weekdays', days: [3] }, category: 'Casa' }),
        m.createTask({ title: 'Regar las plantas', recurrence: { type: 'weekly' }, overrides: { verano: { recurrence: { type: 'weekdays', days: [1, 3, 5] } } } }),
        m.createTask({ title: 'Limpiar la nevera', recurrence: { type: 'monthly' } }),
        m.createTask({ title: 'Revisar extintor', recurrence: { type: 'semester' } }),
        m.createTask({ title: 'Renovar seguro', recurrence: { type: 'yearly' } }),
        m.createTask({ title: 'Pedir cita con el dentista', recurrence: { type: 'once' } }),
      );
    });
  })()`);
  await sleep(200);
  let t = await text();
  for (const s of ['Atrasadas', 'Sacar la basura', 'Esta semana', 'Este mes', 'Este semestre', 'Este año', 'Pendientes']) assert.match(t, new RegExp(s, 'i'), `falta «${s}»`);
  await shot('01-hoy-claro');

  // Marcar y desmarcar
  await click('.row .check:not([disabled])');
  await sleep(150);
  assert.ok((await evaluate('document.querySelectorAll(".row.done").length')) >= 1, 'no se marcó');
  await click('.row.done .check');
  await sleep(150);
  assert.equal(await evaluate('document.querySelectorAll(".row.done").length'), 0, 'no se desmarcó');

  // Marcar la semanal «Regar las plantas»; persiste tras recargar
  await evaluate(`[...document.querySelectorAll('.row')].find(r => r.innerText.includes('Regar las plantas')).querySelector('.check').click()`);
  await sleep(200);
  await goto(`${base}?hoy=2026-11-25`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.row.done')].some(r => r.innerText.includes('Regar las plantas'))`), true, 'los datos no persisten tras recargar');

  // Domingo: sigue hecha; lunes siguiente: se reinicia sola
  await evaluate(`window.__setToday('2026-11-29')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.row.done')].some(r => r.innerText.includes('Regar las plantas'))`), true, 'el domingo debería seguir hecha');
  await evaluate(`window.__setToday('2026-11-30')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.row.done')].some(r => r.innerText.includes('Regar las plantas'))`), false, 'el lunes debería reiniciarse');
  assert.match(await text(), /Última vez: 25\/11\/2026/);
  await shot('02-lunes-reinicio');

  // Cambiar a modo Verano: la semanal pasa a lunes-miércoles-viernes
  await evaluate(`window.__setToday('2026-11-25')`);
  await click('[data-action=pick-mode]');
  await evaluate(`document.querySelector('[data-mode=verano]').click()`);
  await sleep(200);
  assert.match(await text(), /Regar las plantas/);
  assert.equal(await evaluate(`[...document.querySelectorAll('#app .row')].some(r => r.innerText.includes('Regar las plantas') && r.innerText.includes('Atrasada'))`), true);
  await shot('03-modo-verano');
  await evaluate(`document.querySelector('[data-action=tab][data-v=tasks]').click()`);
  await sleep(100);
  await shot('04-tareas');
  await evaluate(`document.querySelector('[data-action=tab][data-v=week]').click()`);
  await sleep(100);
  await shot('05-semana');

  // Alta de tarea desde la interfaz
  await evaluate(`document.querySelector('[data-action=tab][data-v=today]').click()`);
  await click('[data-action=add]');
  await sleep(150);
  await shot('06-nueva-tarea');
  await evaluate(`(() => { const f = document.querySelector('#task-form'); f.elements.title.value = 'Tarea de prueba'; f.elements['base-type'].value = 'monthly'; f.elements['base-type'].dispatchEvent(new Event('change')); f.requestSubmit(); })()`);
  await sleep(250);
  assert.match(await text(), /Tarea de prueba/);

  // Tema oscuro y ajustes
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await evaluate(`document.querySelector('[data-action=tab][data-v=settings]').click()`);
  await sleep(150);
  await shot('07-ajustes-oscuro');
  await evaluate(`document.querySelector('[data-action=tab][data-v=today]').click()`);
  await sleep(100);
  await shot('08-hoy-oscuro');

  // Exportar → contenido válido
  const exported = await evaluate(`window.__store().exportJson()`);
  assert.equal(JSON.parse(exported).data.tasks.length, 8);

  // Service worker activo y manifiesto
  const sw = await evaluate(`navigator.serviceWorker.ready.then(r => !!r.active)`);
  assert.equal(sw, true, 'el service worker no se activó');
  const manifest = await evaluate(`fetch('manifest.webmanifest').then(r => r.json()).then(j => j.icons.length)`);
  assert.ok(manifest >= 3);
  console.log('E2E correcto');
} finally {
  cleanup();
}
process.exit(0);
