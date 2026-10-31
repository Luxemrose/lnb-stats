"""Sincronización incremental con la web oficial.

1. Fixture de la temporada (en tramos de 31 días) -> lista de partidos con equipos, fecha y resultado.
2. Partidos sin resultado -> se guardan como programados (sin pedir la ficha).
3. Partidos con resultado -> se pide la ficha sólo si es nuevo, si le falta la planilla
   o si es reciente (la Liga puede corregir planillas unos días después).
4. Tabla de posiciones oficial.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .sources.laliganacional import (
    BASE, FixtureGame, LayoutChanged, PoliteFetcher, SourceBlocked, build_record, daterange_chunks, fixture_url,
    parse_boxscore, parse_fixture, parse_standings, season_code_for, season_range,
)
from .store import finish_sync, log_error, resolve_errors, save_game, save_standings, start_sync
from .validate import validate_game

STANDINGS_PHASES_URL = f"{BASE}/api/clasificacion/{{fase}}/grupos"


def _needs_page(conn, natural_key: str, recheck_days: int, today: date) -> bool:
    row = conn.execute("SELECT status, detail_level, date FROM games WHERE natural_key=?", (natural_key,)).fetchone()
    if row is None or row["status"] != "final" or row["detail_level"] != "box_score":
        return True
    return (today - date.fromisoformat(row["date"])).days <= recheck_days


def _save(conn, rec, sync_id, counts, ref) -> None:
    res = validate_game(rec)
    if not res.ok:
        log_error(conn, sync_id, "validate", ref, " | ".join(res.errors))
        counts["rejected"] += 1
        print(f"  RECHAZADO {rec.date} {rec.home_team.name}-{rec.away_team.name}: {' | '.join(res.errors)}")
        return
    with conn:
        counts[save_game(conn, rec, sync_id)] += 1
        resolve_errors(conn, ref)


def sync_crests(conn, fetcher: PoliteFetcher, season: str, fixture: list[FixtureGame], sync_id: int, out_dir: Path) -> None:
    """Registra el equipo de cada temporada (idEquipo de la Liga) y su escudo oficial (se descarga una vez)."""
    from .crests import crest_filename, ensure_crest
    from .store import get_or_create_season, get_or_create_team, now_iso
    season_id = get_or_create_season(conn, season)
    teams = {}
    for fx in fixture:
        for t in (fx.home, fx.away):
            teams.setdefault((t.club_id, t.team_id), t)
    nuevos = 0
    for (club, team_sid), t in sorted(teams.items()):
        tid = get_or_create_team(conn, t.name, club)
        prev = conn.execute("SELECT crest_file FROM team_seasons WHERE season_id=? AND team_id=?", (season_id, tid)).fetchone()
        try:
            had = (out_dir / crest_filename(club, team_sid)).exists()
            file, err = ensure_crest(fetcher, out_dir, club, team_sid, t.crest_src, t.crest_alt, t.name)
            nuevos += int(file is not None and not had)
        except SourceBlocked:
            raise
        except Exception as e:  # noqa: BLE001 — sin escudo la app usa un reemplazo discreto
            file, err = None, f"{type(e).__name__}: {e}"
        if err:
            log_error(conn, sync_id, "escudo", f"escudo {t.name}", err)
        with conn:
            conn.execute(
                "INSERT INTO team_seasons(season_id, team_id, source_team_id, crest_source, crest_file, crest_error, updated_at)"
                " VALUES (?,?,?,?,?,?,?) ON CONFLICT(season_id, team_id) DO UPDATE SET source_team_id=excluded.source_team_id,"
                " crest_source=excluded.crest_source, crest_file=COALESCE(excluded.crest_file, crest_file),"
                " crest_error=excluded.crest_error, updated_at=excluded.updated_at",
                (season_id, tid, team_sid, t.crest_src, file or (prev["crest_file"] if prev else None), err, now_iso()))
            if file:
                resolve_errors(conn, f"escudo {t.name}")
    print(f"  escudos: {len(teams)} equipos, {nuevos} descargados ahora")


def sync_standings(conn, fetcher: PoliteFetcher, season: str, sync_id: int) -> None:
    """Tabla oficial: la portada indica las fases (select-fase); cada fase tiene grupos (API JSON)."""
    import json
    import re
    home = fetcher.get(f"{BASE}/laliga/", save_as="portada")
    m = re.search(r'id="select-fase".*?</select>', home, flags=re.S)
    fases = re.findall(r'<option value="(\d+)"[^>]*>([^<]+)</option>', m.group(0)) if m else []
    if not fases:
        log_error(conn, sync_id, "parse", "posiciones", "no se encontraron fases en la portada")
        return
    for fase_id, fase_name in fases:
        grupos = json.loads(fetcher.get(STANDINGS_PHASES_URL.format(fase=fase_id), save_as=f"grupos_{fase_id}"))
        for g in grupos:
            html = fetcher.get(f"{BASE}/laliga?handler=Clasificacion&faseId={fase_id}&grupoId={g['idGrupo']}",
                               save_as=f"posiciones_{fase_id}_{g['idGrupo']}")
            rows = parse_standings(html)
            phase = fase_name.strip() if len(grupos) == 1 else f"{fase_name.strip()} · {g['nombre']}"
            with conn:
                save_standings(conn, season, phase, rows)
            print(f"  posiciones oficiales: {phase} ({len(rows)} equipos)")


def run_sync(conn, raw_dir: Path, season: str, max_games: int = 80, recheck_days: int = 4,
             today: date | None = None, standings: bool = True, crest_dir: Path | None = None) -> dict:
    today = today or datetime.now(timezone.utc).astimezone().date()
    sync_id = start_sync(conn, "laliganacional", f"temporada {season}")
    counts = {"new": 0, "updated": 0, "unchanged": 0, "rejected": 0, "skipped": 0}
    fetcher = PoliteFetcher(raw_dir)
    start, end = season_range(season)
    end = min(end, today + timedelta(days=14))  # próximos 14 días como "programados"
    try:
        fixture: list[FixtureGame] = []
        for a, b in daterange_chunks(start, end):
            fixture += parse_fixture(fetcher.get(fixture_url(a, b), save_as=f"fixture_{a}_{b}"))
        print(f"Fixture {season}: {len(fixture)} partidos entre {start} y {end}")
        if crest_dir is not None and fixture:
            sync_crests(conn, fetcher, season, fixture, sync_id, crest_dir)
        if not fixture:
            log_error(conn, sync_id, "parse", "fixture", "el fixture no devolvió partidos")

        pages = 0
        for fx in fixture:
            rec = build_record(fx, None, season, today)
            ref = fx.url or rec.natural_key()
            if fx.home_score is None or not fx.url:
                _save(conn, rec, sync_id, counts, ref)
                continue
            if not _needs_page(conn, rec.natural_key(), recheck_days, today):
                counts["skipped"] += 1
                continue
            if pages >= max_games:
                counts["skipped"] += 1
                continue
            pages += 1
            try:
                box = parse_boxscore(fetcher.get(fx.url, save_as=f"partido_{fx.date}_{fx.home.club_id}_{fx.away.club_id}"))
                rec = build_record(fx, box if box.players else None, season, today)
                if not box.players:
                    rec.notes.append("la ficha no tiene planilla individual")
            except SourceBlocked:
                raise
            except (LayoutChanged, ValueError, KeyError) as e:
                log_error(conn, sync_id, "parse", ref, f"{type(e).__name__}: {e}")
                counts["rejected"] += 1
                continue
            except Exception as e:  # noqa: BLE001 — red u otros: queda registrado para reintentar
                log_error(conn, sync_id, "fetch", ref, f"{type(e).__name__}: {e}")
                counts["rejected"] += 1
                continue
            _save(conn, rec, sync_id, counts, ref)
        if pages >= max_games:
            print(f"Se alcanzó el límite de {max_games} fichas por ejecución; el resto se procesa en la próxima.")
        # La portada sólo publica la tabla de la temporada en curso: para temporadas pasadas no se pide.
        if standings and season != season_code_for(today):
            print(f"  (tabla oficial no disponible para temporadas pasadas: se usa la calculada)")
        elif standings:
            try:
                sync_standings(conn, fetcher, season, sync_id)
            except SourceBlocked:
                raise
            except Exception as e:  # noqa: BLE001
                log_error(conn, sync_id, "parse", "posiciones", f"{type(e).__name__}: {e}")
    except SourceBlocked as e:
        log_error(conn, sync_id, "fetch", "sitio", str(e))
        status = finish_sync(conn, sync_id, counts, f"detenido: {e}", failed=True)
        print(f"Sincronización detenida: {e}")
        return {"sync_id": sync_id, "status": status, **counts}
    except Exception as e:  # noqa: BLE001 — p. ej. el fixture cambió de estructura
        log_error(conn, sync_id, "fetch", "fixture", f"{type(e).__name__}: {e}")
        status = finish_sync(conn, sync_id, counts, f"fallo: {e}", failed=True)
        print(f"Sincronización fallida: {e}")
        return {"sync_id": sync_id, "status": status, **counts}
    msg = f"{fetcher.requests} pedidos al sitio; omitidos (al día o por límite): {counts['skipped']}"
    status = finish_sync(conn, sync_id, counts, msg)
    print(f"Resultado ({status}): {counts} · {msg}")
    return {"sync_id": sync_id, "status": status, **counts}


def retry_failed(conn, raw_dir: Path, season: str) -> dict:
    """Los partidos con error se vuelven a pedir en una sincronización normal: no figuran como guardados."""
    n = conn.execute("SELECT COUNT(*) c FROM sync_errors WHERE resolved_at IS NULL").fetchone()["c"]
    print(f"Errores pendientes: {n}. Se reintentan con una sincronización incremental.")
    return run_sync(conn, raw_dir, season)
