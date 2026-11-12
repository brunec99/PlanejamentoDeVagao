import { ChecklistOverview } from '@/modules/checklist/checklist-overview';
export const metadata = { title: 'Checklist de equipamentos' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <ChecklistOverview workId={obraId} />;
}
