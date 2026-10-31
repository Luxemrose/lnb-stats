"""Adaptador para https://www.laliganacional.com.ar/laliga/

Estructura VERIFICADA el 29/10/2026 contra el sitio real:

- Fixture: la página /laliga/fixture carga los partidos con
    GET /laliga/fixture?handler=ProximosPartidos&fechaInicio=AAAA-MM-DD&fechaFin=AAAA-MM-DD
  que devuelve una tabla HTML (filas `tr.fila-tabla-calendarios`) con: equipos
  (enlace /laliga/equipo/{idClub}/{idEquipo}/{slug}/inicio), resultado, fecha/hora,
  estadio y enlace a la ficha /laliga/partido/{token}/{slug}.
- Ficha de partido: dos tablas de planilla. Cada fila de jugador tiene un atributo
  onclick="EstadisticasComponente({...json...}, ...)" con IdJugador, IdClub,
  NombreCompleto, CincoInicial, TiempoJuego y todas las estadísticas.
  La última fila (`tr.footer-tabla-estadistica`) tiene los totales del equipo.
- Tabla de posiciones: GET /api/clasificacion/{faseId}/grupos (JSON) y
  GET /laliga?handler=Clasificacion&faseId=..&grupoId=.. (tabla HTML).
- No hay posición de jugador en planillas, planteles ni fichas de jugador.
- El token de la URL del partido NO es estable (cambió de formato); el id de
  jugador (IdJugador) y el id de club (IdClub) sí lo son.
- robots.txt (29/10/2026): `User-agent: *  Allow: /`, Content-Signal
  `search=yes, ai-train=no, use=reference`. LNB Stats no entrena modelos.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
import urllib.robotparser
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..headers import map_header, parse_minutes, parse_pair
from ..models import GameRecord, PlayerLine, TeamRef

BASE = "https://www.laliganacional.com.ar"
FIXTURE_URL = f"{BASE}/laliga/fixture"
GAME_LINK_RE = re.compile(r"/laliga/partido/(?!jugadores-pista)([A-Za-z0-9_\-=]+)/([a-z0-9\-]+)")
TEAM_LINK_RE = re.compile(r"/laliga/equipo/(\d+)/(\d+)/")
USER_AGENT = "LNBStats/0.1 (analisis estadistico; uso no comercial; respeta robots.txt){contact}"


class SourceBlocked(Exception):
    """La fuente rechazó el acceso (403/429) o robots.txt lo prohíbe: hay que detenerse, no insistir."""


class LayoutChanged(Exception):
    """La página no tiene la estructura esperada: hay que revisar el parser, no adivinar."""


# ---------------------------------------------------------------- descarga

class PoliteFetcher:
    def __init__(self, cache_dir: Path, min_interval: float = 3.0, timeout: int = 30):
        contact = os.environ.get("LNB_CONTACT")
        self.ua = USER_AGENT.format(contact=f"; contacto: {contact}" if contact else "")
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self.timeout = timeout
        self._last = 0.0
        self._robots: Optional[urllib.robotparser.RobotFileParser] = None
        self.requests = 0

    def _check_robots(self, url: str) -> None:
        if self._robots is None:
            rp = urllib.robotparser.RobotFileParser()
            try:
                req = urllib.request.Request(f"{BASE}/robots.txt", headers={"User-Agent": self.ua})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    rp.parse(r.read().decode("utf-8", "replace").splitlines())
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    raise SourceBlocked(f"robots.txt devolvió {e.code}") from e
                rp.parse([])  # 404: sin restricciones declaradas
            self._robots = rp
        if not self._robots.can_fetch(self.ua, url):
            raise SourceBlocked(f"robots.txt no permite {url}")

    def _request(self, url: str) -> tuple[bytes, Optional[str]]:
        """Pedido con pausa entre pedidos, reintentos ante errores de red/5xx y freno ante 403/429."""
        self._check_robots(url)
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        last_err: Exception | None = None
        for attempt in range(3):
            self._last = time.monotonic()
            self.requests += 1
            try:
                req = urllib.request.Request(url, headers={"User-Agent": self.ua, "Accept-Language": "es-AR,es"})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return r.read(), r.headers.get_content_charset()
            except urllib.error.HTTPError as e:
                if e.code in (401, 403, 429):
                    raise SourceBlocked(f"HTTP {e.code} en {url}") from e
                if e.code < 500:
                    raise
                last_err = e
            except (urllib.error.URLError, TimeoutError) as e:
                last_err = e
            time.sleep(5 * (attempt + 1))
        raise ConnectionError(f"No se pudo descargar {url}: {last_err}")

    def get(self, url: str, save_as: Optional[str] = None) -> str:
        data, charset = self._request(url)
        body = data.decode(charset or "utf-8", "replace")
        self._save_raw(url, body, save_as)
        return body

    def get_bytes(self, url: str) -> bytes:
        """Descarga binaria (imágenes de escudos)."""
        return self._request(url)[0]

    def _save_raw(self, url: str, body: str, save_as: Optional[str]) -> None:
        """Guarda la respuesta original: permite re-procesar sin volver a pedirla y auditar cambios."""
        day = datetime.now().strftime("%Y%m%d")
        name = save_as or re.sub(r"[^A-Za-z0-9_\-]+", "_", urlparse(url).path.strip("/"))[:150] or "index"
        path = self.cache_dir / day / f"{name}.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")


# ---------------------------------------------------------------- temporadas

def season_code_for(d: date) -> str:
    """La temporada va de agosto a julio: 2026-10-01 -> '2026-27'."""
    y = d.year if d.month >= 8 else d.year - 1
    return f"{y}-{(y + 1) % 100:02d}"


def season_range(code: str) -> tuple[date, date]:
    y = int(code[:4])
    return date(y, 8, 1), date(y + 1, 7, 31)


# ---------------------------------------------------------------- fixture

@dataclass
class FixtureTeam:
    name: str
    club_id: str
    team_id: str
    crest_src: Optional[str] = None   # p. ej. "/escudos/63/112600" (imagen oficial del escudo)
    crest_alt: Optional[str] = None   # texto alternativo de esa imagen (nombre del equipo según el sitio)


@dataclass
class FixtureGame:
    date: str
    time: Optional[str]
    venue: Optional[str]
    home: FixtureTeam
    away: FixtureTeam
    home_score: Optional[int]
    away_score: Optional[int]
    url: Optional[str]
    token: Optional[str]


def fixture_url(start: date, end: date) -> str:
    return f"{FIXTURE_URL}?handler=ProximosPartidos&fechaInicio={start.isoformat()}&fechaFin={end.isoformat()}"


def _team_from_cell(td) -> FixtureTeam:
    a = td.find("a", href=TEAM_LINK_RE)
    if a is None:
        raise LayoutChanged("fila del fixture sin enlace de equipo")
    m = TEAM_LINK_RE.search(a["href"])
    name = (td.select_one(".nombre-equipo") or a).get_text(" ", strip=True)
    return FixtureTeam(name=name, club_id=m.group(1), team_id=m.group(2))


def _with_crest(team: FixtureTeam, img) -> FixtureTeam:
    """Asocia la imagen del escudo de la fila del fixture (mismo idClub/idEquipo que el enlace del equipo)."""
    if img is not None and img.get("src"):
        m = re.match(r"/escudos/(\d+)/(\d+)", img["src"])
        if m and (m.group(1), m.group(2)) == (team.club_id, team.team_id):
            team.crest_src, team.crest_alt = img["src"], img.get("alt")
    return team


def _int_or_none(s: str) -> Optional[int]:
    s = s.strip()
    return int(s) if re.fullmatch(r"\d+", s) else None


def parse_fixture(html: str) -> list[FixtureGame]:
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("tr.fila-tabla-calendarios")
    games = []
    for tr in rows:
        names = tr.select("td.celda-nombre")
        crests = tr.select("td.celda-escudo img.escudo")
        scores = tr.select("td.resultados")
        when = tr.select_one("td.fecha-campo")
        if len(names) != 2 or len(scores) != 2 or when is None:
            raise LayoutChanged(f"fila del fixture con estructura inesperada: {tr.get_text(' ', strip=True)[:120]}")
        strong = when.find("strong")
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{1,2}:\d{2}))?", strong.get_text(" ", strip=True) if strong else "")
        if not m:
            raise LayoutChanged("fila del fixture sin fecha dd/mm/aaaa")
        hs, as_ = _int_or_none(scores[0].get_text()), _int_or_none(scores[1].get_text())
        if hs == 0 and as_ == 0:
            hs = as_ = None  # el sitio muestra 0-0 en partidos no jugados: no es un resultado
        venue = when.find("small")
        link = tr.find("a", href=GAME_LINK_RE)
        token = GAME_LINK_RE.search(link["href"]).group(1) if link else None
        games.append(FixtureGame(
            date=f"{m.group(3)}-{m.group(2)}-{m.group(1)}", time=m.group(4),
            venue=venue.get_text(" ", strip=True) if venue else None,
            home=_with_crest(_team_from_cell(names[0]), crests[0] if len(crests) == 2 else None),
            away=_with_crest(_team_from_cell(names[1]), crests[1] if len(crests) == 2 else None),
            home_score=hs, away_score=as_,
            url=urljoin(BASE, link["href"]) if link else None, token=token))
    return games


# ---------------------------------------------------------------- planilla

def pretty_name(raw: str) -> str:
    """'WHITFIELD III, ROBERT JAMARCUS' -> 'Whitfield III, Robert Jamarcus'; "D'AMARO" -> "D'Amaro"."""
    keep = {"II", "III", "IV"}

    def cap(w: str) -> str:
        if w.upper() in keep:
            return w.upper()
        if w.upper().rstrip(".") in ("JR", "SR"):
            return w.upper().rstrip(".").capitalize() + "."
        return "'".join(p[:1].upper() + p[1:].lower() for p in w.split("'"))

    return "".join(cap(t) if t.strip(" ,-") else t for t in re.split(r"(\s+|-|,)", raw.strip()))


def _player_json(onclick: str) -> dict:
    start = onclick.index("(") + 1
    data, _ = json.JSONDecoder().raw_decode(onclick[start:])
    return data


def _pair(d: Optional[dict]) -> tuple[Optional[int], Optional[int]]:
    if not d:
        return None, None
    return d.get("Aciertos"), d.get("Totales")


def player_from_json(d: dict) -> tuple[str, PlayerLine]:
    fg2m, fg2a = _pair(d.get("TirosDos"))
    fg3m, fg3a = _pair(d.get("TirosTres"))
    ftm, fta = _pair(d.get("TirosLibres"))
    minutes = parse_minutes(d.get("TiempoJuego"))
    stats = dict(
        minutes_sec=minutes, pts=d.get("Puntos"), fg2m=fg2m, fg2a=fg2a, fg3m=fg3m, fg3a=fg3a, ftm=ftm, fta=fta,
        oreb=d.get("ReboteOfensivo"), dreb=d.get("ReboteDefensivo"), reb=d.get("RebotesTotales"),
        ast=d.get("Asistencias"), stl=d.get("Recuperaciones"), tov=d.get("Perdidas"),
        blk=d.get("TaponCometido"), blka=d.get("TaponRecibido"), pf=d.get("FaltaCometida"),
        pfd=d.get("FaltaRecibida"), plus_minus=d.get("MasMenos"), eff=d.get("Valoracion"))
    name = pretty_name(d.get("NombreCompleto") or d.get("Nombre") or "")
    line = PlayerLine(side="?", name=name, source_id=str(d["IdJugador"]), jersey=(d.get("Dorsal") or None),
                      starter=bool(d.get("CincoInicial")), did_not_play=(minutes == 0), stats=stats)
    return str(d["IdClub"]), line


# Columnas de la fila "Totales" a partir de los minutos (verificado con el encabezado de 2º nivel).
TOTALS_SUBHEADERS = ["Min", "PTOS", "A/I", "%", "A/I", "%", "A/I", "%", "Def.", "Of.", "Total", "Total", "Total",
                     "Total", "Com.", "Rec.", "Com.", "Rec.", "Tot.", "Tot."]
TOTALS_FIELDS = ["minutes_sec", "pts", "fg2", None, "fg3", None, "ft", None, "dreb", "oreb", "reb", "ast", "stl",
                 "tov", "blk", "blka", "pf", "pfd", "eff", "plus_minus"]


def _cells(tr) -> list[str]:
    return [" ".join(c.get_text(" ", strip=True).split()) for c in tr.find_all(["th", "td"])]


def _parse_totals(table) -> dict:
    subhdr = table.find_all("tr")[1]
    labels = _cells(subhdr)[3:]
    if labels != TOTALS_SUBHEADERS:
        raise LayoutChanged(f"encabezados de la planilla cambiaron: {labels}")
    foot = table.select_one("tr.footer-tabla-estadistica")
    if foot is None:
        return {}
    vals = _cells(foot)[1:]  # la primera celda es "Totales" (colspan 3)
    if len(vals) != len(TOTALS_FIELDS):
        raise LayoutChanged(f"fila de totales con {len(vals)} columnas (se esperaban {len(TOTALS_FIELDS)})")
    out: dict[str, Optional[int]] = {}
    for f, v in zip(TOTALS_FIELDS, vals):
        if f is None:
            continue
        if f in ("fg2", "fg3", "ft"):
            m, a = parse_pair(v)
            key = {"fg2": ("fg2m", "fg2a"), "fg3": ("fg3m", "fg3a"), "ft": ("ftm", "fta")}[f]
            out[key[0]], out[key[1]] = m, a
        elif f == "minutes_sec":
            out[f] = parse_minutes(v)
        else:
            out[f] = int(v) if re.fullmatch(r"-?\d+", v) else None
    out["plus_minus"] = None  # el +/- de equipo publicado es 0 en todas las planillas vistas: no es informativo
    return out


@dataclass
class BoxScore:
    players: list[tuple[str, PlayerLine]] = field(default_factory=list)  # (IdClub, línea)
    totals: dict[str, dict] = field(default_factory=dict)                # IdClub -> totales
    club_order: list[str] = field(default_factory=list)                  # orden de las tablas en la página


def parse_boxscore(html: str) -> BoxScore:
    soup = BeautifulSoup(html, "html.parser")
    box = BoxScore()
    for table in soup.find_all("table"):
        # Filas de jugador: tienen el JSON en onclick. La fila de totales también, pero se lee aparte.
        rows = [tr for tr in table.find_all("tr") if (tr.get("onclick") or "").strip().startswith("EstadisticasComponente(")
                and "footer-tabla-estadistica" not in (tr.get("class") or [])]
        if not rows:
            continue
        clubs = set()
        for tr in rows:
            club, line = player_from_json(_player_json(tr["onclick"]))
            clubs.add(club)
            box.players.append((club, line))
        if len(clubs) != 1:
            raise LayoutChanged(f"una tabla de planilla mezcla jugadores de varios clubes: {clubs}")
        club = clubs.pop()
        box.club_order.append(club)
        box.totals[club] = _parse_totals(table)
    return box


def build_record(fx: FixtureGame, box: Optional[BoxScore], season: str, today: date) -> GameRecord:
    """Une los datos del fixture (equipos, fecha, resultado) con la planilla (si la hay)."""
    rec = GameRecord(
        source="laliganacional", season_code=season, date=fx.date, time=fx.time, venue=fx.venue,
        home_team=TeamRef(fx.home.name, fx.home.club_id), away_team=TeamRef(fx.away.name, fx.away.club_id),
        home_score=fx.home_score, away_score=fx.away_score, source_ref=fx.token, source_url=fx.url)
    gday = date.fromisoformat(fx.date)
    if fx.home_score is not None and fx.away_score is not None:
        if gday < today:
            rec.status = "final"
            rec.notes.append("estado final inferido: partido de un día anterior con resultado")
        else:
            rec.status = "unknown"  # podría estar en juego: se revisa en la próxima actualización
    else:
        rec.status = "scheduled" if gday >= today else "unknown"
    if box:
        side_of = {fx.home.club_id: "home", fx.away.club_id: "away"}
        for club, line in box.players:
            if club not in side_of:
                raise LayoutChanged(f"la planilla tiene un club ({club}) que no juega este partido")
            line.side = side_of[club]
            rec.players.append(line)
        for club, totals in box.totals.items():
            if totals:
                rec.team_totals[side_of[club]] = totals
    return rec


def parse_game_page(html: str, url: str, season_code: str, today: Optional[date] = None,
                    game_date: Optional[str] = None) -> GameRecord:
    """Procesa una ficha suelta (sin fixture), p. ej. un HTML guardado.

    Local = primer equipo del título ('LOCAL vs VISITANTE') y primera planilla de la página.
    La fecha no figura de forma fiable en la ficha: hay que pasarla con `game_date`.
    """
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    m = re.match(r"(.+?)\s+vs\.?\s+(.+?)(?:\s+\|.*)?$", title, flags=re.I)
    if not m:
        raise LayoutChanged(f"título sin 'LOCAL vs VISITANTE': {title!r}")
    if not game_date:
        raise ValueError("indicá la fecha del partido (--date AAAA-MM-DD): la ficha no la informa de forma fiable")
    box = parse_boxscore(html)
    if len(box.club_order) != 2:
        raise LayoutChanged(f"se esperaban 2 planillas y hay {len(box.club_order)}")
    hs, as_ = (box.totals.get(c, {}).get("pts") for c in box.club_order)
    path = urlparse(url).path.split("/")
    fx = FixtureGame(date=game_date, time=None, venue=None,
                     home=FixtureTeam(m.group(1).strip(), box.club_order[0], ""),
                     away=FixtureTeam(m.group(2).strip(), box.club_order[1], ""),
                     home_score=hs, away_score=as_, url=url, token=path[3] if len(path) > 3 else None)
    rec = build_record(fx, box, season_code, today or date.today())
    rec.notes.append("resultado tomado de los totales de la planilla")
    return rec


# ---------------------------------------------------------------- posiciones

@dataclass
class StandingRow:
    position: int; team: str; club_id: Optional[str]; pj: int; pg: int; pp: int; pf: int; pc: int; pts: int


def parse_standings(html: str) -> list[StandingRow]:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None:
        raise LayoutChanged("la tabla de posiciones no tiene <table>")
    header = _cells(table.find("tr"))
    expected = ["Posicion", "Equipo", "PJ", "PG", "PP", "PF", "PC", "PTOS"]
    if header[:8] != expected:
        raise LayoutChanged(f"encabezados de posiciones cambiaron: {header}")
    out = []
    for tr in table.find_all("tr")[1:]:
        c = _cells(tr)
        if len(c) < 8 or not c[0].isdigit():
            continue
        a = tr.find("a", href=TEAM_LINK_RE)
        out.append(StandingRow(int(c[0]), c[1], TEAM_LINK_RE.search(a["href"]).group(1) if a else None,
                               *[int(x) for x in c[2:8]]))
    return out


# ---------------------------------------------------------------- diagnóstico

def inspect_html(html: str, url: str) -> str:
    """Resumen de la estructura de una página para calibrar el parser."""
    soup = BeautifulSoup(html, "html.parser")
    out = [f"URL: {url}", f"Título: {soup.title.get_text(strip=True) if soup.title else '(sin título)'}",
           f"Tamaño HTML: {len(html)} bytes"]
    tables = soup.find_all("table")
    out.append(f"Tablas: {len(tables)}")
    for i, t in enumerate(tables):
        first = t.find("tr")
        hdr = _cells(first) if first else []
        n_json = sum(1 for tr in t.find_all("tr") if (tr.get("onclick") or "").startswith("EstadisticasComponente("))
        out.append(f"  [{i}] filas={len(t.find_all('tr'))} filas_con_json={n_json} encabezados={hdr[:18]}")
    fx = soup.select("tr.fila-tabla-calendarios")
    if fx:
        out.append(f"Filas de fixture: {len(fx)}")
    links = {urljoin(BASE, a['href']) for a in soup.find_all('a', href=True)}
    pats: dict[str, int] = {}
    for l in links:
        p = urlparse(l).path
        key = re.sub(r"/[A-Za-z0-9_\-]{12,}={0,2}(?=/|$)", "/{token}", re.sub(r"/\d+", "/{n}", p))
        pats[key] = pats.get(key, 0) + 1
    out.append("Patrones de enlaces:")
    out += [f"  {n:4d}  {k}" for k, n in sorted(pats.items(), key=lambda x: -x[1])[:25]]
    handlers = sorted(set(re.findall(r"handler=[A-Za-z]+[^`\"' ]{0,60}", html)))
    apis = sorted(set(re.findall(r"/api/[A-Za-z0-9_/${}]+", html)))
    out.append("Pedidos de datos que hace la página (handler= / api):")
    out += [f"  {h}" for h in handlers + apis] or ["  (ninguno)"]
    return "\n".join(out)


def daterange_chunks(start: date, end: date, days: int = 31):
    cur = start
    while cur <= end:
        nxt = min(end, cur + timedelta(days=days - 1))
        yield cur, nxt
        cur = nxt + timedelta(days=1)
