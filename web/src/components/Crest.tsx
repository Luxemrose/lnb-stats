import { useState, type ReactNode } from "react";
import { useData } from "../lib/data";
import { REMOTE_BASE, isNative } from "../lib/native";

/**
 * Escudos oficiales (descargados de laliganacional.com.ar por el pipeline, ver pipeline/lnbstats/crests.py).
 *
 * - useCrest(teamId): escudo del equipo en la temporada activa (si no hay, el más reciente del equipo).
 * - <CrestLayer>: capa decorativa absoluta con el escudo a la izquierda, desvanecido hacia la derecha.
 *   Se ubica contra el ancestro posicionado más cercano (las celdas de DataTable ya lo son).
 * - <CrestCell>: para usar dentro de una celda de tabla: capa + contenido por encima.
 * - <CrestBox>: contenedor propio (tarjetas, filas de listas).
 *
 * Si una imagen no carga, se recuerda el fallo (no se reintenta en esta visita) y no se muestra nada:
 * el contenido sigue igual, sin espacios vacíos.
 */

const failed = new Set<string>();

export function useCrest(teamId: number | null | undefined, seasonId?: number | null): string | null {
  const { db, seasonId: active } = useData();
  if (!db || teamId === null || teamId === undefined) return null;
  const s = seasonId ?? active;
  const url = (s !== null && s !== undefined ? db.crestBySeasonTeam.get(`${s}:${teamId}`) : undefined) ?? db.crestByTeam.get(teamId) ?? null;
  return url && !failed.has(url) ? url : null;
}

/**
 * En la app, los escudos vienen incluidos. Si falta uno (equipo nuevo después de compilar la app),
 * se pide al sitio publicado; si tampoco carga, no se muestra nada.
 */
export function useCrestSrc(url: string | null): [string | null, () => void] {
  const [attempt, setAttempt] = useState(0);
  if (!url) return [null, () => {}];
  const src = attempt === 0 ? url : attempt === 1 && isNative ? `${REMOTE_BASE}${url}` : null;
  const onError = () => {
    if (attempt === 0 && isNative) setAttempt(1);
    else { failed.add(url); setAttempt(2); }
  };
  return [src, onError];
}

export function CrestLayer({ teamId, seasonId, size = "cell" }: { teamId: number | null | undefined; seasonId?: number | null; size?: "cell" | "card" | "hero" }) {
  const [src, onError] = useCrestSrc(useCrest(teamId, seasonId));
  if (!src) return null;
  return (
    <span aria-hidden className={`crest-layer crest-${size}`}>
      <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={onError} />
    </span>
  );
}

/** Contenido de una celda de tabla con el escudo de fondo (la celda debe estar posicionada: DataTable ya lo hace). */
export function CrestCell({ teamId, seasonId, children }: { teamId: number | null | undefined; seasonId?: number | null; children: ReactNode }) {
  return (
    <>
      <CrestLayer teamId={teamId} seasonId={seasonId} />
      <span className="crest-content">{children}</span>
    </>
  );
}

/** Contenedor con escudo de fondo para tarjetas y filas fuera de tablas. */
export function CrestBox({ teamId, seasonId, children, className = "", size = "cell" }: {
  teamId: number | null | undefined; seasonId?: number | null; children: ReactNode; className?: string; size?: "cell" | "card" | "hero";
}) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <CrestLayer teamId={teamId} seasonId={seasonId} size={size} />
      <div className="crest-content">{children}</div>
    </div>
  );
}
