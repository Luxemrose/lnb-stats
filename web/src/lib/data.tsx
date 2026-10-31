import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Dataset, Game, PlayerGameRow, Roster, Team, Player, TeamGameRow } from "./types";

export type Mode = "real" | "demo";
export type DatedRow = PlayerGameRow & { date: string; game: Game };

export interface Db {
  ds: Dataset;
  mode: Mode;
  teamsById: Map<number, Team>;
  playersById: Map<number, Player>;
  gamesById: Map<number, Game>;
  /** filas jugador-partido con fecha, ordenadas cronológicamente */
  rowsByPlayer: Map<number, DatedRow[]>;
  rowsByGame: Map<number, PlayerGameRow[]>;
  teamRowsByGame: Map<number, TeamGameRow[]>;
}

interface Ctx {
  db: Db | null;
  error: string | null;
  loading: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  seasonId: number | null;
  setSeasonId: (id: number) => void;
  reload: () => void;
}

const DataCtx = createContext<Ctx | null>(null);

function readMode(): Mode {
  try {
    const q = new URLSearchParams(window.location.search).get("modo");
    if (q === "demo" || q === "real") return q;
    return localStorage.getItem("lnb-mode") === "demo" ? "demo" : "real";
  } catch { return "real"; }
}

function index(ds: Dataset, mode: Mode): Db {
  const gamesById = new Map(ds.games.map((g) => [g.id, g]));
  const rowsByPlayer = new Map<number, DatedRow[]>();
  const rowsByGame = new Map<number, PlayerGameRow[]>();
  for (const r of ds.playerStats) {
    const game = gamesById.get(r.gameId);
    if (!game) continue;
    const list = rowsByPlayer.get(r.playerId) ?? [];
    list.push({ ...r, date: game.date, game });
    rowsByPlayer.set(r.playerId, list);
    const gl = rowsByGame.get(r.gameId) ?? [];
    gl.push(r);
    rowsByGame.set(r.gameId, gl);
  }
  for (const l of rowsByPlayer.values()) l.sort((a, b) => a.date.localeCompare(b.date) || a.gameId - b.gameId);
  const teamRowsByGame = new Map<number, TeamGameRow[]>();
  for (const r of ds.teamStats) teamRowsByGame.set(r.gameId, [...(teamRowsByGame.get(r.gameId) ?? []), r]);
  return {
    ds, mode, gamesById, rowsByPlayer, rowsByGame, teamRowsByGame,
    teamsById: new Map(ds.teams.map((t) => [t.id, t])),
    playersById: new Map(ds.players.map((p) => [p.id, p])),
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fetch(`./data/${mode}.json`, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Dataset>; })
      .then((ds) => {
        if (!alive) return;
        const built = index(ds, mode);
        setDb(built);
        // temporada por defecto: la más reciente que tenga partidos
        const withGames = ds.seasons.filter((s) => ds.games.some((g) => g.seasonId === s.id));
        setSeasonId((withGames[0] ?? ds.seasons[0])?.id ?? null);
      })
      .catch((e) => alive && setError(`No pudimos cargar las estadísticas (${e.message}). Revisá tu conexión e intentá de nuevo.`))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mode, nonce]);

  const setMode = (m: Mode) => {
    try { localStorage.setItem("lnb-mode", m); } catch { /* sin almacenamiento: sólo para esta sesión */ }
    setModeState(m);
  };

  return <DataCtx.Provider value={{ db, error, loading, mode, setMode, seasonId, setSeasonId, reload: () => setNonce((n) => n + 1) }}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData fuera de DataProvider");
  return c;
}

/** Datos ya filtrados por la temporada seleccionada. */
export function useSeason() {
  const { db, seasonId } = useData();
  return useMemo(() => {
    if (!db || seasonId === null) return null;
    const games = db.ds.games.filter((g) => g.seasonId === seasonId);
    const gameIds = new Set(games.map((g) => g.id));
    const rosters: Roster[] = db.ds.rosters.filter((r) => r.seasonId === seasonId);
    const teamIds = [...new Set(games.flatMap((g) => [g.homeTeamId, g.awayTeamId]))];
    const rowsForPlayer = (pid: number): DatedRow[] => (db.rowsByPlayer.get(pid) ?? []).filter((r) => gameIds.has(r.gameId));
    return { db, seasonId, season: db.ds.seasons.find((s) => s.id === seasonId)!, games, gameIds, rosters, teamIds, rowsForPlayer };
  }, [db, seasonId]);
}

export type SeasonData = NonNullable<ReturnType<typeof useSeason>>;
