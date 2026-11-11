# Actualización de datos

## Qué hace `sync`

1. Lee `robots.txt` y se detiene si no permite el acceso.
2. Pide el fixture de la temporada en tramos de 31 días (desde el 1 de agosto hasta 14 días después de hoy).
3. Partidos sin resultado (el sitio los muestra 0-0): se guardan como programados, sin pedir la ficha.
4. Partidos con resultado: pide la ficha **sólo** si es nuevo, si le falta la planilla o si se jugó en los
   últimos 4 días (por si la Liga corrige la planilla). Máximo 80 fichas por ejecución, 3 s entre pedidos.
5. Valida y guarda. Si un partido ya guardado cambió, crea una revisión nueva y conserva la anterior
   (el token de la URL no cuenta como cambio: el sitio lo regenera en cada visita).
6. Quita los partidos **sin jugar** que ya no figuran en el fixture (la Liga los reprogramó: la fecha
   nueva entra como otro partido). Nunca toca partidos con resultado o estadísticas.
7. Actualiza la tabla de posiciones oficial.
8. Registra todo en `data_sync_logs` / `sync_errors` y regenera `web/public/data/real.json`.
9. Ante 403 o 429 se detiene. Si la página cambió de estructura, registra el error y no guarda datos dudosos.

Costo típico: primera carga ≈ 75 pedidos (≈ 4 min); actualización diaria ≈ 15 pedidos (< 1 min).

`retry-failed` repite la sincronización: los partidos con error no quedaron guardados, así que se vuelven a pedir.

## Actualización automática (activa)

`.github/workflows/sync.yml` corre **cuatro veces por día: 02:17, 08:17, 14:17 y 20:17 (hora argentina)** en GitHub Actions.
GitHub puede atrasar varias horas las tareas programadas (en noviembre de 2026 la corrida de las 07:17 se
ejecutaba entre las 13:30 y las 17:50); con cuatro horarios, los resultados de la noche entran temprano.

1. Corre las pruebas del pipeline (si fallan, no toca los datos).
2. Reconstruye la base desde `data/lnb.sql` y ejecuta `sync` para la temporada en curso.
3. Si cambió algo, guarda `data/lnb.sql` y `web/public/data/real.json` en el repositorio.
4. Si hubo cambios, vuelve a publicar la web (`deploy.yml`).

Si el sitio rechaza el acceso o cambia de estructura, la ejecución falla y GitHub te avisa por correo.
Se puede lanzar a mano desde la pestaña **Actions → Sincronizar datos LNB → Run workflow**.
Costo: 0 (repositorio público).

### Por qué la base se guarda como texto

`data/lnb.sqlite` no se sube a git: se guarda un volcado SQL (`data/lnb.sql`), con un orden estable.
Así cada actualización agrega sólo las líneas que cambiaron, en vez de una copia completa del archivo binario.
Si `lnb.sqlite` no existe, el pipeline lo reconstruye solo a partir de `lnb.sql`.

## Histórico: sólo desde esta temporada

El sitio oficial sólo expone la competencia en curso (el fixture devuelve "No se encontraron partidos"
para fechas de 2025; estadísticas, equipos y descargas tampoco tienen temporadas anteriores).
**Cuando empiece la temporada 2027-28, los partidos de 2026-27 dejarán de ser accesibles por el fixture**:
la base de LNB Stats es la que conserva la historia, y por eso importa la actualización diaria.
Para temporadas pasadas, la vía es la importación CSV (`docs/04-importacion-csv.md`).
