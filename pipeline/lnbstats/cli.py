"""Línea de comandos de LNB Stats.

Uso (desde la carpeta pipeline/):
    .venv/bin/python -m lnbstats.cli <comando> [opciones]

Comandos:
    init-db       crea la base real vacía (data/lnb.sqlite)
    import-csv    importa partidos/estadísticas desde CSV
    sync          sincroniza con la web oficial (incremental)
    retry-failed  reintenta los partidos con errores pendientes
    parse-file    procesa un HTML guardado de una ficha de partido (sin red)
    inspect       muestra la estructura de una página (URL o archivo) para calibrar el parser
    export        genera web/public/data/real.json
    demo          genera la base ficticia y web/public/data/demo.json
    status        últimas sincronizaciones y errores pendientes
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import demo as demo_mod
from .export import write_export
from .ingest import ingest_records
from .store import connect

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
REAL_DB = DATA / "lnb.sqlite"
DEMO_DB = DATA / "demo.sqlite"
RAW_DIR = DATA / "raw"
WEB_DATA = ROOT / "web" / "public" / "data"


def export_real(conn, a) -> None:
    """Sólo la base real alimenta la web; con --db alternativo no se toca real.json."""
    if Path(a.db).resolve() == REAL_DB.resolve():
        write_export(conn, WEB_DATA / "real.json", "real")
    else:
        print(f"(base alternativa {a.db}: no se actualiza web/public/data/real.json; usá 'export --out')")


def cmd_init(a):
    connect(a.db).close()
    print(f"Base lista: {a.db}")


def cmd_import_csv(a):
    from .sources.csv_import import CsvImportError, load_csv
    try:
        records = load_csv(a.games, a.stats)
    except CsvImportError as e:
        print(f"Error en CSV: {e}")
        return 1
    conn = connect(a.db)
    r = ingest_records(conn, records, "csv", f"csv {Path(a.games).name}")
    if not a.no_export:
        export_real(conn, a)
    return 0 if r["status"] != "failed" else 1


def cmd_sync(a):
    from .sync import run_sync
    conn = connect(a.db)
    r = run_sync(conn, RAW_DIR, a.season, max_games=a.max_games, recheck_days=a.recheck_days)
    export_real(conn, a)
    return 0 if r["status"] in ("success", "partial") else 1


def cmd_retry(a):
    from .sync import retry_failed
    conn = connect(a.db)
    retry_failed(conn, RAW_DIR, a.season)
    export_real(conn, a)


def cmd_parse_file(a):
    from .sources.laliganacional import parse_game_page
    html = Path(a.file).read_text(encoding="utf-8")
    rec = parse_game_page(html, a.url, a.season)
    print(f"{rec.date} {rec.home_team.name} {rec.home_score} - {rec.away_score} {rec.away_team.name}"
          f" | estado={rec.status} | detalle={rec.detail_level} | jugadores={len(rec.players)}")
    for n in rec.notes:
        print(f"  nota: {n}")
    if a.save:
        conn = connect(a.db)
        ingest_records(conn, [rec], "laliganacional-archivo", f"archivo {Path(a.file).name}")
        export_real(conn, a)


def cmd_inspect(a):
    from .sources.laliganacional import PoliteFetcher, inspect_html
    if a.target.startswith("http"):
        html = PoliteFetcher(RAW_DIR).get(a.target)
    else:
        html = Path(a.target).read_text(encoding="utf-8")
    print(inspect_html(html, a.target))


def cmd_export(a):
    write_export(connect(a.db), Path(a.out), "real")


def cmd_demo(a):
    if DEMO_DB.exists():
        DEMO_DB.unlink()
    conn = connect(DEMO_DB)
    ingest_records(conn, demo_mod.generate_demo_games(), "demo", "datos ficticios", verbose=False)
    conn.execute("UPDATE seasons SET name = 'Temporada DEMO (datos ficticios)'")
    conn.commit()
    write_export(conn, WEB_DATA / "demo.json", "demo")


def cmd_status(a):
    conn = connect(a.db)
    for r in conn.execute("SELECT * FROM data_sync_logs ORDER BY id DESC LIMIT 10"):
        print(f"#{r['id']} {r['started_at']} {r['source']} {r['status']} nuevos={r['games_new']}"
              f" act={r['games_updated']} sin_cambios={r['games_unchanged']} rech={r['games_rejected']} {r['message'] or ''}")
    errs = conn.execute("SELECT * FROM sync_errors WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 20").fetchall()
    print(f"Errores pendientes: {len(errs)}")
    for e in errs:
        print(f"  [{e['stage']}] {e['ref']} (reintentos {e['retry_count']}): {e['message'][:200]}")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="lnbstats", description="Pipeline de datos de LNB Stats")
    p.add_argument("--db", default=str(REAL_DB), help="ruta de la base SQLite real")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db").set_defaults(fn=cmd_init)
    s = sub.add_parser("import-csv")
    s.add_argument("games"); s.add_argument("stats", nargs="?")
    s.add_argument("--no-export", action="store_true")
    s.set_defaults(fn=cmd_import_csv)
    s = sub.add_parser("sync")
    s.add_argument("--season", required=True, help="código de temporada, p. ej. 2026-27")
    s.add_argument("--max-games", type=int, default=60)
    s.add_argument("--recheck-days", type=int, default=4)
    s.set_defaults(fn=cmd_sync)
    s = sub.add_parser("retry-failed"); s.add_argument("--season", required=True); s.set_defaults(fn=cmd_retry)
    s = sub.add_parser("parse-file")
    s.add_argument("file"); s.add_argument("--url", required=True); s.add_argument("--season", required=True)
    s.add_argument("--save", action="store_true", help="validar y guardar en la base real")
    s.set_defaults(fn=cmd_parse_file)
    s = sub.add_parser("inspect"); s.add_argument("target"); s.set_defaults(fn=cmd_inspect)
    s = sub.add_parser("export"); s.add_argument("--out", default=str(WEB_DATA / "real.json")); s.set_defaults(fn=cmd_export)
    sub.add_parser("demo").set_defaults(fn=cmd_demo)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    a = p.parse_args(argv)
    return a.fn(a) or 0


if __name__ == "__main__":
    sys.exit(main())
