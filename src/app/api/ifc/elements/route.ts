import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';

export const runtime = 'nodejs';

const PAGE = 500;
// A consulta de geometria devolve nove números por elemento e alimenta o 3D inteiro: paginar de
// 500 em 500 faria centenas de idas ao servidor para um modelo de obra. Linhas magras, página larga.
const GEOMETRY_PAGE = 5000;
// Teto de linhas por resposta da API REST do Supabase, do qual nenhum range escapa.
const CHUNK = 1000;

/** As tabelas transcritas do IFC não entram no snapshot do planejamento: um modelo real tem
 * centenas de milhares de linhas, e o snapshot trafega inteiro a cada comando. Elas são
 * escritas em lote por aqui e lidas paginadas, com a soma feita no banco. */
async function versionAccess(versionId: string) {
  const profile = await getRouteProfile();
  if (!profile) return { error: NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 }) };
  const snapshot = await new SupabasePlanningRepository().getSnapshot();
  const version = snapshot.ifcVersions.find(v => v.id === versionId);
  const model = version && snapshot.ifcModels.find(m => m.id === version.modelId);
  if (!version || !model) return { error: NextResponse.json({ error: 'Versão não encontrada.' }, { status: 400 }) };
  if (!profile.workIds.includes(model.workId)) return { error: NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403 }) };
  return { profile, version };
}

