import Anthropic from '@anthropic-ai/sdk';
import type { AgentBriefing } from '../../domain/agent-briefing';
import { costOf, type TokenUsage } from '../../domain/agent-cost';
import { AGENT_TOOL_SPECS, runAgentTool, type AgentProposal, type ToolContext } from '../../application/use-cases/agent-tools';
import { AGENT } from '../../modules/agente/agent-identity';
import { manualIndex, SCREEN_LABEL } from '../../modules/agente/manual';

/** Chamada ao modelo da Anthropic para o agente de IA (27/10/2026). Duas entradas: a leitura da obra
 * (uma chamada, sem ferramentas, com estrutura fixa em markdown) e a pergunta (laço manual de
 * ferramentas: o modelo lista semanas e tarefas e propõe edições, que a tela aplica com um clique).
 * O dossiê vai no prompt do sistema com `cache_control`, para as perguntas seguidas sobre a mesma obra
 * reaproveitarem o prefixo. Sem parâmetro `thinking`: os modelos 5.5 pensam por padrão, e o `effort`
 * médio segura o custo. Recusa por política cai num modelo substituto escolhido pelo servidor
 * (`fallbacks: 'default'`); por isso o custo é calculado pelo `model` de cada resposta, não pelo pedido. */

export interface ChatConfig {
  apiKey: string;
  model: string;
}
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatResult {
  text: string;
  usage: TokenUsage;
  costUsd: number;
  /** Modelo que respondeu por último (pode ser o substituto do servidor). */
  model: string;
  /** Iterações com o modelo (a pergunta com ferramentas faz várias). */
  calls: number;
  proposals: AgentProposal[];
  /** Nomes das ferramentas chamadas, na ordem (vazio na leitura). Serve ao teste de fumaça. */
  toolCalls: string[];
}

/** Erro do modelo já traduzido para a pessoa, com o status HTTP que a rota deve responder. */
export class AgentModelError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentModelError';
  }
}
export const isAgentModelError = (error: unknown): error is AgentModelError => error instanceof AgentModelError;

// Nos modelos 5.5 o raciocínio conta no `max_tokens`: folga para ele não cortar a resposta (27/10/2026).
export const READING_MAX_TOKENS = 4000;
export const QUESTION_MAX_TOKENS = 4000;
export const MAX_TOOL_ITERATIONS = 6;
export const HISTORY_TURNS = 8;
export const HISTORY_CHARS = 2000;
const BETAS = ['server-side-fallback-2026-07-01'];

const READING_SYSTEM = `Você é ${AGENT.name}, ${AGENT.persona}
Você recebe o dossiê de uma obra (abaixo), montado pelo sistema a partir dos três níveis do planejamento: longo prazo (plano macro e vagões), médio prazo (plano do mês) e curto prazo (planilha semanal com PPC e causas).
Responda em português do Brasil, em markdown simples (títulos com #, listas com -, negrito com **), sem introdução nem despedida, com no máximo cerca de 350 palavras. Estrutura obrigatória, nesta ordem:
# Leitura da obra
De 3 a 5 pontos, os mais importantes, cada um com nomes e números do dossiê.
# Correlações entre os níveis
O que o curto, o médio e o longo prazo dizem um do outro (o que atrasa no macro aparece no mês? o que falha na semana é o que o mês previa?). Se um nível não foi lido (não está no dossiê), diga isso em uma linha.
# O que fazer esta semana
De 3 a 5 ações concretas, cada uma com o responsável provável (engenheiro, mestre, empreiteiro, planejador, comprador).
# Dados que faltam
O que impede uma leitura melhor: medição do longo prazo, linha de base do mês, apontamento da semana, causas sem justificativa.
Regras: baseie-se só no dossiê; o pareamento entre níveis é feito pelo nome das atividades e é heurístico, então trate as correlações como indícios, não como certeza; não invente números (use "cerca de" quando estimar); não repita o dossiê inteiro, interprete.`;

