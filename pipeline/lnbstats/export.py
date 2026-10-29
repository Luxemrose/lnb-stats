"""Exporta la base SQLite a un JSON estático que consume la web.

La web no se conecta a ninguna base: lee este archivo. Así no hay claves ni
servidores que mantener, y el sitio puede publicarse gratis como estático.
"""
from __future__ import annotations

import json
from pathlib import Path

from .models import STAT_FIELDS
from .store import now_iso


def _rows(conn, sql, *args):
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def build_export(conn, mode: str) -> dict:
    last_ok = conn.execute("SELECT * FROM data_sync_logs WHERE status IN ('success','partial') AND"
                           " (games_new + games_updated + games_unchanged) > 0 ORDER BY finished_at DESC LIMIT 1"
                           ).fetchone()
    stat_cols = ", ".join(STAT_FIELDS)
    return {
        "meta": {
            "mode": mode,
            "generatedAt": now_iso(),
            "lastSuccessfulSync": dict(last_ok) if last_ok else None,
            "sourceName": "La Liga Nacional de Básquet (laliganacional.com.ar)" if mode == "real"
                          else "DATOS FICTICIOS DE DEMOSTRACIÓN",
            "sourceUrl": "https://www.laliganacional.com.ar/laliga/" if mode == "real" else None,
        },
        "seasons": _rows(conn, "SELECT id, code, name FROM seasons ORDER BY code DESC"),
        "teams": _rows(conn, "SELECT id, name, slug, source_id AS sourceId FROM teams ORDER BY name"),
        "players": _rows(conn, "SELECT id, full_name AS name, source_id AS sourceId, identity FROM players"
                               " ORDER BY full_name"),
        "rosters": _rows(conn, "SELECT season_id AS seasonId, team_id AS teamId, player_id AS playerId, jersey,"
                               " position, source, first_seen AS firstSeen, last_seen AS lastSeen FROM team_rosters"),
        "games": _rows(conn, "SELECT id, season_id AS seasonId, date, time, phase, round, venue,"
                             " home_team_id AS homeTeamId, away_team_id AS awayTeamId, home_score AS homeScore,"
                             " away_score AS awayScore, status, detail_level AS detailLevel, source,"
                             " source_url AS sourceUrl, revision, updated_at AS updatedAt"
                             " FROM games ORDER BY date, id"),
        "playerStats": _rows(conn, f"SELECT game_id AS gameId, player_id AS playerId, team_id AS teamId, starter,"
                                   f" did_not_play AS dnp, {stat_cols} FROM player_game_stats"),
        "teamStats": _rows(conn, f"SELECT game_id AS gameId, team_id AS teamId, is_home AS isHome, {stat_cols}"
                                 f" FROM team_game_stats"),
        "officialStandings": _rows(conn, "SELECT season_id AS seasonId, phase, position, team_id AS teamId, pj, pg, pp,"
                                         " pf, pc, pts, captured_at AS capturedAt FROM official_standings"
                                         " ORDER BY season_id, phase, position"),
        "syncLogs": _rows(conn, "SELECT * FROM data_sync_logs ORDER BY id DESC LIMIT 30"),
        "openErrors": _rows(conn, "SELECT id, stage, ref, message, created_at AS createdAt, retry_count AS retryCount"
                                  " FROM sync_errors WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 100"),
    }


def write_export(conn, out: Path, mode: str) -> dict:
    data = build_export(conn, mode)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Exportado {out} ({out.stat().st_size // 1024} KB): {len(data['games'])} partidos,"
          f" {len(data['players'])} jugadores")
    return data
