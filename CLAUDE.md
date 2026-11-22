# task-reminder

PWA personal de tareas periódicas (días de la semana, semanal, mensual, trimestral, semestral, anual, pendiente puntual) con modos (Normal/Verano…). Proyecto **nuevo**, contexto **personal**. Se instala en el iPhone desde GitHub Pages (sin App Store) y se lanza en el PC desde My Tools.

## Stack y comandos
- JS plano modular (ES modules), **sin build ni dependencias**. Node 22 solo para tests, servidor local y e2e.
- `npm test` (unitarios, `node --test`) · `node tests/e2e/e2e.mjs [--shots=carpeta]` (Edge/Chrome headless por CDP) · `npm run icons` · `npm run version:sync`.
- Servidor local: `node serve.mjs [puerto]` (8095). My Tools lo arranca con `abrir-task-reminder.ps1` (`-Parar`, `-SoloComprobar`).

## Reglas de diseño (decisiones en `docs/adr/`)
- «Hecha» se **calcula** (`js/tasks.js`): una tarea guarda su `log` y está hecha si hay una realización en el periodo actual (semana lunes–domingo, mes, trimestre, semestre, año). No hay reinicios programados. Días de la semana: cada ocurrencia se marca con `occ`.
- `js/periods.js` y `js/tasks.js` son **puros** (sin DOM ni reloj): reciben «hoy» como clave `YYYY-MM-DD`. Aritmética UTC sobre claves: inmune a cambios de horario.
- Persistencia: un único documento JSON (`js/store.js`) en IndexedDB. **Datos entre versiones (requisito 6): ver `docs/datos-y-migraciones.md`.** Prohibido cambiar la forma de los datos sin migración + fixture + test.
- Modos: `task.overrides[modeId]` = otra periodicidad o `disabled`. Se resuelven en `js/modes.js`.
- Sin push, sin backend, sin telemetría. Los datos viven solo en el dispositivo; export/import JSON + copias automáticas.
- Tema claro/oscuro con tokens CSS; texto de la interfaz en castellano; código en inglés.
- `?hoy=AAAA-MM-DD` y `window.__setToday` solo funcionan en `localhost` (pruebas).
- El origen `localhost` es el de My Tools (datos del PC); usar siempre `localhost`, no `127.0.0.1`, o se verán datos distintos.

## Release (regla general del usuario; cada cambio)
1. Subir `version` en `package.json` y `npm run version:sync` (actualiza `js/version.js` y la caché del `sw.js`).
2. Tests + e2e en verde.
3. Cerrar solo la instancia en marcha (`abrir-task-reminder.ps1 -Parar`); My Tools la lanza de nuevo con lo último.
4. Publicar: `git push` a `main` (GitHub Pages; repo `hector-yago/task-reminder`, URL `https://hector-yago.github.io/task-reminder/`). Subir a Pages requiere autorización expresa del usuario.
5. En el iPhone, la PWA se actualiza al abrirla con conexión (service worker red-primero).

## Pendiente conocido
- Instalación y persistencia en iPhone real: prueba manual (`docs/pruebas.md`).
- Push/notificaciones y sincronización PC↔iPhone: fuera de v1 (ADR 0001).
