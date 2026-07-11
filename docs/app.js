/* Archivo de Leyes del Perú — visor local / extensión Chrome.
 * Carga leyes.json (generado por scraper/scraper.mjs), ordena por año
 * ascendente y permite filtrar por tipo, año, número, vigencia y texto. */
'use strict';

const POR_PAGINA = 200;
let NORMAS = [];
let filtradas = [];
let pagina = 1;

const $ = (id) => document.getElementById(id);

async function cargar() {
  const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('leyes.json')
    : 'leyes.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    NORMAS = data.normas;
    const act = $('actualizado');
    if (act) act.textContent = new Date(data.actualizado).toLocaleDateString('es-PE');
    const tot = $('total');
    if (tot) tot.textContent = data.total.toLocaleString('es-PE');
    window.META = data;
    poblarFiltros();
    aplicar();
  } catch (e) {
    $('aviso').innerHTML =
      'No se pudo cargar <code>leyes.json</code> (' + e.message + ').<br>' +
      'Si abriste este archivo con doble clic, ejecuta primero: <code>node server.mjs</code> ' +
      'dentro de la carpeta <b>app/</b> y entra a <a href="http://localhost:8321">http://localhost:8321</a>.<br>' +
      'Si aún no existe leyes.json, corre el scraper: <code>node scraper/scraper.mjs</code>.';
  }
}

