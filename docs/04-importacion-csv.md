# Importar datos desde CSV

Útil mientras la extracción automática no esté disponible, o para cargar
temporadas anteriores desde planillas propias.

Plantillas: `pipeline/templates/partidos.csv` y `pipeline/templates/estadisticas.csv`
(la fila de ejemplo es ilustrativa: borrala antes de cargar datos).

## partidos.csv (obligatorio)

| Columna | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| game_key | sí | `2026-27-F03-BOC-INS` | Clave libre, única dentro del archivo; vincula con estadisticas.csv |
| season | sí | `2026-27` | |
| date | sí | `2026-10-12` | AAAA-MM-DD |
| home_team / away_team | sí | `BOCA` | Usá siempre la misma grafía |
| home_score / away_score | sí* | `85` | Vacío si no se jugó |
| status | sí | `final` | `final`, `scheduled`, `live`, `unknown` |
| time, phase, round, venue, source_url, source_ref | no | | |

## estadisticas.csv (opcional)

Una fila por jugador y partido. `game_key`, `side` (`home`/`away` o `local`/`visitante`)
y `player` son obligatorias; el resto de las columnas, opcionales:

`player_source_id, jersey, position, starter (si/no), min (mm:ss), pts, fg2m, fg2a, fg3m, fg3a, ftm, fta, oreb, dreb, reb, ast, stl, tov, blk, blka, pf, pfd, plus_minus, eff`

- También se aceptan encabezados en español (`T2` con celdas `5/9`, `TL`, `RO`, `RD`, `AS`, `BR`, `BP`, `TAP`, `FC`, `VAL`, …).
- **Celda vacía = sin dato. `0` = cero.** No completes con 0 lo que no sabés.
- Para "no jugó" poné `NJ` en `min`.
- Una fila con `player` = `TOTALES` se toma como totales oficiales del equipo.

## Comando

```bash
cd pipeline
.venv/bin/python -m lnbstats.cli import-csv ruta/partidos.csv ruta/estadisticas.csv
```

Reimportar el mismo archivo no duplica nada; si cambiaste un valor, se crea una nueva revisión del partido.
Los partidos que no pasan la validación se informan en pantalla y en *Estado de datos*.
