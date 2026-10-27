/**
 * Teste de fumaça do agente de IA contra a API real da Anthropic (27/10/2026).
 *
 * Uso:
 *   node --import tsx scripts/agent-smoke.ts [--env-file .env.local] [--pergunta "texto"]
 *
 * Usa a obra de exemplo de `tests/fixtures/agent-planning.ts` (sem banco): monta o dossiê, pede a leitura e
 * faz uma pergunta que exige ferramentas e deve render uma proposta de "levar" o Contrapiso apto 602 para
 * a semana 43. Imprime tempo, tokens, modelo que respondeu e custo de cada chamada. Gasta cerca de
 * US$ 0,05 por execução no Sonnet 5.5; serve para conferir a chave, o modelo e os parâmetros da chamada
 * depois de trocar de modelo ou de SDK, e para calibrar `ESTIMATED_CALL_USD`.
 */
import { readFileSync } from 'node:fs';
import { buildBriefing } from '../src/domain/agent-briefing';
import { agentConfigFromEnv, formatUsd } from '../src/domain/agent-cost';
import { answerQuestion, generateReading } from '../src/infrastructure/agent/chat';
import type { ToolContext } from '../src/application/use-cases/agent-tools';
import { TODAY, WEEK_ONE, WORK, fixture, longTermPlan } from '../tests/fixtures/agent-planning';

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: string) => {
    const at = args.indexOf(name);
    return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
  };
  const envFile = option('--env-file', '.env.local');
  const question = option(
    '--pergunta',
    'Quais tarefas do plano de outubro deveriam estar na semana atual e não estão? Leve para a semana atual o que ficou sem fazer na semana passada.',
  );

  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  const cfg = agentConfigFromEnv(process.env);
  if (!cfg.apiKey) {
    console.error(`Sem chave: defina ANTHROPIC_API_KEY (ou API_ANTHROPIC) em ${envFile}.`);
    process.exit(1);
  }
  console.log(`modelo: ${cfg.model} | teto mensal: ${formatUsd(cfg.budgetUsd)}`);

  const data = fixture();
  const levels = ['longo', 'medio', 'curto'] as const;
  const briefing = buildBriefing({ data, workId: WORK, today: TODAY, levels: [...levels], longTermPlan, weekOne: WEEK_ONE });
  console.log(`dossiê: ${briefing.text.length} caracteres, ${briefing.findings.length} achados, hash ${briefing.hash}`);
  const config = { apiKey: cfg.apiKey, model: cfg.model };
  const seconds = (since: number) => ((Date.now() - since) / 1000).toFixed(1);
  let total = 0;

  let started = Date.now();
  const reading = await generateReading({ briefing, config });
  total += reading.costUsd;
  console.log(
    `\n=== LEITURA (${seconds(started)} s) modelo=${reading.model} chamadas=${reading.calls} custo=${formatUsd(reading.costUsd)}`,
  );
  console.log('tokens:', JSON.stringify(reading.usage));
  console.log(reading.text);

  let seq = 0;
  const toolContext: ToolContext = {
    data,
    workId: WORK,
    today: TODAY,
    actor: { id: 'u-planner', role: 'planner' },
    levels: [...levels],
    weekOne: WEEK_ONE,
    longTermPlan,
    newId: () => `prop-${++seq}`,
  };
  started = Date.now();
  const answer = await answerQuestion({ briefing, config, question, history: [], toolContext });
  total += answer.costUsd;
  console.log(`\n=== PERGUNTA (${seconds(started)} s) modelo=${answer.model} chamadas=${answer.calls} custo=${formatUsd(answer.costUsd)}`);
  console.log('tokens:', JSON.stringify(answer.usage));
  console.log(answer.text);
  for (const proposal of answer.proposals) {
    console.log(`\n--- proposta [${proposal.kind}] ${proposal.title} (${proposal.commands.length} comandos, semana ${proposal.weekStart})`);
    for (const line of proposal.lines) console.log('  +', line);
    for (const skipped of proposal.skipped) console.log('  x', skipped);
  }
  console.log(`\nTOTAL ${formatUsd(total)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
