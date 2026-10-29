// Tipos del JSON que genera el pipeline (pipeline/lnbstats/export.py).
// Regla: `null` = dato no disponible. `0` = el valor fue cero.

export const STAT_KEYS = [
  "minutes_sec", "pts", "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta",
  "oreb", "dreb", "reb", "ast", "stl", "tov", "blk", "blka", "pf", "pfd", "plus_minus", "eff",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatLine = Record<StatKey, number | null>;

export interface Season { id: number; code: string; name: string }
export interface Team { id: number; name: string; slug: string; sourceId: string | null }
export interface Player { id: number; name: string; sourceId: string | null; identity: "source_id" | "name" }
export interface Roster {
  seasonId: number; teamId: number; playerId: number; jersey: string | null; position: string | null;
  source: string; firstSeen: string; lastSeen: string;
}
export interface Game {
  id: number; seasonId: number; date: string; time: string | null; phase: string | null; round: string | null;
  venue: string | null; homeTeamId: number; awayTeamId: number; homeScore: number | null; awayScore: number | null;
  status: "final" | "scheduled" | "live" | "unknown"; detailLevel: "box_score" | "result_only" | "scheduled";
  source: string; sourceUrl: string | null; revision: number; updatedAt: string;
}
export interface PlayerGameRow extends StatLine {
  gameId: number; playerId: number; teamId: number; starter: number | null; dnp: number;
}
export interface TeamGameRow extends StatLine { gameId: number; teamId: number; isHome: number }
export interface SyncLog {
  id: number; source: string; scope: string | null; started_at: string; finished_at: string | null;
  status: "running" | "success" | "partial" | "failed"; games_new: number; games_updated: number;
  games_unchanged: number; games_rejected: number; message: string | null;
}
export interface OpenError { id: number; stage: string; ref: string | null; message: string; createdAt: string; retryCount: number }

export interface Dataset {
  meta: {
    mode: "real" | "demo"; generatedAt: string; lastSuccessfulSync: SyncLog | null;
    sourceName: string; sourceUrl: string | null;
  };
  seasons: Season[]; teams: Team[]; players: Player[]; rosters: Roster[]; games: Game[];
  playerStats: PlayerGameRow[]; teamStats: TeamGameRow[]; syncLogs: SyncLog[]; openErrors: OpenError[];
}
