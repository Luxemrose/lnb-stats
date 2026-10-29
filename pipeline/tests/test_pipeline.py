from datetime import date
from pathlib import Path

import pytest

from lnbstats.demo import generate_demo_games
from lnbstats.export import build_export
from lnbstats.headers import parse_minutes, parse_pair, parse_int, map_header
from lnbstats.ingest import ingest_records
from lnbstats.models import GameRecord, PlayerLine, TeamRef, normalize_name
from lnbstats.sources.csv_import import CsvImportError, load_csv
from lnbstats.sources.laliganacional import (build_record, parse_boxscore, parse_fixture, parse_game_page,
                                            parse_standings, pretty_name, season_code_for)
from lnbstats.store import connect
from lnbstats.validate import validate_game

FIX = Path(__file__).parent / "fixtures"
TPL = Path(__file__).parents[1] / "templates"


def make_game(**kw) -> GameRecord:
    base = dict(source="csv", season_code="2026-27", date="2026-10-01", home_team=TeamRef("Equipo A"),
                away_team=TeamRef("Equipo B"), home_score=5, away_score=3, status="final",
                players=[PlayerLine("home", "Uno, Jugador", stats={"pts": 5, "fg2m": 1, "fg2a": 2, "fg3m": 1, "fg3a": 1, "ftm": 0, "fta": 0}),
                         PlayerLine("away", "Dos, Jugador", stats={"pts": 3, "fg2m": 0, "fg2a": 3, "fg3m": 1, "fg3a": 2, "ftm": 0, "fta": 1})])
    base.update(kw)
    return GameRecord(**base)


@pytest.fixture
def conn(tmp_path):
    return connect(tmp_path / "t.sqlite")


# ---------------- parsing de celdas

def test_null_vs_zero():
    assert parse_int("") is None
    assert parse_int("-") is None
    assert parse_int("0") == 0
    with pytest.raises(ValueError):
        parse_int("x3")


def test_pairs_and_minutes():
    assert parse_pair("5/9") == (5, 9)
    assert parse_pair("5-9") == (5, 9)
    assert parse_pair("") == (None, None)
    assert parse_minutes("25:30") == 1530
    assert parse_minutes("25") == 1500
    assert parse_minutes("") is None


def test_header_mapping():
    assert map_header("T3") == ("fg3m", "fg3a")
    assert map_header("T3 %") is None  # porcentajes se recalculan, no se importan
    assert map_header("+/-") == "plus_minus"
    assert map_header("Rebotes") == "reb"


def test_normalize_name():
    assert normalize_name("PÉREZ, Juan") == "juan perez"
    assert normalize_name("Juan  Pérez") == "juan perez"


# ---------------- validación

def test_valid_game_passes():
    assert validate_game(make_game()).ok


def test_score_must_match_player_points():
    res = validate_game(make_game(home_score=6))
    assert not res.ok and any("suma de puntos" in e for e in res.errors)


def test_points_formula_and_made_vs_attempts():
    g = make_game()
    g.players[0].stats.update(pts=6)
    assert any("2*T2+3*T3+TL" in e for e in validate_game(g).errors)
    g = make_game()
    g.players[0].stats.update(fg2m=3, fg2a=2)
    assert any("mayor que" in e for e in validate_game(g).errors)


def test_final_without_score_and_ties_rejected():
    assert not validate_game(make_game(home_score=None, players=[])).ok
    assert not validate_game(make_game(home_score=3, players=[])).ok


def test_duplicate_player_rejected():
    g = make_game()
    g.players.append(PlayerLine("home", "UNO, Jugador", stats={}))
    assert any("duplicado" in e for e in validate_game(g).errors)


# ---------------- almacenamiento idempotente e historial

