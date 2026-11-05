import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { SafetyUnavailableError, setTst } from '@/infrastructure/repositories/supabase/safety-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca ou desmarca alguém como TST (`profiles.tst`), o tipo que libera gravar na aba 6. Fica fora dos
 * comandos do planejamento: o `commit_planning` não conhece a coluna, então quem a grava é só esta rota, e
 * só para admin. Corpo `{ userId, enabled }`. O admin grava na aba 6 mesmo sem a marca. */
export async function POST(request: Request) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (profile.role !== 'admin') return responseError('Só administradores marcam quem é TST.', 403);

  const body = (await request.json().catch(() => null)) as { userId?: unknown; enabled?: unknown } | null;
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  // `profiles.id` é o uuid do Supabase Auth: outro formato nem chega ao banco.
  if (!UUID.test(userId)) return responseError('Usuário não informado.', 400);
  if (typeof body?.enabled !== 'boolean') return responseError('Informe se a pessoa é TST.', 400);
  const enabled = body.enabled;

  try {
    if (!(await setTst(userId, enabled))) return responseError('Perfil não encontrado.', 404);
    return NextResponse.json({ userId, tst: enabled }, { headers });
  } catch (error) {
    if (error instanceof SafetyUnavailableError) return responseError('Aplique a migração 0040 para marcar técnicos de segurança.', 503);
    logRouteError('POST /api/seguranca/tst', error, { actorId: profile.id, userId, enabled });
    return responseError('Não foi possível gravar a marcação de TST. Tente novamente.', 502);
  }
}