export async function POST(request: NextRequest) {
  let body: { versionId?: unknown; reset?: unknown; finish?: unknown; elements?: unknown; properties?: unknown; quantities?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }
  const versionId = typeof body.versionId === 'string' ? body.versionId : '';
  if (!versionId) return NextResponse.json({ error: 'Versão não informada.' }, { status: 400 });

  const access = await versionAccess(versionId).catch(() => ({ error: NextResponse.json({ error: 'Falha ao consultar a versão.' }, { status: 502 }) }));
  if ('error' in access) return access.error;
  if (access.profile.role === 'viewer') return NextResponse.json({ error: 'Seu perfil permite apenas consulta.' }, { status: 403 });

  const client = getServiceClient();
  const now = new Date().toISOString();
  const rows = <T>(value: unknown) => (Array.isArray(value) ? value as T[] : []);

  try {
    // Reextrair substitui o que é daquela versão, para a operação ser idempotente.
    if (body.reset === true) {
      for (const table of ['ifc_properties', 'ifc_quantities', 'ifc_elements']) {
        const { error } = await client.from(table).delete().eq('version_id', versionId);
        if (error) throw new Error(error.message);
      }
    }

    const elements = rows<{ expressId: number; globalId?: string; ifcClass: string; name?: string; objectType?: string; storey?: string; attributes?: Record<string, unknown>; box?: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } }>(body.elements)
      .map(e => ({ id: `${versionId}:${e.expressId}`, created_at: now, version_id: versionId, express_id: e.expressId, global_id: e.globalId ?? null, ifc_class: e.ifcClass, name: e.name ?? null, object_type: e.objectType ?? null, storey: e.storey ?? null, attributes: e.attributes ?? {},
        min_x: e.box?.minX ?? null, min_y: e.box?.minY ?? null, min_z: e.box?.minZ ?? null, max_x: e.box?.maxX ?? null, max_y: e.box?.maxY ?? null, max_z: e.box?.maxZ ?? null }));
    const properties = rows<{ expressId: number; pset: string; name: string; valueText?: string; valueNumber?: number; unit?: string }>(body.properties)
      .map(p => ({ id: crypto.randomUUID(), created_at: now, version_id: versionId, express_id: p.expressId, pset: p.pset, name: p.name, value_text: p.valueText ?? null, value_number: p.valueNumber ?? null, unit: p.unit ?? null }));
    const quantities = rows<{ expressId: number; qset: string; name: string; kind: string; value: number; unit?: string }>(body.quantities)
      .map(q => ({ id: crypto.randomUUID(), created_at: now, version_id: versionId, express_id: q.expressId, qset: q.qset, name: q.name, kind: q.kind, value: q.value, unit: q.unit ?? null }));

    if (elements.length) { const { error } = await client.from('ifc_elements').upsert(elements, { onConflict: 'id' }); if (error) throw new Error(error.message); }
    if (properties.length) { const { error } = await client.from('ifc_properties').insert(properties); if (error) throw new Error(error.message); }
    if (quantities.length) { const { error } = await client.from('ifc_quantities').insert(quantities); if (error) throw new Error(error.message); }

    if (body.finish === true) {
      const { count, error: countError } = await client.from('ifc_elements').select('id', { count: 'exact', head: true }).eq('version_id', versionId);
      if (countError) throw new Error(countError.message);
      const { count: withBox } = await client.from('ifc_elements').select('id', { count: 'exact', head: true }).eq('version_id', versionId).not('min_x', 'is', null);
      const { error } = await client.from('ifc_model_versions').update({ extracted_at: now, element_rows: count ?? 0, has_geometry: (withBox ?? 0) > 0 }).eq('id', versionId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ gravados: { elements: elements.length, properties: properties.length, quantities: quantities.length }, total: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ gravados: { elements: elements.length, properties: properties.length, quantities: quantities.length } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: `Falha ao gravar a transcrição do modelo: ${cause instanceof Error ? cause.message : 'erro desconhecido.'}` }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const versionId = request.nextUrl.searchParams.get('versionId') ?? '';
  if (!versionId) return NextResponse.json({ error: 'Versão não informada.' }, { status: 400 });
  const access = await versionAccess(versionId).catch(() => ({ error: NextResponse.json({ error: 'Falha ao consultar a versão.' }, { status: 502 }) }));
  if ('error' in access) return access.error;

  const client = getServiceClient();
  const storey = request.nextUrl.searchParams.get('pavimento');
  const ifcClass = request.nextUrl.searchParams.get('classe');
  const page = Math.max(0, Number(request.nextUrl.searchParams.get('pagina') ?? 0));

  try {
    if (request.nextUrl.searchParams.get('resumo') === '1') {
      // O quantitativo é somado no banco: contar no navegador significaria baixar o modelo inteiro
      // e, pior, receber só as primeiras mil linhas que a API REST devolve — uma amostra com cara
      // de total. A função ifc_version_summary (migração 0018) agrupa e devolve o resumo inteiro.
      const { data, error } = await client.rpc('ifc_version_summary', { p_version_id: versionId });
      if (error) throw new Error(/does not exist/i.test(error.message)
        ? 'A função de resumo não existe no banco: rode a migração 0018_ifc_summary.sql no Supabase.'
        : error.message);
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    const geometria = request.nextUrl.searchParams.get('geometria') === '1';
    const colunas = geometria ? 'express_id, global_id, ifc_class, name, storey, min_x, min_y, min_z, max_x, max_y, max_z' : 'express_id, global_id, ifc_class, name, object_type, storey';
    const size = geometria ? GEOMETRY_PAGE : PAGE;
    // A página é montada em blocos porque a API REST nunca devolve mais de mil linhas por
    // requisição, qualquer que seja o range pedido. Quem paginasse de mil em mil pelo navegador
    // releria o snapshot do planejamento (que autoriza a consulta) a cada bloco.
    const elementos: unknown[] = [];
    let total = 0;
    for (let taken = 0; taken < size; taken += CHUNK) {
      const wanted = Math.min(CHUNK, size - taken);
      const from = page * size + taken;
      let query = client.from('ifc_elements').select(colunas, { count: taken === 0 ? 'exact' : undefined }).eq('version_id', versionId);
      if (geometria) query = query.not('min_x', 'is', null);
      if (storey) query = query.eq('storey', storey);
      if (ifcClass) query = query.eq('ifc_class', ifcClass);
      const { data, count, error } = await query.order('express_id').range(from, from + wanted - 1);
      if (error) throw new Error(error.message);
      if (taken === 0) total = count ?? 0;
      elementos.push(...data);
      if (data.length < wanted) break;
    }
    return NextResponse.json({ pagina: page, porPagina: size, total, elementos }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: `Falha ao ler a transcrição do modelo: ${cause instanceof Error ? cause.message : 'erro desconhecido.'}` }, { status: 502 });
  }
}
