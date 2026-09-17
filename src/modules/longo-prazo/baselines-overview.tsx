'use client';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, formatTimestamp, wagonLabel } from '@/shared/format';

export function BaselinesOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;
  const baselines = data.baselines.filter(b => b.workId === workId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? id;

  return <>
    <p className="eyebrow">{selected.work.code}</p>
    <h1 className="page-title">Planejamento de longo prazo</h1>
    <p className="mt-1 text-sm text-slate-500">Linha de Balanço da obra e as linhas de base salvas para comparação com o realizado.</p>

    <div className="my-6">
      <CommandForm title="Definir linha de base" submit="Definir linha de base" command={d => ({ type: 'create_baseline', workId, name: value(d, 'name') })}>
        <TextField name="name" label="Nome da linha de base" />
      </CommandForm>
    </div>

    <section data-tour="longo-baselines" className="panel overflow-hidden">
      <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">Linhas de base</h2>
      {baselines.length === 0
        ? <div className="p-5"><Empty>Nenhuma linha de base salva. Cada acionamento cria um registro novo, sem substituir os anteriores.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Linhas de base" tabIndex={0}>
            <table className="data-table min-w-[720px]">
              <thead><tr>{['Linha de base', 'Salva em', 'Por', 'Vagões', 'Atividades', 'Período coberto'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{baselines.map(baseline => {
                const starts = baseline.wagons.map(w => w.plannedStart).sort();
                const ends = baseline.wagons.map(w => w.plannedEnd).sort();
                return <tr key={baseline.id}>
                  <th scope="row">{baseline.name}</th>
                  <td className="whitespace-nowrap">{formatTimestamp(baseline.createdAt)}</td>
                  <td>{person(baseline.createdBy)}</td>
                  <td className="tabular-nums">{baseline.wagons.length}<span className="block text-xs text-slate-400">{baseline.wagons.length > 0 ? `${wagonLabel(Math.min(...baseline.wagons.map(w => w.number)))} em diante` : ''}</span></td>
                  <td className="tabular-nums">{baseline.activities.length}</td>
                  <td className="whitespace-nowrap tabular-nums">{starts.length > 0 ? `${formatDate(starts[0])} a ${formatDate(ends[ends.length - 1])}` : '—'}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
    </section>

    <div className="mt-5"><Callout tone="info">Reprogramar o planejamento atual não altera nenhuma linha de base já salva. O planejamento atual, as linhas de base e o realizado permanecem registros distintos.</Callout></div>
  </>;
}
