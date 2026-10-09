/**
 * Importa o histórico do curto prazo (compromissos semanais / PPC) de um CSV normalizado.
 *
 * Uso:
 *   node --import tsx scripts/import-curto-prazo.ts <arquivo.csv> --actor <profileId>
 *     [--work-id <id>] [--create-works] [--causes-map mapa.json] [--env-file .env.local] [--apply]
 *
 * Sem --apply é SIMULAÇÃO: lê o banco, aplica tudo numa cópia em memória e imprime o relatório
 * por obra. Com --apply grava, numa única transação por obra (`SupabasePlanningRepository.transaction`),
 * e só se a simulação não tiver encontrado nenhum erro.
 *
 * Formato do CSV — UTF-8, separador `;`, cabeçalho na primeira linha, uma linha por linha da planilha:
 *
 *   obra;empresa;semana;inicio;termino;atividade;equipe;status;causa;justificativa
 *
 *   obra           nome da obra; casa com works.name sem acento e sem caixa. Com --create-works a obra
 *                  inexistente é criada (código gerado do nome). Com --work-id a coluna é ignorada
 *                  e pode ficar em branco.
 *   empresa        fornecedor: vira `supplier` do compromisso e `company` da equipe.
 *   semana         AAAA-MM-DD da segunda-feira da semana; outra data é levada à segunda da semana.
 *   inicio,termino AAAA-MM-DD dentro da semana (segunda a domingo). Em branco: inicio = semana e
 *                  termino = inicio.
 *   atividade      texto livre, obrigatório.
 *   equipe         opcional. Reaproveita a equipe da obra com mesmo nome e empresa (sem acento/caixa)
 *                  ou cria uma nova (capacidade 3, como a planilha semanal). Exige empresa.
 *   status         Sim | Não | Nao | em branco (não apurado).
 *   causa          obrigatória quando status = Não. Uma das causas oficiais (NON_FULFILLMENT_CAUSES,
 *                  sem acento/caixa) ou uma chave de --causes-map ({"texto da planilha": "causa oficial"}).
 *   justificativa  texto livre, opcional (só gravada quando há status).
 *
 * Campos podem vir entre aspas ("a;b", "linha 1\nlinha 2", aspas dobradas ""). Linhas em branco
 * são ignoradas. Os números de linha do relatório são as linhas físicas do arquivo.
 *
 * Idempotência: rodar o mesmo CSV de novo não duplica. Cada linha é casada com o compromisso já
 * gravado de mesma chave (obra, semana, início, término, atividade, empresa, equipe — texto sem
 * acento/caixa): entre linhas iguais, primeiro com o de mesmo apontamento, depois na ordem de
 * ocorrência; o que já existe só tem o apontamento atualizado quando o CSV traz status diferente.
 * Linhas criadas recebem createdAt distintos, na ordem do CSV. Nada é apagado.
 *
 * O apontamento importado (record_fulfillment) é datado no sábado da semana, ao meio-dia de São
 * Paulo (recordedAt), com recordedBy = --actor. O responsável das linhas é o --actor, que precisa
 * ser admin com acesso à obra (semana passada fica encerrada para os demais).
 *
 * Ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, lidos do processo ou de
 * --env-file (padrão .env.local, ignorado se não existir). Nenhum segredo é impresso.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { SupabasePlanningRepository } from '../src/infrastructure/repositories/supabase/planning-repository';
import { commandContext } from '../src/infrastructure/clock';
import {
  checkImportActor,
  groupRowsByWork,
  importGroup,
  loadCausesMap,
  parseCommitmentsCsv,
  type CausesMap,
  type ImportIssue,
  type WorkImportResult,
} from '../src/application/use-cases/import-commitments';

const USAGE =
  'Uso: node --import tsx scripts/import-curto-prazo.ts <arquivo.csv> --actor <profileId> [--work-id <id>] [--create-works] [--causes-map mapa.json] [--env-file .env.local] [--apply]';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        actor: { type: 'string' },
        'work-id': { type: 'string' },
        'create-works': { type: 'boolean', default: false },
        'causes-map': { type: 'string' },
        'env-file': { type: 'string' },
        apply: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    return fail(`${(error as Error).message}\n${USAGE}`);
  }
})();
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [file] = positionals;
if (!file || positionals.length > 1) fail(USAGE);
if (!values.actor) fail(`Informe --actor <profileId>.\n${USAGE}`);
const actorId = values.actor;
const workId = values['work-id'];

const envFile = values['env-file'] ?? '.env.local';
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
else if (values['env-file']) fail(`Arquivo de ambiente não encontrado: ${envFile}`);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  fail('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no ambiente ou em --env-file).');

let causesMap: CausesMap | undefined;
if (values['causes-map']) {
  try {
    causesMap = loadCausesMap(JSON.parse(fs.readFileSync(values['causes-map'], 'utf8')));
  } catch (error) {
    fail(`Mapa de causas inválido: ${(error as Error).message}`);
  }
}

const formatIssue = (issue: ImportIssue) => `${issue.line ? `linha ${issue.line}: ` : ''}${issue.message}`;
const percent = (value: number) => `${value.toFixed(0)}%`;

function printResult(result: WorkImportResult) {
  console.log(`\n=== ${result.workName ?? result.obra}${result.workId ? ` (${result.workId})` : ''} ===`);
  if (result.createdWork) console.log(`Obra NOVA: "${result.createdWork.name}", código ${result.createdWork.code}`);
  console.log(`Linhas: ${result.rows} | novas: ${result.created} | atualizadas: ${result.updated} | já existentes: ${result.unchanged}`);
  if (result.weeks) console.log(`Semanas: ${result.weeks.first} a ${result.weeks.last} (${result.weeks.count} semanas)`);
  console.log(`Apontamento: ${result.fulfilled} Sim | ${result.notFulfilled} Não | ${result.pending} não apurados`);
  console.log(`Empresas (${result.companies.length}): ${result.companies.join(', ') || '—'}`);
  console.log(
    `Equipes: ${result.teamsReused} reaproveitadas, ${result.teamsCreated.length} a criar` +
      (result.teamsCreated.length ? `: ${result.teamsCreated.map(t => `${t.name} (${t.company})`).join(', ')}` : ''),
  );
  if (result.untouchedExisting) console.log(`Compromissos já gravados na obra fora do CSV (mantidos): ${result.untouchedExisting}`);
  if (result.ppc.length) {
    const sample = result.ppc.length > 8 ? [...result.ppc.slice(0, 4), undefined, ...result.ppc.slice(-4)] : result.ppc;
    console.log('PPC por semana (amostra):');
    for (const week of sample)
      console.log(
        week
          ? `  ${week.weekStart}  ${percent(week.percent).padStart(4)}  (${week.fulfilled}/${week.planned}${week.pending ? `, ${week.pending} não apurados` : ''})`
          : '  …',
      );
  }
  for (const warning of result.warnings) console.log(`  aviso — ${formatIssue(warning)}`);
  for (const error of result.errors) console.log(`  ERRO — ${formatIssue(error)}`);
}

async function main() {
  const text = fs.readFileSync(file, 'utf8');
  const parsed = parseCommitmentsCsv(text, { causesMap, requireObra: !workId });
  console.log(`${values.apply ? 'GRAVAÇÃO' : 'SIMULAÇÃO (use --apply para gravar)'} — ${file}`);
  console.log(`Banco: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}`);
  console.log(`Linhas válidas: ${parsed.rows.length} | linhas com erro: ${new Set(parsed.errors.map(e => e.line)).size}`);
  for (const warning of parsed.warnings) console.log(`aviso — ${formatIssue(warning)}`);
  for (const error of parsed.errors) console.log(`ERRO — ${formatIssue(error)}`);
  if (parsed.unmappedCauses.size) {
    console.log('Causas sem correspondência (inclua em --causes-map):');
    for (const [cause, count] of parsed.unmappedCauses) console.log(`  "${cause}": ${count} linha(s)`);
  }

  const repository = new SupabasePlanningRepository();
  const snapshot = await repository.getSnapshot();
  const actor = checkImportActor(snapshot, actorId);
  console.log(`Ator: ${actor.name} (${actor.role})`);
  const groups = groupRowsByWork(parsed.rows, workId);
  const context = commandContext(actorId);
  const simulation = structuredClone(snapshot);
  const results = groups.map(group => importGroup(simulation, group, { context, createWorks: values['create-works'] }));
  results.forEach(printResult);
  const errorCount = parsed.errors.length + results.reduce((sum, r) => sum + r.errors.length, 0);
  console.log(`\nTotal: ${results.length} obra(s), ${errorCount} erro(s).`);
  if (!values.apply) return;
  if (errorCount) fail('Nada foi gravado: corrija os erros acima e rode de novo.');

  for (const [i, group] of groups.entries()) {
    const expectedWorkId = results[i].createdWork ? null : results[i].workId!;
    // Uma transação por obra: o commit leva o snapshot recortado da obra inteiro, então gravar
    // linha a linha seria uma ida e volta do snapshot por linha.
    const applied = await repository.transaction(
      draft => {
        const result = importGroup(draft, group, { context: commandContext(actorId), createWorks: values['create-works'], expectedWorkId });
        if (result.errors.length)
          throw new Error(`Erros ao gravar ${group.obra}; nada desta obra foi gravado:\n${result.errors.map(formatIssue).join('\n')}`);
        return result;
      },
      { workIds: expectedWorkId ? [expectedWorkId] : [] },
    );
    console.log(
      `Gravado: ${applied.workName} — ${applied.created} novas, ${applied.updated} atualizadas, ${applied.unchanged} já existentes, ${applied.teamsCreated.length} equipes criadas.`,
    );
  }
}

main().catch(error => fail(`Falha: ${error instanceof Error ? error.message : String(error)}`));
