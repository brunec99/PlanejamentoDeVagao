import Image from 'next/image';
import { redirect } from 'next/navigation';
import { CalendarRange, ChartGantt, ClipboardCheck, TrainFront } from 'lucide-react';
import { signInWithGoogle } from './actions';
export const metadata = { title: 'Entrar' };

/** O que o Obra 360 reúne — a mesma ordem das abas da obra (longo, vagões, médio, curto). */
const DESTAQUES = [
  { icon: CalendarRange, titulo: 'Longo prazo', texto: 'Fluxograma, linha de balanço e restrições da obra inteira.' },
  { icon: TrainFront, titulo: 'Vagões', texto: 'Períodos de takt e terminalidade por pavimento.' },
  { icon: ChartGantt, titulo: 'Médio prazo', texto: 'Gantt com recursos e linha de base, no padrão do Project.' },
  { icon: ClipboardCheck, titulo: 'Curto prazo', texto: 'Planilha semanal, PPC e causas de não cumprimento.' },
];

/** Os dois logos são escuros, então ficam sempre num chip branco — no painel azul e no celular. */
function Logos({ priority = false }: { priority?: boolean }) {
  return (
    <div className="flex w-fit items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-brand-900/5">
      <Image
        src="/logo-atr.png"
        alt="ATR Incorporadora"
        width={110}
        height={48}
        className="h-8 w-auto object-contain"
        priority={priority}
      />
      <div className="h-8 w-px bg-slate-200" aria-hidden />
      <Image src="/logo-takt.png" alt="Takt Engenharia" width={150} height={84} className="h-9 w-auto object-contain" priority={priority} />
    </div>
  );
}

/**
 * Entrada do sistema, no mesmo desenho do Takt Hub. No desktop, um painel da marca à esquerda diz
 * em quatro linhas o que o Obra 360 faz; no celular, só os logos e o formulário.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string; code?: string }> }) {
  const params = await searchParams;
  // O login fica fora do middleware; se o Supabase devolver o código aqui, ele segue para a troca por sessão.
  if (params.code)
    redirect(`/auth/callback?code=${encodeURIComponent(params.code)}&redirect=${encodeURIComponent(params.redirect ?? '/obras')}`);
  const ano = new Date().getFullYear();
  return (
    <main className="grid min-h-dvh font-sans lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section
        aria-label="Sobre o Obra 360"
        className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-gradient-to-br from-brand-900 to-brand-950 p-10 text-brand-50 lg:flex xl:p-14"
      >
        {/* Um arco de luz no canto, para o painel não ser um bloco chapado. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-brand-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-48 -left-32 h-[24rem] w-[24rem] rounded-full bg-brand-600/20 blur-3xl"
        />

        <div className="relative">
          <Logos priority />
        </div>

        <div className="relative max-w-md">
          <p className="text-sm font-semibold tracking-wide text-brand-300 uppercase">Obra 360</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white xl:text-4xl">Do cronograma da obra à meta da semana.</h2>
          <ul className="mt-8 flex flex-col gap-5">
            {DESTAQUES.map(({ icon: Icon, titulo, texto }) => (
              <li key={titulo} className="flex gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50/10 text-brand-100 ring-1 ring-brand-50/10">
                  <Icon size={20} aria-hidden />
                </span>
                <span>
                  <span className="block font-medium text-white">{titulo}</span>
                  <span className="block text-sm leading-relaxed text-brand-200">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-300">ATR Incorporadora · Takt Engenharia · {ano}</p>
      </section>

      <section
        className="flex flex-col bg-white"
        style={{
          backgroundImage:
            'radial-gradient(60rem 30rem at 100% 0%, rgb(193 224 240 / 0.45), transparent 60%), radial-gradient(40rem 24rem at 0% 100%, rgb(227 240 248 / 0.7), transparent 60%)',
        }}
      >
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
              <span className="lg:hidden">
                <Logos priority />
              </span>
              <div>
                <h1 id="login-title" className="text-2xl font-semibold tracking-tight text-brand-950">
                  Entrar no Obra 360
                </h1>
                <p className="mt-1 text-sm text-slate-600">Use sua conta Google da ATR para acessar o planejamento das obras.</p>
              </div>
            </div>

            {params.error && (
              <div role="alert" className="mb-5 rounded-xl border border-danger-ring bg-danger-soft px-4 py-3">
                <p className="text-sm font-semibold text-rose-800">Não foi possível concluir o login</p>
                <p className="mt-0.5 text-xs text-rose-700">{params.error}</p>
              </div>
            )}

            <form action={signInWithGoogle} aria-labelledby="login-title">
              <input type="hidden" name="redirect" value={params.redirect ?? '/obras'} />
              <button
                type="submit"
                className="mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-brand-200 bg-white py-3 text-sm font-semibold text-brand-950 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continuar com o Google
              </button>
            </form>

            <p className="rounded-lg border border-brand-100 bg-primary-soft/70 px-3 py-2 text-center text-xs leading-5 text-slate-600 lg:text-left">
              Seu acesso às obras é liberado por um administrador após o primeiro login.
            </p>
          </div>
        </div>

        <footer className="pb-6 text-center text-xs text-slate-500 lg:hidden">ATR Incorporadora · Takt Engenharia · {ano}</footer>
      </section>
    </main>
  );
}
