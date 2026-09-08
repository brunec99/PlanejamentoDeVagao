import { signIn } from './actions';
export const metadata = { title: 'Entrar' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; redirect?: string }> }) {
  const params = await searchParams;
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6 py-12">
      <p className="eyebrow">Sistema de Planejamento Vagão</p>
      <h1 className="page-title">Entrar</h1>
      {params.error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{params.error}</p>}
      <form action={signIn} className="mt-6 space-y-4">
        <input type="hidden" name="redirect" value={params.redirect ?? '/obras'} />
        <label className="block text-sm font-medium">E-mail<input className="field mt-1" type="email" name="email" required autoFocus /></label>
        <label className="block text-sm font-medium">Senha<input className="field mt-1" type="password" name="password" required /></label>
        <button className="button mt-2 w-full" type="submit">Entrar</button>
      </form>
    </div>
  );
}
