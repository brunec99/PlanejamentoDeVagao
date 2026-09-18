'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Boxes, Layers, Play } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Progress, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, planningPath, wagonLabel, wagonPath, workPath } from '@/shared/format';
import type { Activity, Baseline, ProgressEntry } from '@/domain/entities';
import { weightedProgress } from '@/domain/rules';
import { FourDViewer, type ViewerJob, type ViewerService } from './viewer';

// Mesma paleta categórica validada para fundo claro usada na Linha de Balanço.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const OTHER = '#52514e';
const MS = 86400000;
const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS) + 1;
const percentLabel = (value: number | undefined) => (value === undefined ? 'sem medição' : `${Math.round(value)}%`);

/** Executado até a data: por atividade vale o último lançamento com `recordedDate <= data`, e 0
 * quando não houver nenhum. `Activity.progress` guarda só o valor de hoje, não a série. */
function resolverAt(entries: ProgressEntry[], date: string) {
  const byActivity = new Map<string, ProgressEntry[]>();
  for (const entry of entries) {
    if (entry.recordedDate > date) continue;
    const list = byActivity.get(entry.activityId);
    if (list) list.push(entry); else byActivity.set(entry.activityId, [entry]);
  }
  return (activity: Activity): Activity => {
    const last = byActivity.get(activity.id)?.slice()
      .sort((a, b) => a.recordedDate.localeCompare(b.recordedDate) || a.createdAt.localeCompare(b.createdAt)).at(-1);
    const progress = last?.progress ?? 0;
    return { ...activity, progress, status: progress === 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started' };
  };
}

/** Planejado da linha de base na data: cada atividade avança linearmente entre suas datas salvas. */
function baselinePlanned(baseline: Baseline, date: string) {
  const total = baseline.activities.reduce((sum, activity) => sum + activity.weight, 0);
  if (!total) return 0;
  const share = (activity: { plannedStart: string; plannedEnd: string }) => date < activity.plannedStart ? 0
    : date >= activity.plannedEnd ? 100
    : (spanDays(activity.plannedStart, date) / spanDays(activity.plannedStart, activity.plannedEnd)) * 100;
  return baseline.activities.reduce((sum, activity) => sum + share(activity) * activity.weight, 0) / total;
}

export function FourDOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [date, setDate] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [storey, setStorey] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [job, setJob] = useState<ViewerJob>();
  const [report, setReport] = useState({ elements: 0, linked: 0 });
  const [viewerError, setViewerError] = useState('');

  const rules = useMemo(() => context.state === 'ready'
    ? context.planning.data.linkRules.filter(rule => rule.workId === workId).slice().sort((a, b) => a.order - b.order)
    : [], [context, workId]);

  const view = useMemo(() => {
    const empty = { services: [] as ViewerService[], resolve: (activity: Activity) => activity, activities: [] as Activity[], executed: 0 };
    if (context.state !== 'ready') return empty;
    const selected = selectWorkPlanning(context.planning, workId);
    if (!selected) return empty;
    const { data, today } = context.planning;
    const on = date || today;
    const wagonIds = new Set(selected.wagons.map(wagon => wagon.id));
    const activities = data.activities.filter(activity => wagonIds.has(activity.wagonId));
    const resolve = resolverAt(data.progressEntries, on);
    const names = [...new Set(rules.map(rule => rule.serviceName))];
    const services: ViewerService[] = names.map((name, index) => {
      const matching = activities.filter(activity => activity.name === name).map(resolve);
      return { name, color: index < SERIES.length ? SERIES[index] : OTHER, percent: matching.length ? weightedProgress(matching) : undefined };
    });
    return { services, resolve, activities, executed: activities.length ? weightedProgress(activities.map(resolve)) : 0 };
  }, [context, workId, rules, date]);

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(user => user.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { work, wagons } = selected;
  const { data, today } = planning;
  const on = date || today;

  const models = data.ifcModels.filter(model => model.workId === workId).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const versionsOf = (modelId: string) => data.ifcVersions.filter(version => version.modelId === modelId).slice().sort((a, b) => b.version - a.version);
  const chosenId = (modelId: string) => picked[modelId] ?? versionsOf(modelId)[0]?.id ?? '';
  const federated = models.flatMap(model => {
    const version = versionsOf(model.id).find(candidate => candidate.id === chosenId(model.id));
    return version ? [{ model, version }] : [];
  });
  const storeys = [...new Set(federated.flatMap(entry => entry.version.storeys))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  // Trocar o conjunto federado pode tirar o pavimento escolhido de cena; aí o recorte volta a "todos".
  const activeStorey = storeys.includes(storey) ? storey : '';
  const baselines = data.baselines.filter(baseline => baseline.workId === workId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const baseline = baselines.find(candidate => candidate.id === baselineId);
  const { services, executed } = view;
  const anyVersion = data.ifcVersions.some(version => models.some(model => model.id === version.modelId));

  const rows = services.flatMap(service => wagons
    .filter(wagon => view.activities.some(activity => activity.wagonId === wagon.id && activity.name === service.name))
    .map(wagon => {
      const inWagon = view.activities.filter(activity => activity.wagonId === wagon.id && activity.name === service.name).map(view.resolve);
      return { service, wagon, count: inWagon.length, percent: weightedProgress(inWagon) };
    }))
    .sort((a, b) => a.wagon.plannedStart.localeCompare(b.wagon.plannedStart) || a.wagon.number - b.wagon.number || a.service.name.localeCompare(b.service.name, 'pt-BR'));
  const unmeasured = services.filter(service => service.percent === undefined);

  const header = <>
    <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800" href={planningPath(workId)}><ArrowLeft size={15} />{work.name}</Link>
    <p className="eyebrow mt-5">Modelo federado · {work.code}</p>
    <h1 className="page-title">BIM 4D</h1>
    <p className="mt-1 max-w-3xl text-sm text-slate-500">Mostra a evolução física do edifício numa data escolhida e compara o executado com o planejado de uma linha de base. Os elementos são coloridos pelo serviço vinculado por regra.</p>
  </>;

  if (!anyVersion) return <>
    {header}
    <div className="panel mt-6 p-6">
      <h2 className="mb-1 text-sm font-bold text-slate-800">Nenhuma versão de modelo IFC nesta obra</h2>
      <Empty>O 4D desenha a geometria convertida no envio e lê o serviço de cada elemento dos dados transcritos, nunca o arquivo IFC. Envie o modelo em <Link className="text-link" href={workPath(workId, 'ifc')}>Modelos IFC</Link> — o envio guarda as duas metades, a malha e as tabelas, e cada versão nova preserva as anteriores. Depois volte aqui para montar o conjunto federado.</Empty>
    </div>
  </>;

  return <>
    {header}

    {viewerError && <div className="mt-4"><Callout tone="danger" role="alert">{viewerError}</Callout></div>}

    <section data-tour="quatro-d-controls" className="panel mt-6 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Data da consulta</span>
          <input type="date" className="field w-44" value={on} onChange={event => setDate(event.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Comparar com linha de base</span>
          <select className="field w-60" value={baselineId} onChange={event => setBaselineId(event.target.value)}>
            <option value="">Sem comparação</option>
            {baselines.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Recorte por pavimento</span>
          <select className="field w-52" value={activeStorey} onChange={event => setStorey(event.target.value)}>
            <option value="">Todos os pavimentos</option>
            {storeys.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button type="button" className="button" disabled={federated.length === 0}
          onClick={() => { setViewerError(''); setJob({ token: Date.now(), versions: federated.map(entry => ({ id: entry.version.id, label: `${entry.model.name} v${entry.version.version}` })) }); }}>
          <Play size={15} />{job ? 'Recarregar modelo' : 'Carregar modelo'}
        </button>
      </div>

      <fieldset className="mt-5 border-t border-slate-100 pt-4">
        <legend className="flex items-center gap-2 text-xs font-bold text-slate-700"><Layers size={14} className="text-blue-600" />Conjunto federado</legend>
        <p className="mt-1 text-xs text-slate-500">Vários modelos entram na mesma cena. O padrão é a versão mais recente de cada modelo da obra; a geometria convertida de cada versão é baixada quando você aciona o carregamento.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map(model => {
            const versions = versionsOf(model.id);
            return <label key={model.id} className="block rounded-lg border border-slate-200 p-3 text-xs font-semibold text-slate-600">
              <span className="block truncate text-slate-800">{model.name}</span>
              <span className="mb-1.5 block text-[11px] font-normal text-slate-400">{model.discipline}</span>
              <select className="field py-1.5" value={chosenId(model.id)} onChange={event => setPicked(current => ({ ...current, [model.id]: event.target.value }))}>
                <option value="">Fora do conjunto</option>
                {versions.map(version => <option key={version.id} value={version.id}>v{version.version} · {version.fileName} · {version.elementCount.toLocaleString('pt-BR')} elementos</option>)}
              </select>
              {versions.length === 0 && <span className="mt-1.5 block text-[11px] font-normal text-amber-600">Nenhuma versão enviada.</span>}
            </label>;
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {federated.length === 0
            ? 'Nenhuma versão no conjunto — escolha ao menos uma para carregar.'
            : `${federated.length} ${federated.length === 1 ? 'versão' : 'versões'} · ${federated.reduce((sum, entry) => sum + entry.version.elementCount, 0).toLocaleString('pt-BR')} elementos transcritos no envio`}
        </p>
      </fieldset>
    </section>

    <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Serviços vinculados por regra" value={services.length} tone={services.length === 0 ? 'warning' : 'default'} />
      <StatCard label="Elementos no modelo carregado" value={job ? report.elements.toLocaleString('pt-BR') : '—'} />
      <StatCard label={`Executado até ${formatDate(on)} (estimativa)`} value={`${Math.round(executed)}%`} />
      {baseline && <StatCard label={`Planejado por "${baseline.name}" até ${formatDate(on)}`} value={`${Math.round(baselinePlanned(baseline, on))}%`}
        tone={baselinePlanned(baseline, on) - executed > 5 ? 'warning' : 'default'} />}
    </div>

    {rules.length === 0 && <div className="mb-5"><Callout tone="warning">Nenhuma regra de vínculo cadastrada nesta obra, então nenhum elemento tem serviço associado e o modelo aparece todo em cinza. O vínculo entre elementos e serviços vem de regras por propriedade (pavimento e tipo), nunca de seleção manual elemento por elemento — cadastre as regras em <Link className="text-link" href={workPath(workId, 'ifc')}>Modelos IFC</Link>.</Callout></div>}

    <section data-tour="quatro-d-viewer" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Boxes size={15} className="text-blue-600" />Evolução física em {formatDate(on)}</h2>
        <span className="badge-muted">{activeStorey || 'Todos os pavimentos'}{job && report.elements > 0 && ` · ${report.linked.toLocaleString('pt-BR')} de ${report.elements.toLocaleString('pt-BR')} elementos com serviço`}</span>
      </div>
      <div className="p-5">
        <FourDViewer job={job} rules={rules} services={services} storey={activeStorey} onReport={setReport} onError={setViewerError} />

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {services.map(service => <span key={service.name} className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: service.color }} />
            {service.name} · {percentLabel(service.percent)}
          </span>)}
          <span className="flex items-center gap-2 text-xs font-medium text-slate-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-slate-400" />Sem regra que case · cinza</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Tom claro e translúcido = 0% estimado; tom cheio e opaco = 100% estimado. A intensidade é a mesma para todos os elementos de um serviço.</p>

        <div className="mt-4">
          <Callout tone="warning">As cores vêm das regras de vínculo (pavimento e tipo de elemento), não de escolha elemento por elemento. O avanço parcial mostrado é uma <strong>estimativa do serviço inteiro</strong> em {formatDate(on)}: o percentual não informa quais elementos foram executados, então nenhum elemento individual é apresentado como verificado. Para confirmar o que está pronto, use as atividades e os critérios de terminalidade do vagão.</Callout>
        </div>
      </div>
    </section>

    <section className="panel mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-800">Serviços por vagão em {formatDate(on)}</h2>
        <p className="mt-0.5 text-xs text-slate-500">Mesma informação da cena 3D em texto: cada serviço vinculado por regra, o vagão em que ele é executado e o percentual apurado até a data.</p>
      </div>
      {rows.length === 0
        ? <div className="p-5"><Empty>{services.length === 0
            ? 'Sem regras de vínculo, nenhum serviço pode ser relacionado aos vagões.'
            : 'Nenhum vagão desta obra tem atividade com o nome de um serviço cadastrado nas regras. Confira se o nome do serviço na regra é igual ao nome da atividade.'}</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Serviços vinculados por regra e seus vagões" tabIndex={0}>
            <table className="data-table min-w-[820px]">
              <thead><tr>{['Serviço', 'Vagão', 'Período previsto', `Executado até ${formatDate(on)} (estimativa)`].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={`${row.service.name}-${row.wagon.id}`}>
                <th scope="row">
                  <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.service.color }} />{row.service.name}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.count} {row.count === 1 ? 'atividade' : 'atividades'}</span>
                </th>
                <td><Link className="text-link whitespace-nowrap" href={wagonPath(workId, row.wagon.id)}>{wagonLabel(row.wagon.number)}</Link></td>
                <td className="whitespace-nowrap tabular-nums">{formatDate(row.wagon.plannedStart)}<span className="block text-xs text-slate-400">até {formatDate(row.wagon.plannedEnd)}</span></td>
                <td><Progress value={row.percent} label={`${row.service.name} no ${wagonLabel(row.wagon.number)} até ${formatDate(on)}`} /></td>
              </tr>)}</tbody>
            </table>
          </div>}
      {unmeasured.length > 0 && <div className="border-t border-slate-100 p-4"><Callout tone="info">{unmeasured.length === 1 ? 'O serviço' : 'Os serviços'} {unmeasured.map(service => `"${service.name}"`).join(', ')} {unmeasured.length === 1 ? 'tem regra cadastrada mas nenhuma atividade com esse nome' : 'têm regra cadastrada mas nenhuma atividade com esses nomes'} nos vagões desta obra — sem atividade não há percentual apurado, então esses elementos aparecem no tom mais claro e marcados como &quot;sem medição&quot; na legenda.</Callout></div>}
    </section>
  </>;
}
