"""Almacenamiento idempotente en SQLite.

- Un partido se identifica por `natural_key` (temporada|fecha|local|visitante)
  o por `source_ref`. Importar el mismo partido dos veces no lo duplica.
- Si el contenido cambió (hash distinto), se guarda una nueva revisión y se
  reemplazan las estadísticas vigentes; la versión anterior queda en
  `game_revisions`.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .models import GameRecord, STAT_FIELDS, normalize_name, slugify

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def dump_path(path: str | Path) -> Path:
    return Path(path).with_suffix(".sql")


def connect(path: str | Path) -> sqlite3.Connection:
    """Abre la base. Si no existe pero hay un volcado .sql (lo que se guarda en git), la reconstruye."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    rebuild = not Path(path).exists() and dump_path(path).exists()
    conn = sqlite3.connect(str(path))
    if rebuild:
        conn.executescript(dump_path(path).read_text(encoding="utf-8"))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def content_hash(g: GameRecord) -> str:
    raw = json.dumps(g.to_payload(), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- entidades

def get_or_create_season(conn, code: str) -> int:
    row = conn.execute("SELECT id FROM seasons WHERE code = ?", (code,)).fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO seasons(code, name) VALUES (?, ?)", (code, f"Temporada {code}")).lastrowid


def _alias(conn, etype: str, key: str) -> Optional[int]:
    row = conn.execute("SELECT entity_id FROM entity_aliases WHERE entity_type=? AND alias_key=?", (etype, key)).fetchone()
    return row["entity_id"] if row else None


def _add_alias(conn, etype: str, key: str, entity_id: int) -> None:
    conn.execute("INSERT OR IGNORE INTO entity_aliases(entity_type, alias_key, entity_id) VALUES (?,?,?)", (etype, key, entity_id))


def get_or_create_team(conn, name: str, source_id: Optional[str] = None) -> int:
    if source_id:
        row = conn.execute("SELECT id FROM teams WHERE source_id = ?", (source_id,)).fetchone()
        if row:
            _add_alias(conn, "team", normalize_name(name), row["id"])
            return row["id"]
    tid = _alias(conn, "team", normalize_name(name))
    if tid is None:
        slug = slugify(name)
        row = conn.execute("SELECT id FROM teams WHERE slug = ?", (slug,)).fetchone()
        tid = row["id"] if row else conn.execute(
            "INSERT INTO teams(name, slug, source_id) VALUES (?,?,?)", (name.strip(), slug, source_id)).lastrowid
        _add_alias(conn, "team", normalize_name(name), tid)
    if source_id:
        conn.execute("UPDATE teams SET source_id = COALESCE(source_id, ?) WHERE id = ?", (source_id, tid))
    return tid


def get_or_create_player(conn, name: str, source_id: Optional[str] = None) -> int:
    """Si la fuente da un id oficial lo usamos; si no, identificamos por nombre normalizado.

    La identificación por nombre queda marcada (identity='name') porque puede fallar
    con homónimos o con nombres abreviados de forma distinta.
    """
    key = normalize_name(name)
    if source_id:
        row = conn.execute("SELECT id FROM players WHERE source_id = ?", (source_id,)).fetchone()
        if row:
            _add_alias(conn, "player", key, row["id"])
            return row["id"]
        pid = _alias(conn, "player", key)
        if pid is not None:
            existing = conn.execute("SELECT source_id FROM players WHERE id=?", (pid,)).fetchone()
            if existing["source_id"] is None:  # completar el id oficial de un jugador ya cargado por nombre
                conn.execute("UPDATE players SET source_id=?, identity='source_id' WHERE id=?", (source_id, pid))
                return pid
        pid = conn.execute("INSERT INTO players(full_name, name_key, source_id, identity) VALUES (?,?,?, 'source_id')",
                           (name.strip(), key, source_id)).lastrowid
        _add_alias(conn, "player", key, pid)
        return pid
    pid = _alias(conn, "player", key)
    if pid is None:
        pid = conn.execute("INSERT INTO players(full_name, name_key, identity) VALUES (?,?, 'name')",
                           (name.strip(), key)).lastrowid
        _add_alias(conn, "player", key, pid)
    return pid


def upsert_roster(conn, season_id, team_id, player_id, game_date, source, jersey=None, position=None):
    conn.execute(
        """INSERT INTO team_rosters(season_id, team_id, player_id, jersey, position, source, first_seen, last_seen)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(season_id, team_id, player_id) DO UPDATE SET
             jersey = COALESCE(excluded.jersey, jersey),
             position = COALESCE(excluded.position, position),
             first_seen = MIN(first_seen, excluded.first_seen),
             last_seen = MAX(last_seen, excluded.last_seen)""",
        (season_id, team_id, player_id, jersey, position, source, game_date, game_date))


# ---------------------------------------------------------------- partidos

def _find_game(conn, g: GameRecord):
    row = conn.execute("SELECT * FROM games WHERE natural_key = ?", (g.natural_key(),)).fetchone()
    if row is None and g.source_ref:
        row = conn.execute("SELECT * FROM games WHERE source_ref = ?", (g.source_ref,)).fetchone()
    return row


def _summarize_change(old_payload: Optional[dict], g: GameRecord) -> str:
    if old_payload is None:
        return "alta inicial"
    parts = []
    if (old_payload.get("home_score"), old_payload.get("away_score")) != (g.home_score, g.away_score):
        parts.append(f"resultado {old_payload.get('home_score')}-{old_payload.get('away_score')} -> {g.home_score}-{g.away_score}")
    if old_payload.get("status") != g.status:
        parts.append(f"estado {old_payload.get('status')} -> {g.status}")
    if len(old_payload.get("players", [])) != len(g.players):
        parts.append(f"jugadores {len(old_payload.get('players', []))} -> {len(g.players)}")
    return "; ".join(parts) or "cambios en estadísticas individuales/colectivas"


def save_game(conn, g: GameRecord, sync_log_id: Optional[int] = None) -> str:
    """Guarda un partido YA validado. Devuelve 'new', 'updated' o 'unchanged'."""
    ts = now_iso()
    h = content_hash(g)
    season_id = get_or_create_season(conn, g.season_code)
    home_id = get_or_create_team(conn, g.home_team.name, g.home_team.source_id)
    away_id = get_or_create_team(conn, g.away_team.name, g.away_team.source_id)
    existing = _find_game(conn, g)

    if existing is not None and existing["content_hash"] == h:
        conn.execute("UPDATE games SET last_checked_at=? WHERE id=?", (ts, existing["id"]))
        return "unchanged"

    fields = dict(season_id=season_id, natural_key=g.natural_key(), source=g.source, source_ref=g.source_ref,
                  source_url=g.source_url, date=g.date, time=g.time, phase=g.phase, round=g.round, venue=g.venue,
                  home_team_id=home_id, away_team_id=away_id, home_score=g.home_score, away_score=g.away_score,
                  status=g.status, detail_level=g.detail_level, content_hash=h, updated_at=ts, last_checked_at=ts)
    if existing is None:
        fields.update(first_imported_at=ts, revision=1)
        cols = ", ".join(fields)
        game_id = conn.execute(f"INSERT INTO games({cols}) VALUES ({', '.join('?' * len(fields))})",
                               tuple(fields.values())).lastrowid
        revision, old_payload, result = 1, None, "new"
    else:
        game_id = existing["id"]
        revision = existing["revision"] + 1
        prev = conn.execute("SELECT payload_json FROM game_revisions WHERE game_id=? ORDER BY revision DESC LIMIT 1",
                            (game_id,)).fetchone()
        old_payload = json.loads(prev["payload_json"]) if prev else None
        fields["revision"] = revision
        sets = ", ".join(f"{k}=?" for k in fields)
        conn.execute(f"UPDATE games SET {sets} WHERE id=?", (*fields.values(), game_id))
        conn.execute("DELETE FROM player_game_stats WHERE game_id=?", (game_id,))
        conn.execute("DELETE FROM team_game_stats WHERE game_id=?", (game_id,))
        result = "updated"

    conn.execute(
        "INSERT INTO game_revisions(game_id, revision, content_hash, payload_json, change_summary, captured_at, sync_log_id)"
        " VALUES (?,?,?,?,?,?,?)",
        (game_id, revision, h, json.dumps(g.to_payload(), ensure_ascii=False, sort_keys=True),
         _summarize_change(old_payload, g), ts, sync_log_id))

    stat_cols = ", ".join(STAT_FIELDS)
    qmarks = ", ".join("?" * len(STAT_FIELDS))
    for p in g.players:
        team_id = home_id if p.side == "home" else away_id
        pid = get_or_create_player(conn, p.name, p.source_id)
        upsert_roster(conn, season_id, team_id, pid, g.date, g.source, p.jersey, p.position)
        conn.execute(
            f"INSERT INTO player_game_stats(game_id, player_id, team_id, starter, did_not_play, {stat_cols})"
            f" VALUES (?,?,?,?,?, {qmarks})",
            (game_id, pid, team_id, None if p.starter is None else int(p.starter), int(p.did_not_play),
             *[p.stats.get(f) for f in STAT_FIELDS]))
    for side, totals in g.team_totals.items():
        team_id = home_id if side == "home" else away_id
        conn.execute(f"INSERT INTO team_game_stats(game_id, team_id, is_home, {stat_cols}) VALUES (?,?,?, {qmarks})",
                     (game_id, team_id, int(side == "home"), *[totals.get(f) for f in STAT_FIELDS]))
    return result


def game_needs_refresh(conn, source_ref: str, recheck_days: int) -> bool:
    """Sincronización incremental: no volver a pedir partidos finalizados y estables."""
    row = conn.execute("SELECT status, detail_level, updated_at, date FROM games WHERE source_ref=?",
                       (source_ref,)).fetchone()
    if row is None or row["status"] != "final" or row["detail_level"] != "box_score":
        return True
    try:
        game_day = datetime.fromisoformat(row["date"]).replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    # Los partidos recientes se revisan unos días más por si la fuente corrige planillas.
    return (datetime.now(timezone.utc) - game_day).days <= recheck_days


# ---------------------------------------------------------------- logs

def start_sync(conn, source: str, scope: str) -> int:
    sid = conn.execute("INSERT INTO data_sync_logs(source, scope, started_at, status) VALUES (?,?,?, 'running')",
                       (source, scope, now_iso())).lastrowid
    conn.commit()
    return sid


def log_error(conn, sync_id: int, stage: str, ref: Optional[str], message: str) -> None:
    prev = conn.execute("SELECT id, retry_count FROM sync_errors WHERE ref=? AND resolved_at IS NULL", (ref,)).fetchone()
    if prev and ref:
        conn.execute("UPDATE sync_errors SET retry_count=retry_count+1, message=?, stage=?, sync_log_id=? WHERE id=?",
                     (message[:2000], stage, sync_id, prev["id"]))
    else:
        conn.execute("INSERT INTO sync_errors(sync_log_id, stage, ref, message, created_at) VALUES (?,?,?,?,?)",
                     (sync_id, stage, ref, message[:2000], now_iso()))
    conn.commit()


def resolve_errors(conn, ref: str) -> None:
    conn.execute("UPDATE sync_errors SET resolved_at=? WHERE ref=? AND resolved_at IS NULL", (now_iso(), ref))


def finish_sync(conn, sync_id: int, counts: dict, message: str = "", failed: bool = False) -> str:
    errs = conn.execute("SELECT COUNT(*) c FROM sync_errors WHERE sync_log_id=? AND resolved_at IS NULL",
                        (sync_id,)).fetchone()["c"]
    status = "failed" if failed else ("partial" if errs or counts.get("rejected") else "success")
    conn.execute(
        "UPDATE data_sync_logs SET finished_at=?, status=?, games_new=?, games_updated=?, games_unchanged=?,"
        " games_rejected=?, message=? WHERE id=?",
        (now_iso(), status, counts.get("new", 0), counts.get("updated", 0), counts.get("unchanged", 0),
         counts.get("rejected", 0), message, sync_id))
    conn.commit()
    return status


def save_standings(conn, season_code: str, phase: str, rows) -> int:
    """Reemplaza la foto de la tabla oficial (temporada + fase). `rows`: StandingRow."""
    season_id = get_or_create_season(conn, season_code)
    ts = now_iso()
    conn.execute("DELETE FROM official_standings WHERE season_id=? AND phase=?", (season_id, phase))
    for r in rows:
        tid = get_or_create_team(conn, r.team, r.club_id)
        conn.execute("INSERT INTO official_standings(season_id, phase, position, team_id, pj, pg, pp, pf, pc, pts,"
                     " captured_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                     (season_id, phase, r.position, tid, r.pj, r.pg, r.pp, r.pf, r.pc, r.pts, ts))
    return len(rows)


def write_dump(conn, path: str | Path) -> Path:
    """Volcado de texto de la base (orden estable): en git ocupa poco y los cambios se pueden revisar."""
    out = dump_path(path)
    out.write_text("\n".join(conn.iterdump()) + "\n", encoding="utf-8")
    return out
