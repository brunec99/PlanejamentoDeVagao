import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { User } from '../../domain/entities';
import { getServiceClient } from '../repositories/supabase/client';
import { devBypassProfileId } from './dev-bypass';
import { hasDeveloperAccess, RESTRICTED_MODULE_MESSAGE } from '../../application/module-access';

/** SSR client bound to the request's cookies. Only for auth (getUser/signIn/signOut) — never for querying
 * planning tables, since RLS denies the anon/authenticated role by design (see 0001_init.sql). */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* called from a Server Component render; middleware already refreshes the session */
        }
      },
    },
  });
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function loadProfile(id: string): Promise<User | null> {
  const { data, error } = await getServiceClient().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar perfil: ${error.message}`);
  if (!data) return null;
  return { id: data.id, createdAt: data.created_at, updatedAt: data.updated_at, name: data.name, role: data.role, workIds: data.work_ids };
}

export type RouteAccess = { profile: User | null; developer: boolean };

/** Perfil de quem está logado e se essa pessoa desenvolve o sistema (`DEVELOPER_EMAILS`), com uma só
 * leitura da sessão. O acesso local sem login conta como desenvolvedor. */
export async function getRouteAccess(): Promise<RouteAccess> {
  const bypass = devBypassProfileId();
  if (bypass) return { profile: await loadProfile(bypass), developer: true };
  const authUser = await getAuthUser();
  if (!authUser) return { profile: null, developer: false };
  const profile = await loadProfile(authUser.id);
  return { profile, developer: hasDeveloperAccess({ email: authUser.email, role: profile?.role }, process.env.DEVELOPER_EMAILS) };
}

/** Rotas dos módulos em desenvolvimento (`RESTRICTED_API_PREFIXES`): o proxy já barra quem não
 * desenvolve, e cada handler repete a conferência na mesma leitura de sessão que lhe dá o perfil,
 * para a proteção não depender de uma camada só. `error` é a resposta 403 pronta. */
export async function requireDeveloperAccess(): Promise<
  { access: RouteAccess; error?: undefined } | { access?: undefined; error: NextResponse }
> {
  const access = await getRouteAccess();
  if (!access.developer)
    return { error: NextResponse.json({ error: RESTRICTED_MODULE_MESSAGE }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) };
  return { access };
}

/** For Route Handlers: returns the signed-in user's profile, or null if unauthenticated / not provisioned. */
export async function getRouteProfile(): Promise<User | null> {
  return (await getRouteAccess()).profile;
}
