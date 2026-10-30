import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findManualSections,
  isManualScreen,
  MANUAL_MAX_CHARS,
  MANUAL_SECTIONS,
  manualIndex,
  manualSectionById,
  renderManual,
  SCREEN_LABEL,
} from '../src/modules/agente/manual';
import { MODULES } from '../src/application/module-access';
import { NON_FULFILLMENT_CAUSES } from '../src/domain/entities';
import { AGENT_TOOL_SPECS, runAgentTool, type ToolContext } from '../src/application/use-cases/agent-tools';
import { AGENT } from '../src/modules/agente/agent-identity';
import { screenBlock } from '../src/infrastructure/agent/chat';
import { TODAY, WEEK_ONE, WORK, fixture, longTermPlan } from './fixtures/agent-planning';

/** Manual do sistema para o agente (29/10/2026): o conteúdo é texto, então os testes conferem a forma
 * (ids, tamanhos, cobertura das telas, nada de nome de arquivo), a busca (id, acento, sinônimo) e a
 * ferramenta `consultar_manual`. */

const ctx = (): ToolContext => ({
  data: fixture(),
  workId: WORK,
  today: TODAY,
  actor: { id: 'u-planner', role: 'planner' },
  levels: ['longo', 'medio', 'curto'],
  weekOne: WEEK_ONE,
  longTermPlan,
  newId: () => 'prop-1',
});
const ids = MANUAL_SECTIONS.map(s => s.id);

test('toda seção tem id único em kebab-case, título, resumo curto, palavras-chave e texto de manual', () => {
  assert.ok(MANUAL_SECTIONS.length >= 30, `poucas seções: ${MANUAL_SECTIONS.length}`);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const section of MANUAL_SECTIONS) {
    assert.match(section.id, /^[a-z0-9]+(-[a-z0-9]+)+$/, `id fora do padrão: ${section.id}`);
    assert.ok(section.title.trim().length >= 8, `título curto: ${section.id}`);
    assert.ok(section.summary.trim().length >= 20 && section.summary.length <= 170, `resumo fora do tamanho: ${section.id}`);
    assert.ok(section.keywords.length >= 5, `poucas palavras-chave: ${section.id}`);
    for (const keyword of section.keywords)
      assert.equal(keyword, keyword.toLowerCase().trim(), `palavra-chave: ${section.id} "${keyword}"`);
    assert.ok(section.body.trim().length >= 400, `texto curto: ${section.id}`);
    assert.ok(section.body.trim().length <= 9000, `texto longo demais para uma consulta: ${section.id}`);
    assert.ok(isManualScreen(section.screen), `tela desconhecida: ${section.id} → ${section.screen}`);
  }
});

test('o texto é para quem usa a tela: sem caminhos de código, rotas de API nem nomes de tabela', () => {
  const leaks = MANUAL_SECTIONS.filter(s => /\bsrc\/|\.tsx?\b|\/api\/|supabase|\bcommit_planning\b|\bpage\.tsx\b/i.test(s.body));
  assert.deepEqual(
    leaks.map(s => s.id),
    [],
  );
});

test('toda tela do sistema tem ao menos uma seção do manual, e o índice lista todas', () => {
  const screens = [...MODULES.map(m => m.section), 'obras', 'configuracoes-gerais', 'geral', 'agente'];
  for (const screen of screens)
    assert.ok(
      MANUAL_SECTIONS.some(s => s.screen === screen),
      `tela sem manual: ${screen}`,
    );
  for (const screen of Object.keys(SCREEN_LABEL))
    assert.ok(
      MANUAL_SECTIONS.some(s => s.screen === screen),
      `rótulo sem seção: ${screen}`,
    );
  const index = manualIndex();
  for (const section of MANUAL_SECTIONS) assert.ok(index.includes(`- ${section.id}: `), `fora do índice: ${section.id}`);
  for (const label of Object.values(SCREEN_LABEL)) assert.ok(index.includes(label), `rótulo fora do índice: ${label}`);
  // O índice vai no prompt do sistema a cada pergunta (em cache): tem de continuar pequeno.
  assert.ok(index.length <= 14000, `índice grande demais: ${index.length} caracteres`);
});

test('busca pelo id exato e pelo id dentro da frase devolve só aquela seção', () => {
  for (const section of MANUAL_SECTIONS) {
    assert.deepEqual(findManualSections(section.id), [section], section.id);
    assert.equal(manualSectionById(section.id), section);
  }
  assert.deepEqual(findManualSections('me explica a seção geral-glossario por favor'), [manualSectionById('geral-glossario')]);
  assert.equal(manualSectionById('nao-existe'), undefined);
});

test('busca por palavras: cada seção é achada pela maioria das próprias palavras-chave', () => {
  // Palavras-chave genéricas ("o que é") podem levar a outra seção; a maioria tem de trazer a própria.
  for (const section of MANUAL_SECTIONS) {
    const hits = section.keywords.filter(keyword => findManualSections(`Como faço ${keyword}?`).includes(section));
    assert.ok(
      hits.length >= Math.ceil(section.keywords.length / 2),
      `${section.id}: só ${hits.length} de ${section.keywords.length} palavras-chave acham a seção`,
    );
  }
});

