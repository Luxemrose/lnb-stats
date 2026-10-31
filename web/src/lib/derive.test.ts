import { describe, expect, it } from "vitest";
import { contextTeam } from "./derive";
import type { DatedRow } from "./data";

const row = (teamId: number, date: string) => ({ teamId, date } as unknown as DatedRow);

describe("contextTeam (escudo del jugador según el contexto)", () => {
  it("si cambió de equipo, usa el del último partido del período consultado", () => {
    expect(contextTeam({ rows: [row(1, "2026-10-01"), row(1, "2026-10-08"), row(2, "2026-11-02")], currentTeamId: 2 })).toBe(2);
    // período que termina antes del traspaso: escudo del primer equipo
    expect(contextTeam({ rows: [row(1, "2026-10-01"), row(1, "2026-10-08")], currentTeamId: 2 })).toBe(1);
  });
  it("sin partidos en el período, usa el último plantel de la temporada", () => {
    expect(contextTeam({ rows: [], currentTeamId: 7 })).toBe(7);
    expect(contextTeam({ rows: [], currentTeamId: null })).toBeNull();
  });
});
