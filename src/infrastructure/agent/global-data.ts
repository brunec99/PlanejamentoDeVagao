import type { PlanningData, User } from '../../domain/entities';
import type { LongTermPlanDocument } from '../../domain/long-term-plan';
import { buildBriefing, type AgentBriefing, type BriefingLevel } from '../../domain/agent-briefing';
import { startOfWeek } from '../../domain/validation';
import { hasSectionAccess } from '../../application/module-access';
import { scopePlanning, slimForModules } from '../../application/use-cases/scope-planning';
import { getPlanning, type Planning } from '../../application/use-cases/get-planning';
import type { PlanningRepository } from '../../application/ports/planning-repository';
import type { ToolContext } from '../../application/use-cases/agent-tools';
import type { AgentDataLoader, WorkSettingsInfo } from '../../application/use-cases/agent-global-tools';
import type { PeriodSelection } from '../../modules/dashboard/period';
import { SupabasePlanningRepository } from '../repositories/supabase/planning-repository';
import { getServiceClient } from '../repositories/supabase/client';
import { loadTerminality, TerminalityUnavailableError } from '../repositories/supabase/terminality-repository';
import { loadSafety, SafetyUnavailableError } from '../repositories/supabase/safety-repository';
import { loadLob, LobUnavailableError } from '../repositories/supabase/lob-repository';
import { readPortfolioSources } from '../repositories/supabase/portfolio-sources';
import { composePortfolio, portfolioText } from '../../modules/dashboard/portfolio/compose';

/** Dados da Claudia geral (08/11/2026). Cada ferramenta pede só a obra e o módulo de que precisa, e o
 * carregador lê sob demanda, guardando o que já leu durante a pergunta (uma pergunta pode chamar
 * `listar_semana` e `resumo_obra` da mesma obra, ou o panorama e o detalhe de uma obra). Nada aqui
 * sobrevive à requisição. Os recortes são os mesmos das rotas de cada módulo: obras da pessoa
 * (`scopePlanning`), módulos liberados (`slimForModules` para quem não desenvolve) e as mesmas leituras
 * de terminalidade, segurança e Linha de Balanço que as telas usam. */

export interface LoaderAccess {
  profile: User;
  developer: boolean;
  modules: string[];
  today: string;
}

const SECTION_OF: Record<BriefingLevel, string> = { longo: 'longo-prazo', medio: 'medio-prazo', curto: 'curto-prazo' };
const ALL_LEVELS: BriefingLevel[] = ['longo', 'medio', 'curto'];

/** Guarda a promessa (e não o valor): duas ferramentas da mesma volta pedindo a mesma obra fazem uma leitura só. */
function memo<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return key => {
    let pending = cache.get(key);
    if (!pending) {
      pending = load(key);
      cache.set(key, pending);
      // Erro não fica guardado: a próxima chamada tenta de novo.
      pending.catch(() => cache.delete(key));
    }
    return pending;
  };
}

/** Repositório de leitura para `getPlanning`, que só usa o snapshot. */
const readOnly = (data: PlanningData): PlanningRepository =>
  ({
    getSnapshot: async () => data,
    transaction: async () => {
      throw new Error('Somente leitura.');
    },
    commit: async () => {
      throw new Error('Somente leitura.');
    },
  }) as unknown as PlanningRepository;

/** `null` quando a tabela do módulo ainda não existe (migração não aplicada). */
async function orUnavailable<T>(load: () => Promise<T>, unavailable: new () => Error): Promise<T | null> {
  try {
    return await load();
  } catch (cause) {
    if (cause instanceof unavailable) return null;
    throw cause;
  }
}

