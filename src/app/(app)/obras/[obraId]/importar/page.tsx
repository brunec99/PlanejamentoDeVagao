import { PrevisionImport } from '@/modules/integracoes/prevision';
export const metadata = { title: 'Importar do Prevision' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) { const { obraId } = await params; return <PrevisionImport workId={obraId} />; }
