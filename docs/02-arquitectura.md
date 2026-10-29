# Arquitectura

```
 laliganacional.com.ar ──┐
 CSV manual ─────────────┼─► 1. Obtención ─► 2. Limpieza y validación ─► 3. Almacenamiento ─► export JSON ─► 4/5. Web (cálculos + visualización)
 Generador DEMO ─────────┘   (sources/)       (headers.py, validate.py)   (SQLite, store.py)   (export.py)     (React: lib/stats.ts + páginas)
```

| Capa | Dónde | Responsabilidad |
|---|---|---|
| 1. Obtención | `pipeline/lnbstats/sources/` | Descargar HTML (con cortesía) o leer CSV. Todo se convierte a `GameRecord`. |
| 2. Limpieza y validación | `headers.py`, `validate.py` | Traducir encabezados, distinguir nulo de cero, rechazar datos imposibles. |
| 3. Almacenamiento | `store.py`, `schema.sql` → `data/lnb.sqlite` | Altas idempotentes, revisiones, logs y errores. |
| 4. Cálculos | `web/src/lib/stats.ts`, `derive.ts` | Promedios, porcentajes, por 40', medias móviles, récords. Con pruebas. |
| 5. Visualización | `web/src/pages`, `components` | React + Recharts. |

## Decisiones (y por qué)

- **SQLite en lugar de Supabase (por ahora).** Es un archivo, no requiere cuenta,
  claves ni servidor, y alcanza de sobra (una temporada son ~300 partidos y ~8.000
  filas de jugador-partido). El esquema es SQL estándar: `db/schema.postgres.sql`
  es la versión equivalente para Supabase si más adelante querés una base en la nube.
- **La web lee un JSON estático** (`web/public/data/real.json`). No hay backend ni
  claves en el frontend: se puede publicar gratis (GitHub Pages, Netlify, Cloudflare Pages).
- **Python para extraer**, porque BeautifulSoup es la herramienta más simple y
  robusta para HTML; **TypeScript para calcular**, porque los filtros por fecha y
  ventana de partidos son interactivos y conviene calcularlos en el navegador.
- **Sin shadcn/ui.** Agrega muchas dependencias y configuración; con Tailwind y
  unos pocos componentes propios (`components/ui.tsx`) alcanza y es más fácil de entender.
- **Tailwind v4 + Vite + React 19 + TypeScript + Recharts 3.**
- **Datos demo aislados**: `data/demo.sqlite` → `web/public/data/demo.json`,
  equipos "Demo …", franja de aviso permanente en la interfaz.

## Identificadores

| Entidad | Id interno | Id de la fuente | Clave de deduplicación |
|---|---|---|---|
| Temporada | `seasons.id` | — | `code` ("2026-27") |
| Equipo | `teams.id` | `source_id` (número de la URL del plantel) | `source_id`, si no alias del nombre normalizado |
| Jugador | `players.id` | `source_id` si la fuente lo da | `source_id`, si no nombre normalizado (`identity='name'`) |
| Partido | `games.id` | `source_ref` (token, inestable) | `natural_key` = temporada\|fecha\|local\|visitante |

Un jugador que cambia de equipo sigue siendo la misma fila en `players`; la
relación con cada equipo y temporada está en `team_rosters`.

## Datos originales vs. calculados

- Tablas `player_game_stats` y `team_game_stats`: **sólo valores de la fuente**
  (conteos). No se guardan porcentajes ni promedios.
- Todo indicador derivado se calcula en `web/src/lib/stats.ts` y está documentado
  en `docs/03-metricas.md` y en la página *Metodología*.
- Si la fuente no publica totales de equipo, la app los calcula sumando jugadores
  y lo muestra con la etiqueta **Calculado**.
