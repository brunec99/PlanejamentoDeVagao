import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';
const ALLOWED_DOMAIN = 'atrincorporadora.com.br';
const ROLES = ['viewer', 'planner', 'manager', 'admin'] as const;

/** Pré-cadastro, sem e-mail. O projeto Supabase é dividido com o Takt Hub, que tem o cadastro aberto
 * desligado e o modelo de e-mail de convite com a marca dele. A conta nasce confirmada e, ao entrar com
 * o Google pelo mesmo e-mail, o Supabase vincula a identidade a ela. Se a conta já existe (no Takt, por
 * exemplo), reaproveita-se a mesma: o Obra 360 só cria o seu perfil. */
export async function POST(request: NextRequest) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem cadastrar usuários.' }, { status: 403 });

  let body: { email?: string; name?: string; role?: string; workIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const role = ROLES.includes(body.role as (typeof ROLES)[number]) ? (body.role as (typeof ROLES)[number]) : 'viewer';
  const workIds = Array.isArray(body.workIds) ? body.workIds.filter(id => typeof id === 'string') : [];
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`))
    return NextResponse.json({ error: `Só contas @${ALLOWED_DOMAIN} podem ser cadastradas.` }, { status: 400 });

  const service = getServiceClient();
  const created = await service.auth.admin.createUser({ email, email_confirm: true });
  const userId = created.data.user?.id ?? (await findUserIdByEmail(email));
  if (!userId) return NextResponse.json({ error: created.error?.message ?? 'Não foi possível cadastrar.' }, { status: 400 });

  // O perfil já nasce com papel e obras definidos.
  const name = (body.name ?? '').trim() || email.split('@')[0].replace(/[._]/g, ' ');
  const { error: profileError } = await service.from('profiles').upsert({ id: userId, name, role, work_ids: workIds });
  if (profileError) return NextResponse.json({ error: `Conta criada, mas o perfil falhou: ${profileError.message}` }, { status: 500 });

  return NextResponse.json({ email, role }, { headers: { 'Cache-Control': 'no-store' } });
}

/** A conta já existente no Auth compartilhado; a lista é pequena, então paginar basta. */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const service = getServiceClient();
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const user = data.users.find(u => u.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 200) return null;
  }
}
