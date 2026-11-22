# Requisitos — Task Reminder

| Id | Requisito | Cobertura |
|---|---|---|
| R1 | Al empezar semana (lunes), mes, trimestre, semestre o año, las tareas de ese periodo vuelven a estar sin hacer | `js/tasks.js` (hecha calculada), `tasks.test.mjs`, e2e |
| R2 | Mostrar la fecha de la última vez que se realizó cada tarea | Filas de Hoy/Tareas (`lastDone`) |
| R3 | Marcar/desmarcar con un toque; añadir, editar, eliminar (con deshacer), duplicar, archivar; elegir día/periodicidad | Vista Hoy + hoja de tarea |
| R4 | Modos (p. ej. verano) con periodicidad distinta o desactivada por tarea; activación manual o por fechas | `js/modes.js`, hoja de tarea, Ajustes |
| R5 | Extras: pendientes puntuales, atrasadas, vista semana, búsqueda y categorías, saltar esta vez, marcar en otra fecha, progreso, racha y actividad, tema claro/oscuro, insignia, importación desde texto de Telegram, offline | Vistas de la app |
| R6 | No perder datos entre versiones | `docs/datos-y-migraciones.md` |
| R7 | PWA instalable en iPhone sin App Store, con logo | `manifest.webmanifest`, `sw.js`, `icons/` |
| R8 | Instalada en My Tools | `my-tools.json` + `abrir-task-reminder.ps1` |

## Supuestos (aprobados con el plan)
Semana de lunes a domingo; trimestres ene/abr/jul/oct; semestres ene/jul; zona horaria del dispositivo; las tareas de día concreto no hechas quedan «atrasadas» hasta el fin de la semana.
