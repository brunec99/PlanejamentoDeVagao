import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';

export const runtime = 'nodejs';

const EXPIRES_IN = 120;

/** O bucket é privado: o visualizador busca o arquivo com esta URL de curta duração,
 * sem que o navegador conheça a chave de serviço nem o bucket. */
export async function GET(request: NextRequest) {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });

  const versionId = request.nextUrl.searchParams.get('versionId');
  if (!versionId) return NextResponse.json({ error: 'Versão não informada.' }, { status: 400 });

  let snapshot;
  try { snapshot = await new SupabasePlanningRepository().getSnapshot(); }
  catch { return NextResponse.json({ error: 'Falha ao consultar as versões do modelo.' }, { status: 502 }); }
  const version = snapshot.ifcVersions.find(v => v.id === versionId);
  if (!version) return NextResponse.json({ error: 'Versão não encontrada.' }, { status: 400 });
  const model = snapshot.ifcModels.find(m => m.id === version.modelId);
  if (!model) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 400 });
  if (!profile.workIds.includes(model.workId)) return NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403 });
  if (!version.storagePath) return NextResponse.json({ error: 'Esta versão não tem o arquivo guardado — ela vale pelas tabelas transcritas, que é o que as telas leem.' }, { status: 400 });

  const { data, error } = await getServiceClient().storage.from('ifc').createSignedUrl(version.storagePath, EXPIRES_IN);
  if (error || !data) return NextResponse.json({ error: 'Não foi possível abrir o arquivo do modelo. Tente novamente.' }, { status: 502 });
  return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
