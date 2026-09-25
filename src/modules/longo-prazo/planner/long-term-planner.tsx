'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Flag, Layers, Plus, RefreshCw, Ruler, TrainFront, Upload } from 'lucide-react';
import {
  addDays, copyActivity, examplePlanDocument, latestPercents, LONG_TERM_COLORS, measuredActivityIds, planSpan, readPlanFile, reschedule,
  type LongTermActivity, type LongTermPlan, type LongTermPlanDocument, type LocalDate,
} from '@/domain/long-term-plan';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, LoadState } from '@/modules/planejamento/ui';
import { byHeight, height } from '@/modules/longo-prazo/line-of-balance';
import { formatTimestamp } from '@/shared/format';
import { PlanCanvas, type CanvasMode } from './plan-canvas';
import { ActivityForm } from './activity-form';
import { BaselinePanel, ConfigPanel, MeasurementPanel } from './plan-panels';
import { ActivitySummaryTable, PlanStats, TeamAllocation } from './plan-tables';
import { WagonSync } from './wagon-sync';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
type Panel = 'config' | 'baselines' | 'measurements' | 'wagons';
const SAVE_DELAY = 1000;
const newId = () => crypto.randomUUID();
/** Próxima segunda-feira a partir de hoje: ponto de partida do plano de exemplo e de um serviço novo. */
const nextMonday = (today: LocalDate) => { const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); return addDays(today, weekday === 1 ? 0 : (8 - weekday) % 7); };

/** Ferramenta de preenchimento do longo prazo: o plano vive num documento por obra, salvo sozinho
 * pouco depois de cada alteração, com trava de revisão para duas pessoas não se sobrescreverem. */
