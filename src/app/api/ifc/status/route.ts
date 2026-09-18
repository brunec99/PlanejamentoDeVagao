import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';

/** Estado da transcrição de cada versão da obra. Fica fora do snapshot de propósito: são colunas
 * escritas pela ingestão em lote, não pelo comando de planejamento, e o snapshot trafega inteiro
 * a cada comando — devolvê-las por ali faria um commit concorrente sobrescrever a contagem. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return NextResponse.json({ error: 'Obra não informada.' }, { status: 400 });
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  if (!profile.workIds.includes(workId)) return NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403 });

  const client = getServiceClient();
  try {
    const { data: models, error: modelsError } = await client.from('ifc_models').select('id').eq('work_id', workId);
    if (modelsError) throw new Error(modelsError.message);
    const ids = models.map(model => model.id);
    if (!ids.length) return NextResponse.json({ versoes: [] }, { headers: { 'Cache-Control': 'no-store' } });

    const { data, error } = await client.from('ifc_model_versions').select('id, extracted_at, element_rows, has_geometry').in('model_id', ids);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      versoes: data.map(version => ({ versionId: version.id, extractedAt: version.extracted_at ?? null, elementRows: version.element_rows ?? 0, hasGeometry: version.has_geometry === true })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: `Falha ao consultar a transcrição dos modelos: ${cause instanceof Error ? cause.message : 'erro desconhecido.'}` }, { status: 502 });
  }
}
