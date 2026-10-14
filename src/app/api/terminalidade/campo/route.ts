import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import {
  loadTerminality,
  TerminalityUnavailableError,
  withSignedUrls,
} from '@/infrastructure/repositories/supabase/terminality-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Modo de campo da terminalidade (celular, sem sinal). Sem `workId`: quem é a pessoa e as obras dela,
 * para a lista abrir offline depois. Com `workId`: o pacote da obra — pendências com URLs de foto,
 * locais, tipos, responsáveis e as empresas do cadastro de equipes. A leitura usa o recorte leve do
 * snapshot (obras, perfis e equipes, sem compromissos), o mesmo dos comandos de equipe. */
export async function GET(request: NextRequest) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  const actor = { id: profile.id, name: profile.name, role: profile.role };
  const workId = request.nextUrl.searchParams.get('workId');
  try {
    if (!workId) {
      const snapshot = await new SupabasePlanningRepository().getSnapshot({ workIds: profile.workIds, commitments: { ids: [] } });
      const works = snapshot.works
        .filter(work => profile.workIds.includes(work.id) && work.active !== false)
        .map(work => ({ id: work.id, name: work.name, code: work.code }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return NextResponse.json({ actor, works }, { headers });
    }
    if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    const snapshot = await new SupabasePlanningRepository().getSnapshot({ workIds: [workId], commitments: { ids: [] } });
    const work = snapshot.works.find(w => w.id === workId);
    if (!work) return responseError('Obra não encontrada.', 404);
    const companies = [...new Set(snapshot.teams.filter(t => t.workId === workId).map(t => t.company.trim()))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const data = await withSignedUrls(await loadTerminality(workId));
    return NextResponse.json(
      { available: true, work: { id: work.id, name: work.name, code: work.code }, actor, data, companies },
      { headers },
    );
  } catch (error) {
    if (error instanceof TerminalityUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/terminalidade/campo', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar os dados da obra.', 502);
  }
}
