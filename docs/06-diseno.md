# Sistema de diseño (UI/UX)

## Identidad

- **Tema principal oscuro** (también claro y "según el sistema", en Configuración). El tema se aplica antes de pintar la página para evitar destellos.
- Fondo `#10141D` · paneles `#191F2B` · bordes `#2B3443` · acento naranja `#FF8A35` · azul eléctrico `#4389FF`.
- El naranja se usa sólo para: acción principal, sección activa, mejor valor de una tabla y dato destacado.
- Tipografía **Inter** (Google Fonts) con números tabulares (`.num`) en tablas, ejes y contadores.
- Íconos: **Lucide** (`lucide-react`, única dependencia nueva).
- Sin fotos ni escudos: la fuente no ofrece imágenes reutilizables. Se usan iniciales (jugadores) y monogramas (equipos).

Todos los colores son variables CSS en `web/src/index.css` (`:root[data-theme="dark"|"light"]`), expuestas a Tailwind (`bg-surface`, `text-ink-2`, `text-accent-text`, etc.).

## Colores de gráficos

Series validadas para daltonismo (protanopia, deuteranopia, tritanopia) y contraste mínimo 3:1 sobre cada superficie:

| Serie | Oscuro (#191F2B) | Claro (#FFFFFF) |
|---|---|---|
| 1 | `#4389FF` | `#2A6FDB` |
| 2 | `#E8691E` | `#D9631B` |
| 3 | `#1E9E77` | `#168A68` |
| 4 | `#B38A12` | `#B08A0C` |

Por eso el comparador admite como máximo 4 jugadores o equipos. Los gráficos usan un solo eje (nunca doble).

## Navegación

- **Escritorio:** barra lateral fija (contraíble a íconos) con Inicio, Jugadores, Equipos, Comparador, Partidos, Estadísticas, Temporadas; Herramientas (Quinteto Inicial); Sistema (Estado de datos, Metodología, Configuración).
- **Barra superior:** logo (en móvil), temporada activa, buscador global (Ctrl/⌘+K o "/"), última actualización, cambio de tema y configuración.
- **Móvil:** barra inferior (Inicio, Jugadores, Equipos, Partidos, Más) y hoja "Más" con el resto.
- Pestañas sincronizadas con la URL (`?tab=`), botón "Volver" en las fichas.

## Componentes (`web/src/components`)

| Componente | Uso |
|---|---|
| `ui.tsx` | PageHeader, Card, StatTile, PctBar, Notice, EmptyState, Origin (Oficial/Calculado), Badge, ResultPill, InfoTip, Avatar, TeamMark, Field, Segmented, Tabs, FilterBar, Skeleton, **DataTable** (encabezado fijo, orden, paginación, mejor valor resaltado, CSV) |
| `charts.tsx` | ChartCard (PNG con título/período/fuente + CSV), LinesChart, BarsChart |
| `compare.tsx` | CompareSlots, HeadToHead (cara a cara), ComparisonTable, CompareModeSwitch |
| `pickers.tsx` | PeriodPicker, SearchSelect, MultiPicker |
| `GameRow.tsx` | fila de partido estilo marcador |
| `Standings.tsx` | tabla de posiciones oficial con verificación |
| `GlobalSearch.tsx` | buscador de jugadores, equipos y partidos |

## Reglas de UX aplicadas

- Mejor valor resaltado sólo cuando la comparación es justa (no en totales con distinta cantidad de partidos).
- Siempre visible cuántos partidos (PJ) se usaron en cada cálculo y el mínimo para figurar en rankings.
- Tooltips (ícono ⓘ) para métricas menos conocidas: TS%, eFG%, valoración, +/-, por 40'.
- Estados de carga con skeletons; estados vacíos con explicación y acción; errores de carga con "Reintentar".
- Responsive verificado en 390 px (celular), 820 px (tablet) y 1440 px (escritorio), sin desplazamiento horizontal.

## Escudos oficiales como fondo

**Origen (verificado el 31/10/2026):** cada fila del fixture oficial muestra
`<img class="escudo" src="/escudos/{idClub}/{idEquipo}" alt="{EQUIPO}">`. El pipeline
(`pipeline/lnbstats/crests.py`, llamado desde `sync`) sólo acepta la imagen si:

1. su `idClub/idEquipo` coincide con el del enlace del equipo en la misma fila, y
2. su texto alternativo coincide con el nombre del equipo.

La imagen (JPEG con fondo liso) se descarga **una sola vez por equipo y temporada**; se quita sólo el
fondo liso que toca los bordes (el dibujo no se toca), se recorta y se guarda como WebP transparente en
`web/public/escudos/{idClub}-{idEquipo}.webp` (~8 KB). La relación queda en la tabla `team_seasons`
(temporada, equipo, idEquipo de la Liga, archivo, error) y se exporta como `teamSeasons`.
Si un escudo no se puede obtener, se registra en *Estado de datos* y la app no muestra nada en su lugar.

**Qué escudo corresponde a cada jugador** (`contextTeam` en `web/src/lib/derive.ts`, con prueba):
el equipo de su último partido dentro del período consultado; en planillas, el equipo de ese partido;
en el plantel de un equipo, ese equipo. Siempre por ids, nunca por nombre.

**Componente** `web/src/components/Crest.tsx`:

| Pieza | Uso |
|---|---|
| `useCrest(teamId)` | escudo del equipo en la temporada activa (si no hay, el más reciente) |
| `CrestCell` | dentro de celdas de `DataTable` (las celdas ya están posicionadas) |
| `CrestBox` | tarjetas y filas fuera de tablas |
| `CrestLayer` | la capa sola (encabezados de tabla, resultados del buscador) |
| `TeamMark` (ui.tsx) | escudo como logo (fichas de equipo, marcador); monograma si no hay |

**CSS** (`index.css`, `.crest-layer`): capa absoluta que ocupa la celda sin cambiar su tamaño, escudo
desde el borde izquierdo con `object-fit: contain`, alto ≈ 118 % de la celda (recortado), opacidad
`--crest-opacity` (0,30 oscuro · 0,20 claro) y máscara `linear-gradient` hacia la derecha. Como se
desvanece a transparente, se integra con cualquier fondo (normal, hover, alternancia, temas). El texto
va encima (`.crest-content`). Si una imagen falla, se recuerda y no se reintenta en la misma visita.
