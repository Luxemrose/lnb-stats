"""Traducción de encabezados de planillas (español / FIBA / nombres internos) a campos canónicos.

Un encabezado puede mapear a:
- un campo simple, p. ej. "PTS" -> "pts"
- un par convertidos/intentados, p. ej. "T3" con celdas "2/5" -> ("fg3m", "fg3a")
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional, Union

Target = Union[str, tuple[str, str]]


def norm_header(h: str) -> str:
    s = unicodedata.normalize("NFKD", h or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).upper()
    s = s.replace("+/-", "PLUSMINUS").replace("%", " PCT")
    return re.sub(r"[^A-Z0-9 ]+", " ", s).strip().replace("  ", " ")


# Claves ya normalizadas con norm_header.
HEADER_MAP: dict[str, Target] = {
    # identificación
    "JUGADOR": "name", "NOMBRE": "name", "PLAYER": "name", "NAME": "name",
    "N": "jersey", "NRO": "jersey", "NUM": "jersey", "DORSAL": "jersey", "CAMISETA": "jersey",
    # minutos y puntos
    "MIN": "minutes_sec", "MINUTOS": "minutes_sec", "MINUTES": "minutes_sec",
    "PTS": "pts", "PT": "pts", "PUNTOS": "pts", "P": "pts",
    # tiros (pares convertidos/intentados)
    "T2": ("fg2m", "fg2a"), "2P": ("fg2m", "fg2a"), "DOBLES": ("fg2m", "fg2a"), "T2 C I": ("fg2m", "fg2a"),
    "2PM A": ("fg2m", "fg2a"),
    "T3": ("fg3m", "fg3a"), "3P": ("fg3m", "fg3a"), "TRIPLES": ("fg3m", "fg3a"), "T3 C I": ("fg3m", "fg3a"),
    "3PM A": ("fg3m", "fg3a"),
    "TL": ("ftm", "fta"), "T1": ("ftm", "fta"), "LIBRES": ("ftm", "fta"), "TL C I": ("ftm", "fta"),
    "FT": ("ftm", "fta"), "FTM A": ("ftm", "fta"),
    # tiros (columnas separadas)
    "T2C": "fg2m", "T2I": "fg2a", "T3C": "fg3m", "T3I": "fg3a", "TLC": "ftm", "TLI": "fta",
    "FG2M": "fg2m", "FG2A": "fg2a", "FG3M": "fg3m", "FG3A": "fg3a", "FTM": "ftm", "FTA": "fta",
    # rebotes
    "RO": "oreb", "REB O": "oreb", "RBO": "oreb", "OREB": "oreb", "OF": "oreb",
    "RD": "dreb", "REB D": "dreb", "RBD": "dreb", "DREB": "dreb", "DEF": "dreb",
    "RT": "reb", "REB": "reb", "RB": "reb", "REBOTES": "reb", "TOT": "reb", "RTOT": "reb",
    # resto
    "AS": "ast", "AST": "ast", "ASIST": "ast", "ASISTENCIAS": "ast",
    "BR": "stl", "ROB": "stl", "REC": "stl", "STL": "stl", "RECUPEROS": "stl", "ROBOS": "stl",
    "BP": "tov", "PER": "tov", "PERD": "tov", "TOV": "tov", "PERDIDAS": "tov", "TO": "tov",
    "TAP": "blk", "TF": "blk", "BLK": "blk", "TAPAS": "blk", "TAP F": "blk",
    "TC": "blka", "BLKA": "blka", "TAP C": "blka",
    "FC": "pf", "FP": "pf", "F": "pf", "PF": "pf", "FALTAS": "pf",
    "FR": "pfd", "PFD": "pfd", "FREC": "pfd", "FALTAS REC": "pfd",
    "PLUSMINUS": "plus_minus", "PLUS MINUS": "plus_minus", "DIF": "plus_minus",
    "VAL": "eff", "EF": "eff", "EFF": "eff", "VALORACION": "eff", "EFIC": "eff",
}

# Columnas de porcentaje: se ignoran porque se recalculan desde convertidos/intentados.
IGNORED_PATTERNS = (" PCT", "PORC", "PCT")


def map_header(h: str) -> Optional[Target]:
    n = norm_header(h)
    if any(p in f" {n}" for p in IGNORED_PATTERNS):
        return None
    if n in HEADER_MAP:
        return HEADER_MAP[n]
    compact = n.replace(" ", "")
    for k, v in HEADER_MAP.items():
        if k.replace(" ", "") == compact:
            return v
    return None


EMPTY = {"", "-", "—", "–", "N/D", "ND", "NA", "N/A", "NULL", "NONE"}
DNP = {"DNP", "NJ", "NO JUGO", "NO JUGÓ", "DNP-CD", "NJ-DT"}


def parse_int(cell: Optional[str]) -> Optional[int]:
    """'' / '-' -> None (sin dato). '0' -> 0. Error si no es un entero."""
    if cell is None:
        return None
    s = str(cell).strip()
    if s.upper() in EMPTY:
        return None
    if re.fullmatch(r"[+-]?\d+", s):
        return int(s)
    raise ValueError(f"no es un número entero: {cell!r}")


def parse_pair(cell: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """'5/9', '5-9' o '5 de 9' -> (5, 9)."""
    if cell is None or str(cell).strip().upper() in EMPTY:
        return None, None
    m = re.fullmatch(r"\s*(\d+)\s*(?:/|-|de)\s*(\d+)\s*(?:\(.*\))?\s*", str(cell))
    if not m:
        raise ValueError(f"formato convertidos/intentados no reconocido: {cell!r}")
    return int(m.group(1)), int(m.group(2))


def parse_minutes(cell: Optional[str]) -> Optional[int]:
    """'25:30' -> 1530 s; '25' -> 1500 s; '25.5' -> 1530 s; '' -> None."""
    if cell is None:
        return None
    s = str(cell).strip()
    if s.upper() in EMPTY:
        return None
    m = re.fullmatch(r"(\d{1,3}):(\d{2})(?::\d{2})?", s)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.fullmatch(r"(\d+)(?:[.,](\d+))?", s)
    if m:
        whole = int(m.group(1))
        frac = float("0." + m.group(2)) if m.group(2) else 0.0
        return round((whole + frac) * 60)
    raise ValueError(f"formato de minutos no reconocido: {cell!r}")


def parse_stat_cells(cells: dict[str, str]) -> tuple[dict[str, Optional[int]], dict]:
    """Convierte {encabezado: celda} en estadísticas canónicas + campos extra (nombre, dorsal)."""
    stats: dict[str, Optional[int]] = {}
    extra: dict = {}
    for header, cell in cells.items():
        target = map_header(header)
        if target is None:
            continue
        if isinstance(target, tuple):
            stats[target[0]], stats[target[1]] = parse_pair(cell)
        elif target == "minutes_sec":
            if str(cell).strip().upper() in DNP:
                extra["did_not_play"] = True
                stats["minutes_sec"] = None
            else:
                stats["minutes_sec"] = parse_minutes(cell)
        elif target in ("name", "jersey"):
            extra[target] = (cell or "").strip()
        else:
            stats[target] = parse_int(cell)
    return stats, extra
