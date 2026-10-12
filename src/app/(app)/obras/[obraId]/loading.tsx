/** Esqueleto da troca de aba dentro da obra: aparece no clique, antes de a função no servidor
 * responder (fria no plano Hobby), e o `<Link>` da lateral o traz no prefetch. Repete a forma do
 * `TabHeader` (chip, linhas de título, alternadores à direita) e algumas linhas cinza; sem dado. */
export default function Loading() {
  return (
    <div role="status" aria-label="Carregando a aba">
      <div aria-hidden>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="skeleton mt-1 hidden h-12 w-12 shrink-0 rounded-2xl sm:block" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-40" />
              <div className="skeleton h-7 w-80 max-w-full" />
              <div className="skeleton h-3 w-96 max-w-full" />
            </div>
          </div>
          <div className="skeleton h-9 w-56 rounded-lg" />
        </header>
        <div className="panel p-5">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton h-4" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
