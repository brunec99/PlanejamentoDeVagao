'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Plus, RefreshCw } from 'lucide-react';
import {
  editableMeasurement,
  measuredPercents,
  openMeasurement,
  physicalProgress,
  plannedProgress,
  type LobData,
  type LobMeasurement,
  type LocalDate,
} from '@/domain/lob';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, LoadState } from '@/modules/planejamento/ui';
import { CHART } from '@/shared/palette';
import { formatDate, workPath } from '@/shared/format';
import { useLob } from './lob-api';
import { buildSheet, formatPercent, MeasurementSheet, Pill } from './measurement-sheet';
import type { LobExecute } from './measurement-photos';

/** Visão "Medições" da aba 1 (modelo de 04/11/2026, tela 4): à esquerda as rodadas da obra e o
 * avanço físico; à direita a medição selecionada (`MeasurementSheet`). Os dados vêm de `useLob`,
 * fora do snapshot do planejamento; o perfil e o "hoje" vêm do planejamento (`usePlanning`). */

/** Data civil de hoje no fuso do navegador, para quando o planejamento ainda não respondeu. */
const localToday = (): LocalDate => new Date().toLocaleDateString('en-CA');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);

/** Rodadas na ordem da lista: a aberta primeiro, depois as fechadas da mais nova à mais antiga. */
export function orderedRounds(measurements: LobMeasurement[]) {
  const open = measurements.filter(m => m.status === 'open');
  const closed = measurements.filter(m => m.status === 'closed').sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  return [...open, ...closed];
}

/** Linhas do CSV da medição: os blocos atuais na data mais os lançados em outras abas. O destino é a
 * planilha da obra: `;` como separador, vírgula decimal e BOM para o Excel em pt-BR ler os acentos. */
export function measurementCsv(data: LobData, measurement: LobMeasurement): (string | number)[][] {
  const sheet = buildSheet(data, measurement);
  const rows = [...sheet.current, ...sheet.future.filter(r => r.item), ...sheet.done.filter(r => r.item)];
  const header = [
    'Local',
    'Serviço',
    `Previsto até ${formatDate(measurement.date)} (%)`,
    'Anterior (%)',
    'Realizado acumulado (%)',
    'Desvio (pp)',
    'Motivo do atraso',
    'Observação',
    'Fotos',
  ];
  return [
    header,
    ...rows.map(r => [
      r.local.name,
      r.service.name,
      r.planned,
      r.previous,
      r.item ? r.item.value : '',
      r.item ? r.item.value - r.planned : '',
      r.item?.delayCause ?? '',
      r.item?.note ?? '',
      r.photos.length,
    ]),
  ];
}
function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const text = rows
    .map(row =>
      row
        .map(cell =>
          typeof cell === 'number'
            ? cell.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 1 })
            : `"${cell.replace(/"/g, '""')}"`,
        )
        .join(';'),
    )
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Nova medição ───────────────────────────────────────────────────────────────

/** Pequeno `<dialog>` pedindo a data (padrão hoje, máximo hoje). O id da medição nasce aqui para a
 * tela já selecionar a rodada quando a resposta chegar. */
