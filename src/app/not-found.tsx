import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <p className="eyebrow">Página não encontrada</p>
      <h1 className="page-title">Este endereço não existe no Obra 360</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Confira o endereço ou volte para a lista de obras. Se você seguiu um link do sistema, a obra ou o vagão pode ter sido removido.
      </p>
      <div className="mt-6">
        <Link href="/obras" className="button">
          Ir para as obras
        </Link>
      </div>
    </div>
  );
}
