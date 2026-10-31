// Definiciones breves para tooltips. Las fórmulas completas están en Metodología y docs/03-metricas.md.
export const GLOSSARY = {
  pj: "Partidos disputados: partidos en los que el jugador estuvo en cancha (los que figuran con 0:00 no cuentan).",
  min: "Minutos jugados por partido.",
  per40: "Valor proyectado a 40 minutos jugados: permite comparar titulares y suplentes.",
  eff: "Valoración tal como la publica la Liga (suma lo positivo y resta lo negativo de la planilla).",
  plusMinus: "Diferencia de tanteo del equipo mientras el jugador estuvo en cancha.",
  fg3: "Porcentaje de triples: triples convertidos ÷ intentados, acumulados en el período.",
  fg: "Tiros de campo (dobles + triples): convertidos ÷ intentados.",
  ft: "Libres convertidos ÷ intentados.",
  efg: "eFG% (campo efectivo): como el % de campo pero el triple vale 1,5 tiros. (TCC + 0,5 × T3C) ÷ TCI.",
  ts: "TS% (tiro verdadero): eficiencia incluyendo libres. PTS ÷ (2 × (TCI + 0,44 × TLI)).",
  ptsPerTeam: "Puntos convertidos por cada equipo en un partido, promediados sobre todos los partidos finalizados.",
  leaders: "Mínimo de partidos: la mitad de los jugados por el equipo con más partidos. El dato debe estar en todos sus partidos.",
  fg3Leaders: "Además del mínimo de partidos, se exigen al menos 2 triples intentados por partido.",
  official: "Publicado por la Liga Nacional en su sitio oficial.",
  calculated: "Calculado por LNB Stats a partir de los partidos almacenados.",
} as const;
