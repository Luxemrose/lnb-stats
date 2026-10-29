"""Validación previa al guardado.

- `errors`: el registro NO se guarda (datos imposibles o inconsistentes).
- `warnings`: se guarda, pero queda constancia en el log.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from .models import GameRecord, STAT_FIELDS, SIGNED_FIELDS, GAME_STATUSES, normalize_name

MAX_MINUTES_SEC = 70 * 60  # 40 min + varios suplementarios: margen amplio


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _check_stat_line(label: str, s: dict, res: ValidationResult, is_team: bool = False) -> None:
    for k, v in s.items():
        if k not in STAT_FIELDS:
            res.errors.append(f"{label}: campo desconocido '{k}'")
            continue
        if v is None:
            continue
        if not isinstance(v, int) or isinstance(v, bool):
            res.errors.append(f"{label}: '{k}' debe ser entero, vino {v!r}")
            continue
        if v < 0 and k not in SIGNED_FIELDS:
            res.errors.append(f"{label}: '{k}' negativo ({v})")
    get = s.get
    for m, a in (("fg2m", "fg2a"), ("fg3m", "fg3a"), ("ftm", "fta")):
        if get(m) is not None and get(a) is not None and get(m) > get(a):
            res.errors.append(f"{label}: {m} ({get(m)}) mayor que {a} ({get(a)})")
    if None not in (get("oreb"), get("dreb"), get("reb")) and get("oreb") + get("dreb") != get("reb"):
        res.errors.append(f"{label}: rebotes ofensivos + defensivos ({get('oreb')}+{get('dreb')}) != totales ({get('reb')})")
    if None not in (get("fg2m"), get("fg3m"), get("ftm"), get("pts")):
        calc = 2 * get("fg2m") + 3 * get("fg3m") + get("ftm")
        if calc != get("pts"):
            res.errors.append(f"{label}: puntos ({get('pts')}) no coinciden con 2*T2+3*T3+TL ({calc})")
    if not is_team and get("minutes_sec") is not None and get("minutes_sec") > MAX_MINUTES_SEC:
        res.warnings.append(f"{label}: minutos sospechosamente altos ({get('minutes_sec') / 60:.1f})")


def validate_game(g: GameRecord) -> ValidationResult:
    res = ValidationResult()
    if not re.fullmatch(r"\d{4}-\d{2}", g.season_code or ""):
        res.errors.append(f"temporada inválida: {g.season_code!r} (formato esperado 2026-27)")
    try:
        date.fromisoformat(g.date)
    except (TypeError, ValueError):
        res.errors.append(f"fecha inválida: {g.date!r}")
    if not g.home_team.name.strip() or not g.away_team.name.strip():
        res.errors.append("falta el nombre de algún equipo")
    elif normalize_name(g.home_team.name) == normalize_name(g.away_team.name):
        res.errors.append("local y visitante son el mismo equipo")
    if g.status not in GAME_STATUSES:
        res.errors.append(f"estado inválido: {g.status!r}")
    for side, sc in (("local", g.home_score), ("visitante", g.away_score)):
        if sc is not None and (not isinstance(sc, int) or sc < 0 or sc > 250):
            res.errors.append(f"resultado {side} inválido: {sc!r}")
    if g.status == "final" and (g.home_score is None or g.away_score is None):
        res.errors.append("partido finalizado sin resultado")
    if g.status == "final" and g.home_score is not None and g.home_score == g.away_score:
        res.errors.append("partido finalizado empatado (en básquet no hay empates)")

    seen: set[tuple[str, str]] = set()
    for p in g.players:
        label = f"{p.name} ({p.side})"
        if p.side not in ("home", "away"):
            res.errors.append(f"{label}: lado inválido")
        key = (p.side, p.source_id or normalize_name(p.name))
        if key in seen:
            res.errors.append(f"{label}: jugador duplicado en el mismo equipo")
        seen.add(key)
        _check_stat_line(label, p.stats, res)

    for side, s in g.team_totals.items():
        _check_stat_line(f"totales {side}", s, res, is_team=True)

    # Coherencia: suma de puntos individuales == resultado == total oficial.
    for side, score in (("home", g.home_score), ("away", g.away_score)):
        lines = [p for p in g.players if p.side == side and not p.did_not_play]
        if lines and all(p.stats.get("pts") is not None for p in lines) and score is not None:
            total = sum(p.stats["pts"] for p in lines)
            if total != score:
                res.errors.append(f"suma de puntos de jugadores {side} ({total}) != resultado ({score})")
        tt = g.team_totals.get(side, {})
        if tt.get("pts") is not None and score is not None and tt["pts"] != score:
            res.errors.append(f"total oficial de puntos {side} ({tt['pts']}) != resultado ({score})")
        if lines and any(p.stats.get("pts") is None for p in lines):
            res.warnings.append(f"{side}: hay jugadores sin dato de puntos; el box score está incompleto")
    return res
