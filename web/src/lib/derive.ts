import type { DatedRow, SeasonData } from "./data";
import { aggregate, filterPeriod, isCompleted, type Aggregate, type Period } from "./stats";
import { STAT_KEYS, type Game, type StatLine } from "./types";

export interface PlayerSummary {
  playerId: number; name: string; teamIds: number[]; currentTeamId: number | null; position: string | null;
  jersey: string | null; agg: Aggregate; rows: DatedRow[];
}

/** Filas disputadas por un jugador en la temporada, opcionalmente filtradas por período. */
export function playerRows(sd: SeasonData, playerId: number, period: Period = {}): DatedRow[] {
  const rows = sd.rowsForPlayer(playerId).filter((r) => !r.dnp);
  return filterPeriod(rows, period);
}

export function playerSummaries(sd: SeasonData, period: Period = {}): PlayerSummary[] {
  const ids = new Set(sd.rosters.map((r) => r.playerId));
  const out: PlayerSummary[] = [];
  for (const pid of ids) {
    const player = sd.db.playersById.get(pid);
    if (!player) continue;
    const rosterRows = sd.rosters.filter((r) => r.playerId === pid).sort((a, b) => a.lastSeen.localeCompare(b.lastSeen));
    const current = rosterRows[rosterRows.length - 1];
    const rows = playerRows(sd, pid, period);
    out.push({
      playerId: pid, name: player.name, teamIds: rosterRows.map((r) => r.teamId), currentTeamId: current?.teamId ?? null,
      position: current?.position ?? null, jersey: current?.jersey ?? null,
      agg: aggregate(rows, rows.map((r) => r.date)), rows,
    });
  }
  return out;
}

export interface TeamGameLine {
  game: Game; isHome: boolean; opponentId: number; own: number | null; opp: number | null;
  win: boolean | null; stats: StatLine | null; statsOrigin: "oficial" | "calculado" | null; date: string;
}

function sumLines(lines: StatLine[]): StatLine {
  const out = {} as StatLine;
  for (const k of STAT_KEYS) {
    const vals = lines.map((l) => l[k]);
    // Si algún jugador no tiene el dato, el total del equipo es desconocido.
    out[k] = vals.length && vals.every((v) => v !== null) ? (vals as number[]).reduce((a, b) => a + b, 0) : null;
  }
  out.plus_minus = null; // el +/- de equipo no es la suma de los individuales
  return out;
}

/** Partidos de un equipo con sus estadísticas colectivas: oficiales si la fuente las publica, si no, suma de jugadores. */
export function teamGames(sd: SeasonData, teamId: number): TeamGameLine[] {
  return sd.games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((g) => {
      const isHome = g.homeTeamId === teamId;
      const own = isHome ? g.homeScore : g.awayScore;
      const opp = isHome ? g.awayScore : g.homeScore;
      const official = sd.db.teamRowsByGame.get(g.id)?.find((t) => t.teamId === teamId) ?? null;
      let stats: StatLine | null = official;
      let statsOrigin: TeamGameLine["statsOrigin"] = official ? "oficial" : null;
      if (!official) {
        const lines = (sd.db.rowsByGame.get(g.id) ?? []).filter((r) => r.teamId === teamId && !r.dnp);
        if (lines.length) { stats = sumLines(lines); statsOrigin = "calculado"; }
      }
      return {
        game: g, isHome, opponentId: isHome ? g.awayTeamId : g.homeTeamId, own, opp, date: g.date,
        win: isCompleted(g) ? (own as number) > (opp as number) : null, stats, statsOrigin,
      };
    });
}

/** Agregado colectivo de un equipo (sólo partidos finalizados con estadísticas). */
export function teamAggregate(lines: TeamGameLine[]): Aggregate {
  const withStats = lines.filter((l) => l.win !== null && l.stats);
  return aggregate(withStats.map((l) => ({ ...(l.stats as StatLine), dnp: 0 })), withStats.map((l) => l.date));
}

/** Estadísticas del rival en los partidos de un equipo (para promedios defensivos). */
export function opponentLines(sd: SeasonData, teamId: number): TeamGameLine[] {
  return teamGames(sd, teamId).map((l) => {
    const oppLine = teamGames(sd, l.opponentId).find((o) => o.game.id === l.game.id);
    return oppLine ?? l;
  });
}
