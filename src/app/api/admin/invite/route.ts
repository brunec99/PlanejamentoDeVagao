import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';
const ALLOWED_DOMAIN = 'atrincorporadora.com.br';
const ROLES = ['viewer', 'planner', 'manager', 'admin'] as const;

export async function POST(request: NextRequest) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem convidar usuários.' }, { status: 403 });

  let body: { email?: string; name?: string; role?: string; workIds?: string[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }

  const email = (body.email ?? '').trim().toLowerCase();
  const role = ROLES.includes(body.role as typeof ROLES[number]) ? body.role as typeof ROLES[number] : 'viewer';
  const workIds = Array.isArray(body.workIds) ? body.workIds.filter(id => typeof id === 'string') : [];
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return NextResponse.json({ error: `O convite só pode ser enviado para contas @${ALLOWED_DOMAIN}.` }, { status: 400 });

  const service = getServiceClient();
  const origin = request.headers.get('origin') ?? request.nextUrl.origin;
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/callback` });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Não foi possível enviar o convite.' }, { status: 400 });

  // O perfil já nasce com papel e obras definidos; ao entrar pelo Google com o mesmo
  // e-mail o Supabase vincula a identidade a este mesmo usuário.
  const name = (body.name ?? '').trim() || email.split('@')[0].replace(/[._]/g, ' ');
  const { error: profileError } = await service.from('profiles').upsert({ id: data.user.id, name, role, work_ids: workIds });
  if (profileError) return NextResponse.json({ error: `Convite enviado, mas o perfil falhou: ${profileError.message}` }, { status: 500 });

  return NextResponse.json({ email, role }, { headers: { 'Cache-Control': 'no-store' } });
}
