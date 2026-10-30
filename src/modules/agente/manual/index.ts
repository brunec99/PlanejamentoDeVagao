import { nameKey } from '../../../domain/agent-briefing';
import type { ManualSection } from './types';
import { sections as geral } from './geral';
import { sections as acessoConfiguracoes } from './acesso-configuracoes';
import { sections as longoPrazo } from './longo-prazo';
import { sections as vagoes } from './vagoes';
import { sections as medioPrazo } from './medio-prazo';
import { sections as curtoPrazo } from './curto-prazo';
import { sections as terminalidade } from './terminalidade';
import { sections as apoioBim } from './apoio-bim';
import { sections as agente } from './agente';

export type { ManualSection } from './types';

/** Manual do sistema para o agente de IA (29/10/2026). O índice (`manualIndex`) vai no prompt do sistema,
 * dentro do prefixo em cache; o texto de cada seção só vai ao modelo quando ele chama `consultar_manual`
 * com o id ou com o tema (`findManualSections`). Assim a dúvida de uso custa uma consulta a mais, e a
 * pergunta sobre os dados da obra não paga o manual inteiro. */

export const MANUAL_SECTIONS: readonly ManualSection[] = [
  ...geral,
  ...acessoConfiguracoes,
  ...longoPrazo,
  ...vagoes,
  ...medioPrazo,
  ...curtoPrazo,
  ...terminalidade,
  ...apoioBim,
  ...agente,
];

/** Rótulo de cada tela, na ordem do índice. A chave é o `screen` da seção e o `section` da URL da obra. */
export const SCREEN_LABEL: Readonly<Record<string, string>> = {
  geral: 'Geral: o sistema, os níveis e o glossário',
  obras: 'Lista de obras (/obras)',
  'configuracoes-gerais': 'Configurações do sistema, só admin (/configuracoes)',
  'longo-prazo': 'Aba 1 · Cronograma de longo prazo',
  vagoes: 'Aba 2 · Planejamento por vagões',
  'medio-prazo': 'Aba 3 · Cronograma de médio prazo',
  'curto-prazo': 'Aba 4 · Cronograma de curto prazo',
  terminalidade: 'Aba 5 · Terminalidade',
  federacao: 'Apoio · Modelo federado',
  ifc: 'Apoio · Arquivos IFC',
  dividas: 'Apoio · Dívidas',
  importar: 'Apoio · Integrações (Prevision)',
  configuracoes: 'Apoio · Configurações da obra',
  agente: 'A própria assistente de IA',
};
export const isManualScreen = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(SCREEN_LABEL, value);

/** Quantas seções uma consulta devolve, e o tamanho máximo do texto devolvido ao modelo. */
export const MANUAL_MAX_SECTIONS = 3;
export const MANUAL_MAX_CHARS = 7000;

export const manualSectionById = (id: string): ManualSection | undefined => {
  const key = nameKey(id);
  return MANUAL_SECTIONS.find(section => section.id === key);
};

/** O índice que vai no prompt: uma linha por seção, agrupadas por tela. */
export function manualIndex(): string {
  const groups = Object.entries(SCREEN_LABEL)
    .map(([screen, label]) => ({ label, sections: MANUAL_SECTIONS.filter(section => section.screen === screen) }))
    .filter(group => group.sections.length);
  return groups.map(group => `${group.label}\n${group.sections.map(s => `- ${s.id}: ${s.summary}`).join('\n')}`).join('\n');
}

// ─── Busca ─────────────────────────────────────────────────────────────────────

/** Palavras que toda pergunta tem e que não distinguem seção. */
const STOPWORDS = new Set(
  (
    'a o os as um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem sob sobre e ou mas que se ' +
    'como faco fazer fiz feito posso consigo consegue da deu onde fica ficam qual quais quem quando porque por que isso isto esse essa ' +
    'este esta aquilo aquele aquela meu minha meus minhas seu sua teu tua nosso nossa ele ela eles elas voce voces eu nos tem tenho ' +
    'tinha ter ha foi ser sou esta estao estou ficar fica vai vou ir mais menos muito pouco bem mal ja ainda aqui ali la nao sim ' +
    'sistema tela telas pagina obra 360 quero queria preciso gostaria pode podem deveria devo dever ajuda ajude me te lhe explica explique ' +
    'mostra mostre diz diga fala fale sei saber ' +
    // Nomes de módulo e de peça da interface: estão em toda pergunta ("nesta aba do médio prazo") e em toda seção.
    'aba abas modulo modulos botao botoes clique clicar longo medio curto prazo prazos'
  ).split(/\s+/),
);
/** Terminações comuns do português, da mais longa para a mais curta; só uma é tirada, e só se sobrarem
 * quatro letras. Uma só, porque tirar várias fundia "recurso" com "recuar". */
const SUFFIXES = [
  'mentos',
  'mento',
  'coes',
  'cao',
  'ndo',
  'ram',
  'rem',
  'mos',
  'ar',
  'er',
  'ir',
  'ou',
  'ei',
  'am',
  'em',
  'es',
  'as',
  'os',
  'a',
  'o',
  'e',
  'r',
  's',
];
/** Radical de comparação: tira uma terminação e fica com as cinco primeiras letras, para "apontar",
 * "aponto", "apontamento" e "apontamentos" virarem "apont"; "recuo" e "recuar", "recu"; "semana" e
 * "semanas", "seman"; "medir", "medição" e "medições", "medi". É heurística de pontuação, não análise
 * morfológica: "medida" e "medir" não se encontram. */
