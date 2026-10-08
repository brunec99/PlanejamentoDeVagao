import { NextResponse, type NextRequest } from 'next/server';
import { getAuthUser, getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';

/** Remove o perfil do Obra 360, não a conta de login: o Supabase Auth é dividido com o Takt Hub, e
 * apagar a conta tiraria a pessoa de lá também. Sem perfil, ela não vê obra nenhuma; se voltar a entrar
 * com o Google, renasce como Consulta, sem obras. Histórico e atividades já registradas mantêm o id
 * como estava, sem FK, então nada quebra. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem excluir usuários.' }, { status: 403 });

  const { id } = await params;
  const authUser = await getAuthUser();
  if (authUser?.id === id) return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });

  const { error } = await getServiceClient().from('profiles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
