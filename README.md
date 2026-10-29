# LNB Stats

Plataforma de análisis estadístico de la Liga Nacional de Básquet (Argentina),
pensada para producir contenido para el canal **Quinteto Inicial**.

> **Estado (29/10/2026):** la aplicación y el pipeline funcionan y tienen pruebas.
> **Todavía no hay datos reales cargados**: el entorno donde se construyó no tenía
> acceso a `laliganacional.com.ar`, así que el lector de la web oficial está
> escrito pero **sin calibrar con el HTML real**. Ver `docs/01-diagnostico-fuente.md`.
> Mientras tanto podés ver la interfaz en **modo demo** (datos ficticios, siempre señalizados).

## Estructura

```
pipeline/   Python: obtención, validación, almacenamiento y exportación de datos
  lnbstats/   código (cli.py es el punto de entrada)
  tests/      pruebas (pytest)
  templates/  plantillas CSV
data/       lnb.sqlite (base real) · demo.sqlite (ficticia, se regenera) · raw/ (HTML descargado)
web/        React + TypeScript + Vite + Tailwind + Recharts
  public/data/real.json  ← lo que muestra la web (generado por el pipeline)
  public/data/demo.json  ← datos ficticios
docs/       diagnóstico, arquitectura, métricas, CSV, actualización
db/         esquema PostgreSQL/Supabase (opcional, para el futuro)
```

## Puesta en marcha

Requisitos: Python 3.11+ y Node.js 20+.

```bash
cd pipeline
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
```

```bash
cd web
npm install
npm test
npm run dev
```

Abrí la URL que muestra Vite (normalmente http://localhost:5173). Con `?modo=demo`
al final de la URL, o con el selector "Datos" del encabezado, ves los datos ficticios.

En Windows reemplazá `.venv/bin/python` por `.venv\Scripts\python`.

## Cargar datos reales

### Opción A: sincronizar con la web oficial

Desde una computadora con acceso al sitio, primero **verificá** que el lector entienda las páginas:

```bash
cd pipeline
.venv/bin/python -m lnbstats.cli inspect https://www.laliganacional.com.ar/laliga/fixture
```

Tiene que listar muchos enlaces con el patrón `/laliga/partido/{token}/...`. Después, sobre una ficha de partido:

```bash
.venv/bin/python -m lnbstats.cli inspect "https://www.laliganacional.com.ar/laliga/partido/TOKEN/local-vs-visitante"
```

En la salida, las tablas de jugadores deben figurar con `box_score=True` y un `mapeo` sin demasiados `None`.
Si está bien, sincronizá:

```bash
.venv/bin/python -m lnbstats.cli sync --season 2026-27
```

```bash
.venv/bin/python -m lnbstats.cli status
```

Si algo falla, el HTML descargado queda en `data/raw/` y podés reprocesarlo sin volver a pedirlo:

```bash
.venv/bin/python -m lnbstats.cli parse-file data/raw/AAAAMMDD/archivo.html --url "URL-ORIGINAL" --season 2026-27
```

### Opción B: importar CSV

Ver `docs/04-importacion-csv.md`.

```bash
.venv/bin/python -m lnbstats.cli import-csv partidos.csv estadisticas.csv
```

Después de cualquiera de las dos, la web muestra los datos nuevos al recargar.

## Comandos del pipeline

| Comando | Qué hace |
|---|---|
| `init-db` | Crea la base real vacía |
| `sync --season 2026-27` | Sincronización incremental con la web oficial |
| `retry-failed --season 2026-27` | Reintenta los partidos con errores |
| `import-csv partidos.csv [estadisticas.csv]` | Importa desde CSV |
| `inspect URL\|archivo` | Muestra la estructura de una página (para calibrar) |
| `parse-file archivo --url URL --season X [--save]` | Procesa un HTML guardado |
| `export` | Regenera `web/public/data/real.json` |
| `demo` | Regenera los datos ficticios |
| `status` | Últimas sincronizaciones y errores |

## Publicar la web

`npm run build` genera `web/dist/`, un sitio estático que se puede subir a
GitHub Pages, Netlify o Cloudflare Pages sin servidor ni claves.

## Reglas de calidad

Resumen (detalle en `docs/03-metricas.md` y en la página *Metodología*):
sin datos inventados; nulo ≠ cero; validación antes de guardar; sin duplicados;
historial de cambios; oficial vs. calculado siempre señalado; demo aislado.
