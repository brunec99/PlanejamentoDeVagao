import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Um local da obra para a coluna Local da planilha do curto prazo. */
export interface CommitmentLocal {
  id: string;
  name: string;
  /** Posição de baixo para cima, como na Linha de Balanço. */
  order: number;
}
export type CommitmentLocalsResponse = { available: true; locals: CommitmentLocal[] } | { available: false };

/** Os "Locais da obra" da Linha de Balanço (aba 1), para a lista suspensa da coluna Local do curto prazo e para o
 * filtro de local do PDF (05/11/2026, pedido do usuário: "o local deve ser o mesmo do longo prazo"). Fica fora de
 * `/api/lob`, que é restrita ao módulo do longo prazo: o curto prazo é aberto a todos, e quem preenche a planilha
 * precisa ver a lista mesmo sem acesso à aba 1. Devolve só id, nome e ordem; quem pode ler é quem tem a obra.
 * Sem a migração 0038 (tabela ausente), responde `available: false` e a coluna fica sem opções. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const { data, error } = await getServiceClient()
      .from('lob_locals')
      .select('id, name, order_index')
      .eq('work_id', workId)
      .order('order_index')
      .order('id');
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ available: false }, { headers });
      throw new Error(error.message);
    }
    const locals: CommitmentLocal[] = (data as { id: string; name: string; order_index: number }[]).map(row => ({
      id: row.id,
      name: row.name,
      order: row.order_index,
    }));
    return NextResponse.json({ available: true, locals } satisfies CommitmentLocalsResponse, { headers });
  } catch (cause) {
    logRouteError('GET /api/curto-prazo/locais', cause, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar os locais da obra.', 502);
  }
}
