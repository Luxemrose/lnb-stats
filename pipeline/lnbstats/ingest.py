"""Paso común a todas las fuentes: validar -> guardar -> registrar en el log."""
from __future__ import annotations

from typing import Iterable

from .models import GameRecord
from .store import save_game, start_sync, finish_sync, log_error, resolve_errors
from .validate import validate_game


def ingest_records(conn, records: Iterable[GameRecord], source: str, scope: str, verbose: bool = True) -> dict:
    sync_id = start_sync(conn, source, scope)
    counts = {"new": 0, "updated": 0, "unchanged": 0, "rejected": 0}
    for g in records:
        ref = g.source_ref or g.natural_key()
        res = validate_game(g)
        for w in res.warnings:
            if verbose:
                print(f"  aviso [{ref}]: {w}")
        if not res.ok:
            counts["rejected"] += 1
            log_error(conn, sync_id, "validate", ref, " | ".join(res.errors))
            if verbose:
                print(f"  RECHAZADO [{ref}]: " + " | ".join(res.errors))
            continue
        try:
            with conn:
                outcome = save_game(conn, g, sync_id)
                resolve_errors(conn, ref)
            counts[outcome] += 1
        except Exception as e:  # noqa: BLE001 — queremos registrar cualquier fallo de guardado
            counts["rejected"] += 1
            log_error(conn, sync_id, "store", ref, f"{type(e).__name__}: {e}")
    status = finish_sync(conn, sync_id, counts)
    if verbose:
        print(f"Resultado ({status}): {counts}")
    return {"sync_id": sync_id, "status": status, **counts}
