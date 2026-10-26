'use client';
import { useId, useMemo, useState } from 'react';
import { CheckCheck, X } from 'lucide-react';
import type { WeeklyCommitment } from '@/domain/entities';

/** Apontamento em lote da aba Curto prazo (26/10/2026): a obra confere a semana com o Google
 * Sheets e quer marcar várias linhas e aplicar Status, Causa e Justificativa de uma vez, como já
 * faz com as pendências da terminalidade. Cada campo abre em "Manter como está"; só o que a
 * pessoa trocar muda, e a regra do domínio continua valendo linha a linha: "Não" exige causa da
 * lista e "Sim" não tem causa. As linhas que a escolha não consegue gravar (um "Não" sem causa
 * nem na escolha nem na linha, ou "manter" numa linha ainda sem Status) ficam de fora e a barra
 * avisa antes de aplicar, em vez de inventar uma causa e poluir o Pareto. */

export type BulkStatus = '' | 'Sim' | 'Não'; // '' = manter como está
export interface BulkChoice {
  status: BulkStatus;
  /** Causa da lista; vazio = manter a de cada linha. */
  cause: string;
  justification: { mode: 'keep' } | { mode: 'set'; text: string };
}
export interface BulkItem {
  commitmentId: string;
  fulfilled: boolean;
  cause?: string;
  justification?: string;
}

/** Monta o que gravar em cada linha marcada. Puro. Regras:
 *  - status 'Sim': fulfilled true, sem causa; justificativa = texto novo (mode set, trim; vazio = sem) ou a da linha.
 *  - status 'Não': fulfilled false; causa = a escolhida, senão a que a linha já tem; sem nenhuma das duas a linha é pulada (skipped).
 *  - status '' (manter): linha sem Status (fulfilled undefined) é pulada; linha com Status mantém fulfilled; causa escolhida só entra em linha com Não (em linha Sim é ignorada); justificativa conforme mode.
 *  - Linha cujo resultado é igual ao que ela já tem não entra em items (não há o que gravar) e não conta como skipped. */
export function bulkFulfillmentItems(rows: readonly WeeklyCommitment[], choice: BulkChoice): { items: BulkItem[]; skipped: number } {
  const items: BulkItem[] = [];
  let skipped = 0;
  // Texto novo já aparado; `undefined` quando a justificativa de cada linha fica como está.
  const newText = choice.justification.mode === 'set' ? choice.justification.text.trim() : undefined;
  for (const row of rows) {
    const fulfilled = choice.status === 'Sim' ? true : choice.status === 'Não' ? false : row.fulfilled;
    if (fulfilled === undefined) {
      skipped += 1;
      continue;
    }
    // Causa só existe no Não; no Sim ela cai, inclusive a que a linha porventura tenha.
    const cause = fulfilled ? undefined : choice.cause || row.cause || undefined;
    if (!fulfilled && !cause) {
      // Vale também para "manter" numa linha Não que ficou sem causa (dado antigo): o comando
      // de gravação recusaria, então é melhor avisar do que falhar no meio do lote.
      skipped += 1;
      continue;
    }
    // Em "manter", a justificativa da linha vai como está (sem aparar), senão uma linha com
    // espaço sobrando seria regravada à toa.
    const justification = newText !== undefined ? newText || undefined : row.justification || undefined;
    const same = fulfilled === row.fulfilled && (cause ?? '') === (row.cause ?? '') && (justification ?? '') === (row.justification ?? '');
    if (same) continue;
    items.push({
      commitmentId: row.id,
      fulfilled,
      ...(cause ? { cause } : {}),
      ...(justification ? { justification } : {}),
    });
  }
  return { items, skipped };
}

/** Nada escolhido = nada a aplicar. "Trocar por…" em branco conta como escolha: apaga a justificativa. */
export function bulkChoiceChanges(choice: BulkChoice): boolean {
  return choice.status !== '' || choice.cause !== '' || choice.justification.mode === 'set';
}

