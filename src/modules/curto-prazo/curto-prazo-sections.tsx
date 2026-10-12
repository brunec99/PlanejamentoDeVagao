'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CommitmentsOverview } from '@/modules/curto-prazo/commitments-overview';
import { ClosingOverview } from '@/modules/curto-prazo/closing-overview';
import { isCurtoSection } from '@/modules/curto-prazo/section-nav';
import { LoadState } from '@/modules/planejamento/ui';

/** A seção vem de `?secao=` lida no cliente: o `SectionNav` troca a URL com `pushState`, o Next
 * atualiza o `useSearchParams` e a planilha dá lugar ao fechamento sem passar pelo servidor. */
function Section({ workId }: { workId: string }) {
  const secao = useSearchParams().get('secao') ?? undefined;
  const section = isCurtoSection(secao) ? secao : 'planilha';
  return section === 'fechamento' ? <ClosingOverview workId={workId} /> : <CommitmentsOverview workId={workId} />;
}

/** As duas seções da aba 4. O `Suspense` é o que o Next pede para `useSearchParams`: se a rota
 * um dia for pré-renderizada, só este trecho cai para o cliente, com o esqueleto no lugar. */
export function CurtoPrazoSections({ workId }: { workId: string }) {
  return (
    <Suspense fallback={<LoadState />}>
      <Section workId={workId} />
    </Suspense>
  );
}
