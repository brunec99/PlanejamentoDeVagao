import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';

export const runtime = 'nodejs';

/** A geometria convertida (Fragments) de cada versão: o ponteiro para o objeto no Storage. Fica
 * fora do snapshot do planejamento porque quem a escreve é a ingestão, não o comando — e o
 * snapshot trafega inteiro a cada comando, então um commit concorrente apagaria o ponteiro. */
async function versionAccess(versionId: string) {
  const profile = await getRouteProfile();
  if (!profile) return { error: NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 }) };
  const snapshot = await new SupabasePlanningRepository().getSnapshot();
  const version = snapshot.ifcVersions.find(v => v.id === versionId);
  const model = version && snapshot.ifcModels.find(m => m.id === version.modelId);
  if (!version || !model) return { error: NextResponse.json({ error: 'Versão não encontrada.' }, { status: 400 }) };
  if (!profile.workIds.includes(model.workId)) return { error: NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403 }) };
  return { profile, version, model };
}

export async function POST(request: NextRequest) {
  let body: { versionId?: unknown; storagePath?: unknown; byteSize?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }
  const versionId = typeof body.versionId === 'string' ? body.versionId : '';
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : '';
  const byteSize = Number(body.byteSize);
  if (!versionId) return NextResponse.json({ error: 'Versão não informada.' }, { status: 400 });
  if (!storagePath) return NextResponse.json({ error: 'Caminho da geometria não informado.' }, { status: 400 });
  if (!Number.isFinite(byteSize) || byteSize <= 0) return NextResponse.json({ error: 'Geometria convertida vazia.' }, { status: 400 });

  const access = await versionAccess(versionId).catch(() => ({ error: NextResponse.json({ error: 'Falha ao consultar a versão.' }, { status: 502 }) }));
  if ('error' in access) return access.error;
  if (access.profile.role === 'viewer') return NextResponse.json({ error: 'Seu perfil permite apenas consulta.' }, { status: 403 });

  const client = getServiceClient();
  try {
    // Reconverter troca o ponteiro; o objeto antigo sai do bucket para não ficar pago e órfão.
    const { data: current } = await client.from('ifc_fragments').select('storage_path').eq('version_id', versionId).maybeSingle();
    const { error } = await client.from('ifc_fragments')
      .upsert({ version_id: versionId, created_at: new Date().toISOString(), storage_path: storagePath, byte_size: byteSize }, { onConflict: 'version_id' });
    if (error) throw new Error(error.message);
    if (current?.storage_path && current.storage_path !== storagePath) await client.storage.from('ifc').remove([current.storage_path]);
    return NextResponse.json({ versionId, byteSize }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: `Falha ao registrar a geometria convertida: ${cause instanceof Error ? cause.message : 'erro desconhecido.'}` }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const versionId = request.nextUrl.searchParams.get('versionId') ?? '';
  if (!versionId) return NextResponse.json({ error: 'Versão não informada.' }, { status: 400 });
  const access = await versionAccess(versionId).catch(() => ({ error: NextResponse.json({ error: 'Falha ao consultar a versão.' }, { status: 502 }) }));
  if ('error' in access) return access.error;

  const client = getServiceClient();
  try {
    const { data, error } = await client.from('ifc_fragments').select('storage_path, byte_size').eq('version_id', versionId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'Esta versão ainda não tem geometria convertida. Reenvie o modelo em Modelos IFC para gerá-la.' }, { status: 404 });
    const signed = await client.storage.from('ifc').createSignedUrl(data.storage_path, 60 * 30);
    if (signed.error || !signed.data) throw new Error('não foi possível abrir a geometria convertida.');
    return NextResponse.json({ url: signed.data.signedUrl, byteSize: Number(data.byte_size) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: `Falha ao ler a geometria convertida: ${cause instanceof Error ? cause.message : 'erro desconhecido.'}` }, { status: 502 });
  }
}