function NewMeasurementDialog({
  workId,
  today,
  lastClosed,
  onExecute,
  onCreated,
  onClose,
}: {
  workId: string;
  today: LocalDate;
  lastClosed?: LobMeasurement;
  onExecute: LobExecute;
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  const submit = async () => {
    if (!date) return setError('Informe a data da medição.');
    setBusy(true);
    setError(undefined);
    const measurementId = crypto.randomUUID();
    try {
      await onExecute({ type: 'open_measurement', workId, measurementId, date });
      onCreated(measurementId);
      dialog.current?.close();
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível abrir a medição.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="lob-new-measurement"
      className="m-auto w-[min(26rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <form
        className="p-5"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="eyebrow">Medições</p>
        <h2 id="lob-new-measurement" className="mt-1 text-base font-bold text-slate-900">
          Nova medição
        </h2>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Data da medição
          <input
            type="date"
            className="field mt-1 tabular-nums"
            value={date}
            max={today}
            min={lastClosed?.date}
            required
            autoFocus
            onChange={event => setDate(event.target.value)}
          />
        </label>
        <p className="mt-1.5 text-xs text-slate-500">
          Retroativa permitida, futura não
          {lastClosed ? `; nem anterior à medição #${lastClosed.number} (${formatDate(lastClosed.date)})` : ''}. A data trava ao salvar a
          medição.
        </p>
        {error && (
          <div className="mt-3">
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="button-ghost" onClick={() => dialog.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Abrindo…' : 'Abrir medição'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ─── Visão ──────────────────────────────────────────────────────────────────────

export function MeasurementsView({ workId }: { workId: string }) {
  const { state, reload, execute } = useLob(workId);
  const planning = usePlanning();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const ready = planning.state === 'ready' ? planning : undefined;
  const today = ready?.planning.today ?? localToday();
  const users = ready?.planning.data.users;
  const me = users?.find(u => u.id === ready?.actorId);
  // Regra 26: consulta vê e não mede. Sem perfil carregado, a tela fica só leitura até ele chegar.
  const readOnly = !me || me.role === 'viewer';
  const authorName = useCallback((id: string) => users?.find(u => u.id === id)?.name ?? 'autor desconhecido', [users]);

  const help = (
    <HelpNote title="Como medir">
      <p>
        Cada <strong>medição</strong> é uma rodada com data: retroativa permitida, futura não, e a data trava ao salvar. A lista traz os
        blocos <strong>atuais</strong> (começaram até a data e abaixo de 100%), os <strong>futuros</strong> (até 12 meses) e os{' '}
        <strong>concluídos</strong>, agrupados por local, com busca.
      </p>
      <p>
        Lance o <strong>realizado acumulado</strong> em %, com os atalhos "= previsto" e "100%". Acumulado menor que a medição anterior é
        recusado. Cada valor é gravado ao sair do campo: o rascunho fica guardado até salvar a medição.
      </p>
      <p>
        <strong>Avançou o %? Tire ao menos uma foto</strong> (até 6 por bloco por medição). Sem foto do avanço, a medição não salva. Início
        real recebe a data da medição no primeiro avanço e término real ao chegar a 100%; os dois podem ser corrigidos à mão.
      </p>
      <p>
        Bloco atrasado pede o <strong>motivo</strong>, da mesma lista de causas do curto prazo, e aceita observação. "Salvar medição" fecha
        a rodada. <strong>Só a última medição pode ser corrigida ou excluída</strong>; as anteriores ficam só para consulta. Consulta vê
        medições e fotos e não mede; planejador, gestor e admin medem, no computador ou no celular com a câmera.
      </p>
    </HelpNote>
  );

  const data = state.status === 'ready' ? state.data : undefined;
  const rounds = data ? orderedRounds(data.measurements) : [];
  const editable = data ? editableMeasurement(data.measurements) : undefined;
  const open = data ? openMeasurement(data.measurements) : undefined;
  const selected = rounds.find(m => m.id === selectedId) ?? open ?? rounds[0];
  const lastClosed = data
    ? [...data.measurements]
        .filter(m => m.status === 'closed')
        .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
        .pop()
    : undefined;
  const hasBlocks = !!data?.activities.length;
  const newBlocked = readOnly
    ? 'Perfil de consulta: não mede.'
    : !hasBlocks
      ? 'Lance um fluxo antes de medir.'
      : open
        ? `A medição #${open.number} está em aberto. Salve ou exclua antes de abrir outra.`
        : undefined;

  const exportCsv = () => {
    if (!data || !selected) return;
    downloadCsv(`medicao-${String(selected.number).padStart(2, '0')}-${selected.date}.csv`, measurementCsv(data, selected));
    toast({ title: `CSV da medição #${selected.number} gerado`, tone: 'info' });
  };

  const header = (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <h2 className="text-lg font-bold text-slate-900">Medições</h2>
          {help}
        </div>
        <p className="text-sm text-slate-500">
          Cada medição é uma rodada com data: lança o acumulado realizado de cada serviço em cada local, com foto do que avançou.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="button-ghost" disabled={!data || !selected} onClick={exportCsv} title="CSV da medição selecionada">
          <Download size={15} aria-hidden />
          Exportar CSV
        </button>
        <button
          data-tour="longo-medicoes-nova"
          type="button"
          className="button"
          disabled={!data || !!newBlocked}
          title={newBlocked}
          onClick={() => setCreating(true)}
        >
          <Plus size={15} aria-hidden />
          Nova medição
        </button>
      </div>
    </div>
  );

  if (state.status === 'loading')
    return (
      <>
        {header}
        <LoadState rows={8} />
      </>
    );
  if (state.status === 'error')
    return (
      <>
        {header}
        <div className="panel p-6">
          <p role="alert" className="text-sm font-semibold text-slate-800">
            Não foi possível carregar as medições.
          </p>
          <p className="mt-1 text-sm text-slate-500">{state.message}</p>
          <button
            type="button"
            className="button-ghost mt-4"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              reload().finally(() => setRetrying(false));
            }}
          >
            <RefreshCw size={15} aria-hidden />
            {retrying ? 'Tentando…' : 'Tentar de novo'}
          </button>
        </div>
      </>
    );
  if (state.status === 'unavailable' || !data)
    return (
      <>
        {header}
        <Callout tone="warning" role="status">
          A Linha de Balanço ainda não foi ativada no banco: aplique a migração 0038.
        </Callout>
      </>
    );

  // Avanço físico da obra (regra 18): média ponderada pela duração, só com medições fechadas.
  const percents = measuredPercents(data.measurements, data.items);
  const physical = physicalProgress(data.activities, percents);
  const planned = plannedProgress(data.activities, today);
  const deviation = physical !== undefined && planned !== undefined ? physical - planned : undefined;

  return (
    <>
      {header}
      {!hasBlocks && (
        <div className="mb-4">
          <Callout tone="info" role="status">
            Não há blocos para medir.{' '}
            <Link className="text-link" href={workPath(workId, 'longo-prazo')}>
              Lance um fluxo na Linha de Balanço
            </Link>{' '}
            para a primeira medição.
          </Callout>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <nav data-tour="longo-medicoes-rodadas" aria-label="Medições da obra" className="panel p-2">
            <p className="px-3 pt-1 pb-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Rodadas</p>
            {rounds.length === 0 && <p className="px-3 pb-2 text-sm text-slate-500">Nenhuma medição ainda.</p>}
            <ul className="space-y-0.5">
              {rounds.map(m => {
                const items = data.items.filter(i => i.measurementId === m.id);
                const itemIds = new Set(items.map(i => i.id));
                const photos = data.photos.filter(p => itemIds.has(p.itemId)).length;
                const on = m.id === selected?.id;
                const canEdit = editable?.id === m.id && !readOnly;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setSelectedId(m.id)}
                      className={`block w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                        on ? 'border-primary-ring bg-primary-soft' : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                        Medição #{m.number}
                        {m.status === 'open' ? (
                          <Pill tone="warn">em aberto</Pill>
                        ) : (
                          <span className="text-xs text-slate-600 tabular-nums">{formatDate(m.date)}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {m.status === 'open' && `${formatDate(m.date)} · `}
                        {plural(items.length, 'bloco', 'blocos')} · {plural(photos, 'foto', 'fotos')} · {authorName(m.createdBy)}
                        {m.status === 'closed' && ` · ${canEdit ? 'pode editar' : 'só leitura'}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="panel bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-700">Avanço físico da obra</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900 tabular-nums">
              {physical === undefined ? '—' : formatPercent(Math.round(physical * 10) / 10)}
            </p>
            <div
              className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Avanço físico medido"
              aria-valuenow={physical === undefined ? 0 : Math.round(physical)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${planned ?? 0}%` }} aria-hidden />
              <i
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${physical ?? 0}%`, background: CHART.executed }}
                aria-hidden
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 tabular-nums">
              {planned === undefined ? (
                'Sem blocos para prever.'
              ) : (
                <>
                  Previsto até hoje <b className="text-slate-700">{formatPercent(Math.round(planned * 10) / 10)}</b>
                  {deviation !== undefined && (
                    <>
                      {' · desvio '}
                      <b className={deviation < -0.05 ? 'text-danger' : deviation > 0.05 ? 'text-success' : 'text-slate-700'}>
                        {deviation > 0 ? '+' : deviation < 0 ? '−' : ''}
                        {Math.abs(deviation).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pp
                      </b>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </aside>

        {selected ? (
          <MeasurementSheet
            key={selected.id}
            workId={workId}
            data={data}
            measurement={selected}
            today={today}
            readOnly={readOnly}
            editable={editable?.id === selected.id && !readOnly}
            onExecute={execute}
            authorName={authorName}
          />
        ) : (
          <div className="panel flex flex-col items-start gap-3 p-6">
            <p className="text-sm font-semibold text-slate-800">Nenhuma medição ainda.</p>
            <p className="text-sm text-slate-500">
              A primeira medição lista os blocos que já começaram até a data escolhida. Lance o acumulado realizado de cada um, com foto do
              que avançou, e salve a rodada.
            </p>
            <button type="button" className="button" disabled={!!newBlocked} title={newBlocked} onClick={() => setCreating(true)}>
              <Plus size={15} aria-hidden />
              Nova medição
            </button>
          </div>
        )}
      </div>

      {creating && (
        <NewMeasurementDialog
          workId={workId}
          today={today}
          lastClosed={lastClosed}
          onExecute={execute}
          onCreated={id => {
            setSelectedId(id);
            toast({ title: 'Medição aberta', description: 'Lance o realizado de cada bloco e salve a medição ao terminar.', tone: 'info' });
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
