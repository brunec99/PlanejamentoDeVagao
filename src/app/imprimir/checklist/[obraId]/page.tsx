import { ChecklistLabels } from '@/modules/checklist/labels-print';

export const metadata = { title: 'Etiquetas do checklist de equipamentos' };

/** Etiquetas com o QR de cada equipamento, para imprimir e colar na máquina. Fora do layout do sistema; o
 * login segue exigido pelo proxy, e o segredo dos links só chega a TST e admin (`/api/checklist`).
 * `?equipamento=<id>` imprime uma só. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ obraId }, raw] = await Promise.all([params, searchParams]);
  const only = typeof raw.equipamento === 'string' ? raw.equipamento : undefined;
  return <ChecklistLabels workId={obraId} only={only} />;
}
