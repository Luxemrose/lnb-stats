import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CornerDownLeft, Search, SearchX, Shield, UserRound, X } from "lucide-react";
import { useData } from "../lib/data";
import { CrestLayer } from "./Crest";
import { fdate } from "../lib/format";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9/ ]/g, " ").trim();

interface Hit { kind: "player" | "team" | "game"; id: number; label: string; sub: string; to: string; teamId?: number | null }

/** Buscador global (Ctrl/Cmd + K o "/"): jugadores, equipos y partidos. */
export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const { db, seasonId } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const index = useMemo(() => {
    if (!db) return null;
    const teamName = (id: number) => db.teamsById.get(id)?.name ?? "";
    // equipo más reciente de cada jugador (en la temporada activa si figura)
    const lastTeam = new Map<number, number>();
    for (const r of [...db.ds.rosters].sort((a, b) => (a.seasonId === seasonId ? 1 : 0) - (b.seasonId === seasonId ? 1 : 0) || a.lastSeen.localeCompare(b.lastSeen))) {
      lastTeam.set(r.playerId, r.teamId);
    }
    return {
      players: db.ds.players.map((p) => ({ id: p.id, label: p.name, key: norm(p.name), sub: teamName(lastTeam.get(p.id) ?? -1), teamId: lastTeam.get(p.id) ?? null })),
      teams: db.ds.teams.map((t) => ({ id: t.id, label: t.name, key: norm(t.name) })),
      games: db.ds.games.map((g) => ({
        g, key: norm(`${teamName(g.homeTeamId)} ${teamName(g.awayTeamId)} ${fdate(g.date)}`),
        label: `${teamName(g.homeTeamId)} ${g.homeScore ?? ""}${g.homeScore !== null ? " - " : " vs "}${g.awayScore ?? ""} ${teamName(g.awayTeamId)}`.replace(/\s+/g, " "),
      })),
    };
  }, [db, seasonId]);

  const hits: Hit[] = useMemo(() => {
    const n = norm(q);
    if (!index || n.length < 2) return [];
    const words = n.split(/\s+/);
    const has = (key: string) => words.every((w) => key.includes(w));
    const players = index.players.filter((p) => has(p.key)).slice(0, 6)
      .map((p): Hit => ({ kind: "player", id: p.id, label: p.label, sub: p.sub || "Jugador", to: `/jugadores/${p.id}`, teamId: p.teamId }));
    const teams = index.teams.filter((t) => has(t.key)).slice(0, 5)
      .map((t): Hit => ({ kind: "team", id: t.id, label: t.label, sub: "Equipo", to: `/equipos/${t.id}`, teamId: t.id }));
    const games = index.games.filter((x) => has(x.key)).sort((a, b) => b.g.date.localeCompare(a.g.date)).slice(0, 6)
      .map((x): Hit => ({ kind: "game", id: x.g.id, label: x.label, sub: fdate(x.g.date), to: `/partidos/${x.g.id}` }));
    return [...players, ...teams, ...games];
  }, [q, index]);

  useEffect(() => { setIdx(0); }, [q]);
  const go = (h: Hit) => { navigate(h.to); onClose(); };
  const icon = { player: UserRound, team: Shield, game: CalendarDays };
  const groupLabel = { player: "Jugadores", team: "Equipos", game: "Partidos" };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 px-3 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugadores, equipos o partidos…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && hits[idx]) go(hits[idx]);
            }} />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Cerrar buscador"><X size={16} /></button>
        </div>
        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 && (
            <div className="px-3 py-6 text-center text-sm text-muted">
              Escribí al menos 2 letras. Probá con un apellido, un equipo o dos equipos juntos (por ejemplo, <span className="text-ink-2">boca quimsa</span>).
            </div>
          )}
          {q.trim().length >= 2 && !hits.length && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-sm text-muted"><SearchX size={22} />Sin resultados para "{q}".</div>
          )}
          {hits.map((h, i) => {
            const Ico = icon[h.kind];
            const first = i === 0 || hits[i - 1].kind !== h.kind;
            return (
              <div key={`${h.kind}-${h.id}`}>
                {first && <div className="eyebrow px-3 pb-1 pt-3">{groupLabel[h.kind]}</div>}
                <button onMouseEnter={() => setIdx(i)} onClick={() => go(h)}
                  className={`relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left ${i === idx ? "bg-surface-2" : ""}`}>
                  {h.teamId ? <CrestLayer teamId={h.teamId} /> : null}
                  <span className="crest-content grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-2">{h.teamId ? null : <Ico size={15} />}</span>
                  <span className="crest-content min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.label}</span>
                    <span className="block truncate text-xs text-muted">{h.sub}</span>
                  </span>
                  {i === idx && <CornerDownLeft size={14} className="text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span><kbd className="font-sans">↑ ↓</kbd> moverse</span><span><kbd className="font-sans">Enter</kbd> abrir</span><span><kbd className="font-sans">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
