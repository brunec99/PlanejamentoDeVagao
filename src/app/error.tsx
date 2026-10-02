'use client';
import { useEffect } from 'react';
import Link from 'next/link';

/** Erro não tratado numa tela. O cabeçalho e a lateral continuam de pé; aqui aparece o que
 * aconteceu, com o identificador que a Vercel registra, e um botão para tentar de novo. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: 'error', route: 'page', digest: error.digest, message: error.message }));
  }, [error]);
  return (
    <div className="mx-auto max-w-xl py-12">
      <p className="eyebrow">Algo deu errado</p>
      <h1 className="page-title">Esta tela não pôde ser exibida</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        O erro foi registrado. Tente de novo; se continuar, volte à lista de obras e avise o administrador informando o código abaixo.
      </p>
      {error.digest && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600">Código: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className="button" onClick={reset}>
          Tentar de novo
        </button>
        <Link href="/obras" className="button-ghost">
          Ir para as obras
        </Link>
      </div>
    </div>
  );
}
