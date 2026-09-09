import { signInWithGoogle } from './actions';
export const metadata = { title: 'Entrar' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-700 text-lg font-bold text-white">V</span>
          <div>
            <p className="text-lg font-bold leading-tight text-slate-900">Planejamento Vagão</p>
            <p className="text-xs font-medium text-slate-400">ATR Incorporadora</p>
          </div>
        </div>
        <div className="panel p-6">
          <h1 className="text-base font-bold text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-500">Use sua conta Google da ATR.</p>
          {params.error && <p role="alert" className="callout callout-danger mt-4">{params.error}</p>}
          <form action={signInWithGoogle} className="mt-5">
            <input type="hidden" name="redirect" value={params.redirect ?? '/obras'} />
            <button className="button w-full" type="submit">Continuar com Google</button>
          </form>
          <p className="mt-4 text-xs leading-5 text-slate-400">Seu acesso às obras é liberado por um administrador após o primeiro login.</p>
        </div>
      </div>
    </div>
  );
}
