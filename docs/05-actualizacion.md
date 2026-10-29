# Actualización de datos

## Qué hace `sync`

1. Lee `robots.txt` y se detiene si no permite el acceso.
2. Descarga `/laliga/fixture` y extrae los enlaces a fichas de partido.
3. **Incremental:** omite los partidos ya guardados como finalizados con planilla y con más de 4 días de antigüedad.
4. Procesa como máximo 60 fichas por ejecución, con 3 s de pausa entre pedidos.
5. Cada ficha: descarga → guarda el HTML crudo en `data/raw/AAAAMMDD/` → parsea → valida → guarda.
6. Si el partido ya existía y cambió algo, guarda una **revisión nueva** (la anterior queda en `game_revisions`).
7. Registra la ejecución en `data_sync_logs` y cada error en `sync_errors`.
8. Ante 403 o 429 **se detiene** (no reintenta ni intenta esquivar bloqueos).
9. Regenera `web/public/data/real.json`.

`retry-failed` vuelve a procesar sólo las fichas con errores pendientes.
Un error se marca como resuelto cuando ese partido se guarda bien.

## ¿Cómo automatizarlo?

| Opción | Costo | Complejidad | Comentario |
|---|---|---|---|
| **Manual** (correrlo después de cada fecha) | 0 | Ninguna | Recomendado para empezar: ves los errores en el momento. |
| Programador de tu computadora (cron / Programador de tareas de Windows) | 0 | Baja | La computadora tiene que estar prendida. |
| GitHub Actions programado | 0 en repos públicos; en privados hay 2.000 min/mes gratis (alcanza: cada corrida dura pocos minutos) | Media | El workflow hace commit de la base y del JSON. Ver `.github/workflows/sync.yml` (viene **desactivado**). Algunos sitios bloquean IPs de centros de datos: probalo a mano primero. |
| Supabase + función programada | Plan gratuito con límites | Alta | Sólo vale la pena si necesitás varios usuarios editando o una API. No hace falta para el MVP. |

Antes de automatizar: revisá los términos de uso del sitio y mantené la frecuencia baja (una vez por día alcanza).