test('busca ignora acentos e maiúsculas e aceita variações da palavra', () => {
  assert.equal(findManualSections('GLOSSÁRIO')[0]?.id, 'geral-glossario');
  assert.equal(findManualSections('glossario')[0]?.id, 'geral-glossario');
  assert.ok(findManualSections('níveis de planejamento').some(s => s.id === 'geral-niveis-de-planejamento'));
  assert.ok(findManualSections('propostas aplicadas').some(s => s.id === 'agente-conversa-e-propostas'));
});

test('busca por perguntas reais acha a seção certa', () => {
  const first = (query: string) => findManualSections(query)[0]?.id;
  assert.equal(first('o que é takt?'), 'geral-glossario');
  assert.equal(first('O que significa PPC'), 'geral-glossario');
  assert.equal(first('como funciona o sistema'), 'geral-o-que-e-o-obra-360');
  assert.equal(first('quanto custa usar a Claudia? qual é o limite mensal de IA?'), 'agente-limites-e-custo');
  assert.equal(first('o que você sabe fazer?'), 'agente-o-que-faz');
  assert.equal(findManualSections('como aponto Não com causa na planilha da semana?')[0]?.screen, 'curto-prazo');
  assert.equal(findManualSections('como gero o PDF da terminalidade só de um pavimento')[0]?.screen, 'terminalidade');
  assert.equal(findManualSections('como entro no sistema com a conta Google')[0]?.screen, 'geral');
  assert.deepEqual(findManualSections('xyzzy plugh'), []);
  assert.deepEqual(findManualSections(''), []);
  assert.deepEqual(findManualSections('como faço isso?'), []);
  assert.ok(findManualSections('linha de base', 10).length <= 10);
});

test('renderManual junta as seções com título e id, e corta no limite com aviso', () => {
  const two = MANUAL_SECTIONS.slice(0, 2);
  const text = renderManual(two);
  for (const section of two) assert.ok(text.includes(`# ${section.title} (${section.id})`));
  const cut = renderManual(MANUAL_SECTIONS, 1200);
  assert.ok(cut.length <= 1200, `cortado em ${cut.length}`);
  assert.ok(cut.endsWith('Peça a seção específica pelo id para ler o resto.)'));
  // Três seções médias cabem no limite padrão sem corte na maioria dos casos; o limite existe para as grandes.
  assert.ok(MANUAL_MAX_CHARS >= 5000);
});

test('a ferramenta consultar_manual devolve a seção pelo id ou pelo tema e, sem casar, o índice como erro', () => {
  assert.ok(AGENT_TOOL_SPECS.some(spec => spec.name === 'consultar_manual'));
  const byId = runAgentTool('consultar_manual', { tema: 'geral-glossario' }, ctx());
  assert.equal(byId.error, undefined);
  assert.ok(byId.result.includes('(geral-glossario)') && byId.result.includes('Takt'));
  const byTopic = runAgentTool('consultar_manual', { tema: 'limite mensal de IA' }, ctx());
  assert.ok(byTopic.result.includes('agente-limites-e-custo'));
  const none = runAgentTool('consultar_manual', { tema: 'xyzzy' }, ctx());
  assert.equal(none.error, true);
  assert.ok(none.result.includes('- geral-glossario: '));
  const empty = runAgentTool('consultar_manual', {}, ctx());
  assert.equal(empty.error, true);
});

test('o manual do curto prazo lista todas as causas de não cumprimento, e o da assistente usa o nome dela', () => {
  const curto = MANUAL_SECTIONS.filter(s => s.screen === 'curto-prazo')
    .map(s => s.body)
    .join('\n');
  for (const cause of NON_FULFILLMENT_CAUSES) assert.ok(curto.includes(cause), `causa fora do manual: ${cause}`);
  const agente = MANUAL_SECTIONS.filter(s => s.screen === 'agente');
  assert.ok(agente.length >= 3);
  // O nome vem da constante: trocar `NEXT_PUBLIC_AGENT_NAME` troca o manual junto, sem "Claudia" escrito à mão.
  assert.ok(agente.some(s => s.body.includes(AGENT.name)));
  assert.ok(!agente.some(s => /Vagner/.test(s.body)));
});

test('screenBlock descreve a tela conhecida e ignora a desconhecida', () => {
  assert.ok(screenBlock('curto-prazo')?.text.includes('Aba 4 · Cronograma de curto prazo'));
  assert.ok(screenBlock('vagoes')?.text.includes('Aba 2'));
  assert.equal(screenBlock('nao-existe'), undefined);
  assert.equal(screenBlock(undefined), undefined);
  assert.equal(isManualScreen('ifc'), true);
  assert.equal(isManualScreen('toString'), false);
  assert.equal(isManualScreen(42), false);
});
