"""Escudos oficiales de los equipos (fuente: laliganacional.com.ar).

Origen verificado (31/10/2026): cada fila del fixture muestra el escudo con
  <img class="escudo" src="/escudos/{idClub}/{idEquipo}" alt="{NOMBRE DEL EQUIPO}">
y el mismo idClub/idEquipo aparece en el enlace del equipo de esa fila. La imagen es
un JPEG (~200x200) con fondo liso (negro en casi todos, blanco en alguno).

Procesamiento: se quita SÓLO el fondo liso conectado con los bordes (para que el escudo
se integre con el fondo de la app) y se recorta al contorno. El dibujo no se altera.
Los archivos quedan en web/public/escudos/{idClub}-{idEquipo}.webp (WebP con transparencia, ~8 KB)
y se descargan una sola vez.
"""
from __future__ import annotations

import html
import io
from pathlib import Path
from typing import Optional

from .models import normalize_name

BASE = "https://www.laliganacional.com.ar"
TOLERANCE = 46   # distancia de color para considerar "fondo" (absorbe artefactos JPEG)
MAX_SIDE = 160


def crest_filename(club_id: str, team_id: str) -> str:
    return f"{club_id}-{team_id}.webp"


def remove_flat_background(data: bytes) -> bytes:
    """JPEG/PNG -> WebP con transparencia donde estaba el fondo liso que toca los bordes."""
    from PIL import Image, ImageDraw, ImageFilter

    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    # Color de fondo: el más frecuente entre las 4 esquinas.
    corners = [im.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    bg = max(set(corners), key=corners.count)

    # Marcamos con un color "imposible" todo lo conectado al borde y parecido al fondo.
    marker = (255, 0, 255)
    work = im.copy()
    seeds = [(x, 0) for x in range(0, w, 4)] + [(x, h - 1) for x in range(0, w, 4)] + \
            [(0, y) for y in range(0, h, 4)] + [(w - 1, y) for y in range(0, h, 4)]
    for sx, sy in seeds:
        px = work.getpixel((sx, sy))
        if px != marker and sum((a - b) ** 2 for a, b in zip(px, bg)) ** 0.5 <= TOLERANCE:
            ImageDraw.floodfill(work, (sx, sy), marker, thresh=TOLERANCE)

    alpha = Image.new("L", (w, h), 255)
    a_px, w_px = alpha.load(), work.load()
    for y in range(h):
        for x in range(w):
            if w_px[x, y] == marker:
                a_px[x, y] = 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))  # bordes suaves, sin dentado
    out = im.convert("RGBA")
    out.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        out = out.crop(bbox)
    out.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    out.save(buf, format="WEBP", quality=86, method=6)
    return buf.getvalue()


def alt_matches(alt: Optional[str], team_name: str) -> bool:
    """El texto alternativo de la imagen debe nombrar al mismo equipo."""
    return bool(alt) and normalize_name(html.unescape(alt)) == normalize_name(team_name)


def ensure_crest(fetcher, out_dir: Path, club_id: str, team_id: str, crest_src: Optional[str],
                 crest_alt: Optional[str], team_name: str) -> tuple[Optional[str], Optional[str]]:
    """Devuelve (archivo, error). Descarga sólo si el archivo todavía no existe."""
    name = crest_filename(club_id, team_id)
    path = out_dir / name
    if path.exists():
        return name, None
    if not crest_src:
        return None, "el fixture no muestra escudo para este equipo"
    if not alt_matches(crest_alt, team_name):
        return None, f"el texto de la imagen ({crest_alt!r}) no coincide con el equipo ({team_name!r})"
    data = fetcher.get_bytes(f"{BASE}{crest_src}")
    if not (data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n"):
        return None, "la respuesta no es una imagen JPEG/PNG"
    out_dir.mkdir(parents=True, exist_ok=True)
    path.write_bytes(remove_flat_background(data))
    return name, None
