import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { removeWorkFiles } from '@/infrastructure/repositories/supabase/work-files';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const missingFunction = (code?: string) => code === '42883' || code === 'PGRST202';

/** Exclui a obra com tudo o que é dela (`delete_work`, migração 0037), numa transação só, e depois a
 * pasta dela nos buckets. Só administradores; o corpo traz o código da obra digitado na tela, que a
 * função confere de novo. O histórico e o livro-razão do custo da IA ficam (ver a migração). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return responseError('Somente administradores podem excluir obras.', 403);
  const { id } = await params;
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return responseError('Corpo da requisição inválido.', 400);
  }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return responseError('Digite o código da obra para confirmar a exclusão.', 400);

  const client = getServiceClient();
  const { data, error } = await client.rpc('delete_work', { p_work_id: id, p_code: code, p_actor_id: profile.id });
  if (error) {
    if (missingFunction(error.code))
      return responseError('Aplique a migração 0037_delete_work.sql no Supabase para excluir obras. Nada foi apagado.', 503);
    if (error.message.includes('work_not_found')) return responseError('Obra não encontrada. Ela pode já ter sido excluída.', 404);
    if (error.message.includes('work_code_mismatch')) return responseError('O código digitado não é o desta obra.', 400);
    if (error.message.includes('not_admin')) return responseError('Somente administradores podem excluir obras.', 403);
    logRouteError('admin/works DELETE', error, { workId: id });
    return responseError(`Não foi possível excluir a obra: ${error.message}`, 500);
  }

  const result = data as { version: number; removed: Record<string, number> };
  // As linhas já saíram; arquivo que o Storage não apagar fica órfão no bucket privado, sem efeito na tela.
  const files = await removeWorkFiles(client, id);
  if (files.failed.length)
    logRouteError('admin/works DELETE storage', new Error('Falha ao apagar arquivos'), { workId: id, buckets: files.failed });
  return NextResponse.json({ ok: true, version: result.version, removed: result.removed, files }, { headers });
}
