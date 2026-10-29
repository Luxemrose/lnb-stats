"""Formato canónico intermedio.

Todas las fuentes (web oficial, CSV, datos de demostración) se convierten a
`GameRecord` antes de validar y guardar. Así la validación y el almacenamiento
no dependen de dónde vinieron los datos.

Regla clave: un valor desconocido es `None` (nulo), nunca 0.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field, asdict
from typing import Optional

# Estadísticas "crudas" que puede traer una fuente por jugador o por equipo.
# Los porcentajes NO se guardan: se calculan siempre a partir de convertidos/intentados.
STAT_FIELDS: list[str] = [
    "minutes_sec",  # minutos jugados, en segundos
    "pts",          # puntos
    "fg2m", "fg2a",  # dobles convertidos / intentados
    "fg3m", "fg3a",  # triples convertidos / intentados
    "ftm", "fta",    # libres convertidos / intentados
    "oreb", "dreb", "reb",  # rebotes ofensivos / defensivos / totales
    "ast",          # asistencias
    "stl",          # robos (recuperos)
    "tov",          # pérdidas
    "blk",          # tapas a favor
    "blka",         # tapas recibidas
    "pf",           # faltas cometidas
    "pfd",          # faltas recibidas
    "plus_minus",   # +/- en cancha
    "eff",          # valoración oficial (tal cual la publica la fuente)
]

# Campos que pueden ser negativos.
SIGNED_FIELDS = {"plus_minus", "eff"}

GAME_STATUSES = {"final", "scheduled", "live", "unknown"}


def normalize_name(name: str) -> str:
    """Clave de comparación para nombres: sin tildes, minúsculas, 'Apellido, Nombre' -> 'nombre apellido'."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.strip().lower()
    if "," in s:
        last, _, first = s.partition(",")
        s = f"{first.strip()} {last.strip()}"
    s = re.sub(r"[^a-z0-9() ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(name: str) -> str:
    return normalize_name(name).replace("(", "").replace(")", "").replace(" ", "-")


@dataclass
class TeamRef:
    name: str
    source_id: Optional[str] = None


@dataclass
class PlayerLine:
    side: str                       # "home" | "away"
    name: str
    source_id: Optional[str] = None
    jersey: Optional[str] = None
    position: Optional[str] = None
    starter: Optional[bool] = None
    did_not_play: bool = False
    stats: dict[str, Optional[int]] = field(default_factory=dict)


@dataclass
class GameRecord:
    source: str                     # "laliganacional" | "csv" | "demo"
    season_code: str                # p. ej. "2026-27"
    date: str                       # ISO "YYYY-MM-DD"
    home_team: TeamRef
    away_team: TeamRef
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    status: str = "unknown"
    source_ref: Optional[str] = None  # identificador o token de la fuente
    source_url: Optional[str] = None
    time: Optional[str] = None
    phase: Optional[str] = None
    round: Optional[str] = None
    venue: Optional[str] = None
    players: list[PlayerLine] = field(default_factory=list)
    # Totales de equipo tal como los publica la fuente (no calculados por nosotros).
    team_totals: dict[str, dict[str, Optional[int]]] = field(default_factory=dict)
    # Notas del parser (por ejemplo, de dónde salió el resultado).
    notes: list[str] = field(default_factory=list)

    def natural_key(self) -> str:
        """Clave estable independiente de la fuente: temporada + fecha + local + visitante."""
        return f"{self.season_code}|{self.date}|{slugify(self.home_team.name)}|{slugify(self.away_team.name)}"

    @property
    def detail_level(self) -> str:
        has_box = any(any(v is not None for v in p.stats.values()) for p in self.players)
        if has_box:
            return "box_score"
        if self.home_score is not None and self.away_score is not None:
            return "result_only"
        return "scheduled"

    def to_payload(self) -> dict:
        """Representación determinística (para hash de cambios e historial)."""
        d = asdict(self)
        d.pop("notes", None)
        # El token de la URL oficial cambia en cada visita: no es un cambio de contenido.
        d.pop("source_ref", None)
        d.pop("source_url", None)
        d["players"] = sorted(d["players"], key=lambda p: (p["side"], normalize_name(p["name"])))
        return d
