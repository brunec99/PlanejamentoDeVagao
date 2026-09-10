import { signInWithGoogle } from './actions';
export const metadata = { title: 'Entrar' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4 py-10 font-sans">
      <div className="pointer-events-none absolute top-[-15%] right-[-5%] h-[40%] w-[40%] rounded-full bg-blue-100/60 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-5%] h-[35%] w-[35%] rounded-full bg-emerald-100/60 blur-[100px]" />

      <div className="z-10 w-full max-w-xl overflow-hidden rounded-2xl shadow-xl" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0d3d2e 100%)' }}>
        <div className="h-0.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-500" />
        <div className="px-7 py-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-blue-300">ATR Incorporadora · Engenharia</p>
          <h1 className="text-xl font-bold leading-snug text-white">Planejamento Vagão</h1>
          <p className="text-base font-light text-blue-100">Planejamento por período de takt</p>
        </div>
      </div>

      <div className="z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 12l9-5M12 12v10M12 12L3 7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="mb-1 text-center text-xl font-bold text-slate-900">Acesso ao sistema</h2>
          <p className="mb-7 text-center text-sm text-slate-500">Entre com sua conta Google da ATR para acessar o painel.</p>

          {params.error && (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-rose-700">Não foi possível concluir o login</p>
              <p className="mt-0.5 text-xs text-rose-600">{params.error}</p>
            </div>
          )}

          <form action={signInWithGoogle}>
            <input type="hidden" name="redirect" value={params.redirect ?? '/obras'} />
            <button type="submit" className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar com o Google
            </button>
          </form>

          <p className="text-center text-xs leading-5 text-slate-400">Seu acesso às obras é liberado por um administrador após o primeiro login.</p>
        </div>
      </div>
    </div>
  );
}
