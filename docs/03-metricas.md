# Definiciones y fórmulas

Implementación: `web/src/lib/stats.ts` (pruebas en `stats.test.ts`).

## Reglas generales

- `null` = sin dato (se muestra "s/d"). `0` = el valor fue cero. Nunca se rellena un faltante con 0.
- **PJ (partidos disputados):** filas sin marca de "no jugó" con minutos > 0, o sin minutos pero con algún dato.
- **Promedio por partido** de una estadística = total ÷ PJ *que tienen ese dato*. Si faltan datos se informa "n de N PJ con dato" y se marca con `*`.
- Los **porcentajes son acumulados**: convertidos totales ÷ intentados totales del período (no el promedio de los porcentajes de cada partido). Con 0 intentos el porcentaje es "s/d".

## Fórmulas

| Indicador | Fórmula |
|---|---|
| Minutos por partido | minutos totales ÷ PJ con minutos |
| Por 40 minutos | Σ estadística ÷ Σ segundos × 2400 (sólo partidos con ambos datos) |
| TC (tiros de campo) | T2 + T3 (convertidos e intentados) |
| TC% | (T2C + T3C) ÷ (T2I + T3I) |
| T2%, T3%, TL% | convertidos ÷ intentados |
| eFG% | (TCC + 0,5 × T3C) ÷ TCI |
| TS% | PTS ÷ (2 × (TCI + 0,44 × TLI)) |
| Valoración | la publicada por la fuente (no se recalcula) |
| Media móvil N | promedio de los últimos N partidos; null si falta un dato en la ventana o hay menos de N |
| Diferencia absoluta | B − A (en porcentajes: puntos porcentuales, "pp") |
| Diferencia relativa | (B − A) ÷ A × 100; sólo si A > 0; no se aplica a porcentajes ni a +/- |
| Récord | G, P, %V = G ÷ PJ, sólo partidos finalizados con resultado |
| Tabla de posiciones | orden por %V, luego G, luego diferencia de puntos (no son los desempates oficiales) |
| Racha | resultados consecutivos iguales al último (G3 = tres victorias seguidas) |
| Promedios defensivos | promedio de las estadísticas del rival en los partidos del equipo |
| Totales de equipo calculados | suma de jugadores; si a algún jugador le falta el dato, el total es null; el +/- de equipo no se calcula |
| Líderes | promedio por partido; mínimo de PJ = ⌈máx. PJ de un equipo ÷ 2⌉; el dato debe estar en todos los PJ del jugador |

## Validaciones al importar (`pipeline/lnbstats/validate.py`)

Se **rechaza** el partido si:
- temporada, fecha o equipos inválidos; local = visitante;
- partido finalizado sin resultado o empatado;
- algún valor negativo (salvo +/- y valoración) o no entero;
- convertidos > intentados; RO + RD ≠ REB; PTS ≠ 2×T2C + 3×T3C + TLC;
- jugador duplicado en el mismo equipo;
- suma de puntos de los jugadores ≠ resultado; total oficial de equipo ≠ resultado.

Se **advierte** (pero se guarda) si hay minutos de jugador > 70 o jugadores sin dato de puntos.
