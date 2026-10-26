import { NextResponse } from 'next/server';
import { applyCommand, type Command } from '@/application/use-cases/commands';
import { commandScope } from '@/application/use-cases/command-scope';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { isCommandAllowed, RESTRICTED_MODULE_MESSAGE } from '@/application/module-access';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError, logRouteTiming, serverTimingHeader, SLOW_ROUTE_MS } from '@/infrastructure/log';
export const runtime = 'nodejs';
const ROUTE = 'POST /api/planning/commands';
export async function POST(request: Request) {
  // Tempo por fase (`auth`, `commit`, `total`), devolvido em `Server-Timing` em toda resposta, inclusive
  // nas recusas de regra: é o que diz se uma gravação lenta na obra parou na sessão ou no banco.
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const { profile, developer, modules } = await getRouteAccess();
  durations.auth = performance.now() - startedAt;
  let command: Command | undefined;
  const respond = (body: unknown, status: number) => {
    durations.total = performance.now() - startedAt;
    if (durations.total > SLOW_ROUTE_MS) logRouteTiming(ROUTE, durations, { actorId: profile?.id, type: command?.type, status });
    return NextResponse.json(body, { status, headers: { 'Server-Timing': serverTimingHeader(durations) } });
  };
  if (!profile) return respond({ error: 'Perfil não provisionado. Contate o gestor.' }, 403);
  try {
    command = (await request.json()) as Command;
  } catch {
    return respond({ error: 'Corpo da requisição inválido.' }, 400);
  }
  // Go-live do curto prazo: fora do desenvolvimento, só os comandos dele, das equipes e da administração,
  // mais os dos módulos liberados para a pessoa.
  if (!isCommandAllowed(command?.type, { developer, modules })) return respond({ error: RESTRICTED_MODULE_MESSAGE }, 403);
  // Gerar vagões pelo plano só pela rota própria, que lê o plano salvo em vez de aceitar pavimentos do navegador.
  if (command?.type === 'sync_long_term_plan') return respond({ error: 'Use a geração de vagões do Planejador de longo prazo.' }, 400);
  const commitStartedAt = performance.now();
  try {
    const context = commandContext(profile.id);
    const parsed = command;
    // Comandos do curto prazo leem só o recorte deles (equipes e compromissos envolvidos); os demais,
    // o planejamento inteiro das obras do perfil. A gravação leva só o que mudou, nos dois casos.
    // A versão gravada vai junto: com ela a tela sabe que a projeção local já é a versão do banco e
    // não baixa o planejamento inteiro de novo (`confirmsOwnWrite`).
    const { result: id, version } = await new SupabasePlanningRepository().commit(
      draft => applyCommand(draft, parsed, context),
      commandScope(parsed, profile.workIds),
    );
    durations.commit = performance.now() - commitStartedAt;
    return respond({ id, version }, 200);
  } catch (error) {
    durations.commit = performance.now() - commitStartedAt;
    // Regra de negócio recusada volta como 400 com a mensagem; falha de infraestrutura é registrada.
    const message = error instanceof Error ? error.message : 'Falha ao aplicar o comando.';
    if (/Falha ao ler|Conflito de concorrência|fetch failed/i.test(message))
      logRouteError(ROUTE, error, { actorId: profile.id, type: command?.type });
    return respond({ error: message }, 400);
  }
}
