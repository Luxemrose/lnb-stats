"""Sincronización incremental con la web oficial."""
from __future__ import annotations

from pathlib import Path

from .sources.laliganacional import (FIXTURE_URL, PoliteFetcher, SourceBlocked, discover_game_urls, parse_game_page)
from .store import finish_sync, game_needs_refresh, log_error, resolve_errors, save_game, start_sync
from .validate import validate_game


def _process_url(conn, fetcher, sync_id, url, season, counts):
    try:
        html = fetcher.get(url)
    except SourceBlocked:
        raise
    except Exception as e:  # noqa: BLE001
        log_error(conn, sync_id, "fetch", url, f"{type(e).__name__}: {e}")
        counts["rejected"] += 1
        return
    try:
        rec = parse_game_page(html, url, season)
    except Exception as e:  # noqa: BLE001
        log_error(conn, sync_id, "parse", url, f"{type(e).__name__}: {e}")
        counts["rejected"] += 1
        return
    res = validate_game(rec)
    if not res.ok:
        log_error(conn, sync_id, "validate", url, " | ".join(res.errors))
        counts["rejected"] += 1
        return
    with conn:
        counts[save_game(conn, rec, sync_id)] += 1
        resolve_errors(conn, url)
    print(f"  ok {rec.date} {rec.home_team.name} {rec.home_score}-{rec.away_score} {rec.away_team.name}"
          f" [{rec.detail_level}] {'; '.join(rec.notes)}")


def run_sync(conn, raw_dir: Path, season: str, max_games: int = 60, recheck_days: int = 4,
             urls: list[str] | None = None) -> dict:
    """Descubre partidos en el fixture y procesa solo los nuevos o recientes.

    `max_games` limita los pedidos por ejecución para no sobrecargar el sitio.
    """
    sync_id = start_sync(conn, "laliganacional", f"temporada {season}")
    counts = {"new": 0, "updated": 0, "unchanged": 0, "rejected": 0, "skipped": 0}
    fetcher = PoliteFetcher(raw_dir)
    try:
        if urls is None:
            try:
                discovered = discover_game_urls(fetcher.get(FIXTURE_URL))
            except SourceBlocked:
                raise
            except Exception as e:  # noqa: BLE001
                log_error(conn, sync_id, "fetch", FIXTURE_URL, f"{type(e).__name__}: {e}")
                finish_sync(conn, sync_id, counts, "no se pudo leer el fixture", failed=True)
                return {"sync_id": sync_id, "status": "failed", **counts}
            if not discovered:
                log_error(conn, sync_id, "parse", FIXTURE_URL,
                          "el fixture no contiene enlaces /laliga/partido/...; puede cargarse con JavaScript")
                finish_sync(conn, sync_id, counts, "sin partidos descubiertos", failed=True)
                return {"sync_id": sync_id, "status": "failed", **counts}
            urls = []
            for token, url in discovered:
                if game_needs_refresh(conn, token, recheck_days):
                    urls.append(url)
                else:
                    counts["skipped"] += 1
        print(f"Partidos a procesar: {len(urls[:max_games])} (omitidos por estar al día: {counts['skipped']})")
        for url in urls[:max_games]:
            _process_url(conn, fetcher, sync_id, url, season, counts)
    except SourceBlocked as e:
        log_error(conn, sync_id, "fetch", "sitio", str(e))
        status = finish_sync(conn, sync_id, counts, f"detenido: {e}", failed=True)
        print(f"Sincronización detenida: {e}")
        return {"sync_id": sync_id, "status": status, **counts}
    msg = f"omitidos al día: {counts['skipped']}"
    status = finish_sync(conn, sync_id, counts, msg)
    print(f"Resultado ({status}): {counts}")
    return {"sync_id": sync_id, "status": status, **counts}


def retry_failed(conn, raw_dir: Path, season: str) -> dict:
    rows = conn.execute("SELECT DISTINCT ref FROM sync_errors WHERE resolved_at IS NULL AND ref LIKE 'http%'"
                        " AND ref LIKE '%/partido/%'").fetchall()
    urls = [r["ref"] for r in rows]
    print(f"Reintentando {len(urls)} partidos con errores pendientes")
    return run_sync(conn, raw_dir, season, max_games=len(urls) or 1, urls=urls)
