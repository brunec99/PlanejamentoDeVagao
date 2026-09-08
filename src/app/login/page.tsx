import { signInWithGoogle } from './actions';
import { Callout } from '@/modules/planejamento/ui';
export const metadata = { title: 'Entrar' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-sm flex-col justify-center px-6 py-12">
      <p className="eyebrow">Planejamento Vagão</p>
      <h1 className="page-title">Entrar</h1>
      <p className="mt-2 text-[13.5px] text-[var(--ink-muted)]">Acesse com sua conta Google da Atrin Incorporadora.</p>
      <div className="panel mt-8 p-6">
        {params.error && <div className="mb-5"><Callout tone="danger" role="alert">{params.error}</Callout></div>}
        <form action={signInWithGoogle}>
          <input type="hidden" name="redirect" value={params.redirect ?? '/obras'} />
          <button className="button w-full" type="submit">Continuar com Google</button>
        </form>
        <p className="mt-4 text-[12.5px] text-[var(--ink-subtle)]">Seu acesso às obras é liberado por um administrador após o primeiro login.</p>
      </div>
    </div>
  );
}
