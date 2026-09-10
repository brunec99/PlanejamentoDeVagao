import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';

/** Emails vivem só no Supabase Auth, não em PlanningData — endpoint só de leitura, admin-only. */
export async function GET() {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Somente administradores podem ver e-mails.' }, { status: 403 });

  const service = getServiceClient();
  const emails: Record<string, string> = {};
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const u of data.users) if (u.email) emails[u.id] = u.email;
    if (data.users.length < 200) break;
  }
  return NextResponse.json({ emails }, { headers: { 'Cache-Control': 'no-store' } });
}
