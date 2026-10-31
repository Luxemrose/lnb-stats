import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, BarChart3 } from "lucide-react";
import { CalculatedTable, StandingsCard } from "../components/Standings";
import { CrestBox } from "../components/Crest";
import { Card, Origin, PageHeader, ResultPill } from "../components/ui";
import { useSeason } from "../lib/data";
import { f1, pct, signed } from "../lib/format";
import { standings } from "../lib/stats";

export default function Teams() {
  const sd = useSeason();
  const rows = useMemo(() => (sd ? standings(sd.teamIds, sd.games) : []), [sd]);
  if (!sd) return null;
  const official = new Map((sd.db.ds.officialStandings ?? []).filter((o) => o.seasonId === sd.seasonId).map((o) => [o.teamId, o]));
  const ordered = [...sd.teamIds].sort((a, b) => (official.get(a)?.position ?? 99) - (official.get(b)?.position ?? 99) ||
    rows.findIndex((r) => r.teamId === a) - rows.findIndex((r) => r.teamId === b));
  const rec = new Map(rows.map((r) => [r.teamId, r]));

  return (
    <div className="space-y-6">
      <PageHeader title="Equipos" subtitle={`Temporada ${sd.season.code} · ${sd.teamIds.length} equipos`}
        actions={<Link className="btn btn-primary" to="/equipos/comparar"><ArrowLeftRight size={15} /> Comparar equipos</Link>} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {ordered.map((id) => {
          const t = sd.db.teamsById.get(id)!;
          const r = rec.get(id);
          const o = official.get(id);
          return (
            <Link key={id} to={`/equipos/${id}`} className="card card-hover block overflow-hidden">
              <CrestBox teamId={id} size="card" className="rounded-[13px]">
              <div className="flex items-center gap-3.5 p-4 pl-[72px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {o && <span className="num text-xs font-semibold text-muted">{o.position}.º</span>}
                  <span className="truncate font-semibold">{t.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-2">
                  <span className="num font-semibold text-ink">{r ? `${r.wins}-${r.losses}` : "0-0"}</span>
                  <span>{pct(r?.winPct ?? null)}</span>
                  <span className={`num ${r && r.diff > 0 ? "text-good" : r && r.diff < 0 ? "text-bad" : ""}`}>{r ? signed(r.diff, 0) : ""}</span>
                </div>
              </div>
              <div className="hidden flex-col items-end gap-1.5 sm:flex">
                <span className="flex gap-0.5">{(r?.last5 ?? []).map((x, i) => <ResultPill key={i} r={x} />)}</span>
                <span className="num text-[11px] text-muted">{r ? `${f1(r.pfPerGame)} PF · ${f1(r.paPerGame)} PC` : ""}</span>
              </div>
              </div>
              </CrestBox>
            </Link>
          );
        })}
      </div>

      <StandingsCard sd={sd} />
      <Card icon={BarChart3} title={<span className="flex items-center gap-2">Local, visitante y racha <Origin kind="calculado" /></span>}
        subtitle="Calculado con los partidos finalizados almacenados. En naranja, el mejor valor de cada columna.">
        <CalculatedTable rows={rows} team={(i) => sd.db.teamsById.get(i)!} />
      </Card>
    </div>
  );
}
