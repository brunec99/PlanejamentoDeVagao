import { WorkNav } from '@/modules/layout/work-nav';
export default async function WorkLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ obraId: string }> }>) {
  const { obraId } = await params;
  return <><WorkNav workId={obraId} />{children}</>;
}