const QUESTION_SYSTEM = `Você é ${AGENT.name}, ${AGENT.persona}
Você conversa com a equipe de planejamento de uma obra. O dossiê da obra (abaixo) resume os três níveis: longo prazo (plano macro e vagões), médio prazo (plano do mês) e curto prazo (planilha semanal com PPC e causas).
Responda curto e direto, em português do Brasil, em markdown simples (listas com -, negrito com **; títulos só se a resposta for longa). Cite nomes e números do dossiê e das listas que as ferramentas devolvem; não invente nada. Se faltar informação para responder ou para propor, pergunte.
Ferramentas: listar_semana (linhas da planilha de uma semana, com apelidos "c:…"), listar_tarefas_mes (tarefas do plano do mês, com apelidos "t:…"), listar_servicos_macro (serviços do longo prazo), propor_levar, propor_criar_linhas, propor_apontar e consultar_manual (o manual do sistema).
Quando a pessoa pedir para editar o planejamento (levar linhas para outra semana, criar linhas a partir do plano do mês, apontar linhas como cumpridas ou não), primeiro use listar_semana ou listar_tarefas_mes para achar os apelidos certos e só então chame propor_*. Nunca diga que algo foi gravado: as propostas aparecem na tela com o botão Aplicar, e só a pessoa grava. Depois de propor, resuma em uma ou duas linhas o que a proposta faz e o que ficou de fora.
Você também é a ajuda do Obra 360, o sistema em que esta conversa acontece. Quando a pergunta for sobre o sistema — como fazer algo, onde fica um botão ou campo, o que uma coluna ou aviso significa, por que não consegue editar, quem pode fazer o quê, ou o que você mesma sabe fazer — chame consultar_manual com o id da seção (índice abaixo) ou com o tema em palavras, e responda com o que o manual devolver: passo a passo curto, com os nomes dos botões, campos e abas como aparecem na tela, entre aspas. Pode chamar consultar_manual mais de uma vez se a dúvida cruzar duas telas. Se o manual não cobrir a dúvida, diga que não encontrou isso no manual e indique o botão "?" (Como usar) da tela; nunca descreva uma funcionalidade que o manual não confirme. Quando a pessoa misturar dúvida de uso com pergunta sobre os dados, resolva as duas. Você não clica nem grava nada: explica, e a pessoa faz na tela.

## Índice do manual do sistema (id: o que a seção responde)
${manualIndex()}`;

const briefingBlock = (briefing: AgentBriefing): Anthropic.Beta.BetaTextBlockParam => ({
  type: 'text',
  text: `## Dossiê da obra (dados do sistema)\n\n${briefing.text}`,
  cache_control: { type: 'ephemeral' },
});
const emptyUsage = (): TokenUsage => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
const usageOf = (usage: Anthropic.Beta.BetaUsage): TokenUsage => ({
  input: usage.input_tokens,
  output: usage.output_tokens,
  cacheWrite: usage.cache_creation_input_tokens ?? 0,
  cacheRead: usage.cache_read_input_tokens ?? 0,
});
const textOf = (response: Anthropic.Beta.BetaMessage) =>
  response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
const round6 = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000;

/** Traduz o erro da API da Anthropic como a rota de análise do curto prazo faz. */
function translate(cause: unknown): AgentModelError {
  if (cause instanceof AgentModelError) return cause;
  if (cause instanceof Anthropic.AuthenticationError)
    return new AgentModelError('Chave da API da Anthropic inválida. Confira ANTHROPIC_API_KEY (ou API_ANTHROPIC).', 503);
  if (cause instanceof Anthropic.RateLimitError)
    return new AgentModelError('Limite de uso da IA atingido. Tente de novo em instantes.', 429);
  if (cause instanceof Anthropic.APIConnectionError) return new AgentModelError('Sem conexão com a IA. Tente de novo em instantes.', 502);
  if (cause instanceof Anthropic.APIError)
    return new AgentModelError(`A IA respondeu com erro${cause.status ? ` ${cause.status}` : ''}. Tente de novo.`, 502);
  return new AgentModelError('Falha ao consultar a IA. Tente de novo em instantes.', 502);
}

/** Soma de tokens e custo ao longo das iterações; o custo usa o modelo de cada resposta. */
class Tally {
  usage = emptyUsage();
  costUsd = 0;
  calls = 0;
  model = '';
  add(response: Anthropic.Beta.BetaMessage) {
    const step = usageOf(response.usage);
    this.usage = {
      input: this.usage.input + step.input,
      output: this.usage.output + step.output,
      cacheWrite: this.usage.cacheWrite + step.cacheWrite,
      cacheRead: this.usage.cacheRead + step.cacheRead,
    };
    this.costUsd = round6(this.costUsd + costOf(step, response.model));
    this.calls += 1;
    this.model = response.model;
  }
}