export function createAgentDataLoader(access: LoaderAccess): AgentDataLoader {
  const { profile, developer, modules, today } = access;
  const levels = ALL_LEVELS.filter(level => hasSectionAccess(SECTION_OF[level], { developer, modules }));
  const allowed = new Set(profile.workIds);
  const repository = new SupabasePlanningRepository();
  const trim = (data: PlanningData) => (developer ? data : slimForModules(data, modules));
  const guard = (workId: string) => {
    if (!allowed.has(workId)) throw new Error('Obra fora do acesso da pessoa.');
  };

  /** Snapshot recortado de um conjunto de obras (chave = ids ordenados). */
  const snapshot = memo(async (key: string) => trim(scopePlanning(await repository.getSnapshot({ workIds: key.split(',') }), profile.id)));
  const workData = (workId: string) => {
    guard(workId);
    return snapshot(workId);
  };

  const longTermPlan = memo(async (workId: string): Promise<LongTermPlanDocument | undefined> => {
    if (!levels.includes('longo')) return undefined;
    const { data, error } = await getServiceClient().from('long_term_plans').select('document').eq('work_id', workId).maybeSingle();
    if (error || !data?.document || typeof data.document !== 'object') return undefined;
    return data.document as LongTermPlanDocument;
  });
  const settings = memo(async (workId: string): Promise<WorkSettingsInfo> => {
    const { data, error } = await getServiceClient().from('work_settings').select('*').eq('work_id', workId).maybeSingle();
    if (error || !data) return {};
    const row = data as { week_one_start?: string | null; place?: string | null };
    return {
      ...(row.week_one_start ? { weekOne: startOfWeek(row.week_one_start) } : {}),
      ...(row.place ? { place: row.place } : {}),
    };
  });

  const workContext = memo(async (workId: string): Promise<ToolContext> => {
    const [data, plan, info] = await Promise.all([workData(workId), longTermPlan(workId), settings(workId)]);
    return {
      data,
      workId,
      today,
      actor: { id: profile.id, role: profile.role },
      levels,
      weekOne: info.weekOne,
      longTermPlan: plan,
      newId: () => crypto.randomUUID(),
    };
  });

  /** Nomes dos perfis, lidos uma vez por pergunta, para o relatório da segurança dizer quem lançou. */
  const userNames = memo(async (): Promise<{ id: string; name: string }[]> => {
    const { data, error } = await getServiceClient().from('profiles').select('id, name');
    return error ? [] : ((data ?? []) as { id: string; name: string }[]);
  });

  const planningOf = memo(async (key: string): Promise<Planning> => getPlanning(readOnly(await snapshot(key)), today));

  return {
    workContext,
    briefing: async (workId: string): Promise<AgentBriefing> => {
      const ctx = await workContext(workId);
      return buildBriefing({ data: ctx.data, workId, today, levels, longTermPlan: ctx.longTermPlan, weekOne: ctx.weekOne });
    },
    planning: async (workId: string) => {
      guard(workId);
      return planningOf(workId);
    },
    terminality: memo(async (workId: string) => {
      guard(workId);
      return orUnavailable(() => loadTerminality(workId), TerminalityUnavailableError);
    }),
    safety: memo(async (workId: string) => {
      guard(workId);
      const [data, users] = await Promise.all([orUnavailable(() => loadSafety(workId), SafetyUnavailableError), userNames('')]);
      // O apontamento guarda só o id de quem lançou: o relatório procura o nome em `users`, como o "Apontado por" da tela.
      return data ? Object.assign(data, { users }) : null;
    }),
    lob: memo(async (workId: string) => {
      guard(workId);
      if (!developer && !modules.includes('longo-prazo')) return null;
      return orUnavailable(() => loadLob(workId), LobUnavailableError);
    }),
    workSettings: async (workId: string) => {
      guard(workId);
      return settings(workId);
    },
    portfolio: async (selection: PeriodSelection, workIds: string[]) => {
      const ids = [...new Set(workIds.filter(id => allowed.has(id)))].sort();
      if (!ids.length) return 'Nenhuma obra para comparar.';
      const key = ids.join(',');
      const [planning, sources] = await Promise.all([
        planningOf(key),
        readPortfolioSources({ workIds: ids, actorId: profile.id, developer, modules }),
      ]);
      const works = planning.data.works.filter(work => ids.includes(work.id));
      const data = composePortfolio({ planning, works, sources, selection, today, developer, modules });
      return portfolioText(data);
    },
  };
}