function poblarFiltros() {
  const tipos = [...new Set(NORMAS.map((n) => n.tipo))].sort();
  $('f-tipo').innerHTML =
    '<option value="">Todos</option>' +
    tipos.map((t) => `<option>${t}</option>`).join('');
  const anios = [...new Set(NORMAS.map((n) => n.anio).filter(Boolean))].sort((a, b) => a - b);
  // el rango llega siempre hasta el año en curso, aunque aún no haya normas publicadas
  const actual = new Date().getFullYear();
  for (let a = anios[anios.length - 1] + 1; a <= actual; a++) anios.push(a);
  anios.reverse(); // 2026 hacia abajo
  const opts = anios.map((a) => `<option>${a}</option>`).join('');
  $('f-desde').innerHTML = '<option value="">' + anios[anios.length - 1] + '</option>' + opts;
  $('f-hasta').innerHTML = '<option value="">' + anios[0] + '</option>' + opts;
  const hoy = $('fecha-hoy');
  if (hoy) hoy.textContent = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function aplicar() {
  const tipo = $('f-tipo').value;
  const desde = +$('f-desde').value || 0;
  const hasta = +$('f-hasta').value || 9999;
  const num = normalizar($('f-numero').value.trim());
  const txt = normalizar($('f-texto').value.trim());
  const vig = $('f-vigencia').value;

  filtradas = NORMAS.filter((n) => {
    if (tipo && n.tipo !== tipo) return false;
    const filtraAnio = $('f-desde').value || $('f-hasta').value;
    if (n.anio ? (n.anio < desde || n.anio > hasta) : filtraAnio) return false;
    if (num && !normalizar(String(n.numero)).includes(num)) return false;
    if (vig === '1' && !n.vigente) return false;
    if (vig === '0' && n.vigente) return false;
    if (txt) {
      const pajar = normalizar(n.titulo + ' ' + n.observaciones + ' ' + n.numero);
      if (!txt.split(/\s+/).every((p) => pajar.includes(p))) return false;
    }
    return true;
  });
  // orden por año ascendente y, dentro del año, por fecha y número
  filtradas.sort((a, b) => (a.anio - b.anio) || cmpFecha(a.fecha, b.fecha) ||
    String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
  pagina = 1;
  render();
}

function cmpFecha(a, b) {
  const pa = (a || '').split('/').reverse().join('');
  const pb = (b || '').split('/').reverse().join('');
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}

function esc(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  const totalPag = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  pagina = Math.min(pagina, totalPag);
  const trozo = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  $('resumen').textContent =
    filtradas.length.toLocaleString('es-PE') + ' normas encontradas — página ' + pagina + ' de ' + totalPag +
    ' (orden: año ascendente)';

  let html = '';
  let anioActual = null;
  for (const n of trozo) {
    if (n.anio !== anioActual) {
      anioActual = n.anio;
      html += `<div class="anio-sep">${anioActual || 'Sin fecha'}</div>`;
    }
    const adj = (n.adjuntos || [])
      .map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(etiqueta(a.tipo))}</a>`)
      .join('');
    html += `<div class="norma">
      <div class="meta">
        <span class="tipo">${esc(n.tipo)} N.º ${esc(String(n.numero))}</span>
        <span class="fecha-pub">📅 ${fechaLegible(n.fecha, n)}</span>
        ${n.vigente ? '' : '<span class="no-vigente">⚠ con observaciones de vigencia</span>'}
      </div>
      <h3>${esc(n.titulo)}</h3>
      ${n.observaciones ? `<div class="obs">${esc(n.observaciones)}</div>` : ''}
      <div class="adjuntos">${adj}</div>
    </div>`;
  }
  $('lista').innerHTML = html || '<p id="aviso">Sin resultados con esos filtros.</p>';
  $('pag-info').textContent = pagina + ' / ' + totalPag;
  $('pag-ant').disabled = pagina <= 1;
  $('pag-sig').disabled = pagina >= totalPag;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLegible(f, n) {
  const m = (f || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) {
    if (n && n.anioEstimado) return `Publicación: c. ${n.anio} (año estimado por numeración; la fuente no registra la fecha)`;
    return 'Publicación: fecha no registrada en la fuente';
  }
  return `Publicada el ${+m[1]} de ${MESES[+m[2] - 1] || m[2]} de ${m[3]}`;
}

function etiqueta(t) {
  return { pdf: '📄 PDF de la ley', 'texto consolidado': '📚 Texto consolidado', expediente: '🗂 Expediente virtual', detalle: '🔎 Ficha / adjuntos' }[t] || t;
}

document.addEventListener('DOMContentLoaded', () => {
  cargar();
  $('btn-buscar').addEventListener('click', aplicar);
  $('btn-limpiar').addEventListener('click', () => {
    for (const id of ['f-tipo', 'f-desde', 'f-hasta', 'f-numero', 'f-texto', 'f-vigencia']) $(id).value = '';
    aplicar();
  });
  for (const id of ['f-tipo', 'f-desde', 'f-hasta', 'f-vigencia']) $(id).addEventListener('change', aplicar);
  for (const id of ['f-numero', 'f-texto']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicar(); });
  $('pag-ant').addEventListener('click', () => { pagina--; render(); scrollTo(0, 0); });
  $('pag-sig').addEventListener('click', () => { pagina++; render(); scrollTo(0, 0); });
});
/* --- extras de la GitHub Page: estadísticas y gráfico por año --- */
(function () {
  const origPoblar = poblarFiltros;
  poblarFiltros = function () {
    origPoblar();
    const anios = NORMAS.map((n) => n.anio).filter(Boolean);
    document.getElementById('st-total').textContent = NORMAS.length.toLocaleString('es-PE');
    document.getElementById('st-rango').textContent = Math.min(...anios) + '–' + Math.max(...anios);
    document.getElementById('st-tipos').textContent = new Set(NORMAS.map((n) => n.tipo)).size;
    document.getElementById('st-act').textContent = (window.META && new Date(window.META.actualizado).toLocaleDateString('es-PE')) || new Date().toLocaleDateString('es-PE');
    dibujarGrafico();
  };

  let barras = [];
  function dibujarGrafico() {
    const cv = document.getElementById('grafico');
    if (!cv) return;
    const porAnio = {};
    for (const n of NORMAS) if (n.anio) porAnio[n.anio] = (porAnio[n.anio] || 0) + 1;
    const anios = Object.keys(porAnio).map(Number).sort((a, b) => a - b);
    if (!anios.length) return;
    const [min, max] = [anios[0], anios[anios.length - 1]];
    const serie = [];
    for (let a = min; a <= max; a++) serie.push([a, porAnio[a] || 0]);
    const W = (cv.width = cv.clientWidth * devicePixelRatio);
    const H = (cv.height = 170 * devicePixelRatio);
    const ctx = cv.getContext('2d');
    const pad = 30 * devicePixelRatio;
    const bw = (W - pad * 2) / serie.length;
    const maxV = Math.max(...serie.map(([, v]) => v));
    ctx.clearRect(0, 0, W, H);
    barras = [];
    ctx.fillStyle = '#6f675c';
    ctx.font = 10 * devicePixelRatio + 'px Georgia';
    serie.forEach(([a, v], i) => {
      const h = v ? Math.max(2, (v / maxV) * (H - pad * 1.6)) : 0;
      const x = pad + i * bw;
      ctx.fillStyle = a % 10 === 0 ? '#b98a2f' : '#9d2323';
      ctx.fillRect(x, H - pad - h, Math.max(1, bw - 1), h);
      barras.push({ x, w: bw, anio: a, v });
      if (a % 10 === 0) {
        ctx.fillStyle = '#6f675c';
        ctx.fillText(a, x - 8 * devicePixelRatio, H - 10 * devicePixelRatio);
      }
    });
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * devicePixelRatio;
      const b = barras.find((b) => px >= b.x && px < b.x + b.w);
      if (!b) return;
      document.getElementById('f-desde').value = b.anio;
      document.getElementById('f-hasta').value = b.anio;
      aplicar();
      document.getElementById('filtros').scrollIntoView({ behavior: 'smooth' });
    };
    cv.onmousemove = (e) => {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * devicePixelRatio;
      const b = barras.find((b) => px >= b.x && px < b.x + b.w);
      cv.title = b ? b.anio + ': ' + b.v.toLocaleString('es-PE') + ' normas' : '';
    };
  }
  addEventListener('resize', dibujarGrafico);
})();
