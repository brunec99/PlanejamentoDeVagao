import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import { LOB_LIMITS, lobPhotoPaths } from '@/domain/lob';
import {
  createPhotoUploadUrls,
  findItemForUpload,
  findWorkIdForEntity,
  LobUnavailableError,
  removeUploadedPhotoFiles,
} from '@/infrastructure/repositories/supabase/lob-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Upload = { workId: string; itemId: string; photoId: string };

/** Mesmo desenho da Terminalidade: a foto vai do navegador direto ao Storage com URLs assinadas
 * devolvidas aqui; o caminho é fixo (`lobPhotoPaths`) e o `add_photo` só aceita esse caminho. */
async function parseUpload(request: Request): Promise<{ profile: { id: string }; upload: Upload } | NextResponse> {
  const gate = await requireModuleAccess('longo-prazo');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
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
  if (!UUID.test(itemId)) return responseError('Lançamento não informado.', 400);
  if (!UUID.test(photoId)) return responseError('Identificador da foto inválido.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  return { profile, upload: { workId, itemId, photoId } };
}

export async function POST(request: Request) {
  const parsed = await parseUpload(request);
  if (parsed instanceof NextResponse) return parsed;
  const { profile, upload } = parsed;
  const { workId, itemId, photoId } = upload;
  try {
    const item = await findItemForUpload(itemId);
    if (!item || item.workId !== workId) return responseError('Lançamento não encontrado. Salve o valor antes de anexar a foto.', 404);
    if (item.photoCount >= LOB_LIMITS.maxPhotosPerItem)
      return responseError(`Este bloco já tem ${LOB_LIMITS.maxPhotosPerItem} fotos nesta medição, o máximo.`, 400);
    if (await findWorkIdForEntity('photos', photoId)) return responseError('Esta foto já foi registrada.', 400);
    const tickets = await createPhotoUploadUrls(lobPhotoPaths(workId, itemId, photoId));
    if (!tickets) return responseError('Não foi possível liberar o envio da foto. Tente novamente.', 502);
    return NextResponse.json(tickets, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return responseError(error.message, 503);
    logRouteError('POST /api/lob/upload-url', error, { actorId: profile.id, workId });
    return responseError('Não foi possível liberar o envio da foto. Tente novamente.', 502);
  }
}

/** Descarta os arquivos de um envio que falhou no meio e nunca virou `add_photo`. */
export async function DELETE(request: Request) {
  const parsed = await parseUpload(request);
  if (parsed instanceof NextResponse) return parsed;
  const { profile, upload } = parsed;
  const { workId, itemId, photoId } = upload;
  try {
    if (await findWorkIdForEntity('photos', photoId)) return responseError('Foto registrada: use "Excluir foto".', 400);
    await removeUploadedPhotoFiles(lobPhotoPaths(workId, itemId, photoId));
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return responseError(error.message, 503);
    logRouteError('DELETE /api/lob/upload-url', error, { actorId: profile.id, workId });
    return responseError('Não foi possível descartar o envio.', 502);
  }
}
