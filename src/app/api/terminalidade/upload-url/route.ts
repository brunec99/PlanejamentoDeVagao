import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { TERMINALITY_LIMITS, terminalityPhotoPaths } from '@/domain/terminality';
import {
  createPhotoUploadUrls,
  findItemForUpload,
  findWorkIdForEntity,
  TerminalityUnavailableError,
} from '@/infrastructure/repositories/supabase/terminality-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Como no IFC, a foto vai do navegador direto ao Storage com URLs assinadas devolvidas aqui; o
 * caminho é fixo (`terminalityPhotoPaths`), e o `add_photo` só aceita esse mesmo caminho. A chave de
 * serviço nunca sai do servidor. */
export async function POST(request: Request) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);

  let body: { workId?: unknown; itemId?: unknown; photoId?: unknown };
  try {
    body = await request.json();
  } catch {
    return responseError('Corpo da requisição inválido.', 400);
  }
  const workId = typeof body?.workId === 'string' ? body.workId : '';
  const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
  const photoId = typeof body?.photoId === 'string' ? body.photoId : '';
  if (!workId) return responseError('Obra não informada.', 400);
  if (!itemId) return responseError('Pendência não informada.', 400);
  if (!UUID.test(photoId)) return responseError('Identificador da foto inválido.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);

  try {
    const item = await findItemForUpload(itemId);
    if (!item || item.workId !== workId) return responseError('Pendência não encontrada. Recarregue a página.', 404);
    if (item.photoCount >= TERMINALITY_LIMITS.maxPhotosPerItem)
      return responseError(`A pendência já tem ${TERMINALITY_LIMITS.maxPhotosPerItem} fotos, o máximo permitido.`, 400);
    if (await findWorkIdForEntity('photos', photoId)) return responseError('Esta foto já foi registrada.', 400);
    const tickets = await createPhotoUploadUrls(terminalityPhotoPaths(workId, itemId, photoId));
    if (!tickets) return responseError('Não foi possível liberar o envio da foto. Tente novamente.', 502);
    return NextResponse.json(tickets, { headers });
  } catch (error) {
    if (error instanceof TerminalityUnavailableError) return responseError(error.message, 503);
    logRouteError('POST /api/terminalidade/upload-url', error, { actorId: profile.id, workId });
    return responseError('Não foi possível liberar o envio da foto. Tente novamente.', 502);
  }
}
