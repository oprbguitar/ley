# ⚖ Leyes del Congreso de la República del Perú

Archivo consultable de la legislación peruana, extraído del
[Archivo Digital de la Legislación del Perú](https://www.leyes.congreso.gob.pe/)
del Congreso de la República.

Incluye **leyes, resoluciones legislativas, decretos ley, decretos legislativos,
decretos de urgencia, decretos supremos, leyes constitucionales, leyes regionales
y decretos supremos extraordinarios**, ordenados por **año ascendente** y con
filtros por:

- tipo de norma
- rango de años
- número de norma
- texto en el título / contenido
- vigencia (con o sin observaciones de derogación)

Cada norma enlaza a sus **archivos adjuntos**: PDF oficial, texto consolidado,
expediente virtual y ficha de detalle del Congreso.

## Estructura

```
scraper/scraper.mjs   Scraper Node.js (sin dependencias) del sitio del Congreso
data/leyes.json       Base de datos consolidada (generada por el scraper)
data/raw/             Respuestas crudas por tipo/año (permiten reanudar)
app/                  App local (HTML + JS puro)
extension/            Extensión de Chrome (Manifest V3)
```

## App local

```bash
cd app
node server.mjs        # → http://localhost:8321
```

(El servidor solo sirve archivos estáticos; se necesita porque `file://`
bloquea la carga de `leyes.json` por CORS.)

## Extensión de Chrome

1. Abre `chrome://extensions` y activa **Modo de desarrollador**.
2. **Cargar extensión sin empaquetar** → elige la carpeta `extension/`.
3. Pulsa el icono de la extensión: se abre el archivo de leyes en una pestaña.

## Actualizar la base de datos

```bash
node scraper/scraper.mjs           # scrape completo (reanudable: guarda por año)
node scraper/scraper.mjs --build   # solo reconsolida data/raw → leyes.json
node scraper/scraper.mjs --year 2024 --tipo 0   # prueba de un año/tipo
```

El scraper respeta al servidor (pausas entre peticiones y reintentos con
retroceso exponencial). Los datos pertenecen al Congreso de la República del
Perú; este proyecto solo los reordena para consulta personal.

## Notas

- El campo `vigente` es heurístico: se marca `false` cuando las observaciones
  mencionan derogación o pérdida de vigencia.
- Las leyes sin numeración (siglo XIX) del sitio (`LeyNoNumeP.aspx`) no están
  incluidas todavía.
- Los enlaces a PDF usan los patrones de carpetas del propio sitio; para normas
  recientes el enlace seguro es el **expediente virtual** o la **ficha**.
