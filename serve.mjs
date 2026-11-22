// Servidor estático mínimo y sin dependencias para usar la PWA en local (My Tools lo arranca).
// Uso: node serve.mjs [puerto] [--lan]   (por defecto 127.0.0.1:8095)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 8095);
const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
// Solo se publica lo necesario para la app (nada de tests, node_modules ni ficheros ocultos).
const allowed = /^(index\.html|sw\.js|manifest\.webmanifest|(css|js|icons)\/[\w.-]+)$/;

createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const full = normalize(join(root, rel));
    if (!full.startsWith(root) || !allowed.test(rel.split(sep).join('/'))) {
      res.writeHead(404).end('No encontrado');
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': types[extname(full)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(port, host, () => {
  console.log(`Task Reminder en http://${host === '0.0.0.0' ? 'TU-IP-LOCAL' : 'localhost'}:${port}/  (Ctrl+C para parar)`);
});
