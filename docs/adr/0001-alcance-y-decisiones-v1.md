# ADR 0001 — Alcance y decisiones de la v1

Fecha: 2026-11-22 · Estado: aceptada (decidido por el usuario)

## Contexto
Las tareas periódicas vivían en un bot de Telegram: se marcaban a diario y se desmarcaban a mano el domingo. Se quiere una app instalable en iPhone sin App Store, con reinicios automáticos por periodo, fecha de última realización, edición fácil, modos estacionales y sin pérdida de datos entre versiones.

## Decisiones
| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Distribución | PWA en **GitHub Pages** (HTTPS válido; instalable desde Safari) | Servidor propio con certificado autofirmado: iOS lo rechaza para PWA instalables |
| Avisos | **Sin push** en v1; insignia con pendientes y resumen al abrir | Push (exige backend y datos fuera del móvil) |
| Datos | **Locales** (IndexedDB) + exportar/importar JSON + copias automáticas | Sincronización automática PC↔iPhone (backend); fase posterior |
| Stack | JS plano modular sin build | Angular: más peso y complejidad con el service worker en Pages |
| Reinicios | «Hecha» **calculada** por periodo (no se reinicia nada) | Tarea programada de reinicio: iOS no garantiza segundo plano |

## Consecuencias
- Abrir la app tras semanas sin usarla muestra el estado correcto sin ejecutar nada.
- Los datos del PC (origen `localhost`) y del iPhone (origen Pages) son independientes; se mueven con JSON.
- Si se quiere sincronizar o avisar en el futuro, habrá que añadir un backend y un ADR nuevo.
