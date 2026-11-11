import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REMOTE_BASE, appDataMode, fetchWithTimeout, hideSplash, onConnectivityChange, readCache, writeCache } from "./native";
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
  /** Escudo oficial por temporada y equipo ("temporada:equipo") y, como respaldo, el más reciente de cada equipo. */
  crestBySeasonTeam: Map<string, string>;
  crestByTeam: Map<number, string>;
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
  /** App: vuelve a consultar el sitio publicado. Devuelve si pudo. */
  refresh: () => Promise<boolean>;
  sync: SyncState;
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
  const crestBySeasonTeam = new Map<string, string>();
  const crestByTeam = new Map<number, string>();
  for (const ts of [...(ds.teamSeasons ?? [])].sort((a, b) => a.seasonId - b.seasonId)) {
    if (!ts.crest) continue;
    crestBySeasonTeam.set(`${ts.seasonId}:${ts.teamId}`, ts.crest);
    crestByTeam.set(ts.teamId, ts.crest);
  }
  return {
    ds, mode, gamesById, rowsByPlayer, rowsByGame, teamRowsByGame, crestBySeasonTeam, crestByTeam,
    teamsById: new Map(ds.teams.map((t) => [t.id, t])),
    playersById: new Map(ds.players.map((p) => [p.id, p])),
  };
}

/** Estado de la actualización de datos (sólo relevante en la app, que trabaja también sin conexión). */
export interface SyncState {
  /** de dónde salen los datos que se ven ahora */
  source: "remoto" | "copia-local" | "incluido" | null;
  checking: boolean;
  offline: boolean;
  /** último intento exitoso de consultar el sitio publicado */
  lastCheck: string | null;
  error: string | null;
}

function newest(a: Dataset | null, b: Dataset | null): Dataset | null {
  if (!a) return b;
  if (!b) return a;
  return (b.meta.generatedAt ?? "") > (a.meta.generatedAt ?? "") ? b : a;
}

function parseDataset(text: string | null): Dataset | null {
  if (!text) return null;
  try { const d = JSON.parse(text) as Dataset; return d && d.meta && Array.isArray(d.games) ? d : null; } catch { return null; }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(readMode);
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const [sync, setSync] = useState<SyncState>({ source: null, checking: false, offline: false, lastCheck: null, error: null });
  const current = useRef<Dataset | null>(null);
  const seasonRef = useRef<number | null>(null);
  seasonRef.current = seasonId;

  const apply = useCallback((ds: Dataset, m: Mode) => {
    current.current = ds;
    setDb(index(ds, m));
    // temporada: se conserva la elegida si sigue existiendo; si no, la más reciente con partidos
    if (seasonRef.current === null || !ds.seasons.some((s) => s.id === seasonRef.current)) {
      const withGames = ds.seasons.filter((s) => ds.games.some((g) => g.seasonId === s.id));
      setSeasonId((withGames[0] ?? ds.seasons[0])?.id ?? null);
    }
  }, []);

  /** Consulta el sitio publicado; si hay datos más nuevos, los muestra y los guarda para usar sin conexión. */
  const refreshRemote = useCallback(async (): Promise<boolean> => {
    setSync((s) => ({ ...s, checking: true }));
    try {
      const r = await fetchWithTimeout(`${REMOTE_BASE}data/real.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const ds = parseDataset(text);
      if (!ds) throw new Error("respuesta inválida");
      // Se muestra sólo si es más nuevo que lo que ya se ve; la copia local se guarda siempre,
      // así la próxima apertura sin conexión tiene los datos más recientes que se descargaron.
      if (newest(current.current, ds) === ds && ds !== current.current) apply(ds, "real");
      void writeCache("real.json", text);
      setSync({ source: "remoto", checking: false, offline: false, lastCheck: new Date().toISOString(), error: null });
      return true;
    } catch (e) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setSync((s) => ({ ...s, checking: false, offline: true, error: offline ? "Sin conexión" : `No se pudo actualizar (${(e as Error).message})` }));
      return false;
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const finish = () => { if (alive) { setLoading(false); void hideSplash(); } };

    if (mode === "demo" || !appDataMode) {
      // Web (y demo): los datos se sirven junto con la página, como siempre.
      fetch(`./data/${mode}.json`, { cache: "no-cache" })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Dataset>; })
        .then((ds) => { if (alive) { apply(ds, mode); setSync((s) => ({ ...s, source: "incluido" })); } })
        .catch((e) => alive && setError(`No pudimos cargar las estadísticas (${e.message}). Revisá tu conexión e intentá de nuevo.`))
        .finally(finish);
      return () => { alive = false; };
    }

    // App: primero lo que ya está en el teléfono (copia guardada o datos incluidos), después el sitio.
    (async () => {
      const [cachedText, bundled] = await Promise.all([
        readCache("real.json"),
        fetch("./data/real.json").then((r) => (r.ok ? (r.json() as Promise<Dataset>) : null)).catch(() => null),
      ]);
      const cached = parseDataset(cachedText);
      const initial = newest(cached, bundled);
      if (!alive) return;
      if (initial) {
        apply(initial, "real");
        setSync((s) => ({ ...s, source: initial === cached ? "copia-local" : "incluido" }));
        finish();
      }
      const ok = await refreshRemote();
      if (!alive) return;
      if (!initial && !ok) setError("No hay conexión y todavía no hay datos guardados en el teléfono. Conectate a internet y tocá Reintentar.");
      if (!initial) finish();
    })();
    return () => { alive = false; };
  }, [mode, nonce, apply, refreshRemote]);

  // App: al volver la conexión, o al volver a la app después de un rato, se buscan datos nuevos.
  useEffect(() => {
    if (!appDataMode || mode === "demo") return;
    const off = onConnectivityChange((online) => {
      setSync((s) => ({ ...s, offline: !online }));
      if (online) void refreshRemote();
    });
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const last = sync.lastCheck ? Date.parse(sync.lastCheck) : 0;
      if (Date.now() - last > 20 * 60 * 1000) void refreshRemote();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { off(); document.removeEventListener("visibilitychange", onVisible); };
  }, [mode, refreshRemote, sync.lastCheck]);

  const setMode = (m: Mode) => {
    try { localStorage.setItem("lnb-mode", m); } catch { /* sin almacenamiento: sólo para esta sesión */ }
    setModeState(m);
  };

  return (
    <DataCtx.Provider value={{
      db, error, loading, mode, setMode, seasonId, setSeasonId, sync,
      reload: () => setNonce((n) => n + 1),
      refresh: () => (appDataMode && mode === "real" ? refreshRemote() : Promise.resolve(false)),
    }}>{children}</DataCtx.Provider>
  );
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
