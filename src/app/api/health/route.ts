import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import {
  interpretProbe,
  MIGRATION_CHECKS,
  summarizeMigrations,
  type MigrationStatus,
} from '@/infrastructure/repositories/supabase/migrations';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

/** Estado do banco para o administrador: quais migrações o esquema já tem. Cada sondagem é uma
 * consulta de zero linhas; nada é escrito. Só administradores leem, porque a lista descreve o
 * esquema. */
export async function GET() {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Somente administradores consultam o estado do banco.' }, { status: 403, headers });
  const client = getServiceClient();
  try {
    const statuses: MigrationStatus[] = await Promise.all(
      MIGRATION_CHECKS.map(async check => {
        const { probe } = check;
        const { error } =
          probe.kind === 'table'
            ? await client.from(probe.table).select('*', { head: true, count: 'exact' }).limit(0)
            : probe.kind === 'column'
              ? await client.from(probe.table).select(probe.column).limit(0)
              : await client.rpc(probe.name, probe.args);
        return interpretProbe(check, error);
      }),
    );
    return NextResponse.json(
      { checkedAt: new Date().toISOString(), summary: summarizeMigrations(statuses), migrations: statuses },
      { headers },
    );
  } catch (cause) {
    logRouteError('GET /api/health', cause, { actorId: profile.id });
    return NextResponse.json({ error: 'Não foi possível consultar o banco.' }, { status: 502, headers });
  }
}
