import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { canWriteChecklist } from '@/application/use-cases/checklist-commands';
import { CHECKLIST_WINDOW_DAYS, shiftDay } from '@/domain/equipment-checklist';
import { ChecklistUnavailableError, loadChecklist } from '@/infrastructure/repositories/supabase/checklist-repository';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Checklists de equipamentos de uma obra: os modelos (lista única), os equipamentos dela e as inspeções
 * dos últimos `CHECKLIST_WINDOW_DAYS` dias. Lê quem tem a obra liberada, como na aba 6; `canEdit` diz se
 * quem pediu é TST ou admin (a tela só esconde botões, quem barra é o POST). Sem a migração 0047 responde
 * "indisponível": só a aba 9 fica fora. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const today = todayInSaoPaulo();
    const data = await loadChecklist(workId, shiftDay(today, -CHECKLIST_WINDOW_DAYS));
    return NextResponse.json({ available: true, canEdit: canWriteChecklist(profile), today, ...data }, { headers });
  } catch (error) {
    if (error instanceof ChecklistUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/checklist', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar os checklists de equipamentos da obra.', 502);
  }
}
