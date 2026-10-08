import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { User } from '../../domain/entities';
import { getServiceClient } from '../repositories/supabase/client';
import { devBypassProfileId } from './dev-bypass';
import { isDeveloperEmail } from '../../application/module-access';

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
  return { profile: await loadProfile(authUser.id), developer: isDeveloperEmail(authUser.email, process.env.DEVELOPER_EMAILS) };
}

/** For Route Handlers: returns the signed-in user's profile, or null if unauthenticated / not provisioned. */
export async function getRouteProfile(): Promise<User | null> {
  return (await getRouteAccess()).profile;
}
