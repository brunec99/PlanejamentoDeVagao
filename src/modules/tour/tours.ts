import { AGENT } from '../agente/agent-identity';
import { steps as agenteAdmin } from './pages/agente-admin';
import { steps as campo } from './pages/campo';
import { steps as configuracoes } from './pages/configuracoes';
import { steps as curtoPrazo } from './pages/curto-prazo';
import { steps as dividas } from './pages/dividas';
import { steps as federacao } from './pages/federacao';
import { steps as ifc } from './pages/ifc';
import { steps as longoPrazo } from './pages/longo-prazo';
import { steps as medioPrazo } from './pages/medio-prazo';
import { steps as obraConfiguracoes } from './pages/obra-configuracoes';
import { steps as obras } from './pages/obras';
import { steps as prevision } from './pages/prevision';
import { steps as terminalidade } from './pages/terminalidade';
import { steps as vagao } from './pages/vagao';
import { steps as planejamento } from './pages/vagoes';

/** Tour "Como usar esta tela" (botão "?" do cabeçalho): escurece a tela e destaca, um por vez, os botões e
 * campos dela, com a explicação ao lado. Cada tela tem o próprio arquivo em `pages/` (20/10/2026), para
 * as telas evoluírem sem disputar um arquivo só. Passo com alvo ausente na tela (papel sem permissão,
 * seção fechada, celular) é pulado sozinho; `tests/tour-targets.test.ts` confere que todo alvo existe. */
export interface TourStep {
  /** Valor do atributo `data-tour` do elemento a destacar. Omitido = passo introdutório central, sem alvo. */
  target?: string;
  title: string;
  body: string;
}

export type TourKey =
  | 'obras'
  | 'longoPrazo'
  | 'medioPrazo'
  | 'curtoPrazo'
  | 'terminalidade'
  | 'planejamento'
  | 'vagao'
  | 'ifc'
  | 'federacao'
  | 'prevision'
  | 'dividas'
  | 'obraConfiguracoes'
  | 'configuracoes'
  | 'agenteAdmin'
  | 'campo';

/** Fecho comum a todos os tours: aponta para o próprio botão, para a pessoa saber onde voltar. */
const CLOSING: TourStep = {
  target: 'ajuda',
  title: 'Sempre que precisar',
  body: 'Este botão refaz o tour da tela em que você estiver. Ele só explica: nada é alterado enquanto o tour está aberto.',
};
/** O agente de IA está em toda tela da obra (27/10/2026); fora da obra o alvo não existe e o passo é pulado. */
const AGENT_STEP: TourStep = {
  target: 'agente',
  title: `${AGENT.name}, ${AGENT.tagline}`,
  body: 'Abre a assistente de planejamento: ela lê o longo, o médio e o curto prazo desta obra, aponta o que não bate entre os níveis e responde perguntas. Também propõe edições na planilha da semana (levar linhas, criar linhas do plano do mês, apontar), que só são gravadas quando você clica em Aplicar.',
};
const withClosing = (steps: TourStep[]) => [...steps, AGENT_STEP, CLOSING];

const pages: Record<TourKey, TourStep[]> = {
  obras,
  longoPrazo,
  medioPrazo,
  curtoPrazo,
  terminalidade,
  planejamento,
  vagao,
  ifc,
  federacao,
  prevision,
  dividas,
  obraConfiguracoes,
  configuracoes,
  agenteAdmin,
  campo,
};
export const tours = Object.fromEntries(Object.entries(pages).map(([key, steps]) => [key, withClosing(steps)])) as Record<
  TourKey,
  TourStep[]
>;

export function resolveTourKey(pathname: string): TourKey | null {
  if (pathname === '/obras') return 'obras';
  if (/^\/obras\/[^/]+\/longo-prazo$/.test(pathname)) return 'longoPrazo';
  if (/^\/obras\/[^/]+\/medio-prazo$/.test(pathname)) return 'medioPrazo';
  if (/^\/obras\/[^/]+\/curto-prazo$/.test(pathname)) return 'curtoPrazo';
  if (/^\/obras\/[^/]+\/terminalidade$/.test(pathname)) return 'terminalidade';
  if (/^\/obras\/[^/]+\/vagoes$/.test(pathname)) return 'planejamento';
  if (/^\/obras\/[^/]+\/vagoes\/[^/]+$/.test(pathname)) return 'vagao';
  if (/^\/obras\/[^/]+\/ifc$/.test(pathname)) return 'ifc';
  if (/^\/obras\/[^/]+\/federacao$/.test(pathname)) return 'federacao';
  if (/^\/obras\/[^/]+\/importar$/.test(pathname)) return 'prevision';
  if (/^\/obras\/[^/]+\/dividas$/.test(pathname)) return 'dividas';
  if (/^\/obras\/[^/]+\/configuracoes$/.test(pathname)) return 'obraConfiguracoes';
  if (pathname === '/configuracoes') return 'configuracoes';
  if (pathname === '/configuracoes/agente') return 'agenteAdmin';
  if (/^\/campo\/terminalidade\/?$/.test(pathname)) return 'campo';
  return null;
}