/** Valor atual de um campo nas linhas marcadas: igual em todas (ou "vazio"), senão "vários". */
function currentValue(rows: readonly WeeklyCommitment[], pick: (row: WeeklyCommitment) => string): string {
  const values = new Set(rows.map(pick));
  if (values.size > 1) return 'vários';
  const [only] = values;
  return only || 'vazio';
}

/** Por que linhas ficam de fora: "sem Status" vem só do modo "manter"; o resto é Não sem causa. */
function skipReason(rows: readonly WeeklyCommitment[], choice: BulkChoice, skipped: number): string {
  const noStatus = choice.status === '' ? rows.filter(row => row.fulfilled === undefined).length : 0;
  const noCause = skipped - noStatus;
  const reasons: string[] = [];
  if (noStatus > 0) reasons.push('sem Status');
  if (noCause > 0) reasons.push('Não sem causa');
  return reasons.join(' e ');
}

const INITIAL = { status: '' as BulkStatus, cause: '', justMode: 'keep' as 'keep' | 'set', justText: '' };

/** Barra das linhas marcadas: acima da planilha no computador, fixa no rodapé no celular. */
export function BulkBar({
  count,
  total,
  rows,
  causes,
  busy = false,
  onApply,
  onSelectAll,
  onClear,
}: {
  count: number; // linhas marcadas
  total: number; // linhas visíveis (para "Marcar todas")
  rows: readonly WeeklyCommitment[]; // as marcadas (para mostrar "Hoje: Sim/Não/vários" e a prévia de pulos)
  causes: readonly string[];
  busy?: boolean;
  onApply: (choice: BulkChoice) => void;
  onSelectAll: () => void;
  onClear: () => void;
}): React.JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState(INITIAL);
  const choice: BulkChoice = useMemo(
    () => ({
      status: draft.status,
      cause: draft.cause,
      justification: draft.justMode === 'set' ? { mode: 'set', text: draft.justText } : { mode: 'keep' },
    }),
    [draft],
  );
  const preview = useMemo(() => bulkFulfillmentItems(rows, choice), [rows, choice]);
  const changes = bulkChoiceChanges(choice);
  const nothingToWrite = changes && preview.items.length === 0;

  const statusNow = currentValue(rows, row => (row.fulfilled === undefined ? 'sem Status' : row.fulfilled ? 'Sim' : 'Não'));
  const causeNow = currentValue(rows, row => row.cause ?? '');
  const justificationNow = currentValue(rows, row => row.justification?.trim() ?? '');
  const linhas = count === 1 ? 'linha marcada' : 'linhas marcadas';

  function apply() {
    if (busy || !changes || nothingToWrite) return;
    onApply(choice);
    // A escolha é da rodada: aplicada, a barra volta a "Manter como está" para a próxima leva.
    setDraft(INITIAL);
  }

  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500';
  const hint = 'mt-1 block truncate text-xs text-slate-500';
  return (
    <div
      role="region"
      aria-label="Linhas marcadas"
      data-tour="curto-lote"
      // No celular a barra cobre o rodapé da tela (a planilha vira cartões compridos e a seleção
      // sumiria da vista); na tela larga ela fica no fluxo, acima da planilha, como na terminalidade.
      className="fixed inset-x-2 bottom-2 z-30 max-h-[60dvh] overflow-y-auto rounded-xl border border-primary-ring bg-white px-3 py-2 shadow-lg custom-scrollbar lg:static lg:inset-auto lg:z-auto lg:mt-3 lg:max-h-none lg:overflow-visible lg:shadow-none"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:items-start">
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 lg:w-auto lg:pt-6">
          <span className="text-sm font-semibold text-slate-800" aria-live="polite">
            {count} {linhas}
          </span>
          {count < total && (
            <button
              type="button"
              className="text-link"
              onClick={onSelectAll}
              disabled={busy}
              aria-label={`Marcar todas as ${total} linhas visíveis`}
            >
              Marcar todas ({total})
            </button>
          )}
        </div>

        <label className="min-w-0 flex-1 basis-[45%] lg:w-44 lg:flex-none lg:basis-auto">
          <span className={label}>Status</span>
          <select
            className="field min-h-10"
            value={draft.status}
            onChange={e => {
              const status = e.target.value as BulkStatus;
              // Sim não tem causa: a escolhida cai junto, para o campo desabilitado não enganar.
              setDraft(d => ({ ...d, status, cause: status === 'Sim' ? '' : d.cause }));
            }}
            disabled={busy}
            aria-label="Status das linhas marcadas"
            aria-describedby={`${id}-status`}
          >
            <option value="">Manter como está</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
          </select>
          <span id={`${id}-status`} className={hint}>
            Hoje: {statusNow}
          </span>
        </label>

        <label className="min-w-0 flex-1 basis-[45%] lg:w-64 lg:flex-none lg:basis-auto">
          <span className={label}>Causa</span>
          <select
            className="field min-h-10"
            value={draft.cause}
            onChange={e => setDraft(d => ({ ...d, cause: e.target.value }))}
            disabled={busy || draft.status === 'Sim'}
            title={draft.status === 'Sim' ? 'A causa só é pedida quando o Status é Não.' : undefined}
            aria-label="Causa das linhas marcadas"
            aria-describedby={`${id}-causa`}
          >
            <option value="">Manter</option>
            {causes.map(cause => (
              <option key={cause} value={cause}>
                {cause}
              </option>
            ))}
          </select>
          <span id={`${id}-causa`} className={hint} title={causeNow}>
            Hoje: {causeNow}
          </span>
        </label>

        <div className="w-full min-w-0 lg:w-80 lg:flex-none">
          <label className="block">
            <span className={label}>Justificativa</span>
            <select
              className="field min-h-10"
              value={draft.justMode}
              onChange={e => setDraft(d => ({ ...d, justMode: e.target.value === 'set' ? 'set' : 'keep' }))}
              disabled={busy}
              aria-label="Justificativa das linhas marcadas"
              aria-describedby={`${id}-justificativa`}
            >
              <option value="keep">Manter</option>
              <option value="set">Trocar por…</option>
            </select>
          </label>
          {draft.justMode === 'set' && (
            <input
              className="field mt-1.5 min-h-10"
              value={draft.justText}
              onChange={e => setDraft(d => ({ ...d, justText: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply();
                }
              }}
              placeholder="Nova justificativa para todas as marcadas"
              aria-label="Nova justificativa"
              autoFocus
              disabled={busy}
            />
          )}
          <span id={`${id}-justificativa`} className={hint} title={justificationNow}>
            Hoje: {justificationNow}
            {draft.justMode === 'set' && !draft.justText.trim() && ' · Em branco apaga a justificativa das marcadas.'}
          </span>
        </div>

        <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto lg:pt-5">
          <button
            type="button"
            className="button flex-1 lg:flex-none"
            onClick={apply}
            disabled={busy || !changes || nothingToWrite}
            aria-label={`Aplicar a escolha a ${count} ${linhas}`}
          >
            <CheckCheck size={15} aria-hidden />
            {busy ? 'Salvando…' : `Aplicar a ${count}`}
          </button>
          <button type="button" className="button-ghost" onClick={onClear} disabled={busy} aria-label="Desmarcar todas as linhas">
            <X size={15} aria-hidden />
            Desmarcar
          </button>
        </div>

        {preview.skipped > 0 && (
          <p className="w-full text-xs text-amber-700" role="status">
            {preview.skipped} {preview.skipped === 1 ? 'linha fica' : 'linhas ficam'} de fora: {skipReason(rows, choice, preview.skipped)}.
          </p>
        )}
        {nothingToWrite && (
          <p className="w-full text-xs text-slate-500" role="status">
            Nada a gravar: {preview.skipped > 0 ? 'as demais marcadas' : 'as marcadas'} já estão assim.
          </p>
        )}
      </div>
    </div>
  );
}
