import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import type { AccessRequest } from '@/application/access-request';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

/** Pedidos de acesso pendentes, para a lista do admin em Configurações (fora do snapshot). */
export async function GET() {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Somente administradores veem os pedidos de acesso.' }, { status: 403, headers });
  const { data, error } = await getServiceClient()
    .from('access_requests')
    .select('id, email, name, message, verified, status, created_at, updated_at')
    .eq('status', 'pending')
    .order('updated_at', { ascending: false })
    .limit(100);
  // Antes da migração 0032 a tabela não existe: a lista só não aparece.
  if (error) return NextResponse.json({ requests: [], unavailable: true }, { headers });
  const requests: AccessRequest[] = (data ?? []).map(r => ({
    id: r.id,
    email: r.email,
    name: r.name,
    message: r.message,
    verified: r.verified,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return NextResponse.json({ requests }, { headers });
}