def test_ingest_is_idempotent_and_tracks_revisions(conn):
    r1 = ingest_records(conn, [make_game()], "csv", "t", verbose=False)
    r2 = ingest_records(conn, [make_game()], "csv", "t", verbose=False)
    assert (r1["new"], r2["unchanged"]) == (1, 1)
    assert conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM player_game_stats").fetchone()[0] == 2

    changed = make_game()
    changed.players[0].stats.update(ast=4)
    r3 = ingest_records(conn, [changed], "csv", "t", verbose=False)
    assert r3["updated"] == 1
    assert conn.execute("SELECT revision FROM games").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM game_revisions").fetchone()[0] == 2
    assert conn.execute("SELECT ast FROM player_game_stats WHERE ast IS NOT NULL").fetchone()[0] == 4


def test_null_stats_are_stored_as_null(conn):
    ingest_records(conn, [make_game()], "csv", "t", verbose=False)
    row = conn.execute("SELECT ast, pts FROM player_game_stats LIMIT 1").fetchone()
    assert row["ast"] is None and row["pts"] is not None


def test_player_not_duplicated_across_teams(conn):
    g1 = make_game()
    g2 = make_game(date="2026-10-08", home_team=TeamRef("Equipo C"), away_team=TeamRef("Equipo B"))
    g2.players[0].name = "UNO, JUGADOR"  # mismo jugador, otro equipo, otra grafía
    ingest_records(conn, [g1, g2], "csv", "t", verbose=False)
    assert conn.execute("SELECT COUNT(*) FROM players").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM team_rosters").fetchone()[0] == 3


def test_rejected_records_are_logged_and_resolved_on_retry(conn):
    bad = make_game(home_score=99)
    r = ingest_records(conn, [bad], "csv", "t", verbose=False)
    assert r["rejected"] == 1 and r["status"] == "partial"
    assert conn.execute("SELECT COUNT(*) FROM sync_errors WHERE resolved_at IS NULL").fetchone()[0] == 1
    ingest_records(conn, [make_game()], "csv", "t", verbose=False)
    assert conn.execute("SELECT COUNT(*) FROM sync_errors WHERE resolved_at IS NULL").fetchone()[0] == 0


# ---------------- CSV

def test_csv_template_imports(conn):
    games = load_csv(TPL / "partidos.csv", TPL / "estadisticas.csv")
    assert len(games) == 1 and games[0].players[0].stats["minutes_sec"] == 32 * 60 + 15
    # La plantilla tiene un solo jugador: el resultado 80 no coincide con 18 puntos -> se rechaza.
    r = ingest_records(conn, games, "csv", "t", verbose=False)
    assert r["rejected"] == 1


def test_csv_unknown_game_key(tmp_path):
    (tmp_path / "g.csv").write_text((TPL / "partidos.csv").read_text())
    (tmp_path / "s.csv").write_text("game_key,side,player,pts\nNOEXISTE,home,X,3\n")
    with pytest.raises(CsvImportError):
        load_csv(tmp_path / "g.csv", tmp_path / "s.csv")


# ---------------- parser del sitio oficial (extractos reales)

GAME_URL = "https://www.laliganacional.com.ar/laliga/partido/v23PSIaSmF8N15R8lLFu-n6OixyEgi4NMoo7Uwd0lv193Q63IGXr5fwg==/lanus-vs-gimnasia-cr"


def test_parse_real_fixture():
    games = parse_fixture((FIX / "real_fixture_excerpt.html").read_text())
    g = games[0]
    assert len(games) == 3
    assert (g.date, g.time, g.venue) == ("2026-09-28", "22:05", "ANTONIO ROTILI")
    assert (g.home.name, g.home.club_id, g.away.name, g.away.club_id) == ("LANÚS", "63", "GIMNASIA (CR)", "1474")
    assert (g.home_score, g.away_score) == (74, 92)
    assert g.url == GAME_URL and g.token.startswith("v23PSIaSmF8N")


