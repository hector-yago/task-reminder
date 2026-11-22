# Pruebas

## Automáticas
- `npm test`: periodos (límites de semana/mes/trimestre/semestre/año, bisiesto, cambio de horario), reglas de tareas y modos, almacén, migraciones (fixture v1, documento sin versión, versión futura), importación/exportación, copias, importación de texto.
- `node tests/e2e/e2e.mjs`: Edge/Chrome headless a 390×844: alta, marcar/desmarcar, persistencia tras recargar, reinicio semanal (domingo → lunes), cambio de modo, tema oscuro, exportación, service worker y manifiesto.

## Manuales en iPhone (no automatizables)
1. Safari → abrir la URL de Pages → Compartir → «Añadir a pantalla de inicio»; se ve el logo y se abre a pantalla completa.
2. Añadir una tarea, cerrar la app del todo, reabrirla: sigue ahí.
3. Modo avión: la app abre y funciona.
4. Cambiar el tema claro/oscuro del sistema: la app lo sigue; en Ajustes se puede forzar.
5. Ajustes → Exportar: se ofrece «Guardar en Archivos»; importar ese fichero (fusionar) no duplica.
6. Tras publicar una versión nueva: abrir con conexión y comprobar la versión en Ajustes; los datos siguen.
7. Insignia del icono con las pendientes (iOS 16.4+; puede pedir permiso de notificaciones para mostrarla).