export function stem(word: string): string {
  const suffix = SUFFIXES.find(s => word.endsWith(s) && word.length - s.length >= 4);
  const root = suffix ? word.slice(0, -suffix.length) : word;
  return root.length > 5 ? root.slice(0, 5) : root;
}
const words = (text: string) =>
  nameKey(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const tokens = (text: string) => words(text).filter(word => word.length >= 3 && !STOPWORDS.has(word));

interface Indexed {
  section: ManualSection;
  phrases: { text: string; weight: number }[];
  title: Set<string>;
  keywords: Set<string>;
  body: Set<string>;
}
/** Em quantas seções cada radical aparece: palavra rara ("recuar", "rosca") pesa mais que palavra de
 * toda tela ("tarefa", "semana"), para a seção específica vencer a visão geral do módulo. */
let frequency: Map<string, number> | undefined;
const bodyWeight = (s: string) => {
  frequency ??= index().reduce((map, entry) => {
    for (const word of entry.body) map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const df = frequency.get(s) ?? 0;
  return df <= 3 ? 3 : df <= 8 ? 2 : 1;
};
/** Peso de uma expressão-chave inteira achada na pergunta: com mais de uma palavra vale mais; feita só de
 * palavras comuns ("o que é") vale pouco, porque cabe em qualquer pergunta. */
const phraseWeight = (phrase: string) => (!tokens(phrase).length ? 2 : phrase.includes(' ') ? 6 : 4);
let indexed: Indexed[] | undefined;
const index = (): Indexed[] =>
  (indexed ??= MANUAL_SECTIONS.map(section => ({
    section,
    // "médio prazo" e "medio prazo" são a mesma expressão depois de normalizar: contam uma vez.
    phrases: [...new Set(section.keywords.map(nameKey))]
      .filter(phrase => phrase.length >= 3)
      .map(text => ({ text, weight: phraseWeight(text) })),
    title: new Set(tokens(section.title).map(stem)),
    keywords: new Set(tokens(section.keywords.join(' ')).map(stem)),
    body: new Set(tokens(section.body).map(stem)),
  })));

/** Nomes pelos quais a pessoa chama cada tela (já normalizados). Citar o módulo na pergunta ("não vejo a
 * aba de longo prazo") é forte indício, mesmo que as palavras em si sejam comuns demais para pontuar. */
const SCREEN_NAMES: Readonly<Record<string, readonly string[]>> = {
  'longo-prazo': ['longo prazo', 'aba 1'],
  vagoes: ['vagoes', 'vagao', 'aba 2'],
  'medio-prazo': ['medio prazo', 'cronograma do mes', 'plano do mes', 'aba 3'],
  'curto-prazo': ['curto prazo', 'planilha da semana', 'planilha semanal', 'aba 4'],
  terminalidade: ['terminalidade', 'aba 5'],
  federacao: ['modelo federado', 'federacao', 'federado'],
  ifc: ['arquivos ifc', 'ifc'],
  dividas: ['dividas', 'divida'],
  importar: ['integracoes', 'prevision'],
  configuracoes: ['configuracoes da obra'],
  'configuracoes-gerais': ['configuracoes'],
  obras: ['lista de obras'],
};
const SCREEN_BONUS = 5;
const screenBonus = (screen: string, query: string) => (SCREEN_NAMES[screen]?.some(name => query.includes(name)) ? SCREEN_BONUS : 0);

/** Pontuação de uma seção para a pergunta: o módulo citado pelo nome, a expressão-chave inteira contida na
 * pergunta e, depois, cada palavra da pergunta que aparece no título, nas palavras-chave ou no texto. */
function score(entry: Indexed, query: string, queryTokens: string[]): number {
  let total = screenBonus(entry.section.screen, query);
  for (const phrase of entry.phrases) if (query.includes(phrase.text)) total += phrase.weight;
  for (const token of queryTokens) {
    const s = stem(token);
    if (entry.title.has(s)) total += 3;
    if (entry.keywords.has(s)) total += 2;
    if (entry.body.has(s)) total += bodyWeight(s);
  }
  return total;
}

/** As seções que respondem à pergunta, da mais provável para a menos. Um id exato (ou contido na
 * pergunta) devolve só aquela seção. Sem nada que case o bastante, devolve vazio. */
export function findManualSections(query: string, limit = MANUAL_MAX_SECTIONS): ManualSection[] {
  const q = nameKey(query);
  if (!q) return [];
  const exact = MANUAL_SECTIONS.find(section => section.id === q) ?? MANUAL_SECTIONS.find(section => q.includes(section.id));
  if (exact) return [exact];
  const queryTokens = tokens(q);
  // Só palavras comuns e nenhum módulo citado ("como faço isso aqui?"): não há o que casar.
  if (!queryTokens.length && !Object.keys(SCREEN_NAMES).some(screen => screenBonus(screen, q))) return [];
  return index()
    .map((entry, order) => ({ entry, order, points: score(entry, q, queryTokens) }))
    .filter(item => item.points >= 2)
    .sort((a, b) => b.points - a.points || a.order - b.order)
    .slice(0, Math.max(1, limit))
    .map(item => item.entry.section);
}

/** O texto que o modelo lê: título, id e corpo de cada seção, cortado no limite com aviso. */
export function renderManual(sections: readonly ManualSection[], maxChars = MANUAL_MAX_CHARS): string {
  const text = sections.map(section => `# ${section.title} (${section.id})\n\n${section.body.trim()}`).join('\n\n---\n\n');
  if (text.length <= maxChars) return text;
  const note = '\n\n(Texto cortado por tamanho. Peça a seção específica pelo id para ler o resto.)';
  return text.slice(0, Math.max(0, maxChars - note.length)).trimEnd() + note;
}
