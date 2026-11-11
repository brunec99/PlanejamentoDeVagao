/**
 * Importa a Linha de Balanço de uma obra a partir do XML que o Prevision exporta (formato do MS
 * Project), e cria os fluxos de serviços dos pavimentos tipo e dos demais pavimentos (10/11/2026).
 * As regras ficam em `src/domain/lob-prevision-import.ts`; aqui só a leitura, o relatório e a gravação.
 *
 * Uso:
 *   node --import tsx scripts/import-lob-prevision.ts <arquivo.xml> --obra <código> --actor <profileId>
 *     [--date AAAA-MM-DD] [--sem-fluxos] [--env-file .env.local] [--apply]
 *
 * Sem --apply é SIMULAÇÃO: lê o banco e imprime o que entraria. Com --apply grava os locais, os
 * serviços, os blocos, as dependências, a linha de base e a medição com o avanço do arquivo, e depois
 * os fluxos (que são da empresa). Recusa obra que já tem serviços, blocos, medições ou linhas de base
 * na Linha de Balanço; locais já cadastrados em Configurações são reaproveitados pelo nome. Se a
 * gravação falhar no meio, o que entrou é apagado.
 *
 * Ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, do processo ou de --env-file. Nenhum
 * segredo é impresso.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parseMspdi } from '../src/domain/mspdi-import';
import { activityFinish, cascade } from '../src/domain/lob';
import { isLocalDate } from '../src/domain/long-term-plan';
import {
  buildPrevisionImport,
  detachFlowIds,
  LOCAL_GROUP_LABEL,
  readPrevisionSchedule,
  type PrevisionImport,
} from '../src/domain/lob-prevision-import';
import type { LobMutation, LobTable } from '../src/application/use-cases/lob-commands';
import { applyLobMutation, insertFlow, listFlows, loadLob } from '../src/infrastructure/repositories/supabase/lob-repository';
import { getServiceClient } from '../src/infrastructure/repositories/supabase/client';

const USAGE =
  'Uso: node --import tsx scripts/import-lob-prevision.ts <arquivo.xml> --obra <código> --actor <profileId> [--date AAAA-MM-DD] [--sem-fluxos] [--env-file .env.local] [--apply]';

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
        actor: { type: 'string' },
        date: { type: 'string' },
        'sem-fluxos': { type: 'boolean', default: false },
        'env-file': { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    return fail(`${(error as Error).message}\n${USAGE}`);
  }
})();
const [file] = positionals;
if (!file || positionals.length > 1 || !values.obra || !values.actor) fail(USAGE);
const envFile = values['env-file'] ?? '.env.local';
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
else if (values['env-file']) fail(`Arquivo de ambiente não encontrado: ${envFile}`);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  fail('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no ambiente ou em --env-file).');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const measurementDate = values.date ?? today;
if (!isLocalDate(measurementDate)) fail(`Data inválida: ${measurementDate}`);

const br = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const EMPTY = (): Record<LobTable, never[]> => ({
  locals: [],
  services: [],
  activities: [],
  dependencies: [],
  baselines: [],
  launches: [],
  measurements: [],
  items: [],
  photos: [],
});

function report(result: PrevisionImport, workName: string) {
  const serviceName = new Map(result.services.map(s => [s.id, s.name]));
  const localName = new Map(result.localOrder.map(l => [l.local.id, l.local.name]));
  const span = result.activities.reduce(
    (acc, a) => ({
      start: a.start < acc.start ? a.start : acc.start,
      finish: activityFinish(a) > acc.finish ? activityFinish(a) : acc.finish,
    }),
    { start: '9999-12-31', finish: '0000-01-01' },
  );
  console.log(`\n=== ${workName}: Linha de Balanço ===`);
  console.log(`Período: ${br(span.start)} a ${br(span.finish)}`);
  console.log(`Locais: ${result.localOrder.length} (${result.locals.length} novos), de baixo para cima:`);
  const groups = new Map<string, string[]>();
  for (const { local, group } of result.localOrder) groups.set(group, [...(groups.get(group) ?? []), local.name]);
  for (const [group, names] of groups)
    console.log(`  ${LOCAL_GROUP_LABEL[group as keyof typeof LOCAL_GROUP_LABEL]} (${names.length}): ${names.join(', ')}`);
  console.log(`Serviços: ${result.services.length}`);
  console.log(
    `Blocos: ${result.stats.blocks} (${result.stats.withHolidays} com feriados do Prevision no intervalo: a duração aqui conta esses dias e o término fica igual)`,
  );
  console.log(`Dependências: ${result.stats.crew} "equipe segue" + ${result.stats.sequence} de sequência no local`);
  console.log(`Linha de base: "${result.baseline.name}" com ${result.baseline.snapshot.length} blocos`);
  if (result.measurement) {
    console.log(
      `Medição M${result.measurement.number} em ${br(result.measurement.date)} (salva, sem fotos), ${result.items.length} blocos:`,
    );
    for (const item of result.items) {
      const a = result.activities.find(x => x.id === item.activityId)!;
      console.log(`  ${String(item.value).padStart(5)}%  ${serviceName.get(a.serviceId)} › ${localName.get(a.localId)}`);
    }
  }
  const moved = cascade(result.activities, result.dependencies);
  console.log(`Conferência: ${moved.length === 0 ? 'nenhum bloco se move com as dependências' : `${moved.length} BLOCOS SE MOVERIAM`}`);
  for (const flow of result.flows) {
    console.log(`\n=== Fluxo "${flow.document.name}" (${flow.document.services.length} serviços, ${flow.locals.length} locais) ===`);
    console.log(`Locais de origem: ${flow.locals.join(', ')}`);
    if (flow.left.length) console.log(`Fora do fluxo (poucos locais): ${flow.left.join(', ')}`);
    const nameOf = new Map(flow.document.services.map(s => [s.id, s.name]));
    for (const s of flow.document.services) {
      const preds = s.predecessors.map(p => `${nameOf.get(p.serviceId)}${p.lagDays ? ` +${p.lagDays}d` : ''}`).join('; ');
      console.log(`  ${String(s.durationDays).padStart(3)}d  ${s.name}${preds ? `  ⟵ ${preds}` : '  (início)'}`);
    }
  }
  if (result.warnings.length) {
    console.log('\nAvisos:');
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
}

async function main() {
  console.log(`${values.apply ? 'GRAVAÇÃO' : 'SIMULAÇÃO (use --apply para gravar)'} — ${file}`);
  console.log(`Banco: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}`);
  const client = getServiceClient();
  const works = await client.from('works').select('id, name, code');
  if (works.error) fail(`Falha ao ler as obras: ${works.error.message}`);
  const work = (works.data as { id: string; name: string; code: string }[]).find(w => w.code.toLowerCase() === values.obra!.toLowerCase());
  if (!work) fail(`Obra ${values.obra} não encontrada.`);
  const actor = await client.from('profiles').select('id, name, role').eq('id', values.actor!).maybeSingle();
  if (actor.error || !actor.data) fail(`Perfil ${values.actor} não encontrado.`);
  console.log(`Obra: ${work.name} (${work.code}) · Ator: ${actor.data.name} (${actor.data.role}) · Medição em ${br(measurementDate)}`);

  const current = await loadLob(work.id);
  const busy = (['services', 'activities', 'measurements', 'baselines'] as const).filter(t => current[t].length);
  if (busy.length)
    fail(`${work.name} já tem dados na Linha de Balanço (${busy.map(t => `${current[t].length} ${t}`).join(', ')}). Nada foi gravado.`);

  const project = parseMspdi(fs.readFileSync(file, 'utf8'));
  const schedule = readPrevisionSchedule(project);
  const result = buildPrevisionImport(schedule, {
    workId: work.id,
    workName: work.name,
    actorId: actor.data.id,
    now: new Date().toISOString(),
    newId: randomUUID,
    measurementDate,
    sourceName: path.basename(file),
    existingLocals: current.locals,
  });
  const flows = values['sem-fluxos'] ? [] : result.flows;
  report({ ...result, flows }, work.name);
  const existingFlows = flows.length ? await listFlows() : [];
  const repeated = flows.filter(f => existingFlows.some(e => e.name.toLowerCase() === f.document.name.toLowerCase()));
  for (const f of repeated) console.log(`\nJá existe um fluxo chamado "${f.document.name}": ele não será recriado.`);
  if (cascade(result.activities, result.dependencies).length) fail('As dependências moveriam blocos. Nada foi gravado.');
  if (!values.apply) return;

  const mutation: LobMutation = {
    workId: work.id,
    insert: {
      ...EMPTY(),
      locals: result.locals,
      services: result.services,
      activities: result.activities,
      dependencies: result.dependencies,
      baselines: [result.baseline],
      measurements: result.measurement ? [result.measurement] : [],
      items: result.items,
    },
    update: EMPTY(),
    delete: EMPTY(),
    removeFiles: [],
  };
  try {
    await applyLobMutation(mutation);
  } catch (error) {
    console.error(`Falha na gravação: ${(error as Error).message}. Apagando o que entrou…`);
    const order: [string, { id: string }[]][] = [
      ['lob_measurement_items', result.items],
      ['lob_measurements', result.measurement ? [result.measurement] : []],
      ['lob_baselines', [result.baseline]],
      ['lob_dependencies', result.dependencies],
      ['lob_activities', result.activities],
      ['lob_services', result.services],
      ['lob_locals', result.locals],
    ];
    for (const [table, rows] of order)
      for (let i = 0; i < rows.length; i += 200) {
        const { error: undo } = await client
          .from(table)
          .delete()
          .in(
            'id',
            rows.slice(i, i + 200).map(r => r.id),
          );
        if (undo) console.error(`  não consegui apagar de ${table}: ${undo.message}`);
      }
    process.exit(1);
  }
  console.log(`\nLinha de Balanço gravada: ${result.activities.length} blocos, ${result.dependencies.length} dependências.`);
  for (const flow of flows) {
    if (repeated.includes(flow)) continue;
    const saved = await insertFlow(randomUUID(), detachFlowIds(flow.document, randomUUID), actor.data.id);
    console.log(`Fluxo gravado: "${saved.name}" (${saved.services.length} serviços).`);
  }
}

main().catch(error => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));
