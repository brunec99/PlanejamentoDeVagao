import { CurtoPrazoSections } from '@/modules/curto-prazo/curto-prazo-sections';
export const metadata = { title: 'Cronograma de curto prazo' };
/** Página magra: a seção (`?secao=`, planilha ou fechamento) é lida no cliente, em
 * `CurtoPrazoSections`, para a troca entre as duas não voltar à função no servidor. */
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <CurtoPrazoSections workId={obraId} />;
}
