import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';

/** Emails vivem só no Supabase Auth, não em PlanningData — endpoint só de leitura, admin-only. */
export async function GET() {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem ver e-mails.' }, { status: 403 });

  const service = getServiceClient();
  // O Auth é dividido com o Takt Hub: só os e-mails de quem tem perfil no Obra 360.
  const { data: profiles, error: profilesError } = await service.from('profiles').select('id');
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });
  const ours = new Set((profiles ?? []).map(p => p.id as string));
  const emails: Record<string, string> = {};
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const u of data.users) if (u.email && ours.has(u.id)) emails[u.id] = u.email;
    if (data.users.length < 200) break;
  }
  return NextResponse.json({ emails }, { headers: { 'Cache-Control': 'no-store' } });
}
