import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { ChecklistUnavailableError, findChecklistRun, signRunFiles } from '@/infrastructure/repositories/supabase/checklist-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** A assinatura e as fotos de UMA inspeção, em URLs assinadas por uma hora (o bucket `checklist` é privado).
 * A tela pede só quando alguém abre a inspeção, em vez de assinar o histórico inteiro a cada carga. Lê quem
 * tem a obra liberada, como o resto da aba. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  const runId = request.nextUrl.searchParams.get('runId') ?? '';
  if (!workId || !runId) return responseError('Inspeção não informada.', 400);
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const run = await findChecklistRun(runId);
    if (!run || run.workId !== workId) return responseError('Inspeção não encontrada. Recarregue a página.', 404);
    return NextResponse.json(await signRunFiles(run), { headers });
  } catch (error) {
    if (error instanceof ChecklistUnavailableError) return responseError(error.message, 503);
    logRouteError('GET /api/checklist/arquivos', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar a assinatura e as fotos.', 502);
  }
}
