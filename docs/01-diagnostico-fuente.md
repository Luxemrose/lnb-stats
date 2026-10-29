# Diagnóstico de la fuente de datos

Fecha: 29/10/2026 · Fuente: https://www.laliganacional.com.ar/laliga/

## Cómo se investigó (y qué limitó la investigación)

El entorno donde se desarrolló esta primera versión **no tenía acceso de red a
`www.laliganacional.com.ar`** (la política de red del sandbox devolvió 403 para
ese dominio, también para la lectura web directa). Por eso **no se pudo
descargar ni inspeccionar el HTML real** ni probar ningún endpoint.

Lo que sigue proviene de resultados de un buscador web restringido al dominio
oficial (títulos, URLs y fragmentos indexados). Todo lo marcado como
"sin verificar" debe confirmarse con `lnbstats.cli inspect` desde una
computadora con acceso al sitio.

## Lo que se pudo constatar (vía buscador)

| Recurso | Patrón de URL | Qué contiene (según el índice) |
|---|---|---|
| Ficha de partido | `/laliga/partido/{token}/{local-vs-visitante}` | Tabla por jugador: MIN, PTS, REB, AST, faltas, valoración, % de tiro; totales de equipo (tiros, rebotes, recuperos, pérdidas). |
| Plantel | `/laliga/equipo/{id}/{id}/{slug}/roster` | Lista de jugadores; en algunos equipos, posición, altura y fecha de nacimiento. |
| Fixture | `/laliga/fixture` | Calendario de la temporada. |
| Portada | `/laliga/` | Últimos resultados y líderes ("Destacados de la temporada") con promedio por partido. |
| Widget en vivo | `/laliga/partido/jugadores-pista/{token}?key=` | Fragmento dinámico de "jugadores en pista" (parcial, probablemente AJAX). |
| Notas | `/laliga/noticia/{id}/{slug}` | Notas con líderes, premios, etc. (no estructurado). |

Observaciones:

- Los datos de las fichas aparecen en el índice del buscador, lo que sugiere
  que **están en el HTML** (no sólo cargados por JavaScript). Sin verificar.
- El **token del partido cambió de formato** (antes `7HOd8ZYdbHXIjwhorMzAnQ==`,
  ahora `v2…==`): no sirve como identificador estable. LNB Stats identifica
  cada partido por *temporada + fecha + local + visitante* y guarda el token
  sólo como referencia.
- Los equipos tienen **identificadores numéricos** en la URL del plantel
  (p. ej. `/laliga/equipo/80/89148/platense/roster`). El primer número parece
  el id del club y el segundo, el del equipo en la temporada. Sin verificar.
- **No se encontraron fichas individuales de jugador** con URL propia en el
  índice. Si la ficha de partido no enlaza a un id de jugador, la
  identificación será por nombre (con riesgo de homónimos o grafías distintas).
- La temporada 2026-27 empezó a fines de septiembre de 2026; fase regular de
  34 partidos por equipo (según `/laliga/formato`).
- No se encontró ninguna API pública documentada. **No se asume que exista.**

## Diagnóstico

**Datos que pueden obtenerse (probablemente) y verificarse:**
resultados, planilla individual por partido (minutos, puntos, tiros de 2/3/libres,
rebotes, asistencias, robos, pérdidas, tapas, faltas, +/-, valoración), totales
por equipo, planteles. La tabla de posiciones y los promedios de temporada se
pueden **calcular** a partir de los partidos; la tabla oficial (con sus
desempates) no se pudo ubicar como página estructurada.

**Sólo agregados (sin verificar):** líderes de la portada (promedios ya calculados
por la fuente). LNB Stats no los usa: recalcula todo desde los partidos.

**Histórico:** las fichas de temporadas anteriores aparecen indexadas, así que es
probable poder recuperarlas, pero el descubrimiento de URLs viejas depende de
que el fixture permita elegir temporada. Sin verificar.

**Método recomendado:** extracción del HTML de las fichas de partido (Python +
BeautifulSoup), con lectura de tablas **por encabezados** (no por clases CSS),
pausa de 3 s entre pedidos, respeto de `robots.txt`, caché del HTML crudo y
detención inmediata ante 403/429. Alternativa siempre disponible: **importación CSV**.

**Frecuencia:** una vez por día (o el día después de cada fecha). Cada ejecución
procesa como máximo 60 fichas nuevas o recientes; los partidos finalizados se
revisan durante 4 días por si la Liga corrige la planilla y después no se vuelven a pedir.

**Limitaciones detectadas:**
1. Sin acceso al sitio desde el entorno de desarrollo: el parser **no está calibrado** con HTML real.
2. Tokens de partido no estables.
3. Posible ausencia de id oficial de jugador.
4. No se pudieron revisar `robots.txt` ni los términos de uso: hay que leerlos antes de automatizar.
5. Si el fixture se arma con JavaScript, el descubrimiento automático de partidos no funcionará con HTML simple (el comando lo detecta y lo informa).

## Qué hacer para habilitar los datos reales

1. Permitir el dominio `www.laliganacional.com.ar` en la configuración de red del
   entorno (o ejecutar el pipeline en tu computadora).
2. Revisar `https://www.laliganacional.com.ar/robots.txt` y los términos del sitio.
3. Ejecutar `inspect` sobre el fixture y sobre una ficha de partido y comparar
   la salida con lo esperado (ver README). Ajustar `lnbstats/headers.py` si algún
   encabezado no se reconoce.
4. Guardar una ficha real en `pipeline/tests/fixtures/` y agregar una prueba con ella.
