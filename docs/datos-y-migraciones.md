# Datos entre versiones (requisito 6)

Los datos no se pierden al actualizar la app. Mecanismo:

1. **Documento versionado**: `schemaVersion` (actual: `CURRENT_SCHEMA` en `js/migrations.js`). Todo se guarda como un único documento en IndexedDB (`js/store.js`), escrito de forma atómica.
2. **Migraciones**: `js/migrations.js` tiene un paso por cada versión (`N → N+1`), puro e idempotente, que no elimina datos del usuario. Un paso publicado **nunca se edita**; se añade otro.
3. **Copia previa**: antes de migrar se guarda un snapshot del documento original (se conservan las últimas 7 copias). También antes de importar o restaurar.
4. **Datos de una versión más nueva** (p. ej. abrir un iPhone con la app vieja en caché): se muestra un error y **no se toca nada**.
5. **Saneado**: al migrar o importar se descarta solo lo irrecuperable (tareas sin título/periodicidad, fechas inválidas) y se conserva el resto.
6. **Copias manuales**: Ajustes → Exportar (fichero `.json` versionado, vía «Compartir» en iOS) e Importar (fusionar o reemplazar). Aviso si pasan más de 14 días sin exportar.
7. **Almacenamiento**: se pide `navigator.storage.persist()`; en iOS, la PWA instalada en pantalla de inicio no se purga por inactividad (Safari en pestaña sí puede hacerlo).

## Cómo cambiar el esquema
1. Subir `CURRENT_SCHEMA` y añadir `steps[N]` en `migrations.js`.
2. Guardar el fixture de la versión anterior en `tests/fixtures/vN.json` (el de la v1 ya existe).
3. Añadir un test que lo migre a la actual comprobando que no se pierde nada (`tests/store.test.mjs`).
4. Anotarlo en este documento y subir la versión de la app.
