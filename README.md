# LNB Stats

Plataforma de análisis estadístico de la Liga Nacional de Básquet (Argentina),
pensada para producir contenido para el canal **Quinteto Inicial**.

> **Estado (29/10/2026):** con **datos reales** de la temporada 2026-27, tomados de
> `laliganacional.com.ar` y verificados: 44 partidos con planilla completa, 25 programados,
> 237 jugadores. La tabla oficial de posiciones coincide con la calculada. Ver `docs/01-diagnostico-fuente.md`.
> El modo demo (datos ficticios, siempre señalizados) sigue disponible para probar la interfaz.

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

### Opción A: sincronizar con la web oficial (recomendada)

```bash
cd pipeline
.venv/bin/python -m lnbstats.cli sync --season 2026-27
```

La primera vez descarga todas las planillas de la temporada (unos 3 minutos); después sólo los partidos nuevos
y los de los últimos 4 días (unos 15 pedidos). Para ver el resultado y los errores:

```bash
.venv/bin/python -m lnbstats.cli status
```

Todas las respuestas del sitio quedan guardadas en `data/raw/`. Si cambia la estructura del sitio, la
sincronización lo informa (`LayoutChanged`) en lugar de guardar datos dudosos; con `inspect` se puede revisar:

```bash
.venv/bin/python -m lnbstats.cli inspect data/raw/AAAAMMDD/archivo.html
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
| `sync --season 2026-27` | Sincronización incremental: fixture, planillas y tabla oficial |
| `retry-failed --season 2026-27` | Reintenta los partidos con errores |
| `import-csv partidos.csv [estadisticas.csv]` | Importa desde CSV |
| `inspect URL\|archivo` | Muestra la estructura de una página (para calibrar) |
| `parse-file archivo --url URL --season X --date AAAA-MM-DD [--save]` | Procesa la ficha de un partido guardada |
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
