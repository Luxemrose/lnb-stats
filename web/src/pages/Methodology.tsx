import { Card, PageHeader } from "../components/ui";

const FORMULAS: [string, string, string][] = [
  ["Promedio por partido", "Total ÷ PJ con el dato", "Si a un partido le falta la estadística, no se cuenta como 0: se excluye y se informa cuántos PJ tienen el dato."],
  ["Por 40 minutos", "Total ÷ minutos × 40", "Sólo con partidos que tienen la estadística y los minutos. Útil para comparar suplentes y titulares."],
  ["TC% (tiros de campo)", "(T2C + T3C) ÷ (T2I + T3I)", "Acumulado del período (no es el promedio de los porcentajes de cada partido)."],
  ["T2%, T3%, TL%", "Convertidos ÷ intentados", "Acumulado del período."],
  ["eFG% (campo efectivo)", "(TC convertidos + 0,5 × T3C) ÷ TC intentados", "Pondera que el triple vale más."],
  ["TS% (tiro verdadero)", "PTS ÷ (2 × (TC intentados + 0,44 × TLI))", "Eficiencia incluyendo libres. 0,44 es la aproximación estándar de posesiones que consume un libre."],
  ["Valoración (VAL)", "Tal como la publica la fuente", "No se recalcula."],
  ["Media móvil (N)", "Promedio de los últimos N partidos", "Si en la ventana falta un dato o hay menos de N partidos, no se calcula."],
  ["Diferencia absoluta", "B − A", "En porcentajes se expresa en puntos porcentuales (pp)."],
  ["Diferencia relativa", "(B − A) ÷ A × 100", "Sólo si A > 0. No se usa para porcentajes ni para +/-."],
  ["Récord y tabla", "G, P, %V = G ÷ PJ; orden por %V y diferencia", "Calculada con partidos finalizados almacenados; no aplica los desempates oficiales del reglamento."],
  ["Promedios defensivos", "Estadísticas del rival en los partidos del equipo", "Puntos en contra, rebotes del rival, etc."],
  ["Líderes", "Promedio por partido con mínimo de PJ", "Mínimo = la mitad de los PJ del equipo que más jugó; el dato debe estar en todos sus partidos."],
];

export default function Methodology() {
  return (
    <div className="space-y-5">
      <PageHeader title="Metodología" subtitle="Cómo se obtienen, validan y calculan los datos de LNB Stats." />
      <Card title="Reglas de calidad">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li><b>Sin datos inventados.</b> Un valor que la fuente no publica se guarda como "sin dato" (s/d), nunca como 0.</li>
          <li><b>Oficial vs. calculado.</b> Las etiquetas <i>Oficial</i> y <i>Calculado</i> indican si un número viene de la fuente o lo calcula la app.</li>
          <li><b>Validación antes de guardar.</b> Se rechaza un partido si: la suma de puntos de los jugadores no coincide con el resultado; los puntos no cumplen 2×T2 + 3×T3 + TL; convertidos &gt; intentados; RO + RD ≠ rebotes totales; hay jugadores duplicados; o hay empate en un partido finalizado.</li>
          <li><b>Sin duplicados.</b> Cada partido se identifica por temporada + fecha + local + visitante. Reimportarlo no lo duplica.</li>
          <li><b>Historial.</b> Si la fuente corrige un partido, se guarda una nueva revisión y se conserva la anterior.</li>
          <li><b>Estado de los partidos.</b> El sitio no marca "finalizado": un partido con resultado de un día anterior se considera finalizado; los del día quedan "sin confirmar" hasta la próxima actualización. Los partidos que el fixture muestra 0-0 se toman como no jugados.</li>
          <li><b>Partido disputado.</b> Los jugadores que figuran en la planilla con 0:00 minutos se marcan "no jugó" y no suman partidos.</li>
          <li><b>Tabla oficial.</b> Se muestra la tabla publicada por la Liga y se verifica automáticamente contra los partidos almacenados.</li>
          <li><b>Posición.</b> La fuente oficial no publica la posición de los jugadores, por eso no figura.</li>
          <li><b>Distinto nivel de detalle.</b> Hay partidos con planilla completa y otros sólo con resultado; cada pantalla lo indica.</li>
          <li><b>Datos de demostración.</b> El modo demo usa equipos y jugadores ficticios ("Demo …") en un archivo separado y se marca con una franja permanente.</li>
        </ul>
      </Card>
      <Card title="Fórmulas de los indicadores calculados">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-2"><th className="py-1.5 pr-3">Indicador</th><th className="pr-3">Fórmula</th><th>Notas</th></tr></thead>
            <tbody>{FORMULAS.map(([a, b, c]) => (
              <tr key={a} className="border-b border-line align-top last:border-0"><td className="py-1.5 pr-3 font-medium">{a}</td><td className="pr-3 font-mono text-xs">{b}</td><td className="text-ink-2">{c}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <Card title="Abreviaturas">
        <p className="text-sm text-ink-2">PJ partidos jugados · MIN minutos · PTS puntos · T2/T3/TL dobles, triples y libres (C convertidos, I intentados) · TC tiros de campo · RO/RD/REB rebotes ofensivos, defensivos y totales · AST asistencias · ROB robos · PER pérdidas · TAP tapas · TAPR tapas recibidas · FC/FR faltas cometidas/recibidas · +/- más/menos · VAL valoración · PF/PC puntos a favor/en contra · G/P ganados/perdidos.</p>
      </Card>
    </div>
  );
}
