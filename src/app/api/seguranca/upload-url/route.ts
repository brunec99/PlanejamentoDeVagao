import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { canWriteSafety } from '@/application/use-cases/safety-commands';
import { SAFETY_LIMITS, SAFETY_TST_ONLY_MESSAGE, safetyPhotoPaths } from '@/domain/safety';
import {
  createPhotoUploadUrls,
  findItemForUpload,
  findWorkIdForEntity,
  removeUploadedPhotoFiles,
  SafetyUnavailableError,
} from '@/infrastructure/repositories/supabase/safety-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Upload = { workId: string; itemId: string; photoId: string };

/** Perfil TST e corpo `{ workId, itemId, photoId }` válido, com acesso à obra; o mesmo para liberar e para
 * descartar um envio. Devolve a resposta de erro quando algo falha. */
async function parseUpload(request: Request): Promise<{ profile: { id: string }; upload: Upload } | NextResponse> {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  // Mesma regra dos comandos: só TST envia foto, qualquer que seja o papel.
  if (!canWriteSafety(profile)) return responseError(SAFETY_TST_ONLY_MESSAGE, 403);

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
  // Os ids entram no caminho do arquivo: só UUID, para ninguém montar um caminho fora do apontamento.
  if (!UUID.test(itemId)) return responseError('Apontamento não informado.', 400);
  if (!UUID.test(photoId)) return responseError('Identificador da foto inválido.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  return { profile, upload: { workId, itemId, photoId } };
}

/** Como na aba 5, a foto vai do navegador direto ao Storage (bucket `seguranca`) com URLs assinadas
 * devolvidas aqui; o caminho é fixo (`safetyPhotoPaths`), e o `add_photo` só aceita esse mesmo caminho. A
 * chave de serviço nunca sai do servidor. */
export async function POST(request: Request) {
  const parsed = await parseUpload(request);
  if (parsed instanceof NextResponse) return parsed;
  const { profile, upload } = parsed;
  const { workId, itemId, photoId } = upload;

  try {
    const item = await findItemForUpload(itemId);
    if (!item || item.workId !== workId) return responseError('Apontamento não encontrado. Recarregue a página.', 404);
    // "Já registrada" antes do limite (05/11/2026): no modo de campo, se a resposta do envio da 10ª foto se
    // perde, a nova tentativa usa o mesmo id e precisa ouvir "já registrada" (conta como enviada), não o limite.
    if (await findWorkIdForEntity('photos', photoId)) return responseError('Esta foto já foi registrada.', 400);
    if (item.photoCount >= SAFETY_LIMITS.maxPhotosPerItem)
      return responseError(`O apontamento já tem ${SAFETY_LIMITS.maxPhotosPerItem} fotos, o máximo permitido.`, 400);
    const tickets = await createPhotoUploadUrls(safetyPhotoPaths(workId, itemId, photoId));
    if (!tickets) return responseError('Não foi possível liberar o envio da foto. Tente novamente.', 502);
    return NextResponse.json(tickets, { headers });
  } catch (error) {
    if (error instanceof SafetyUnavailableError) return responseError(error.message, 503);
    logRouteError('POST /api/seguranca/upload-url', error, { actorId: profile.id, workId });
    return responseError('Não foi possível liberar o envio da foto. Tente novamente.', 502);
  }
}

/** Descarta os arquivos de um envio que falhou no meio (imagem subiu, miniatura não) e nunca virou
 * `add_photo`. Só apaga se não há linha em `safety_photos` para o id: foto registrada sai pelo
 * `delete_photo`. Como na aba 5, um envio abandonado sem esta chamada (aba fechada, sem rede) ainda deixa
 * arquivo órfão no bucket privado. */
export async function DELETE(request: Request) {
  const parsed = await parseUpload(request);
  if (parsed instanceof NextResponse) return parsed;
  const { profile, upload } = parsed;
  const { workId, itemId, photoId } = upload;

  try {
    if (await findWorkIdForEntity('photos', photoId)) return responseError('Esta foto já foi registrada; apague-a pelo apontamento.', 409);
    await removeUploadedPhotoFiles(safetyPhotoPaths(workId, itemId, photoId));
    return NextResponse.json({ removed: true }, { headers });
  } catch (error) {
    if (error instanceof SafetyUnavailableError) return responseError(error.message, 503);
    logRouteError('DELETE /api/seguranca/upload-url', error, { actorId: profile.id, workId });
    return responseError('Não foi possível descartar o envio da foto.', 502);
  }
}