def test_parse_real_boxscore_and_validate():
    fx = parse_fixture((FIX / "real_fixture_excerpt.html").read_text())[0]
    box = parse_boxscore((FIX / "real_game_excerpt.html").read_text())
    assert box.club_order == ["63", "1474"] and len(box.players) == 24
    rec = build_record(fx, box, "2026-27", date(2026, 10, 29))
    assert rec.status == "final" and rec.detail_level == "box_score"
    franchino = next(p for p in rec.players if p.source_id == "219791")
    assert franchino.name == "Franchino, Martin" and franchino.starter and franchino.side == "home"
    assert franchino.stats["pts"] == 23 and franchino.stats["minutes_sec"] == 33 * 60 + 41
    assert (franchino.stats["fg2m"], franchino.stats["fg2a"], franchino.stats["dreb"], franchino.stats["oreb"]) == (7, 9, 7, 3)
    assert (franchino.stats["pfd"], franchino.stats["eff"], franchino.stats["plus_minus"]) == (9, 35, -8)
    brussino = next(p for p in rec.players if p.name.startswith("Brussino"))
    assert brussino.did_not_play  # 00:00 en la planilla
    assert rec.team_totals["home"]["pts"] == 74 and rec.team_totals["away"]["reb"] == 29
    res = validate_game(rec)
    assert res.ok, res.errors


def test_zero_zero_in_fixture_means_not_played():
    from bs4 import BeautifulSoup
    soup = BeautifulSoup((FIX / "real_fixture_excerpt.html").read_text(), "html.parser")
    for td in soup.select("tr.fila-tabla-calendarios")[0].select("td.resultados"):
        td.string = "0"
    g = parse_fixture(str(soup))[0]
    assert (g.home_score, g.away_score) == (None, None)


def test_game_today_is_not_marked_final():
    fx = parse_fixture((FIX / "real_fixture_excerpt.html").read_text())[0]
    assert build_record(fx, None, "2026-27", date(2026, 9, 28)).status == "unknown"


def test_parse_game_page_without_fixture():
    rec = parse_game_page((FIX / "real_game_excerpt.html").read_text(), GAME_URL, "2026-27",
                          today=date(2026, 10, 29), game_date="2026-09-28")
    assert (rec.home_team.name, rec.away_team.name) == ("LANÚS", "GIMNASIA (CR)")
    assert (rec.home_score, rec.away_score) == (74, 92) and validate_game(rec).ok


def test_parse_real_standings():
    rows = parse_standings((FIX / "real_standings_excerpt.html").read_text())
    assert rows[0].team == "QUIMSA" and rows[0].club_id == "1869" and (rows[0].pj, rows[0].pg, rows[0].pts) == (5, 5, 10)


def test_names_and_seasons():
    assert pretty_name("WHITFIELD III, ROBERT JAMARCUS") == "Whitfield III, Robert Jamarcus"
    assert pretty_name("D'AMARO, LUCIANO") == "D'Amaro, Luciano"
    assert pretty_name("JOHNSON JR, MELVIN TYRIEK") == "Johnson Jr., Melvin Tyriek"
    assert season_code_for(date(2026, 10, 1)) == "2026-27"
    assert season_code_for(date(2027, 5, 1)) == "2026-27"


# ---------------- demo + export

def test_demo_data_is_consistent_and_flagged(conn):
    games = generate_demo_games()
    assert all(validate_game(g).ok for g in games)
    ingest_records(conn, games, "demo", "t", verbose=False)
    data = build_export(conn, "demo")
    assert data["meta"]["mode"] == "demo"
    assert all(t["name"].startswith("Demo ") for t in data["teams"])


def test_url_token_change_is_not_a_content_change(conn):
    g1 = make_game(source_ref="tokenA", source_url="https://x/partido/tokenA/a-vs-b")
    g2 = make_game(source_ref="tokenB", source_url="https://x/partido/tokenB/a-vs-b")
    ingest_records(conn, [g1], "csv", "t", verbose=False)
    r = ingest_records(conn, [g2], "csv", "t", verbose=False)
    assert r["unchanged"] == 1
