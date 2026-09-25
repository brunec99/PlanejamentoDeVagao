'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { LongTermPlan } from '@/domain/long-term-plan';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { formatDate, workPath } from '@/shared/format';

type Summary = {
  frontier: string; frozenWagonNumber?: number; wagons: number; activities: number; firstStart?: string; lastEnd?: string;
  keptWagons: number; keptActivities: number; removedWagons: number; removedActivities: number;
  removedRestrictions: number; removedPending: number; removedWithProgress: number; skippedPast: number;
};

/** Gera os vagões a partir do plano salvo. Sempre mostra a prévia antes: gerar pode remover
 * vagões da cauda não liberada, e com eles restrições e pendências. */
export function WagonSync({ workId, plan, busy, onSynced, onClose }: {
  workId: string; plan: LongTermPlan; busy: boolean;
  onSynced: (sync: NonNullable<LongTermPlan['sync']>) => void; onClose: () => void;
}) {
  const context = usePlanning();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const sequences = context.state === 'ready' ? context.planning.data.sequences.filter(s => s.workId === workId) : [];
  const [sequenceId, setSequenceId] = useState(plan.sync?.sequenceId ?? sequences[0]?.id ?? '');
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState({ name: 'Ciclo do longo prazo', taktDays: '5', calendar: 'business_days' as 'business_days' | 'calendar_days' });

  const call = async (dryRun: boolean) => {
    const res = await fetch('/api/long-term-plan/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workId, revision: plan.revision, sequenceId, dryRun }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Falha ao gerar os vagões.');
    return body as { summary: Summary; sync?: NonNullable<LongTermPlan['sync']> };
  };
  useEffect(() => {
    if (!sequenceId || busy || done) return;
    let active = true;
    setSummary(undefined); setError('');
    call(true).then(r => { if (active) setSummary(r.summary); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceId, plan.revision, busy]);

  const createSequence = async () => {
    if (context.state !== 'ready') return;
    const taktDays = Number(draft.taktDays);
    if (!Number.isInteger(taktDays) || taktDays < 1 || taktDays > 60) { setError('Takt: um número inteiro de 1 a 60 dias.'); return; }
    setWorking(true); setError('');
    try { setSequenceId(await context.execute({ type: 'create_sequence', workId, name: draft.name.trim() || 'Ciclo do longo prazo', taktDays, calendar: draft.calendar })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao criar a sequência.'); }
    finally { setWorking(false); }
  };
  const generate = async () => {
    setWorking(true); setError('');
    try {
      const result = await call(false);
      setSummary(result.summary); setDone(true);
      if (result.sync) onSynced(result.sync);
      if (context.state === 'ready') await context.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao gerar os vagões.'); }
    finally { setWorking(false); }
  };
  const sequence = sequences.find(s => s.id === sequenceId);
  const losses = summary ? summary.removedWagons + summary.removedActivities + summary.removedRestrictions + summary.removedPending : 0;

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="gerar-vagoes-titulo" className="m-auto max-h-[90vh] w-[min(40rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55">
    <div className="space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Plano de longo prazo → vagões</p>
          <h3 id="gerar-vagoes-titulo" className="mt-1 text-base font-bold text-slate-900">Gerar vagões a partir do plano</h3>
        </div>
        <button type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>
      <p className="text-sm leading-6 text-slate-600">O plano é o responsável pelas atividades dos vagões. Cada serviço vira uma atividade por pavimento, fatiada nos vagões que atravessa. Vagões já liberados não mudam: o plano ocupa só a cauda ainda não liberada. Gerar de novo sem mudar o plano mantém os mesmos vagões e atividades, com avanço, critérios e restrições.</p>

      {sequences.length > 0 ? <label className="block text-sm">
        <span className="text-xs font-semibold text-slate-600">Sequência de vagões</span>
        <select className="field mt-1" value={sequenceId} onChange={e => { setSequenceId(e.target.value); setDone(false); }}>
          {sequences.map(s => <option key={s.id} value={s.id}>{s.name} · takt {s.defaultTaktDays} {s.calendar === 'business_days' ? 'dias úteis' : 'dias corridos'}</option>)}
        </select>
      </label> : <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-xs font-semibold text-slate-600">A obra ainda não tem sequência de vagões. Crie uma:</legend>
        <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Nome</span><input className="field mt-1" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Takt (dias por vagão)</span><input className="field mt-1" inputMode="numeric" value={draft.taktDays} onChange={e => setDraft({ ...draft, taktDays: e.target.value })} /></label>
          <label className="block text-sm"><span className="text-xs font-semibold text-slate-600">Calendário</span><select className="field mt-1" value={draft.calendar} onChange={e => setDraft({ ...draft, calendar: e.target.value as typeof draft.calendar })}><option value="business_days">Dias úteis</option><option value="calendar_days">Dias corridos</option></select></label>
        </div>
        <button type="button" className="button" disabled={working} onClick={createSequence}>Criar sequência</button>
      </fieldset>}

      {busy && <Callout tone="info">Aguardando o plano terminar de salvar — os vagões são gerados a partir do plano salvo.</Callout>}
      {error && <Callout tone="danger" role="alert">{error}</Callout>}
      {sequence && !summary && !error && !busy && <p role="status" className="text-sm text-slate-500">Calculando a prévia…</p>}

      {summary && <div className="space-y-3">
        {done
          ? <Callout tone="success" role="status">Vagões gerados: {summary.wagons} vagões com {summary.activities} atividades. <Link className="text-link" href={workPath(workId, 'vagoes')}>Abrir os vagões</Link></Callout>
          : <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="stat-card"><dt className="eyebrow">Vagões</dt><dd className="mt-1 font-semibold text-slate-900">{summary.wagons}{summary.firstStart && summary.lastEnd && <span className="block text-xs font-medium text-slate-500">{formatDate(summary.firstStart)} → {formatDate(summary.lastEnd)}</span>}</dd></div>
            <div className="stat-card"><dt className="eyebrow">Atividades</dt><dd className="mt-1 font-semibold text-slate-900">{summary.activities}<span className="block text-xs font-medium text-slate-500">serviço × pavimento, por vagão</span></dd></div>
            <div className="stat-card sm:col-span-2"><dt className="eyebrow">A partir de</dt><dd className="mt-1 text-slate-700">{formatDate(summary.frontier)} {summary.frozenWagonNumber !== undefined ? `— dia seguinte ao vagão ${summary.frozenWagonNumber}, o último liberado` : '— nenhum vagão liberado; o plano começa hoje ou no início da sequência'}. Reaproveitados: {summary.keptWagons} vagões e {summary.keptActivities} atividades.</dd></div>
          </dl>}
        {!done && summary.skippedPast > 0 && <Callout tone="info">{summary.skippedPast} serviço × pavimento terminam antes de {formatDate(summary.frontier)} e ficam fora dos vagões.</Callout>}
        {!done && losses > 0 && <Callout tone="warning">Sai da cauda: {summary.removedWagons} vagões, {summary.removedActivities} atividades{summary.removedWithProgress > 0 && <strong> ({summary.removedWithProgress} com avanço ou critério atendido)</strong>}, {summary.removedRestrictions} restrições e {summary.removedPending} pendências dos vagões removidos. Atividades que vieram do Prevision nesta cauda são substituídas pelas do plano.</Callout>}
        {!done && <div className="flex justify-end gap-2">
          <button type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Cancelar</button>
          <button type="button" className="button" disabled={working || busy} onClick={generate}>{working ? 'Gerando…' : `Gerar ${summary.wagons} vagões`}</button>
        </div>}
      </div>}
    </div>
  </dialog>;
}