export function LongTermPlanner({ workId }: { workId: string }) {
  const context = usePlanning();
  const [plan, setPlan] = useState<LongTermPlan>();
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [mode, setMode] = useState<CanvasMode>('flow');
  const [hoverId, setHoverId] = useState('');
  const [editing, setEditing] = useState<string>(); // id do serviço, 'new' para um novo
  const [panel, setPanel] = useState<Panel>();
  const [baselineId, setBaselineId] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  const pending = useRef<LongTermPlanDocument | undefined>(undefined);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const importInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch(`/api/long-term-plan?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao carregar o planejamento de longo prazo.');
      revision.current = body.plan.revision;
      pending.current = undefined;
      setPlan(body.plan); setSaveState('idle'); setSaveError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Falha ao carregar o planejamento de longo prazo.'); }
  }, [workId]);
  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    if (inFlight.current || !pending.current) return;
    const document = pending.current;
    pending.current = undefined;
    inFlight.current = true;
    setSaveState('saving');
    try {
      const res = await fetch('/api/long-term-plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workId, revision: revision.current, document }) });
      const body = await res.json();
      if (res.status === 409) { setSaveState('conflict'); setSaveError(body.error); return; }
      if (!res.ok) { pending.current ??= document; setSaveState('error'); setSaveError(body.error ?? 'Falha ao salvar.'); return; }
      revision.current = body.plan.revision;
      // O documento da tela continua o local: o usuário pode ter editado enquanto a gravação ia.
      setPlan(prev => prev && { ...prev, revision: body.plan.revision, updatedAt: body.plan.updatedAt, updatedBy: body.plan.updatedBy });
      setSaveState(pending.current ? 'pending' : 'saved');
    } catch {
      pending.current ??= document;
      setSaveState('error'); setSaveError('Sem conexão com o servidor. As alterações continuam nesta tela; tente salvar de novo.');
    } finally {
      inFlight.current = false;
      if (pending.current) timer.current = setTimeout(flush, SAVE_DELAY);
    }
  }, [workId]);

  // Fechar a aba com alteração não gravada perde trabalho: o navegador pergunta antes.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending.current || inFlight.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); clearTimeout(timer.current); };
  }, []);

  const ready = context.state === 'ready' ? context : undefined;
  const actor = ready?.planning.data.users.find(u => u.id === ready.actorId);
  const readOnly = !actor || actor.role === 'viewer' || saveState === 'conflict';
  const today = ready?.planning.today ?? new Date().toISOString().slice(0, 10);
  const document = plan?.document;

  const update = (change: (document: LongTermPlanDocument) => LongTermPlanDocument) => {
    if (!plan || readOnly) return;
    const next = change(plan.document);
    setPlan({ ...plan, document: next });
    pending.current = next;
    setSaveState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };
  const setActivities = (change: (activities: LongTermActivity[]) => LongTermActivity[], options?: { removeSlack?: boolean }) =>
    update(d => ({ ...d, activities: reschedule(change(d.activities), options) }));

  const percents = useMemo(() => document ? latestPercents(document.activities, document.measurements, today) : {}, [document, today]);
  const measured = useMemo(() => document ? measuredActivityIds(document.measurements) : new Set<string>(), [document]);
  const locationNames = useMemo(() => ready
    ? ready.planning.data.locations.filter(l => l.workId === workId && height(l.name) < 9999).sort(byHeight).map(l => l.name)
    : [], [ready, workId]);

  if (loadError) return <div className="panel p-6"><Callout tone="danger" role="alert">{loadError}</Callout><button type="button" className="button-ghost mt-4" onClick={load}>Tentar de novo</button></div>;
  if (!plan || !document || context.state === 'loading') return <LoadState />;

  const baseline = document.baselines.find(b => b.id === baselineId);
  const editingActivity = editing && editing !== 'new' ? document.activities.find(a => a.id === editing) : undefined;
  const nextColor = LONG_TERM_COLORS[document.activities.length % LONG_TERM_COLORS.length];

  const saveActivity = (activity: LongTermActivity) => {
    setActivities(list => list.some(a => a.id === activity.id) ? list.map(a => a.id === activity.id ? activity : a) : [...list, activity]);
    setEditing(undefined);
  };
  const deleteActivity = (id: string) => {
    update(d => ({
      ...d,
      // Quem dependia do serviço excluído perde só esse vínculo; as datas ficam onde estão.
      activities: d.activities.filter(a => a.id !== id).map(a => ({ ...a, predecessors: a.predecessors.filter(l => l.activityId !== id) })),
      measurements: d.measurements.map(m => ({ ...m, items: m.items.filter(i => i.activityId !== id) })),
    }));
    setEditing(undefined);
  };
  const duplicateActivity = (activity: LongTermActivity) => {
    const copy = { ...copyActivity(activity, newId()), color: nextColor };
    update(d => ({ ...d, activities: [...d.activities, copy] }));
    setEditing(copy.id);
  };
  const saveConfig = (floorCount: number, floorNames: Record<string, string>) => {
    // Diminuir a obra corta a faixa dos serviços que passavam do topo, em vez de recusar.
    const clamp = (a: LongTermActivity): LongTermActivity => {
      const firstFloor = Math.min(a.firstFloor, floorCount), lastFloor = Math.min(a.lastFloor, floorCount);
      const floorDurations = a.floorDurations && Object.fromEntries(Object.entries(a.floorDurations).filter(([k]) => Number(k) <= lastFloor));
      return { ...a, firstFloor, lastFloor, floorDurations: floorDurations && Object.keys(floorDurations).length ? floorDurations : undefined,
        predecessors: a.predecessors.map(l => l.floor !== undefined && l.floor > floorCount ? { activityId: l.activityId, lagDays: l.lagDays } : l) };
    };
    update(d => ({ ...d, floorCount, floorNames, activities: reschedule(d.activities.map(clamp)) }));
    setPanel(undefined);
  };
  const saveBaseline = (name: string) => update(d => ({
    ...d, baselines: [...d.baselines, { id: newId(), name, createdAt: new Date().toISOString(), createdBy: ready?.actorId ?? '', activities: JSON.parse(JSON.stringify(d.activities)) }],
  }));
  const restoreBaseline = (id: string) => {
    const source = document.baselines.find(b => b.id === id);
    if (!source) return;
    setBaselineId('');
    // A foto pode ser de quando a obra tinha mais pavimentos: cresce a obra em vez de cortar serviços.
    const floorCount = Math.max(document.floorCount, ...source.activities.map(a => a.lastFloor));
    update(d => ({ ...d, floorCount, activities: JSON.parse(JSON.stringify(source.activities)) }));
    setNotice(`Plano restaurado a partir de "${source.name}".`);
  };
  const saveMeasurement = ({ date, items }: { date: LocalDate; items: LongTermPlanDocument['measurements'][number]['items'] }) => update(d => ({
    ...d, measurements: [...d.measurements, { id: newId(), number: Math.max(0, ...d.measurements.map(m => m.number)) + 1, date, createdAt: new Date().toISOString(), createdBy: ready?.actorId ?? '', items }],
  }));

  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ format: 'obra360-longo-prazo', version: 1, workId, exportedAt: new Date().toISOString(), document }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(window.document.createElement('a'), { href: url, download: `longo-prazo-${workId}.plp.json` });
    link.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (file: File) => {
    try {
      const imported = readPlanFile(JSON.parse(await file.text()));
      if (document.activities.length && !confirm(`Substituir o plano atual (${document.activities.length} serviços) pelo do arquivo (${imported.activities.length} serviços)? Salve uma linha de base antes se quiser guardar o atual.`)) return;
      update(() => imported);
      setNotice(`Plano importado de "${file.name}": ${imported.activities.length} serviços, ${imported.baselines.length} linhas de base e ${imported.measurements.length} medições.`);
    } catch (error) { setNotice(''); setSaveError(error instanceof Error ? `Arquivo não importado: ${error.message}` : 'Arquivo não importado.'); setSaveState(s => s === 'conflict' ? s : 'error'); }
  };

  const status = {
    idle: plan.updatedAt ? `Salvo em ${formatTimestamp(plan.updatedAt)}` : 'Ainda não salvo',
    pending: 'Alterações não salvas…', saving: 'Salvando…', saved: 'Salvo', error: 'Não salvo', conflict: 'Somente leitura',
  }[saveState];

  return <section aria-labelledby="planejador-titulo" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="planejador-titulo" className="text-lg font-bold text-slate-900">Planejador de longo prazo</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Monte a sequência de serviços no fluxograma e expanda para a Linha de Balanço. As datas de cada pavimento saem da duração, do ritmo e das predecessoras.</p>
      </div>
      <p role="status" className={`text-xs font-semibold ${saveState === 'error' || saveState === 'conflict' ? 'text-rose-700' : saveState === 'saved' ? 'text-emerald-700' : 'text-slate-500'}`}>{status}</p>
    </div>

    <div data-tour="longo-planejador-acoes" className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Ações do plano">
      {!readOnly && <button type="button" className="button" onClick={() => setEditing('new')}><Plus size={16} aria-hidden="true" /> Novo serviço</button>}
      {!readOnly && <button type="button" className="button-ghost" disabled={!document.activities.some(a => a.predecessors.length)} onClick={() => setActivities(list => list, { removeSlack: true })} title="Puxa cada serviço com predecessora para a data mínima, removendo as folgas dadas à mão"><RefreshCw size={15} aria-hidden="true" /> Recalcular</button>}
      {!readOnly && <button type="button" className="button-ghost" disabled={!document.activities.length} onClick={() => setPanel('wagons')} title="O plano é o responsável pelas atividades dos vagões"><TrainFront size={15} aria-hidden="true" /> Gerar vagões</button>}
      <button type="button" className="button-ghost" onClick={() => setPanel('baselines')}><Flag size={15} aria-hidden="true" /> Linhas de base{document.baselines.length > 0 && <span className="badge-muted px-2 py-0">{document.baselines.length}</span>}</button>
      <button type="button" className="button-ghost" onClick={() => setPanel('measurements')}><Ruler size={15} aria-hidden="true" /> Medições{document.measurements.length > 0 && <span className="badge-muted px-2 py-0">{document.measurements.length}</span>}</button>
      <button type="button" className="button-ghost" onClick={() => setPanel('config')}><Layers size={15} aria-hidden="true" /> Pavimentos</button>
      <button type="button" className="button-ghost" disabled={!document.activities.length} onClick={exportFile}><Download size={15} aria-hidden="true" /> Exportar</button>
      {!readOnly && <>
        <button type="button" className="button-ghost" onClick={() => importInput.current?.click()} title="Aceita o arquivo exportado aqui ou o .plp.json da ferramenta antiga do App-ATR"><Upload size={15} aria-hidden="true" /> Importar</button>
        <input ref={importInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) importFile(file); }} />
      </>}
    </div>

    {saveState === 'conflict' && <Callout tone="danger" role="alert">{saveError} <button type="button" className="text-link" onClick={load}>Recarregar o plano</button></Callout>}
    {saveState === 'error' && <Callout tone="danger" role="alert">{saveError} {pending.current && <button type="button" className="text-link" onClick={() => { clearTimeout(timer.current); flush(); }}>Tentar salvar de novo</button>}</Callout>}
    {notice && <Callout tone="success" role="status">{notice} <button type="button" className="text-link" onClick={() => setNotice('')}>Ok</button></Callout>}
    {document.activities.length > 0 && (plan.sync
      ? plan.sync.revision !== plan.revision || saveState === 'pending' || saveState === 'saving'
        ? <Callout tone="warning">O plano mudou depois da última geração de vagões ({formatTimestamp(plan.sync.at)}). Os vagões só acompanham o plano quando você {readOnly ? 'ou um planejador gera de novo' : <button type="button" className="text-link" onClick={() => setPanel('wagons')}>gera os vagões de novo</button>}.</Callout>
        : <Callout tone="success">Os vagões estão em dia com este plano (gerados em {formatTimestamp(plan.sync.at)}).</Callout>
      : <Callout tone="info">O plano é o responsável pelas atividades dos vagões, mas eles ainda não foram gerados a partir dele. {!readOnly && <button type="button" className="text-link" onClick={() => setPanel('wagons')}>Gerar vagões</button>}</Callout>)}
    {actor?.role === 'viewer' && <Callout tone="info">Seu perfil é de consulta: o plano aparece aqui, mas não pode ser alterado.</Callout>}
    {!readOnly && !document.activities.length && <Callout tone="info">Plano vazio. Cadastre o primeiro serviço, importe um arquivo exportado (inclusive da ferramenta antiga do App-ATR) ou <button type="button" className="text-link" onClick={() => update(d => ({ ...examplePlanDocument(nextMonday(today), d.floorCount), floorNames: d.floorNames }))}>comece por um exemplo de edifício</button> e ajuste.</Callout>}

    <PlanStats document={document} baseline={baseline} today={today} />
    {baseline && <Callout tone="warning">Comparando com a linha de base <strong>{baseline.name}</strong>: os retângulos cinza são as datas dela. <button type="button" className="text-link" onClick={() => setBaselineId('')}>Parar de comparar</button></Callout>}

    <div data-tour="longo-planejador-canvas"><PlanCanvas document={document} mode={mode} onModeChange={setMode} today={today} baseline={baseline} percents={percents}
      hoverId={hoverId} onHover={setHoverId} readOnly={readOnly} onOpen={setEditing}
      onMove={(id, start) => setActivities(list => list.map(a => a.id === id ? { ...a, start } : a))}
      onCreate={() => setEditing('new')} /></div>

    {document.activities.length > 0 && <ActivitySummaryTable document={document} hoverId={hoverId} onHover={setHoverId} readOnly={readOnly} onOpen={setEditing}
      onToggleVisible={id => update(d => ({ ...d, activities: d.activities.map(a => a.id === id ? { ...a, visible: !a.visible } : a) }))} />}
    <TeamAllocation document={document} />

    {editing && (editing === 'new' || editingActivity) && <ActivityForm key={editing} document={document} initial={editingActivity}
      defaultStart={nextMonday(today)} defaultColor={nextColor} unitLocked={!!editingActivity && measured.has(editingActivity.id)} readOnly={readOnly}
      onSave={saveActivity} onClose={() => setEditing(undefined)}
      onDelete={editingActivity ? () => deleteActivity(editingActivity.id) : undefined}
      onDuplicate={editingActivity ? () => duplicateActivity(editingActivity) : undefined} />}
    {panel === 'config' && <ConfigPanel document={document} locationNames={locationNames} readOnly={readOnly} onSave={saveConfig} onClose={() => setPanel(undefined)} />}
    {panel === 'baselines' && <BaselinePanel baselines={document.baselines} activeId={baselineId} readOnly={readOnly}
      currentFinish={planSpan(document.activities)?.finish} onToggle={id => setBaselineId(prev => prev === id ? '' : id)}
      onSave={saveBaseline} onRestore={id => { restoreBaseline(id); setPanel(undefined); }}
      onDelete={id => { if (baselineId === id) setBaselineId(''); update(d => ({ ...d, baselines: d.baselines.filter(b => b.id !== id) })); }}
      onClose={() => setPanel(undefined)} />}
    {panel === 'wagons' && <WagonSync workId={workId} plan={plan} busy={saveState === 'pending' || saveState === 'saving'}
      onSynced={sync => setPlan(prev => prev && { ...prev, sync })} onClose={() => setPanel(undefined)} />}
    {panel === 'measurements' && <MeasurementPanel document={document} today={today} readOnly={readOnly} onSave={saveMeasurement}
      onDelete={id => update(d => ({ ...d, measurements: d.measurements.filter(m => m.id !== id) }))} onClose={() => setPanel(undefined)} />}
  </section>;
}
