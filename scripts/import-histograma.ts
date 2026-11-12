/**
 * Importa a planilha "ATR Histograma - Todas as obras" (aba Geral) para a aba 7, Histograma.
 *
 * 1. Exportar a aba Geral em CSV (Arquivo → Fazer download → Valores separados por vírgula).
 * 2. Simular e depois gravar:
 *      node --import tsx scripts/import-histograma.ts <geral.csv> --actor-email <e-mail> [--env-file <arquivo>]
 *        [--obras '{"MYS":"<id ou código da obra>"}'] [--only "BLT,MZN"] [--apply]
 *
 * Sem --apply é SIMULAÇÃO: lê o banco, monta tudo em memória e imprime o relatório por obra, sem gravar
 * nada. As regras estão em `src/application/use-cases/import-headcount.ts`: grafias unificadas, linhas
 * repetidas somadas, linha sem obra, data impossível ou quantidade ruim fica de fora. A obra é achada pelo
 * código ("BLT") ou pelo nome (ou por --obras); a que não achar fica de fora, relatada — o script nunca
 * cria obra. Rodar de novo não duplica e nunca sobrescreve linha já gravada.
 *
 * Ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, do processo ou de --env-file. Sem padrão
 * de propósito: o .env.local deste repositório aponta para o Supabase antigo. Nenhum segredo é impresso.
 * O ator precisa ser admin.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { parseCsv } from '../src/application/use-cases/import-safety';
import { pendingHeadcountImport, planHeadcountImport, type HeadcountWorkRef } from '../src/application/use-cases/import-headcount';
import { headcountKey, type HeadcountEntry } from '../src/domain/headcount';
import { todayInSaoPaulo } from '../src/infrastructure/clock';
import { getServiceClient } from '../src/infrastructure/repositories/supabase/client';
import {
  applyHeadcountMutationToDb,
  HeadcountUnavailableError,
  loadHeadcount,
} from '../src/infrastructure/repositories/supabase/headcount-repository';

const USAGE =
  'Uso: node --import tsx scripts/import-histograma.ts <geral.csv> (--actor-email <e-mail> | --actor <profileId>) [--env-file <arquivo>] [--obras <json>] [--only "BLT,MZN"] [--apply]';

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
        'actor-email': { type: 'string' },
        'env-file': { type: 'string' },
        obras: { type: 'string' },
        only: { type: 'string' },
        apply: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : error}\n${USAGE}`);
  }
})();
const [file] = positionals;
if (!file || (!values.actor && !values['actor-email'])) fail(USAGE);

if (values['env-file']) {
  for (const line of fs.readFileSync(values['env-file'], 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

async function main() {
  const db = getServiceClient();
  // O e-mail fica na conta (auth), não no perfil: acha a conta e depois confere o papel no perfil.
  let actorId = values.actor;
  if (!actorId) {
    const email = values['actor-email']!.toLowerCase();
    for (let page = 1; !actorId; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) fail(`Falha ao listar as contas: ${error.message}`);
      actorId = data.users.find(user => user.email?.toLowerCase() === email)?.id;
      if (data.users.length < 1000) break;
    }
    if (!actorId) fail(`Nenhuma conta com o e-mail ${values['actor-email']}.`);
  }
  const profile = await db.from('profiles').select('id,role').eq('id', actorId).maybeSingle();
  if (profile.error) fail(`Falha ao ler o perfil: ${profile.error.message}`);
  const actor = profile.data as { id: string; role: string } | null;
  if (!actor) fail('Ator sem perfil no sistema.');
  if (actor.role !== 'admin') fail('O ator precisa ser admin.');

  const worksResult = await db.from('works').select('id,name,code');
  if (worksResult.error) fail(`Falha ao ler as obras: ${worksResult.error.message}`);
  const works = worksResult.data as HeadcountWorkRef[];
  const aliases = values.obras ? (JSON.parse(values.obras) as Record<string, string>) : {};
  const only = values.only ? new Set(values.only.split(',').map(headcountKey)) : null;

  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const plan = planHeadcountImport(rows, works, { actorId: actor.id, now: new Date().toISOString(), today: todayInSaoPaulo(), aliases });
  const { report } = plan;
  console.log(`Linhas lidas: ${report.rows}`);
  console.log(
    `Fora: ${report.noWork} sem obra · ${report.badDateTotal} com data impossível · ${report.futureDate} no futuro · ${report.badQuantity} sem quantidade válida · ${report.zero} com zero`,
  );
  console.log(`Repetidas somadas: ${report.merged}`);
  for (const bad of report.badDate) console.log(`  data a corrigir: linha ${bad.line} (${bad.work}: "${bad.value}")`);
  for (const [name, count] of Object.entries(report.unknownWorks))
    console.log(`  obra sem correspondente no sistema: ${name} (${count} linhas) — use --obras para apontar`);

  let total = 0;
  for (const work of works) {
    const planned = plan.byWork.get(work.id);
    if (!planned) continue;
    if (only && !only.has(headcountKey(work.code)) && !only.has(headcountKey(work.name))) {
      console.log(`${work.code} ${work.name}: fora por --only (${planned.length} linhas)`);
      continue;
    }
    let existing: HeadcountEntry[];
    try {
      existing = (await loadHeadcount(work.id)).entries;
    } catch (error) {
      if (!(error instanceof HeadcountUnavailableError)) throw error;
      if (values.apply) fail(error.message);
      console.log('AVISO: migração 0045 não aplicada; a simulação segue como se a obra estivesse vazia.');
      existing = [];
    }
    const pending = pendingHeadcountImport(planned, existing);
    const days = new Set(pending.map(e => e.workedOn));
    console.log(
      `${work.code} ${work.name}: ${planned.length} linhas na planilha · ${existing.length} já no sistema · ${pending.length} a gravar em ${days.size} dias`,
    );
    total += pending.length;
    if (values.apply && pending.length) await applyHeadcountMutationToDb({ workId: work.id, insert: pending, update: [], delete: [] });
  }
  console.log(
    values.apply ? `GRAVADO: ${total} linhas.` : `SIMULAÇÃO: ${total} linhas seriam gravadas. Rode de novo com --apply para gravar.`,
  );
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
