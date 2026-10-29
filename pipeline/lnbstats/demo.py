"""Generador de DATOS FICTICIOS para desarrollar la interfaz.

Todo lo que produce este módulo es inventado: equipos "Demo ...", jugadores
con nombres ficticios. Se guarda en una base separada (data/demo.sqlite) y la
web lo muestra con un aviso permanente. Nunca se mezcla con la base real.

Los datos pasan por la misma validación que los reales, así que también sirven
como prueba de punta a punta del pipeline.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from .models import GameRecord, PlayerLine, TeamRef

TEAMS = ["Demo Norte", "Demo Sur", "Demo Puerto", "Demo Sierra", "Demo Valle", "Demo Llanura", "Demo Río",
         "Demo Bosque"]
FIRST = ["Tomás", "Bruno", "Lautaro", "Nicolás", "Facundo", "Mateo", "Iván", "Ramiro", "Gael", "Simón", "Ciro",
         "Thiago", "Joaquín", "Benjamín", "Valentín", "Dante", "Felipe", "Agustín", "León", "Emiliano"]
LAST = ["Ficticio", "Inventado", "Ejemplar", "Muestra", "Prototipo", "Ensayo", "Borrador", "Maqueta", "Boceto",
        "Simulado", "Modelo", "Patrón", "Plantilla", "Esquema", "Probeta", "Testigo", "Piloto", "Demo"]
POSITIONS = ["Base", "Escolta", "Alero", "Ala-pivote", "Pivote"]


def _roster(rng: random.Random, used: set[str]) -> list[dict]:
    players = []
    for i in range(11):
        while True:
            name = f"{rng.choice(LAST)}, {rng.choice(FIRST)}"
            if name not in used:
                used.add(name)
                break
        players.append({"name": name, "pos": POSITIONS[i % 5], "jersey": str(rng.randint(0, 99)),
                        "skill": rng.uniform(0.6, 1.4) * (1.3 if i < 5 else 0.8)})
    return players


def _line(rng: random.Random, p: dict, minutes: int, side: str, starter: bool) -> PlayerLine:
    if minutes == 0:
        return PlayerLine(side=side, name=p["name"], jersey=p["jersey"], position=p["pos"], starter=False,
                          did_not_play=True, stats={})
    k = minutes / 40 * p["skill"]
    big = p["pos"] in ("Ala-pivote", "Pivote")
    fg2a = max(0, int(rng.gauss(9 * k * (1.2 if big else 0.9), 2)))
    fg3a = max(0, int(rng.gauss(6 * k * (0.4 if big else 1.1), 1.5)))
    fta = max(0, int(rng.gauss(3 * k, 1.5)))
    fg2m = sum(rng.random() < 0.52 for _ in range(fg2a))
    fg3m = sum(rng.random() < 0.34 for _ in range(fg3a))
    ftm = sum(rng.random() < 0.74 for _ in range(fta))
    oreb = max(0, int(rng.gauss(2 * k * (1.6 if big else 0.6), 1)))
    dreb = max(0, int(rng.gauss(5 * k * (1.5 if big else 0.8), 1.5)))
    stats = dict(minutes_sec=minutes * 60 + rng.randint(0, 59), fg2m=fg2m, fg2a=fg2a, fg3m=fg3m, fg3a=fg3a,
                 ftm=ftm, fta=fta, oreb=oreb, dreb=dreb, reb=oreb + dreb,
                 ast=max(0, int(rng.gauss(4 * k * (0.5 if big else 1.2), 1.5))),
                 stl=max(0, int(rng.gauss(1.2 * k, 0.8))), tov=max(0, int(rng.gauss(2 * k, 1))),
                 blk=max(0, int(rng.gauss(0.8 * k * (2 if big else 0.4), 0.6))), blka=max(0, int(rng.gauss(0.4, 0.5))),
                 pf=min(5, max(0, int(rng.gauss(2.5, 1.2)))), pfd=max(0, int(rng.gauss(2.5 * k, 1.2))),
                 plus_minus=None)
    stats["pts"] = 2 * fg2m + 3 * fg3m + ftm
    stats["eff"] = (stats["pts"] + stats["reb"] + stats["ast"] + stats["stl"] + stats["blk"] + stats["pfd"]
                    - (fg2a - fg2m) - (fg3a - fg3m) - (fta - ftm) - stats["tov"] - stats["blka"] - stats["pf"])
    return PlayerLine(side=side, name=p["name"], jersey=p["jersey"], position=p["pos"], starter=starter, stats=stats)


def _team_lines(rng, roster, side) -> list[PlayerLine]:
    mins = [rng.randint(26, 34) for _ in range(5)] + [rng.randint(8, 22) for _ in range(5)] + [0]
    return [_line(rng, p, m, side, i < 5) for i, (p, m) in enumerate(zip(roster, mins))]


def generate_demo_games(seed: int = 7, season: str = "2026-27") -> list[GameRecord]:
    rng = random.Random(seed)
    used: set[str] = set()
    rosters = {t: _roster(rng, used) for t in TEAMS}
    # Calendario todos contra todos (método del círculo), ida y vuelta: un partido por equipo por fecha.
    teams = TEAMS[:]
    rounds = []
    for r in range(len(teams) - 1):
        rounds.append([(teams[i], teams[-1 - i]) if r % 2 == 0 else (teams[-1 - i], teams[i]) for i in range(len(teams) // 2)])
        teams = [teams[0], teams[-1], *teams[1:-1]]
    rounds += [[(a, h) for h, a in rnd] for rnd in rounds]
    day = date(2026, 9, 1)
    games = []
    for rnum, rnd in enumerate(rounds, start=1):
        day += timedelta(days=rng.choice([3, 4]))
        for h, a in rnd:
            i = len(games)
            home = _team_lines(rng, rosters[h], "home")
            away = _team_lines(rng, rosters[a], "away")
            hs = sum(p.stats.get("pts", 0) for p in home)
            as_ = sum(p.stats.get("pts", 0) for p in away)
            if hs == as_:  # en básquet no hay empate: un libre extra para el local
                p = home[0]
                p.stats["ftm"] += 1; p.stats["fta"] += 1; p.stats["pts"] += 1; p.stats["eff"] += 1
                hs += 1
            for lines, diff in ((home, hs - as_), (away, as_ - hs)):
                for p in lines:
                    if not p.did_not_play:
                        p.stats["plus_minus"] = round(diff * p.stats["minutes_sec"] / 2400 + rng.randint(-4, 4))
            games.append(GameRecord(source="demo", season_code=season, date=day.isoformat(),
                                    home_team=TeamRef(h), away_team=TeamRef(a), home_score=hs, away_score=as_,
                                    status="final", source_ref=f"demo-{i + 1}", phase="Fase regular (DEMO)",
                                    round=str(rnum), players=home + away))
    return games
