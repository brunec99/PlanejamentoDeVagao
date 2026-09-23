'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Boxes, CalendarDays, Layers, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Progress, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, wagonLabel, wagonPath, workPath } from '@/shared/format';
import type { Activity, BaselineActivity } from '@/domain/entities';
import { FourDViewer, type ViewerJob, type ViewerService } from './viewer';
import {
  DEVIATION_COLORS, DEVIATION_LABELS, MODE_LABELS, STATE_LABELS, addDays, executedPercentAt, frameEvents, frameIndexAt, indexProgress,
  lookFor, plannedPercentAt, scheduleRange, serviceStateAt, simulationFrames,
  type ServiceFrame, type ServiceState, type SimulationMode, type StepUnit,
} from './simulation';

// Mesma paleta categórica validada para fundo claro usada na Linha de Balanço.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const OTHER = '#52514e';
const STEPS: { value: StepUnit; label: string }[] = [{ value: 'dia', label: '1 dia' }, { value: 'semana', label: '1 semana' }, { value: 'mes', label: '1 mês' }];
const SPEEDS = [1, 2, 4, 8];
const MODES: SimulationMode[] = ['planejado', 'executado', 'comparado'];
const percentLabel = (value: number | undefined) => (value === undefined ? 'sem medição' : `${Math.round(value)}%`);
const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)} p.p.`;

function groupByName<T extends { name: string }>(list: T[]) {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const bucket = map.get(item.name);
    if (bucket) bucket.push(item); else map.set(item.name, [item]);
  }
  return map;
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
  const [mode, setMode] = useState<SimulationMode>('planejado');
  const [step, setStep] = useState<StepUnit>('semana');
  const [speed, setSpeed] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [ghost, setGhost] = useState(false);

  const rules = useMemo(() => context.state === 'ready'
    ? context.planning.data.linkRules.filter(rule => rule.workId === workId).slice().sort((a, b) => a.order - b.order)
    : [], [context, workId]);

  // Base da simulação: não depende da data, então é montada uma vez por mudança de dados.
  const base = useMemo(() => {
    const empty = { activities: [] as Activity[], byName: new Map<string, Activity[]>(), index: indexProgress([]), services: [] as { name: string; color: string }[] };
    if (context.state !== 'ready') return empty;
    const selected = selectWorkPlanning(context.planning, workId);
    if (!selected) return empty;
    const wagonIds = new Set(selected.wagons.map(wagon => wagon.id));
    const activities = context.planning.data.activities.filter(activity => wagonIds.has(activity.wagonId));
    const ids = new Set(activities.map(activity => activity.id));
    const index = indexProgress(context.planning.data.progressEntries.filter(entry => ids.has(entry.activityId)));
    const names = [...new Set(rules.map(rule => rule.serviceName))];
    return { activities, byName: groupByName(activities), index, services: names.map((name, i) => ({ name, color: i < SERIES.length ? SERIES[i] : OTHER })) };
  }, [context, workId, rules]);

  const baseline = context.state === 'ready'
    ? context.planning.data.baselines.find(candidate => candidate.id === baselineId && candidate.workId === workId)
    : undefined;
  const baselineByName = useMemo(() => groupByName<BaselineActivity>(baseline?.activities ?? []), [baseline]);
  const today = context.state === 'ready' ? context.planning.today : '';
  const range = useMemo(() => scheduleRange(base.activities, baseline?.activities ?? []), [base, baseline]);
  const frames = useMemo(() => range ? simulationFrames(range.start, range.end, step) : [], [range, step]);
  const on = date || today;
  const index = frameIndexAt(frames, on);
  const nextDate = frames.length ? (frames[index] > on ? frames[index] : frames[index + 1]) : undefined;
  const previousDate = frames.length ? (frames[index] < on ? frames[index] : frames[index - 1]) : undefined;
  const atEnd = nextDate === undefined;

  // Quadro atual: estado de cada serviço na data, e no quadro anterior para saber o que mudou.
  const frame = useMemo(() => {
    const reference = (name: string) => baseline ? baselineByName.get(name) ?? [] : undefined;
    const stateAt = (when: string) => new Map(base.services.map(service =>
      [service.name, serviceStateAt(base.byName.get(service.name) ?? [], base.index, when, mode, reference(service.name))] as const));
    const current = stateAt(on);
    const before = stateAt(previousDate ?? addDays(on, -1));
    const states = (source: Map<string, ServiceFrame>) => new Map<string, ServiceState>([...source].map(([name, value]) => [name, value.state]));
    const viewer: ViewerService[] = base.services.map(service => ({ name: service.name, look: lookFor(current.get(service.name)!, mode, service.color, ghost) }));
    const referenceAll = baseline ? baseline.activities : base.activities;
    return {
      current, viewer,
      events: frameEvents(states(before), states(current)),
      planned: plannedPercentAt(referenceAll, on),
      executed: executedPercentAt(base.activities, base.index, on),
    };
  }, [base, baseline, baselineByName, mode, ghost, on, previousDate]);

  // Reprodução: um quadro por tique. A data mais recente é lida por ref para o intervalo não ser
  // recriado a cada quadro; no último quadro a reprodução para sozinha.
  const cursor = useRef({ frames, on });
  useEffect(() => { cursor.current = { frames, on }; }, [frames, on]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const { frames: list, on: now } = cursor.current;
      const i = frameIndexAt(list, now);
      const next = list[i] > now ? list[i] : list[i + 1];
      if (!next) { setPlaying(false); return; }
      setDate(next);
      if (next === list.at(-1)) setPlaying(false);
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [playing, speed]);

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(user => user.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { work, wagons } = selected;
  const { data } = planning;

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
  const baselines = data.baselines.filter(candidate => candidate.workId === workId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { services } = base;
  const anyVersion = data.ifcVersions.some(version => models.some(model => model.id === version.modelId));
  const referenceName = baseline ? `"${baseline.name}"` : 'cronograma atual';

  const rows = services.flatMap(service => wagons
    .filter(wagon => base.activities.some(activity => activity.wagonId === wagon.id && activity.name === service.name))
    .map(wagon => {
      const inWagon = base.activities.filter(activity => activity.wagonId === wagon.id && activity.name === service.name);
      return { service, wagon, count: inWagon.length, planned: plannedPercentAt(inWagon, on), executed: executedPercentAt(inWagon, base.index, on) };
    }))
    .sort((a, b) => a.wagon.plannedStart.localeCompare(b.wagon.plannedStart) || a.wagon.number - b.wagon.number || a.service.name.localeCompare(b.service.name, 'pt-BR'));
  const unmeasured = services.filter(service => frame.current.get(service.name)?.percent === undefined);
  const running = services.filter(service => frame.current.get(service.name)?.state === 'em_execucao');
  const starting = frame.events.filter(event => event.kind === 'inicio');
  const finishing = frame.events.filter(event => event.kind === 'termino');

  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (atEnd && frames.length) setDate(frames[0]);
    setPlaying(frames.length > 1);
  };
  // Espaço alterna a reprodução enquanto o foco está nos controles: no botão Reproduzir isso já é o
  // comportamento nativo; no controle deslizante (e no próprio grupo) o espaço é interceptado. Os
  // demais botões, a caixa de seleção e as listas mantêm a ativação por espaço do navegador.
  const onControlsKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ') return;
    const target = event.target as HTMLElement;
    const slider = target instanceof HTMLInputElement && target.type === 'range';
    if (!slider && target !== event.currentTarget) return;
    event.preventDefault();
    if (event.type === 'keydown' && !event.repeat) togglePlay();
  };
  const noSchedule = frames.length === 0;

  const header = <>
    <p className="eyebrow">Aba 6 · {work.code} · {work.name}</p>
    <h1 className="page-title">BIM 4D</h1>
    <p className="mt-1 max-w-3xl text-sm text-slate-500">Cronograma de longo prazo vinculado ao modelo federado.</p>
  </>;

  if (!anyVersion) return <>
    {header}
    <div className="panel mt-6 p-6">
      <h2 className="mb-1 text-sm font-bold text-slate-800">Nenhuma versão de modelo IFC nesta obra</h2>
      <Empty>O 4D desenha a geometria convertida no envio e lê o serviço de cada elemento dos dados transcritos, nunca o arquivo IFC. Envie o modelo em <Link className="text-link" href={workPath(workId, 'ifc')}>Arquivos IFC</Link> — o envio guarda as duas metades, a malha e as tabelas, e cada versão nova preserva as anteriores. Depois volte aqui para montar o conjunto federado.</Empty>
    </div>
  </>;

  return <>
    {header}

    {viewerError && <div className="mt-4"><Callout tone="danger" role="alert">{viewerError}</Callout></div>}

    <section data-tour="quatro-d-controls" className="panel mt-6 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Comparar com linha de base</span>
          <select className="field w-60" value={baselineId} onChange={event => setBaselineId(event.target.value)}>
            <option value="">Sem linha de base (cronograma atual)</option>
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
          <Boxes size={15} />{job ? 'Recarregar modelo' : 'Carregar modelo'}
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
      <StatCard label={`Planejado (${referenceName}) até ${formatDate(on)}`} value={`${Math.round(frame.planned)}%`} />
      <StatCard label={`Executado até ${formatDate(on)} (estimativa)`} value={`${Math.round(frame.executed)}%`}
        tone={frame.planned - frame.executed > 5 ? 'warning' : 'default'} />
    </div>

    {rules.length === 0 && <div className="mb-5"><Callout tone="warning">Nenhuma regra de vínculo cadastrada nesta obra, então nenhum elemento tem serviço associado e o modelo aparece todo em cinza. O vínculo entre elementos e serviços vem de regras por propriedade (pavimento e tipo), nunca de seleção manual elemento por elemento — cadastre as regras em <Link className="text-link" href={workPath(workId, 'ifc')}>Arquivos IFC</Link>.</Callout></div>}

    <section data-tour="quatro-d-viewer" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Boxes size={15} className="text-blue-600" />Simulação 4D em {formatDate(on)}</h2>
        <span className="badge-muted">{MODE_LABELS[mode]} · {activeStorey || 'Todos os pavimentos'}{job && report.elements > 0 && ` · ${report.linked.toLocaleString('pt-BR')} de ${report.elements.toLocaleString('pt-BR')} elementos com serviço`}</span>
      </div>

      <div role="group" aria-label="Controles da simulação" tabIndex={-1} className="border-b border-slate-100 px-5 py-4" onKeyDown={onControlsKey} onKeyUp={onControlsKey}>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Modo da simulação" className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {MODES.map(option => <button key={option} type="button" aria-pressed={mode === option}
              className={`px-3 py-1.5 text-xs font-semibold ${mode === option ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setMode(option)}>{MODE_LABELS[option]}</button>)}
          </div>
          <label className="ml-2 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={ghost} onChange={event => setGhost(event.target.checked)} />Mostrar não iniciados como fantasma
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="button-ghost" aria-label="Voltar ao início" disabled={noSchedule} onClick={() => { setPlaying(false); setDate(frames[0]); }}><RotateCcw size={15} /></button>
          <button type="button" className="button-ghost" aria-label="Quadro anterior" disabled={noSchedule || previousDate === undefined} onClick={() => { setPlaying(false); if (previousDate) setDate(previousDate); }}><SkipBack size={15} /></button>
          <button type="button" className="button" aria-label={playing ? 'Pausar simulação' : 'Reproduzir simulação'} disabled={frames.length < 2} onClick={togglePlay}>
            {playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pausar' : 'Reproduzir'}
          </button>
          <button type="button" className="button-ghost" aria-label="Próximo quadro" disabled={noSchedule || atEnd} onClick={() => { setPlaying(false); if (nextDate) setDate(nextDate); }}><SkipForward size={15} /></button>
          <button type="button" className="button-ghost" aria-label={`Ir para hoje, ${formatDate(today)}`} onClick={() => { setPlaying(false); setDate(today); }}><CalendarDays size={15} />Hoje</button>
          <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-600">Passo
            <select className="field w-28 py-1.5" value={step} onChange={event => setStep(event.target.value as StepUnit)}>
              {STEPS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">Velocidade
            <select className="field w-32 py-1.5" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              {SPEEDS.map(value => <option key={value} value={value}>{value} {value === 1 ? 'quadro' : 'quadros'}/s</option>)}
            </select>
          </label>
        </div>

        {noSchedule
          ? <p className="mt-3 text-xs text-slate-500">O cronograma de longo prazo desta obra não tem atividades com datas, então não há linha do tempo para simular.</p>
          : <div className="mt-3 flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">{formatDate(frames[0])}</span>
              <input type="range" className="w-full accent-blue-600" min={0} max={frames.length - 1} value={index}
                aria-label="Data da simulação" aria-valuetext={formatDate(on)}
                onChange={event => { setPlaying(false); setDate(frames[Number(event.target.value)]); }} />
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">{formatDate(frames.at(-1)!)}</span>
              <label className="shrink-0 text-xs font-semibold text-slate-600"><span className="sr-only">Data exata</span>
                <input type="date" className="field w-40 py-1.5" value={on} onChange={event => { setPlaying(false); if (event.target.value) setDate(event.target.value); }} />
              </label>
            </div>}
        <p className="mt-2 text-xs text-slate-500" aria-live="polite">
          <strong className="text-slate-700">{formatDate(on)}</strong>{!noSchedule && ` · quadro ${index + 1} de ${frames.length}`}{on === today && ' · hoje'}. Espaço reproduz ou pausa quando o foco está nestes controles.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
        <div>
          <FourDViewer job={job} rules={rules} services={frame.viewer} storey={activeStorey} onReport={setReport} onError={setViewerError} />

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {mode === 'comparado'
              ? (Object.keys(DEVIATION_COLORS) as (keyof typeof DEVIATION_COLORS)[]).map(key => <span key={key} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEVIATION_COLORS[key] }} />{DEVIATION_LABELS[key]}
                </span>)
              : services.map(service => <span key={service.name} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: service.color }} />
                  {service.name} · {percentLabel(frame.current.get(service.name)?.percent)}
                </span>)}
            <span className="flex items-center gap-2 text-xs font-medium text-slate-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-slate-400" />Sem regra que case · cinza</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {mode === 'planejado' ? 'Um serviço aparece quando a janela prevista dele começa; o tom se intensifica com o planejado até a data e fica cheio no término previsto.'
              : mode === 'executado' ? 'Um serviço aparece com o primeiro lançamento de avanço; o tom é o executado apurado até a data e fica cheio em 100%.'
              : `Cor pelo desvio do executado em relação ao planejado (${referenceName}) na data, com tolerância de 5 pontos.`}
            {' '}{ghost ? 'Não iniciados aparecem como fantasma translúcido.' : 'Não iniciados ficam ocultos.'}
          </p>
        </div>

        <aside aria-label="O que está acontecendo nesta data" className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600">
          <h3 className="text-sm font-bold text-slate-800">Nesta data</h3>
          <p className="mt-1 text-slate-500">Planejado {Math.round(frame.planned)}% · executado {Math.round(frame.executed)}% <span className="text-slate-400">({signed(frame.executed - frame.planned)})</span></p>
          <h4 className="mt-3 font-semibold text-slate-700">Começam neste quadro</h4>
          {starting.length ? <ul className="mt-1 space-y-0.5">{starting.map(event => <li key={event.service}>{event.service}</li>)}</ul> : <p className="mt-1 text-slate-400">Nenhum serviço.</p>}
          <h4 className="mt-3 font-semibold text-slate-700">Terminam neste quadro</h4>
          {finishing.length ? <ul className="mt-1 space-y-0.5">{finishing.map(event => <li key={event.service}>{event.service}</li>)}</ul> : <p className="mt-1 text-slate-400">Nenhum serviço.</p>}
          <h4 className="mt-3 font-semibold text-slate-700">{STATE_LABELS.em_execucao} ({running.length})</h4>
          {running.length ? <ul className="mt-1 space-y-0.5">{running.map(service => {
            const current = frame.current.get(service.name)!;
            return <li key={service.name} className="flex justify-between gap-2"><span className="truncate">{service.name}</span>
              <span className="shrink-0 tabular-nums text-slate-400">{Math.round(current.percent ?? 0)}%{mode === 'comparado' && ` · ${DEVIATION_LABELS[current.deviation].toLowerCase()}`}</span></li>;
          })}</ul> : <p className="mt-1 text-slate-400">Nenhum serviço.</p>}
        </aside>
      </div>

      <div className="px-5 pb-5">
        <Callout tone="warning">As cores vêm das regras de vínculo (pavimento e tipo de elemento), não de escolha elemento por elemento. O avanço parcial mostrado é uma <strong>estimativa do serviço inteiro</strong> em {formatDate(on)}: o percentual não informa quais elementos foram executados, então nenhum elemento individual é apresentado como verificado. Para confirmar o que está pronto, use as atividades e os critérios de terminalidade do vagão.</Callout>
      </div>
    </section>

    <section className="panel mt-5 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-bold text-slate-800">Serviços por vagão em {formatDate(on)}</h2>
        <p className="mt-0.5 text-xs text-slate-500">Mesma informação da cena 3D em texto, acompanhando a data da simulação: cada serviço vinculado por regra, o vagão em que ele é executado e o planejado e o executado até a data.</p>
      </div>
      {rows.length === 0
        ? <div className="p-5"><Empty>{services.length === 0
            ? 'Sem regras de vínculo, nenhum serviço pode ser relacionado aos vagões.'
            : 'Nenhum vagão desta obra tem atividade com o nome de um serviço cadastrado nas regras. Confira se o nome do serviço na regra é igual ao nome da atividade.'}</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Serviços vinculados por regra e seus vagões" tabIndex={0}>
            <table className="data-table min-w-[920px]">
              <thead><tr>{['Serviço', 'Vagão', 'Período previsto', `Planejado até ${formatDate(on)}`, `Executado até ${formatDate(on)} (estimativa)`].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={`${row.service.name}-${row.wagon.id}`}>
                <th scope="row">
                  <span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.service.color }} />{row.service.name}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.count} {row.count === 1 ? 'atividade' : 'atividades'}</span>
                </th>
                <td><Link className="text-link whitespace-nowrap" href={wagonPath(workId, row.wagon.id)}>{wagonLabel(row.wagon.number)}</Link></td>
                <td className="whitespace-nowrap tabular-nums">{formatDate(row.wagon.plannedStart)}<span className="block text-xs text-slate-400">até {formatDate(row.wagon.plannedEnd)}</span></td>
                <td><Progress value={row.planned} label={`${row.service.name} no ${wagonLabel(row.wagon.number)}, planejado até ${formatDate(on)}`} /></td>
                <td><Progress value={row.executed} label={`${row.service.name} no ${wagonLabel(row.wagon.number)}, executado até ${formatDate(on)}`} /></td>
              </tr>)}</tbody>
            </table>
          </div>}
      {unmeasured.length > 0 && <div className="border-t border-slate-100 p-4"><Callout tone="info">{unmeasured.length === 1 ? 'O serviço' : 'Os serviços'} {unmeasured.map(service => `"${service.name}"`).join(', ')} {unmeasured.length === 1 ? 'tem regra cadastrada mas nenhuma atividade com esse nome' : 'têm regra cadastrada mas nenhuma atividade com esses nomes'} nos vagões desta obra — sem atividade não há o que simular, então esses elementos aparecem sempre como fantasma e marcados como &quot;sem medição&quot; na legenda.</Callout></div>}
    </section>
  </>;
}
