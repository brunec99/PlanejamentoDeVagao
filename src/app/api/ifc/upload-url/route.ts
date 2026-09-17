import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';

export const runtime = 'nodejs';

const MAX_NAME = 80;

/** Um IFC passa de dezenas de MB e estouraria o limite de corpo da requisição do servidor:
 * o navegador envia o arquivo direto ao Storage com a URL assinada devolvida aqui, e só
 * depois registra a versão pelo /api/planning/commands. A chave de serviço nunca sai do servidor. */
export async function POST(request: Request) {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  if (profile.role === 'viewer') return NextResponse.json({ error: 'Seu perfil permite apenas consulta.' }, { status: 403 });

  let body: { modelId?: unknown; fileName?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }
  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : '';
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
  if (!modelId) return NextResponse.json({ error: 'Modelo não informado.' }, { status: 400 });
  if (!fileName || !fileName.toLowerCase().endsWith('.ifc')) return NextResponse.json({ error: 'O repositório aceita apenas arquivos .ifc.' }, { status: 400 });

  let model;
  try { model = (await new SupabasePlanningRepository().getSnapshot()).ifcModels.find(m => m.id === modelId); }
  catch { return NextResponse.json({ error: 'Falha ao consultar os modelos da obra.' }, { status: 502 }); }
  if (!model) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 400 });
  if (!profile.workIds.includes(model.workId)) return NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403 });

  // O caminho vem da obra e do modelo já validados; do nome enviado sobra só um sufixo saneado.
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-MAX_NAME);
  const path = `${model.workId}/${model.id}/${crypto.randomUUID()}-${safeName}`;

  const { data, error } = await getServiceClient().storage.from('ifc').createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: 'Não foi possível liberar o envio do arquivo. Tente novamente.' }, { status: 502 });
  return NextResponse.json({ path: data.path, signedUrl: data.signedUrl, token: data.token }, { headers: { 'Cache-Control': 'no-store' } });
}
