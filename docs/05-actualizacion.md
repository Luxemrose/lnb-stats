# Actualización de datos

## Qué hace `sync`

1. Lee `robots.txt` y se detiene si no permite el acceso.
2. Pide el fixture de la temporada en tramos de 31 días (desde el 1 de agosto hasta 14 días después de hoy).
3. Partidos sin resultado (el sitio los muestra 0-0): se guardan como programados, sin pedir la ficha.
4. Partidos con resultado: pide la ficha **sólo** si es nuevo, si le falta la planilla o si se jugó en los
   últimos 4 días (por si la Liga corrige la planilla). Máximo 80 fichas por ejecución, 3 s entre pedidos.
5. Valida y guarda. Si un partido ya guardado cambió, crea una revisión nueva y conserva la anterior
   (el token de la URL no cuenta como cambio: el sitio lo regenera en cada visita).
6. Actualiza la tabla de posiciones oficial.
7. Registra todo en `data_sync_logs` / `sync_errors` y regenera `web/public/data/real.json`.
8. Ante 403 o 429 se detiene. Si la página cambió de estructura, registra el error y no guarda datos dudosos.

Costo típico: primera carga ≈ 75 pedidos (≈ 4 min); actualización diaria ≈ 15 pedidos (< 1 min).

`retry-failed` repite la sincronización: los partidos con error no quedaron guardados, así que se vuelven a pedir.

## ¿Cómo automatizarlo?

| Opción | Costo | Complejidad | Comentario |
|---|---|---|---|
| **Manual** (correrlo después de cada fecha) | 0 | Ninguna | Recomendado para empezar: ves los errores en el momento. |
| Programador de tu computadora (cron / Programador de tareas de Windows) | 0 | Baja | La computadora tiene que estar prendida. |
| GitHub Actions programado | 0 en repos públicos; en privados hay 2.000 min/mes gratis (alcanza: cada corrida dura pocos minutos) | Media | El workflow hace commit de la base y del JSON. Ver `.github/workflows/sync.yml` (viene **desactivado**). Algunos sitios bloquean IPs de centros de datos: probalo a mano primero. |
| Supabase + función programada | Plan gratuito con límites | Alta | Sólo vale la pena si necesitás varios usuarios editando o una API. No hace falta para el MVP. |

Antes de automatizar: revisá los términos de uso del sitio y mantené la frecuencia baja (una vez por día alcanza).
