"""Importación desde CSV (alternativa manual cuando la extracción automática no está disponible).

Dos archivos:
- partidos.csv: una fila por partido.
- estadisticas.csv: una fila por jugador y partido (opcional).

Ver plantillas en pipeline/templates/ y la guía en docs/importacion-csv.md.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Optional

from ..headers import parse_stat_cells, parse_int
from ..models import GameRecord, TeamRef, PlayerLine

GAME_COLUMNS = ["game_key", "season", "date", "home_team", "away_team", "home_score", "away_score", "status"]
SIDE_MAP = {"home": "home", "local": "home", "l": "home", "away": "away", "visitante": "away", "v": "away"}
BOOL_MAP = {"1": True, "si": True, "sí": True, "true": True, "s": True,
            "0": False, "no": False, "false": False, "n": False, "": None}


class CsvImportError(Exception):
    pass


def _read(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        sample = f.read(4096)
        f.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t") if sample else csv.excel
        return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f, dialect=dialect)]


def load_csv(games_path: str | Path, stats_path: Optional[str | Path] = None) -> list[GameRecord]:
    rows = _read(Path(games_path))
    if rows:
        missing = [c for c in GAME_COLUMNS if c not in rows[0]]
        if missing:
            raise CsvImportError(f"{games_path}: faltan columnas {missing}")
    games: dict[str, GameRecord] = {}
    for i, r in enumerate(rows, start=2):
        key = r["game_key"]
        if not key:
            raise CsvImportError(f"{games_path}:{i}: game_key vacío")
        if key in games:
            raise CsvImportError(f"{games_path}:{i}: game_key repetido '{key}'")
        try:
            games[key] = GameRecord(
                source="csv", season_code=r["season"], date=r["date"],
                home_team=TeamRef(r["home_team"], r.get("home_team_source_id") or None),
                away_team=TeamRef(r["away_team"], r.get("away_team_source_id") or None),
                home_score=parse_int(r["home_score"]), away_score=parse_int(r["away_score"]),
                status=r["status"] or "unknown", source_ref=r.get("source_ref") or None,
                source_url=r.get("source_url") or None, time=r.get("time") or None,
                phase=r.get("phase") or None, round=r.get("round") or None, venue=r.get("venue") or None)
        except ValueError as e:
            raise CsvImportError(f"{games_path}:{i}: {e}") from e

    if stats_path:
        for i, r in enumerate(_read(Path(stats_path)), start=2):
            key = r.get("game_key", "")
            if key not in games:
                raise CsvImportError(f"{stats_path}:{i}: game_key '{key}' no existe en {games_path}")
            side = SIDE_MAP.get(r.get("side", "").lower())
            if side is None:
                raise CsvImportError(f"{stats_path}:{i}: side debe ser home/away (o local/visitante)")
            stat_cells = {k: v for k, v in r.items()
                          if k not in ("game_key", "side", "player", "player_source_id", "starter", "position", "jersey")}
            try:
                stats, extra = parse_stat_cells(stat_cells)
            except ValueError as e:
                raise CsvImportError(f"{stats_path}:{i}: {e}") from e
            name = r.get("player", "").strip()
            if not name:
                raise CsvImportError(f"{stats_path}:{i}: falta el nombre del jugador")
            starter = BOOL_MAP.get(r.get("starter", "").lower())
            target = games[key]
            if name.upper() in ("TOTAL", "TOTALES", "EQUIPO"):
                target.team_totals[side] = stats
                continue
            target.players.append(PlayerLine(
                side=side, name=name, source_id=r.get("player_source_id") or None,
                jersey=r.get("jersey") or None, position=r.get("position") or None, starter=starter,
                did_not_play=bool(extra.get("did_not_play")), stats=stats))
    return list(games.values())
