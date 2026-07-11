#!/usr/bin/env node
/**
 * Scraper del Archivo Digital de la Legislación del Perú
 * https://www.leyes.congreso.gob.pe/
 *
 * Extrae todas las normas (leyes, resoluciones legislativas, decretos ley,
 * decretos legislativos, decretos de urgencia, decretos supremos, leyes
 * constitucionales, leyes regionales, decretos supremos extraordinarios)
 * mediante búsquedas POST por año sobre el formulario ASP.NET del sitio.
 *
 * Uso:
 *   node scraper.mjs            # scrape completo (reanudable)
 *   node scraper.mjs --year 2020 --tipo 0   # un solo año/tipo (debug)
 *   node scraper.mjs --build    # solo consolida data/raw -> data/leyes.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
mkdirSync(RAW, { recursive: true });

const TIPOS = [
  { code: '0',  label: 'LEY / RESOLUCIÓN LEGISLATIVA / DECRETO LEY', desde: 1904 },
  { code: '2',  label: 'DECRETO SUPREMO', desde: 1904 },
  { code: '3',  label: 'DECRETO LEGISLATIVO', desde: 1980 },
  { code: '5',  label: 'DECRETO DE URGENCIA', desde: 1990 },
  { code: '14', label: 'LEY CONSTITUCIONAL', desde: 1990 },
  { code: '15', label: 'LEY REGIONAL', desde: 1900 },
  { code: '21', label: 'DECRETO SUPREMO EXTRAORDINARIO', desde: 1990 },
];
const HASTA = new Date().getFullYear();

const BASE = 'https://www.leyes.congreso.gob.pe/LeyNumePP.aspx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status >= 500) throw new Error('HTTP ' + res.status);
      return res;
    } catch (e) {
      const wait = Math.min(3000 * 2 ** i, 120000);
      console.error(`  reintento ${i + 1}/${tries} (${e.message}) — espero ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error('agotados los reintentos: ' + url);
}

function hidden(html, id) {
  const m = html.match(new RegExp(`id="${id}" value="([^"]*)"`));
  return m ? m[1] : '';
}

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function parseRows(html) {
  const rows = [];
  const tableM = html.match(/id="ctl00_ContentPlaceHolder1_GwDetalle"[\s\S]*?<\/table>/);
  if (!tableM) return rows;
  const trs = tableM[0].split(/<tr /).slice(2); // salta apertura + encabezado
  for (const tr of trs) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length < 4) continue;
    const expM = tr.match(/OpenWindowLotus\('([^']+)'\)/);
    const detM = tr.match(/OpenWindow\('DetLeyNume_1p\.aspx\?','([^']*)','([^']*)','([^']*)'\)/);
    rows.push({
      norma: decode(tds[0]),
      numero: decode(tds[1]),
      fecha: decode(tds[2]),
      titulo: decode(tds[3]),
      observaciones: tds[4] ? decode(tds[4]) : '',
      expediente: expM ? expM[1].replace(/^http:/, 'https:').replace(/&amp;/g, '&') : '',
      detalle: detM
        ? `https://www.leyes.congreso.gob.pe/DetLeyNume_1p.aspx?xNorma=${detM[1]}&xNumero=${encodeURIComponent(detM[2])}&xTipoNorma=${detM[3]}`
        : '',
    });
  }
  return rows;
}

function pageInfo(html) {
  const m = html.match(/\[(\d+) de (\d+)\]/);
  return m ? { actual: +m[1], total: +m[2] } : { actual: 1, total: 1 };
}

// La búsqueda real vive en LeyNume_1p.aspx y acepta los parámetros por GET;
// las páginas siguientes se piden con POST (postback del botón "siguiente").
async function searchPaginated(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0 (investigacion-legal-personal)' } });
  const cookies = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  let html = await res.text();
  const rows = parseRows(html);
  let pg = pageInfo(html);
  if (process.env.DEBUG) console.error('pg inicial', pg, 'rows', rows.length, 'len', html.length);
  while (pg.actual < pg.total) {
    const btn = html.match(/name="(ctl00\$ContentPlaceHolder1\$GwDetalle\$ctl\d+\$ImgBtnSiguiente)"/)?.[1];
    if (process.env.DEBUG) console.error('btn', btn);
    if (!btn) break;
    const form = {
      'ctl00_ToolkitScriptManager1_HiddenField': '',
      '__VIEWSTATE': hidden(html, '__VIEWSTATE'),
      '__VIEWSTATEGENERATOR': hidden(html, '__VIEWSTATEGENERATOR'),
      '__VIEWSTATEENCRYPTED': '',
      '__EVENTVALIDATION': hidden(html, '__EVENTVALIDATION'),
      [`${btn}.x`]: '5',
      [`${btn}.y`]: '5',
    };
    const res2 = await fetchRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies,
        'User-Agent': 'Mozilla/5.0 (investigacion-legal-personal)',
      },
      body: new URLSearchParams(form).toString(),
    });
    html = await res2.text();
    const nuevas = parseRows(html);
    const prev = pg;
    pg = pageInfo(html);
    if (pg.actual === prev.actual || nuevas.length === 0) break; // no avanzó
    rows.push(...nuevas);
    await sleep(300);
  }
  return rows;
}

const searchYear = (_state, tipo, year) =>
  searchPaginated(
    `https://www.leyes.congreso.gob.pe/LeyNume_1p.aspx?xEstado=2&xTipoNorma=${tipo}` +
      `&xTipoBusqueda=2&xFechaI=01%2f01%2f${year}&xFechaF=31%2f12%2f${year}` +
      `&xTexto=&xOrden=0&xNormaI=&xNormaF=`,
  );

const searchNumero = (tipo, ini, fin) =>
  searchPaginated(
    `https://www.leyes.congreso.gob.pe/LeyNume_1p.aspx?xEstado=2&xTipoNorma=${tipo}` +
      `&xTipoBusqueda=4&xFechaI=&xFechaF=&xTexto=&xOrden=0&xNormaI=${ini}&xNormaF=${fin}`,
  );

const searchAllByNumero = (tipo) => searchNumero(tipo, 1, 9999999);

// ---- PDFs: patrones confirmados por época --------------------------------
function pdfCandidates(row) {
  const urls = [];
  const n = parseInt(row.numero.replace(/\D/g, ''), 10);
  const year = parseInt(row.fecha.split('/')[2], 10);
  if (row.expediente) urls.push({ tipo: 'expediente', url: row.expediente });
  if (row.detalle) urls.push({ tipo: 'detalle', url: row.detalle });
  // Leyes/RL/DL numeradas hasta ~30490: PDF directo en Documentos/Leyes/NNNNN.pdf
  if (!isNaN(n) && n > 0 && n <= 30490 && /LEY|RESOLUCION|DECRETO LEY/i.test(row.norma)) {
    urls.push({ tipo: 'pdf', url: `https://www.leyes.congreso.gob.pe/Documentos/Leyes/${String(n).padStart(5, '0')}.pdf` });
  }
  // Época 2016-2021
  if (!isNaN(n) && year >= 2016 && year <= 2021 && /^LEY$/i.test(row.norma)) {
    urls.push({ tipo: 'pdf', url: `https://www.leyes.congreso.gob.pe/Documentos/2016_2021/ADLP/Normas_Legales/${n}-LEY.pdf` });
    urls.push({ tipo: 'texto consolidado', url: `https://www.leyes.congreso.gob.pe/Documentos/2016_2021/ADLP/Texto_Consolidado/${n}-TXM.pdf` });
  }
  return urls;
}

// ---- flujo principal ------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};

async function scrapeTipo(tipo) {
  const cfg = TIPOS.find((t) => t.code === tipo);
  if (tipo === '0') {
    // barrido por número en bloques de 500 (las normas antiguas no tienen
    // fecha de publicación registrada, así que la búsqueda por fecha las omite)
    const PASO = 500;
    let vacios = 0;
    for (let ini = 1; ini <= 34000 && vacios < 4; ini += PASO) {
      const fin = ini + PASO - 1;
      const file = join(RAW, `t0_n${String(ini).padStart(5, '0')}.json`);
      if (existsSync(file)) {
        vacios = JSON.parse(readFileSync(file, 'utf8')).length === 0 ? vacios + 1 : 0;
        continue; // reanudable
      }
      const rows = await searchNumero(tipo, ini, fin);
      writeFileSync(file, JSON.stringify(rows, null, 1));
      console.log(`tipo 0 números ${ini}-${fin}: ${rows.length} normas`);
      vacios = rows.length === 0 ? vacios + 1 : 0;
      await sleep(400);
    }
  } else {
    // los demás tipos usan numeración tipo "001-94": una sola búsqueda paginada
    const file = join(RAW, `t${tipo}_all.json`);
    if (existsSync(file)) return;
    const rows = await searchAllByNumero(tipo);
    writeFileSync(file, JSON.stringify(rows, null, 1));
    console.log(`tipo ${tipo} (${cfg.label}): ${rows.length} normas`);
  }
}

// ---- fase de detalle: fechas y PDFs para normas sin fecha de publicación ---
async function fetchDetalle(url) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': 'Mozilla/5.0 (investigacion-legal-personal)' } });
  const html = (await res.text()).replace(/\n/g, ' ');
  const campo = (label) => {
    const m = html.match(new RegExp(label + String.raw`[^<]*</font></td><td[^>]*><font[^>]*>\s*([^<]*)<`));
    return m ? m[1].replace(/&nbsp;/g, ' ').trim() : '';
  };
  const pdfs = [...html.matchAll(/href="(Documentos\/[^"]+)"/g)].map(
    (m) => 'https://www.leyes.congreso.gob.pe/' + m[1].replace(/&amp;/g, '&'),
  );
  return {
    promulgacion: campo('Promulgaci&#243;n:'),
    publicacion: campo('Publicaci&#243;n:'),
    pdfs: [...new Set(pdfs)],
  };
}

async function resolverDetalles() {
  const cacheFile = join(ROOT, 'data', 'detalles.json');
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  const pendientes = [];
  for (const f of readdirSync(RAW).filter((f) => f.endsWith('.json'))) {
    for (const r of JSON.parse(readFileSync(join(RAW, f), 'utf8'))) {
      if (r.detalle && !cache[r.detalle] && (!r.fecha || !r.fecha.includes('/'))) pendientes.push(r.detalle);
    }
  }
  console.log(`fichas de detalle pendientes: ${pendientes.length}`);
  let hechos = 0;
  const CONC = 6;
  const cola = [...new Set(pendientes)];
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (cola.length) {
        const url = cola.pop();
        try {
          cache[url] = await fetchDetalle(url);
        } catch (e) {
          console.error('detalle falló:', url, e.message);
        }
        if (++hechos % 100 === 0) {
          writeFileSync(cacheFile, JSON.stringify(cache));
          console.log(`  detalles: ${hechos}/${pendientes.length}`);
        }
        await sleep(150);
      }
    }),
  );
  writeFileSync(cacheFile, JSON.stringify(cache));
  console.log(`detalles resueltos: ${hechos}`);
}

function build() {
  const detFile = join(ROOT, 'data', 'detalles.json');
  const detalles = existsSync(detFile) ? JSON.parse(readFileSync(detFile, 'utf8')) : {};
  const all = [];
  const seen = new Set();
  for (const f of readdirSync(RAW).filter((f) => f.endsWith('.json'))) {
    const tipoCode = f.match(/^t(\d+)_/)?.[1] ?? '';
    for (const r of JSON.parse(readFileSync(join(RAW, f), 'utf8'))) {
      const det = r.detalle ? detalles[r.detalle] : null;
      let fecha = r.fecha && r.fecha.includes('/') ? r.fecha : '';
      if (!fecha && det) fecha = det.publicacion?.includes('/') ? det.publicacion : det.promulgacion || '';
      const year = parseInt(fecha.split('/')[2], 10) || null;
      const key = `${r.norma}|${r.numero}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const adjuntos = pdfCandidates({ ...r, fecha });
      if (det) {
        for (const p of det.pdfs) {
          if (!adjuntos.some((a) => a.url === p)) {
            adjuntos.push({ tipo: /Textos\//.test(p) ? 'texto consolidado' : 'pdf', url: p });
          }
        }
      }
      all.push({
        tipo: r.norma,
        tipoCodigo: tipoCode,
        numero: r.numero,
        fecha,
        anio: year,
        titulo: r.titulo,
        observaciones: r.observaciones,
        vigente: !/derogad|sin efecto|sin vigencia/i.test(r.observaciones),
        adjuntos,
      });
    }
  }
  all.sort((a, b) => (a.anio - b.anio) || String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
  const out = join(ROOT, 'data', 'leyes.json');
  writeFileSync(out, JSON.stringify({ actualizado: new Date().toISOString(), total: all.length, fuente: 'https://www.leyes.congreso.gob.pe/', normas: all }));
  // copia para la extensión y la app
  writeFileSync(join(ROOT, 'app', 'leyes.json'), readFileSync(out));
  writeFileSync(join(ROOT, 'extension', 'leyes.json'), readFileSync(out));
  writeFileSync(join(ROOT, 'docs', 'leyes.json'), readFileSync(out));
  console.log(`consolidado: ${all.length} normas -> data/leyes.json`);
}

if (args.includes('--build')) {
  build();
} else if (args.includes('--detalles')) {
  await resolverDetalles();
  build();
} else if (argVal('--year')) {
  const tipo = argVal('--tipo') || '0';
  const rows = await searchYear(null, tipo, argVal('--year'));
  console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  console.log('total:', rows.length);
} else {
  for (const t of TIPOS) {
    console.log(`\n=== ${t.label} (${t.desde}-${HASTA}) ===`);
    await scrapeTipo(t.code);
  }
  build();
}
