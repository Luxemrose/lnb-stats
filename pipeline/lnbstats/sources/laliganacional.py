"""Adaptador para https://www.laliganacional.com.ar/laliga/

ESTADO: NO VERIFICADO CONTRA EL HTML REAL.
El entorno donde se escribió no tenía acceso a la web oficial. Lo que se sabe
(por resultados de buscador, octubre 2026):
- Fichas de partido:  /laliga/partido/{token}/{local-vs-visitante}
  (el token cambió de formato: '7HOd...==' antiguo, 'v2...==' nuevo -> no se usa como id estable)
- Planteles:          /laliga/equipo/{id}/{id}/{slug}/roster
- Fixture:            /laliga/fixture
- Las fichas muestran tabla por jugador (MIN, PTS, REB, AST, faltas, valoración, % de tiro).

Por eso el parser busca tablas por sus ENCABEZADOS (no por clases CSS) y el
comando `inspect` permite ver la estructura real antes de confiar en él.
"""
from __future__ import annotations

import os
import re
import time
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import date, datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..headers import map_header, parse_stat_cells
from ..models import GameRecord, PlayerLine, TeamRef, normalize_name

BASE = "https://www.laliganacional.com.ar"
FIXTURE_URL = f"{BASE}/laliga/fixture"
GAME_LINK_RE = re.compile(r"/laliga/partido/(?!jugadores-pista)([A-Za-z0-9_\-=]+)/([a-z0-9\-]+)")
PLAYER_ID_RE = re.compile(r"/jugador(?:es)?/(\d+)")
TEAM_ID_RE = re.compile(r"/laliga/equipo/(\d+)/")
USER_AGENT = "LNBStats/0.1 (analisis estadistico; uso no comercial; respeta robots.txt){contact}"


class SourceBlocked(Exception):
    """La fuente rechazó el acceso (403/429) o robots.txt lo prohíbe: hay que detenerse, no insistir."""


class PoliteFetcher:
    def __init__(self, cache_dir: Path, min_interval: float = 3.0, timeout: int = 25):
        contact = os.environ.get("LNB_CONTACT")
        self.ua = USER_AGENT.format(contact=f"; contacto: {contact}" if contact else "")
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self.timeout = timeout
        self._last = 0.0
        self._robots: Optional[urllib.robotparser.RobotFileParser] = None

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

    def get(self, url: str) -> str:
        self._check_robots(url)
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        last_err: Exception | None = None
        for attempt in range(3):
            self._last = time.monotonic()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": self.ua, "Accept-Language": "es-AR,es"})
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
                self._save_raw(url, html)
                return html
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

    def _save_raw(self, url: str, html: str) -> None:
        """Guarda el HTML original: permite re-procesar sin volver a pedirlo y auditar cambios."""
        day = datetime.now().strftime("%Y%m%d")
        name = re.sub(r"[^A-Za-z0-9_\-]+", "_", urlparse(url).path.strip("/"))[:180] or "index"
        path = self.cache_dir / day / f"{name}.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html, encoding="utf-8")


# ---------------------------------------------------------------- descubrimiento

def discover_game_urls(html: str) -> list[tuple[str, str]]:
    """Devuelve [(token, url_absoluta)] de fichas de partido encontradas en una página (fixture, portada)."""
    found: dict[str, str] = {}
    for m in GAME_LINK_RE.finditer(html):
        token, slug = m.group(1), m.group(2)
        found.setdefault(token, f"{BASE}/laliga/partido/{token}/{slug}")
    return list(found.items())


# ---------------------------------------------------------------- parser de ficha

def _cell_text(td) -> str:
    return " ".join(td.get_text(" ", strip=True).split())


def _header_cells(table) -> list[str]:
    thead = table.find("thead")
    row = thead.find("tr") if thead else table.find("tr")
    return [_cell_text(c) for c in row.find_all(["th", "td"])] if row else []


def _is_box_table(headers: list[str]) -> bool:
    targets = [map_header(h) for h in headers]
    has_name = "name" in targets or (headers and headers[0].strip() == "")
    n_stats = sum(1 for t in targets if t not in (None, "name", "jersey"))
    return bool(has_name) and n_stats >= 4


def _teams_from_page(soup, url: str) -> tuple[Optional[str], Optional[str]]:
    for text in [soup.title.get_text() if soup.title else "", *(h.get_text(" ") for h in soup.find_all(["h1", "h2"]))]:
        m = re.search(r"(.+?)\s+vs\.?\s+(.+)", text.strip(), flags=re.I)
        if m:
            away = re.split(r"\s+[|\-–]\s+", m.group(2))[0]
            return m.group(1).strip(), away.strip()
    slug = urlparse(url).path.rstrip("/").split("/")[-1]
    if "-vs-" in slug:
        a, b = slug.split("-vs-", 1)
        return a.replace("-", " ").upper(), b.replace("-", " ").upper()
    return None, None


def _side_for_table(table, home: str, away: str, index: int) -> str:
    hk, ak = normalize_name(home), normalize_name(away)
    for s in table.find_all_previous(string=True, limit=40):
        t = normalize_name(str(s))
        if not t:
            continue
        if hk and hk in t and not (ak and ak in t):
            return "home"
        if ak and ak in t and not (hk and hk in t):
            return "away"
    return "home" if index == 0 else "away"


