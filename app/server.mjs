// Servidor local mínimo para la app (evita el bloqueo CORS de file://)
// Uso:  node server.mjs   →  http://localhost:8321
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DIR = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

createServer(async (req, res) => {
  const ruta = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const cuerpo = await readFile(join(DIR, ruta));
    res.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404);
    res.end('no encontrado');
  }
}).listen(8321, () => console.log('App de leyes en http://localhost:8321'));
