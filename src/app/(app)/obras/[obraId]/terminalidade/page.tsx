import { TerminalityOverview } from '@/modules/terminalidade/terminality-overview';
export const metadata = { title: 'Terminalidade' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <TerminalityOverview workId={obraId} />;
}
