import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

/** Dispensar um pedido de acesso. Aprovar não passa por aqui: o cadastro (`/api/admin/invite`) marca o
 * pedido como aprovado ao criar o perfil. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Somente administradores tratam pedidos de acesso.' }, { status: 403, headers });
  const { id } = await params;
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400, headers });
  }
  if (body.status !== 'dismissed')
    return NextResponse.json({ error: 'Só é possível dispensar o pedido por aqui.' }, { status: 400, headers });
  const now = new Date().toISOString();
  const { error } = await getServiceClient()
    .from('access_requests')
    .update({ status: 'dismissed', handled_by: profile.id, handled_at: now, updated_at: now })
    .eq('id', id);
  if (error) return NextResponse.json({ error: `Não foi possível dispensar: ${error.message}` }, { status: 500, headers });
  return NextResponse.json({ id }, { headers });
}
