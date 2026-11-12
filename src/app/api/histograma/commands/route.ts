import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import {
  canWriteHeadcount,
  headcountCommandTarget,
  parseHeadcountCommand,
  planHeadcountCommand,
  type HeadcountMutation,
} from '@/application/use-cases/headcount-commands';
import { HEADCOUNT_READ_ONLY_MESSAGE, type HeadcountCommand } from '@/domain/headcount';
import {
  applyHeadcountMutationToDb,
  findHeadcountWorkId,
  HeadcountConflictError,
  HeadcountUnavailableError,
  loadHeadcount,
} from '@/infrastructure/repositories/supabase/headcount-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Um comando da aba 7 por requisição. `?workId=` é a obra aberta na tela. Aplica as regras
 * (`planHeadcountCommand`) sobre os dados atuais, grava e devolve só o que mudou (`insert`, `update`,
 * `delete`): a tela aplica a mesma mutação no que já tem, sem reler dez mil linhas a cada lançamento. */
export async function POST(request: NextRequest) {
  const gate = await requireModuleAccess('histograma');
  if (gate.error) return gate.error;
  const profile = gate.access.profile;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!canWriteHeadcount(profile)) return responseError(HEADCOUNT_READ_ONLY_MESSAGE, 403);

  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  let command: HeadcountCommand;
  try {
    command = parseHeadcountCommand(await request.json().catch(() => null));
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }
  if (!workId) return responseError('Obra não informada.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  const target = headcountCommandTarget(command);
  // O comando que traz a obra tem de ser da obra aberta: o acesso conferido é o dela.
  if ('workId' in target && target.workId !== workId) return responseError('O comando é de outra obra. Recarregue a página.', 400);

  try {
    // Linha de outra obra conta como não encontrada: a tela só manda o que está nela.
    if ('entryId' in target && (await findHeadcountWorkId(target.entryId)) !== workId)
      return responseError('Lançamento não encontrado. Recarregue a página.', 404);

    const current = await loadHeadcount(workId);
    let mutation: HeadcountMutation;
    try {
      mutation = planHeadcountCommand(current, command, commandContext(profile.id), workId);
    } catch (error) {
      // O planejador é puro: tudo o que ele recusa é regra de negócio, com mensagem para o usuário.
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    await applyHeadcountMutationToDb(mutation);
    return NextResponse.json({ insert: mutation.insert, update: mutation.update, delete: mutation.delete }, { headers });
  } catch (error) {
    if (error instanceof HeadcountUnavailableError) return responseError(error.message, 503);
    if (error instanceof HeadcountConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/histograma/commands', error, { actorId: profile.id, workId, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
