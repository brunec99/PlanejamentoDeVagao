import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import {
  parsePendingCommand,
  pendingCommandTarget,
  planPendingCommand,
  type PendingMutation,
  type PendingNotification,
  type PendingTarget,
} from '@/application/use-cases/pending-commands';
import type { PendingCommand, PendingResponse } from '@/domain/pending-board';
import {
  applyMutation,
  findWorkIdForEntity,
  listPeople,
  loadPending,
  loadWorkName,
  PendingConflictError,
  PendingUnavailableError,
  resolveSourceForCreate,
} from '@/infrastructure/repositories/supabase/pending-repository';
import { enqueuePendingEmail, pendingEmail } from '@/infrastructure/email/takt-outbox';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const ROUTE = 'POST /api/pendencias/commands';

/** Avisos por e-mail de um comando já gravado. Nada aqui derruba o comando: cada falha (tipo ainda não
 * publicado no Takt Hub, pessoa sem endereço, fila fora do ar) vira uma linha de log sem endereço nem
 * texto da mensagem, e segue. */
async function sendNotifications(
  notifications: PendingNotification[],
  ctx: { workId: string; origin: string; now: string; actorId: string },
) {
  if (!notifications.length) return;
  try {
    const workName = await loadWorkName(ctx.workId);
    const results = await Promise.allSettled(notifications.map(n => enqueuePendingEmail(pendingEmail(n, { ...ctx, workName }))));
    results.forEach((result, at) => {
      if (result.status === 'rejected')
        logRouteError(`${ROUTE} (e-mail)`, result.reason, {
          actorId: ctx.actorId,
          workId: ctx.workId,
          cardId: notifications[at].cardId,
          reason: notifications[at].reason,
          toUserId: notifications[at].userId,
        });
    });
  } catch (error) {
    logRouteError(`${ROUTE} (e-mail)`, error, { actorId: ctx.actorId, workId: ctx.workId, notifications: notifications.length });
  }
}

/** Um comando da lista de pendência por requisição. `?workId=` é a obra aberta na tela: é a obra que
 * volta na resposta e a que serve de conferência de acesso. Grava quem abre a aba 2 (módulo `vagoes`) e
 * tem a obra, em qualquer papel (regra 1); a exclusão do card o planejador restringe a quem criou e aos
 * admins. Aplica as regras (`planPendingCommand`) sobre os dados atuais, grava, enfileira os e-mails e
 * devolve a obra já atualizada, no mesmo formato do GET. */
export async function POST(request: NextRequest) {
  const gate = await requireModuleAccess('vagoes');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);

  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  let command: PendingCommand;
  let target: PendingTarget;
  try {
    command = parsePendingCommand(await request.json().catch(() => null));
    target = pendingCommandTarget(command);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }
  if (!workId) return responseError('Obra não informada.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  // O comando que traz a obra tem de ser da obra aberta: a resposta é dela, e o acesso conferido também.
  if ('workId' in target && target.workId !== workId) return responseError('O comando é de outra obra. Recarregue a página.', 400);

  const admin = profile.role === 'admin';
  try {
    if ('table' in target) {
      // Registro de outra obra conta como não encontrado: a tela só manda o que está nela.
      const owner = await findWorkIdForEntity(target.table, target.id);
      if (owner !== workId) return responseError('Registro não encontrado. Recarregue a página.', 404);
    }

    const [current, people] = await Promise.all([loadPending(workId), listPeople(workId)]);
    // A entrega do card ligado a tarefa ou serviço não é digitada: sai do início atual da origem, que
    // precisa existir nesta obra (regras 4 e 5). Sem origem achada o planejador recusa.
    const source =
      command.type === 'create_card' &&
      (command.origin === 'medio_prazo' || command.origin === 'longo_prazo') &&
      typeof command.sourceId === 'string' &&
      command.sourceId
        ? await resolveSourceForCreate(workId, command.origin, command.sourceId)
        : null;
    const ctx = { ...commandContext(profile.id), admin, people, ...(source ? { source } : {}) };
    let mutation: PendingMutation;
    try {
      mutation = planPendingCommand(current, command, ctx);
    } catch (error) {
      // O planejador é puro: tudo o que ele recusa é regra de negócio, com mensagem para o usuário.
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    // Defesa extra: o planejador só enxerga a obra carregada, mas a gravação não pode sair dela.
    if (mutation.workId !== workId) return responseError('Você não tem acesso a esta obra.', 403);
    await applyMutation(mutation);
    await sendNotifications(mutation.notifications, { workId, origin: request.nextUrl.origin, now: ctx.now, actorId: profile.id });
    const fresh = await loadPending(workId);
    return NextResponse.json({ available: true, people, admin, actorId: profile.id, ...fresh } satisfies PendingResponse, { headers });
  } catch (error) {
    if (error instanceof PendingUnavailableError) return responseError(error.message, 503);
    if (error instanceof PendingConflictError) return responseError(error.message, 409);
    logRouteError(ROUTE, error, { actorId: profile.id, workId, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
