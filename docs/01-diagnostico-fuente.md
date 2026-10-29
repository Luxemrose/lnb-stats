# Diagnóstico de la fuente de datos

Fuente: https://www.laliganacional.com.ar/laliga/ · **Verificado contra el sitio real el 29/10/2026.**

## Condiciones de acceso

`robots.txt` (29/10/2026):

- `User-agent: *` → `Allow: /` (acceso general permitido).
- `Content-Signal: search=yes, ai-train=no, use=reference`: **prohibido usar el contenido para entrenar IA**.
  LNB Stats no entrena modelos: guarda estadísticas para análisis.
- Bloquea explícitamente a crawlers de entrenamiento de IA conocidos (GPTBot, ClaudeBot, CCBot, etc.).
  LNB Stats se identifica con su propio agente (`LNBStats/0.1`), respeta `robots.txt` y espera 3 s entre pedidos.
- El sitio usa Cloudflare. Ante un 403/429 la sincronización se detiene y no reintenta.

## Cómo publica los datos el sitio

| Dato | Cómo se obtiene | Formato |
|---|---|---|
| Partidos (fixture y resultados) | `GET /laliga/fixture?handler=ProximosPartidos&fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD` (lo que usa la página del fixture por JavaScript) | Tabla HTML: equipos con `idClub`/`idEquipo`, resultado, fecha y hora, estadio, enlace a la ficha |
| Planilla del partido | `GET /laliga/partido/{token}/{local-vs-visitante}` | Dos tablas; cada fila de jugador trae un **JSON** en el atributo `onclick` (`EstadisticasComponente({...})`) con todas sus estadísticas; fila final "Totales" del equipo |
| Tabla de posiciones oficial | Fases en la portada (`select-fase`), grupos en `GET /api/clasificacion/{faseId}/grupos` (JSON), tabla en `GET /laliga?handler=Clasificacion&faseId=..&grupoId=..` | Tabla HTML: Pos, Equipo, PJ, PG, PP, PF, PC, PTOS, %VICT |
| Plantel | `/laliga/equipo/{idClub}/{idEquipo}/{slug}/roster` | Lista de nombres con enlace al jugador (sin posición) |
| Ficha de jugador | `/laliga/jugador/{idClub}/{idEquipo}/{idJugador}/{slug}` | Datos cargados aparte; sin posición |

Datos por jugador y partido en la planilla: minutos, puntos, dobles, triples y libres (convertidos/intentados),
rebotes ofensivos y defensivos, asistencias, recuperos, pérdidas, tapas a favor y recibidas, faltas cometidas
y recibidas, valoración, +/- y si fue titular. También hay jugada a jugada (no se usa todavía).

## Identificadores

| Entidad | Identificador estable | Notas |
|---|---|---|
| Jugador | `IdJugador` (p. ej. 219791) | Igual en planilla, plantel y ficha. |
| Equipo | `IdClub` (p. ej. 63 = Lanús) | `IdEquipo` cambia por temporada (inscripción). |
| Partido | **ninguno**: el token de la URL **cambia en cada visita** | LNB Stats usa temporada + fecha + local + visitante. |

## Particularidades detectadas (y cómo se tratan)

- **Partidos no jugados figuran 0-0** en el fixture → se guardan como programados, sin resultado.
- **No hay marca explícita de "finalizado"** → un partido con resultado de un día anterior se considera
  finalizado; los del día quedan "sin confirmar" y se revisan en la próxima actualización.
- **Jugadores sin minutos** ("00:00") figuran en la planilla con todo en 0 → se marcan como "no jugó" y no cuentan como partido disputado.
- **Posición del jugador: no disponible** en ninguna página del sitio.
- El +/- de la fila "Totales" es siempre 0 → no se usa.
- **Fase y número de fecha** no figuran en el fixture.

## Verificación de calidad (primera carga, 29/10/2026)

- 44 partidos jugados + 25 programados de la temporada 2026-27; 237 jugadores (todos con id oficial); 18 equipos.
- Los 44 partidos pasaron todas las validaciones (suma de puntos = resultado, puntos = 2×T2 + 3×T3 + TL, RO + RD = REB, etc.).
- Los totales oficiales de equipo coinciden con la suma de jugadores.
- **La tabla oficial coincide exactamente** (PJ, PG, PP, PF, PC de los 18 equipos) con la calculada a partir de los partidos almacenados.

## Histórico

El fixture acepta cualquier rango de fechas, así que en principio se pueden cargar temporadas anteriores con
`sync --season 2025-26`. **Todavía no se probó**: hay que verificar que las fichas viejas tengan el mismo formato.
