/**
 * Importa o cronograma do mês de uma obra a partir do XML do MS Project (08/11/2026), pelo mesmo
 * caminho da tela "Novo cronograma do mês › Importar do MS Project": `parseMspdi` + `buildPlanImport`,
 * a sugestão de equipe para cada recurso e o comando `import_plan`.
 *
 * Uso:
 *   node --import tsx scripts/import-medio-prazo.ts <arquivo.xml> --obra <código> --month AAAA-MM --actor <profileId>
 *     [--replace] [--name "Nome"] [--env-file .env.local] [--apply]
 *
 * Sem --apply é SIMULAÇÃO: lê o banco, aplica numa cópia em memória e imprime o relatório (avisos,
 * recursos → equipes, datas que o motor calcula diferente do Project). Com --apply grava numa única
 * transação. --replace exclui, na mesma transação, o cronograma vivo que a obra já tem no mês e as
 * linhas de base dele (a simulação lista o que sai). O .mpp precisa antes virar .xml no Project
 * ("Salvar como XML"; daqui, pela VM: docs/engenharia-reversa-project.md).
 *
 * Ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, do processo ou de --env-file. Nenhum
 * segredo é impresso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { PlanningData } from '../src/domain/entities';
import { buildPlanImport, parseMspdi } from '../src/domain/mspdi-import';
import { isLegalizationPlan } from '../src/domain/legalization';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { compareWithProject, suggestResourceChoices, toImportCommand } from '../src/application/use-cases/plan-import';
import { SupabasePlanningRepository } from '../src/infrastructure/repositories/supabase/planning-repository';
import { commandContext } from '../src/infrastructure/clock';

const USAGE =
  'Uso: node --import tsx scripts/import-medio-prazo.ts <arquivo.xml> --obra <código> --month AAAA-MM --actor <profileId> [--replace] [--name "Nome"] [--env-file .env.local] [--apply]';
const BASELINE_NAME = 'Linha de base do Project';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        obra: { type: 'string' },
        month: { type: 'string' },
        actor: { type: 'string' },
        name: { type: 'string' },
        replace: { type: 'boolean', default: false },
        'env-file': { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    return fail(`${(error as Error).message}\n${USAGE}`);
  }
})();
const [file] = positionals;
if (!file || positionals.length > 1 || !values.obra || !values.month || !values.actor) fail(USAGE);
const envFile = values['env-file'] ?? '.env.local';
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
else if (values['env-file']) fail(`Arquivo de ambiente não encontrado: ${envFile}`);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  fail('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no ambiente ou em --env-file).');
const actorId = values.actor!;
const month = values.month!;

/** Os comandos da carga, sobre o planejamento recebido: exclui o mês antigo (com --replace) e importa. */
function plan(data: PlanningData) {
  const work = data.works.find(w => w.code.toLowerCase() === values.obra!.toLowerCase());
  if (!work) throw new Error(`Obra ${values.obra} não encontrada.`);
  const fileName = path.basename(file).replace(/\.xml$/i, '') + '.xml';
  const project = parseMspdi(fs.readFileSync(file, 'utf8'));
  const draft = buildPlanImport(project, { month, fileName });
  const choices = suggestResourceChoices(
    draft.resources,
    data.teams.filter(t => t.workId === work.id),
  );
  const existing = data.plans.filter(p => p.workId === work.id && p.month === month && !p.baselineOf && !isLegalizationPlan(p));
  const removals: Command[] = [];
  if (existing.length && !values.replace)
    throw new Error(`${work.name} já tem cronograma em ${month}: ${existing.map(p => p.name).join(', ')}. Use --replace.`);
  for (const old of existing) {
    for (const baseline of data.plans.filter(p => p.baselineOf === old.id)) removals.push({ type: 'delete_plan', planId: baseline.id });
    removals.push({ type: 'delete_plan', planId: old.id });
  }
  const command = toImportCommand(draft, choices, {
    workId: work.id,
    month,
    fileName,
    name: values.name,
    baselineName: draft.baseline && Object.keys(draft.baseline).length ? BASELINE_NAME : undefined,
  });
  return { work, draft, choices, existing, removals, command };
}

