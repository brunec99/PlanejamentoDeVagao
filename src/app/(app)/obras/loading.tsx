import { PageSkeleton } from '@/modules/planejamento/ui';

/** Esqueleto que o Next mostra assim que se clica em "Obras" ou numa obra, antes de a função no
 * servidor responder (no plano Hobby ela pode estar fria): a tela reage na hora, e o `<Link>` já
 * traz este fallback no prefetch. Sem dado nenhum, de propósito: é só a forma da página. */
export default function Loading() {
  return (
    <div role="status" aria-label="Carregando a página">
      <PageSkeleton rows={5} />
    </div>
  );
}
