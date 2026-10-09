import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { TERMINALITY_LIMITS, terminalityPhotoPaths } from '@/domain/terminality';
import {
  createPhotoUploadUrls,
  findItemForUpload,
  findWorkIdForEntity,
  removeUploadedPhotoFiles,
  TerminalityUnavailableError,
} from '@/infrastructure/repositories/supabase/terminality-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Upload = { workId: string; itemId: string; photoId: string };

/** Perfil com permissão de gravar e corpo `{ workId, itemId, photoId }` válido, com acesso à obra;
 * o mesmo para liberar e para descartar um envio. Devolve a resposta de erro quando algo falha. */
async function parseUpload(request: Request): Promise<{ profile: { id: string }; upload: Upload } | NextResponse> {
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
  // Os ids entram no caminho do arquivo: só UUID, para ninguém montar um caminho fora da pendência.
  if (!UUID.test(itemId)) return responseError('Pendência não informada.', 400);
  if (!UUID.test(photoId)) return responseError('Identificador da foto inválido.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  return { profile, upload: { workId, itemId, photoId } };
}

/** Como no IFC, a foto vai do navegador direto ao Storage com URLs assinadas devolvidas aqui; o
 * caminho é fixo (`terminalityPhotoPaths`), e o `add_photo` só aceita esse mesmo caminho. A chave de
 * serviço nunca sai do servidor. */
export async function POST(request: Request) {
  const parsed = await parseUpload(request);
  if (parsed instanceof NextResponse) return parsed;
  const { profile, upload } = parsed;
  const { workId, itemId, photoId } = upload;

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

/** Descarta os arquivos de um envio que falhou no meio (imagem subiu, miniatura não) e nunca virou
 * `add_photo`. Só apaga se não há linha em `terminality_photos` para o id: foto registrada sai pelo
 * `delete_photo`. Os tickets de envio não ficam registrados, então um envio abandonado sem esta
 * chamada (aba fechada, sem rede) ainda deixa arquivo órfão: uma limpeza periódica do bucket, por
 * arquivos sem linha, fica como pendência. */
export async function DELETE(request: Request) {
  const parsed = await parseUpload(request);
  if (parsed instanceof NextResponse) return parsed;
  const { profile, upload } = parsed;
  const { workId, itemId, photoId } = upload;

  try {
    if (await findWorkIdForEntity('photos', photoId)) return responseError('Esta foto já foi registrada; apague-a pela pendência.', 409);
    await removeUploadedPhotoFiles(terminalityPhotoPaths(workId, itemId, photoId));
    return NextResponse.json({ removed: true }, { headers });
  } catch (error) {
    if (error instanceof TerminalityUnavailableError) return responseError(error.message, 503);
    logRouteError('DELETE /api/terminalidade/upload-url', error, { actorId: profile.id, workId });
    return responseError('Não foi possível descartar o envio da foto.', 502);
  }
}
