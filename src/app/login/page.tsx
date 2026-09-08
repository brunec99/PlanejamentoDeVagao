import { signIn } from './actions';
import { Callout } from '@/modules/planejamento/ui';
export const metadata = { title: 'Entrar' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-sm flex-col justify-center px-6 py-12">
      <p className="eyebrow">Planejamento Vagão</p>
      <h1 className="page-title">Entrar</h1>
      <p className="mt-2 text-[13.5px] text-[var(--ink-muted)]">Acesse com sua conta para continuar.</p>
      <div className="panel mt-8 p-6">
        {params.error && <div className="mb-5"><Callout tone="danger" role="alert">{params.error}</Callout></div>}
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="redirect" value={params.redirect ?? '/obras'} />
          <label className="block text-[13px] font-medium text-[var(--ink-muted)]"><span className="mb-1.5 block">E-mail</span><input className="field" type="email" name="email" required autoFocus /></label>
          <label className="block text-[13px] font-medium text-[var(--ink-muted)]"><span className="mb-1.5 block">Senha</span><input className="field" type="password" name="password" required /></label>
          <button className="button mt-2 w-full" type="submit">Entrar</button>
        </form>
      </div>
    </div>
  );
}
