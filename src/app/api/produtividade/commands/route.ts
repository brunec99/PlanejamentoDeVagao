import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import {
  canWriteProduction,
  productionCommandTarget,
  parseProductionCommand,
  planProductionCommand,
  type ProductionMutation,
} from '@/application/use-cases/production-commands';
import { PRODUCTION_READ_ONLY_MESSAGE, type ProductionCommand } from '@/domain/production';
import {
  applyProductionMutationToDb,
  findProductionWorkId,
  ProductionConflictError,
  ProductionUnavailableError,
  loadProduction,
} from '@/infrastructure/repositories/supabase/production-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Um comando da aba 8 por requisição. `?workId=` é a obra aberta na tela. Aplica as regras
 * (`planProductionCommand`) sobre os dados atuais, grava e devolve só o que mudou (`insert`, `update`,
 * `delete`): a tela aplica a mesma mutação no que já tem, sem reler milhares de linhas a cada lançamento. */
export async function POST(request: NextRequest) {
  const gate = await requireModuleAccess('produtividade');
  if (gate.error) return gate.error;
  const profile = gate.access.profile;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!canWriteProduction(profile)) return responseError(PRODUCTION_READ_ONLY_MESSAGE, 403);

  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  let command: ProductionCommand;
  try {
    command = parseProductionCommand(await request.json().catch(() => null));
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }
  if (!workId) return responseError('Obra não informada.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  const target = productionCommandTarget(command);
  // O comando que traz a obra tem de ser da obra aberta: o acesso conferido é o dela.
  if ('workId' in target && target.workId !== workId) return responseError('O comando é de outra obra. Recarregue a página.', 400);

  try {
    // Linha de outra obra conta como não encontrada: a tela só manda o que está nela.
    if ('entryId' in target && (await findProductionWorkId(target.entryId)) !== workId)
      return responseError('Lançamento não encontrado. Recarregue a página.', 404);

    const current = await loadProduction(workId);
    let mutation: ProductionMutation;
    try {
      mutation = planProductionCommand(current, command, commandContext(profile.id), workId);
    } catch (error) {
      // O planejador é puro: tudo o que ele recusa é regra de negócio, com mensagem para o usuário.
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    await applyProductionMutationToDb(mutation);
    return NextResponse.json({ insert: mutation.insert, update: mutation.update, delete: mutation.delete }, { headers });
  } catch (error) {
    if (error instanceof ProductionUnavailableError) return responseError(error.message, 503);
    if (error instanceof ProductionConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/produtividade/commands', error, { actorId: profile.id, workId, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