function run(data: PlanningData) {
  const prepared = plan(data);
  const context = commandContext(actorId);
  for (const removal of prepared.removals) applyCommand(data, removal, context);
  const planId = applyCommand(data, prepared.command, context);
  return { ...prepared, planId };
}

async function main() {
  console.log(`${values.apply ? 'GRAVAÇÃO' : 'SIMULAÇÃO (use --apply para gravar)'} — ${file}`);
  console.log(`Banco: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}`);
  const repository = new SupabasePlanningRepository();
  const snapshot = await repository.getSnapshot();
  const actor = snapshot.users.find(u => u.id === actorId);
  if (!actor) fail(`Perfil ${actorId} não encontrado.`);
  console.log(`Ator: ${actor.name} (${actor.role})`);
  const simulation = structuredClone(snapshot);
  const result = run(simulation);
  const { work, draft, choices, existing, command } = result;
  const created = simulation.planTasks.filter(t => t.planId === result.planId);
  const baseline = simulation.plans.find(p => p.baselineOf === result.planId);
  console.log(`\n=== ${work.name} (${work.code}) · ${month} · "${command.name}" ===`);
  for (const old of existing) {
    const baselines = snapshot.plans.filter(p => p.baselineOf === old.id);
    console.log(
      `Sai: "${old.name}" (${snapshot.planTasks.filter(t => t.planId === old.id).length} tarefas)` +
        (baselines.length ? ` e ${baselines.length} linha(s) de base: ${baselines.map(b => b.name).join(', ')}` : ''),
    );
  }
  console.log(
    `Linhas: ${created.length} | vínculos: ${command.links.length} | linha de base: ${baseline ? `${simulation.planTasks.filter(t => t.planId === baseline.id).length} linhas` : 'não'}`,
  );
  console.log(
    `Calendário: dias ${draft.calendar.weekdays.join(',')} · ${draft.calendar.hoursPerDay} h · ${draft.calendar.holidays.length} dias sem trabalho (${draft.calendar.holidays.slice(0, 4).join(', ')}${draft.calendar.holidays.length > 4 ? ', …' : ''})`,
  );
  console.log(
    `Período no sistema: ${created.reduce((m, t) => (t.plannedStart < m ? t.plannedStart : m), '9999')} a ${created.reduce((m, t) => (t.plannedEnd > m ? t.plannedEnd : m), '0000')}`,
  );
  for (const w of draft.warnings) console.log(`  aviso — ${w.message}`);
  const teamName = (id: string) => {
    const t = snapshot.teams.find(x => x.id === id);
    return t ? `${t.name} · ${t.company}` : id;
  };
  console.log(
    `Recursos (${choices.length}): ${choices.filter(c => c.kind === 'team').length} ligados, ${choices.filter(c => c.kind === 'create').length} a criar`,
  );
  for (const c of choices)
    console.log(
      `  ${c.name} (${c.taskCount}) → ${c.kind === 'team' ? teamName(c.teamId) : c.kind === 'create' ? `CRIAR "${c.teamName}" (${c.company})` : 'sem recurso'}`,
    );
  const comparison = compareWithProject(draft);
  console.log(`Datas: ${comparison.compared - comparison.differences.length} de ${comparison.compared} folhas iguais ao Project`);
  for (const d of comparison.differences.slice(0, 60))
    console.log(`  #${d.row} ${d.name}: Project ${d.project.start}→${d.project.end} | sistema ${d.system.start}→${d.system.end}`);
  if (comparison.differences.length > 60) console.log(`  … mais ${comparison.differences.length - 60}`);
  if (!values.apply) return;
  const applied = await repository.transaction(draftData => run(draftData), { workIds: [work.id] });
  console.log(`\nGravado: plano ${applied.planId} (${work.name}, ${month}).`);
}

main().catch(error => fail(`Falha: ${error instanceof Error ? error.message : String(error)}`));
