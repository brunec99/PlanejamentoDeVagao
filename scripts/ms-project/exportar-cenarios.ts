/**
 * Prepara a conferência da bancada no MS Project real (ver docs/engenharia-reversa-project.md,
 * seção "Conferência no Project real").
 *
 * Uso:
 *   node --import tsx scripts/ms-project/exportar-cenarios.ts <pasta de saída> [cenarios.json]
 *
 * Sem `cenarios.json`, usa os cenários de `tests/fixtures/cenarios-project.ts`. Grava na pasta:
 * - `cenarios.json`: os cenários, que `montar-no-project.ps1` monta tarefa a tarefa no Project;
 * - `motor.json`: o que o motor do Obra 360 calcula para cada tarefa de cada cenário;
 * - `xml/NN.xml`: o MSPDI que o botão "Exportar para o Project" geraria, para `abrir-xml.ps1`.
 * A montagem das tarefas é a mesma de `tests/plan-cpm.test.ts`. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSchedule, endFor, parseDuration, DEFAULT_CALENDAR, type WorkCalendar } from '../../src/domain/plan-schedule';
import { buildMspdi } from '../../src/domain/mspdi';
import type { MediumTermPlan, PlanDependency, PlanTask } from '../../src/domain/entities';
import { CENARIOS, type Cenario } from '../../tests/fixtures/cenarios-project';

const [saida, entrada] = process.argv.slice(2);
if (!saida) {
  console.error('uso: exportar-cenarios.ts <pasta de saída> [cenarios.json]');
  process.exit(1);
}
const cenarios: Cenario[] = entrada ? JSON.parse(readFileSync(entrada, 'utf8')) : CENARIOS;

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const plan: MediumTermPlan = { id: 'plan', ...stamp, workId: 'w', month: '2026-09', name: 'Bancada', createdBy: 'u' };

function montar(cenario: Cenario) {
  const calendar: WorkCalendar = { ...DEFAULT_CALENDAR, holidays: cenario.feriados ?? [] };
  const tasks: PlanTask[] = cenario.tarefas.map((t, i) => {
    const duration = parseDuration(t.dur);
    const start = t.inicio ?? '2026-09-07';
    return {
      id: t.id,
      ...stamp,
      planId: 'p',
      name: t.id,
      plannedStart: start,
      plannedEnd: endFor(start, duration, calendar).end,
      duration,
      level: t.nivel ?? 0,
      order: i + 1,
      progress: t.progresso ?? 0,
      ...(t.restricao ? { constraintType: t.restricao.tipo, constraintDate: t.restricao.data } : {}),
      ...(t.prazo ? { deadline: t.prazo } : {}),
      ...(t.inicioReal ? { actualStart: t.inicioReal } : {}),
      ...(t.terminoReal ? { actualEnd: t.terminoReal } : {}),
    };
  });
  const links: PlanDependency[] = (cenario.vinculos ?? []).map((v, i) => ({
    id: `l${i}`,
    ...stamp,
    predecessorId: v.de,
    successorId: v.para,
    type: v.tipo ?? 'TI',
    lagDays: v.lag ?? 0,
    lagBusiness: !v.corrido,
  }));
  return { tasks, links, calendar };
}

mkdirSync(join(saida, 'xml'), { recursive: true });
const motor = cenarios.map((cenario, n) => {
  const { tasks, links, calendar } = montar(cenario);
  const analysis = analyzeSchedule(tasks, links, calendar);
  const xml = buildMspdi({ plan: { ...plan, name: cenario.nome.slice(0, 60) }, tasks, links, calendar, analysis, workName: 'Bancada' });
  writeFileSync(join(saida, 'xml', `${String(n + 1).padStart(2, '0')}.xml`), xml);
  const { tasks: out, info } = analysis;
  return Object.fromEntries(
    out.map((t, i) => {
      const a = info.get(t.id)!;
      const resumo = out[i + 1]?.level > t.level;
      return [
        t.id,
        {
          inicio: resumo ? a.earlyStart : t.plannedStart,
          termino: resumo ? a.earlyFinish : t.plannedEnd,
          inicioTardio: a.lateStart,
          terminoTardio: a.lateFinish,
          folgaTotal: a.totalSlack,
          folgaLivre: a.freeSlack,
          critica: a.critical,
          conflito: a.conflict,
          prazoPerdido: a.deadlineMissed,
          determinantes: [...a.driverIds].sort(),
        },
      ];
    }),
  );
});
writeFileSync(join(saida, 'cenarios.json'), JSON.stringify(cenarios));
writeFileSync(join(saida, 'motor.json'), JSON.stringify(motor, null, 1));
console.log(`${cenarios.length} cenários → ${saida}`);
