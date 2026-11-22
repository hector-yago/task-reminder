// Copia la versión de package.json a js/version.js y sw.js (cada versión nueva = caché nueva).
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
writeFileSync(new URL('js/version.js', root), `// Generado por tools/sync-version.mjs a partir de package.json. No editar a mano.\nexport const VERSION = '${version}';\n`);
const sw = readFileSync(new URL('sw.js', root), 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
writeFileSync(new URL('sw.js', root), sw);
console.log('Versión sincronizada:', version);