/** Leitura da obra: uma chamada, sem ferramentas. */
export async function generateReading(input: { briefing: AgentBriefing; config: ChatConfig }): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: input.config.apiKey });
  const tally = new Tally();
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: input.config.model,
      max_tokens: READING_MAX_TOKENS,
      betas: BETAS,
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: READING_SYSTEM }, briefingBlock(input.briefing)],
      messages: [{ role: 'user', content: 'Faça a leitura desta obra a partir do dossiê.' }],
    });
  } catch (cause) {
    throw translate(cause);
  }
  tally.add(response);
  if (response.stop_reason === 'refusal') throw new AgentModelError('O modelo não pôde analisar estes dados.', 502);
  const text = textOf(response);
  if (!text) throw new AgentModelError('A leitura voltou vazia. Tente de novo.', 502);
  return { text, usage: tally.usage, costUsd: tally.costUsd, model: tally.model, calls: tally.calls, proposals: [], toolCalls: [] };
}

/** Bloco, fora do cache, que diz ao modelo em que tela a pessoa está (29/10/2026): "como faço isso
 * aqui?" passa a ter resposta. Tela desconhecida não gera bloco. */
export function screenBlock(screen: string | undefined): Anthropic.Beta.BetaTextBlockParam | undefined {
  const label = screen ? SCREEN_LABEL[screen] : undefined;
  if (!label) return undefined;
  return {
    type: 'text',
    text: `Tela em que a pessoa está agora: ${label}. Quando ela disser "esta tela", "aqui" ou "este botão", é dessa tela que fala.`,
  };
}

/** Histórico que vai ao modelo: as últimas mensagens, cada uma cortada, sem vazias e começando por
 * uma da pessoa (a API exige que a primeira mensagem seja `user`). */
export function trimHistory(history: ChatTurn[]): ChatTurn[] {
  const kept = history
    .filter(turn => (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .map(turn => ({ role: turn.role, content: turn.content.trim().slice(0, HISTORY_CHARS) }))
    .filter(turn => turn.content)
    .slice(-HISTORY_TURNS);
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}

const TOOLS: Anthropic.Beta.BetaTool[] = AGENT_TOOL_SPECS.map(spec => ({
  name: spec.name,
  description: spec.description,
  input_schema: spec.input_schema as Anthropic.Beta.BetaTool.InputSchema,
}));

/** Pergunta com ferramentas: laço manual de até `MAX_TOOL_ITERATIONS` idas ao modelo. Cada resposta
 * com `tool_use` é devolvida inteira (inclusive os blocos de raciocínio) seguida de UMA mensagem da
 * pessoa com todos os `tool_result`, como a API pede. As propostas das ferramentas de edição são
 * coletadas e devolvidas à rota; nada é gravado aqui. */
export async function answerQuestion(input: {
  briefing: AgentBriefing;
  config: ChatConfig;
  question: string;
  history: ChatTurn[];
  toolContext: ToolContext;
  /** Seção da obra em que a pessoa está (`curto-prazo`, `vagoes`…), para as dúvidas de uso sobre "esta tela". */
  screen?: string;
}): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: input.config.apiKey });
  const tally = new Tally();
  const proposals: AgentProposal[] = [];
  const toolCalls: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...trimHistory(input.history).map(turn => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: input.question },
  ];
  // O bloco da tela vem depois do dossiê (que leva o `cache_control`): muda a cada pergunta e não entra no cache.
  const screen = screenBlock(input.screen);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: QUESTION_SYSTEM },
    briefingBlock(input.briefing),
    ...(screen ? [screen] : []),
  ];
  let text = '';
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: input.config.model,
        max_tokens: QUESTION_MAX_TOKENS,
        betas: BETAS,
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        tools: TOOLS,
        messages,
      });
    } catch (cause) {
      throw translate(cause);
    }
    tally.add(response);
    if (response.stop_reason === 'refusal') throw new AgentModelError('O modelo não pôde analisar estes dados.', 502);
    text = textOf(response);
    if (response.stop_reason !== 'tool_use') break;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      toolCalls.push(block.name);
      const outcome = runAgentTool(block.name, block.input, input.toolContext);
      if (outcome.proposal) proposals.push(outcome.proposal);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: outcome.result, ...(outcome.error ? { is_error: true } : {}) });
    }
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: results });
    // Última iteração terminou pedindo ferramenta: a resposta fica com o texto que houver ou um aviso.
    if (iteration === MAX_TOOL_ITERATIONS - 1)
      text =
        text ||
        (proposals.length
          ? 'Montei as propostas abaixo; confira e clique em Aplicar nas que fizerem sentido.'
          : 'Precisei de mais consultas do que cabem numa pergunta só. Tente dividir a pergunta.');
  }
  if (!text)
    text = proposals.length
      ? 'Proposta montada: confira abaixo e clique em Aplicar.'
      : 'A resposta voltou vazia. Tente perguntar de outro jeito.';
  return { text, usage: tally.usage, costUsd: tally.costUsd, model: tally.model, calls: tally.calls, proposals, toolCalls };
}
