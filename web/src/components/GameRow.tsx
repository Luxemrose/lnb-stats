import { Link } from "react-router-dom";
import { ChevronRight, MapPin } from "lucide-react";
import type { Game } from "../lib/types";
import { fdate } from "../lib/format";
import { CrestBox } from "./Crest";

const STATUS: Record<Game["status"], string> = { final: "Final", scheduled: "", live: "En juego", unknown: "Sin confirmar" };

/** Fila de partido estilo marcador: fecha/hora, equipos apilados y resultado; el ganador resaltado. */
export function GameRow({ game, teamName, showVenue = false, highlightTeam }: {
  game: Game; teamName: (id: number) => string; showVenue?: boolean; highlightTeam?: number;
}) {
  const done = game.homeScore !== null && game.awayScore !== null && game.status === "final";
  const homeWin = done && (game.homeScore as number) > (game.awayScore as number);
  const line = (id: number, score: number | null, win: boolean) => (
    <CrestBox teamId={id} className="rounded-md">
      <div className="flex items-center gap-2.5 py-0.5 pl-8">
        <span className={`min-w-0 flex-1 truncate text-sm ${done && !win ? "text-ink-2" : "font-semibold"} ${highlightTeam === id ? "text-accent-text" : ""}`}>{teamName(id)}</span>
        <span className={`num w-8 text-right text-sm ${done && !win ? "text-muted" : "font-bold"}`}>{score ?? ""}</span>
      </div>
    </CrestBox>
  );
  return (
    <Link to={`/partidos/${game.id}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
      <div className="w-14 shrink-0 text-center">
        <div className="num text-xs font-medium text-ink-2">{fdate(game.date).slice(0, 5)}</div>
        <div className={`text-[11px] ${game.status === "final" ? "text-muted" : "font-medium text-accent-text"}`}>
          {game.status === "final" ? STATUS.final : game.status === "scheduled" ? game.time ?? "Prog." : STATUS[game.status]}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1 border-l border-line pl-2">
        {line(game.homeTeamId, game.homeScore, homeWin)}
        {line(game.awayTeamId, game.awayScore, done && !homeWin)}
        {showVenue && game.venue && <div className="flex items-center gap-1 pl-8 pt-0.5 text-[11px] text-muted"><MapPin size={11} />{game.venue}</div>}
      </div>
      <ChevronRight size={16} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