def parse_game_page(html: str, url: str, season_code: str, today: Optional[date] = None) -> GameRecord:
    soup = BeautifulSoup(html, "html.parser")
    home, away = _teams_from_page(soup, url)
    if not home or not away:
        raise ValueError("no se encontraron los equipos (se esperaba 'LOCAL vs VISITANTE' en el título)")
    text = soup.get_text(" ", strip=True)
    m = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", text)
    if not m:
        raise ValueError("no se encontró la fecha del partido (dd/mm/aaaa)")
    game_date = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    rec = GameRecord(source="laliganacional", season_code=season_code, date=game_date,
                     home_team=TeamRef(home), away_team=TeamRef(away), source_url=url,
                     source_ref=urlparse(url).path.split("/")[3] if url.count("/") >= 5 else url)
    for a in soup.find_all("a", href=True):
        tm = TEAM_ID_RE.search(a["href"])
        if tm:
            label = normalize_name(a.get_text(" "))
            if label and label in normalize_name(home):
                rec.home_team.source_id = tm.group(1)
            elif label and label in normalize_name(away):
                rec.away_team.source_id = tm.group(1)

    box_tables = [t for t in soup.find_all("table") if _is_box_table(_header_cells(t))]
    for idx, table in enumerate(box_tables[:2]):
        side = _side_for_table(table, home, away, idx)
        headers = _header_cells(table)
        if headers and headers[0].strip() == "" and "name" not in [map_header(h) for h in headers]:
            headers[0] = "JUGADOR"
        body_rows = table.find("tbody").find_all("tr") if table.find("tbody") else table.find_all("tr")[1:]
        for tr in body_rows:
            tds = tr.find_all(["td", "th"])
            if len(tds) != len(headers):
                continue
            cells = {h: _cell_text(td) for h, td in zip(headers, tds)}
            stats, extra = parse_stat_cells(cells)
            name = extra.get("name", "")
            if not name:
                continue
            if normalize_name(name) in ("total", "totales", "equipo", "team"):
                rec.team_totals[side] = stats
                continue
            starter = None
            if name.startswith("*"):
                starter, name = True, name.lstrip("* ").strip()
            pid = None
            link = tr.find("a", href=True)
            if link:
                pm = PLAYER_ID_RE.search(link["href"])
                pid = pm.group(1) if pm else None
            rec.players.append(PlayerLine(side=side, name=name, source_id=pid, jersey=extra.get("jersey") or None,
                                          starter=starter, did_not_play=bool(extra.get("did_not_play")), stats=stats))

    # Resultado: preferimos el total oficial; si no está, la suma de puntos individuales (y lo anotamos).
    for side in ("home", "away"):
        score = rec.team_totals.get(side, {}).get("pts")
        if score is None:
            pts = [p.stats.get("pts") for p in rec.players if p.side == side and not p.did_not_play]
            if pts and None not in pts:
                score = sum(pts)
                rec.notes.append(f"resultado {side} = suma de puntos individuales")
        setattr(rec, f"{side}_score", score)

    today = today or date.today()
    if re.search(r"\bfinal(izado)?\b", text, flags=re.I) and rec.home_score is not None:
        rec.status = "final"
    elif rec.home_score is not None and date.fromisoformat(game_date) < today:
        rec.status = "final"
        rec.notes.append("estado 'final' inferido: partido de un día anterior con resultado")
    elif rec.home_score is None and date.fromisoformat(game_date) >= today:
        rec.status = "scheduled"
    return rec


# ---------------------------------------------------------------- diagnóstico

def inspect_html(html: str, url: str) -> str:
    """Resumen de la estructura de una página para calibrar el parser."""
    soup = BeautifulSoup(html, "html.parser")
    out = [f"URL: {url}", f"Título: {soup.title.get_text(strip=True) if soup.title else '(sin título)'}",
           f"Tamaño HTML: {len(html)} bytes"]
    tables = soup.find_all("table")
    out.append(f"Tablas: {len(tables)}")
    for i, t in enumerate(tables):
        hdr = _header_cells(t)
        out.append(f"  [{i}] filas={len(t.find_all('tr'))} box_score={_is_box_table(hdr)} encabezados={hdr}")
        out.append(f"       mapeo={[map_header(h) for h in hdr]}")
    links = {urljoin(BASE, a['href']) for a in soup.find_all('a', href=True)}
    pats: dict[str, int] = {}
    for l in links:
        p = urlparse(l).path
        key = re.sub(r"/[A-Za-z0-9_\-]{12,}={0,2}(?=/|$)", "/{token}", re.sub(r"/\d+", "/{n}", p))
        pats[key] = pats.get(key, 0) + 1
    out.append("Patrones de enlaces:")
    out += [f"  {n:4d}  {k}" for k, n in sorted(pats.items(), key=lambda x: -x[1])[:40]]
    scripts = [s.get("src") for s in soup.find_all("script") if s.get("src")]
    out.append("Scripts externos:")
    out += [f"  {s}" for s in scripts]
    hints = sorted(set(re.findall(r"""["'](https?://[^"']*(?:api|json|ajax|data|stats|genius|fiba)[^"']*)["']""", html, re.I)))
    hints += sorted(set(re.findall(r"""["'](/[^"']*(?:api|json|ajax)[^"']*)["']""", html, re.I)))
    out.append("Posibles endpoints de datos mencionados en el HTML (sin verificar):")
    out += [f"  {h}" for h in hints[:40]] or ["  (ninguno)"]
    m = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", soup.get_text(" "))
    out.append(f"Primera fecha dd/mm/aaaa encontrada: {m.group(0) if m else '(ninguna)'}")
    return "\n".join(out)
