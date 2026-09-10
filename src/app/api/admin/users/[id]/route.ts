import { NextResponse, type NextRequest } from 'next/server';
import { getAuthUser, getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';

/** Remove a conta do Supabase Auth — o perfil cai junto (profiles.id tem ON DELETE CASCADE).
 * Histórico e atividades já registradas mantêm o id como estava, sem FK, então nada quebra. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem excluir usuários.' }, { status: 403 });

  const { id } = await params;
  const authUser = await getAuthUser();
  if (authUser?.id === id) return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });

  const { error } = await getServiceClient().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
