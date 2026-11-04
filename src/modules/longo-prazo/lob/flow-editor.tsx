'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown, Copy, Plus, RefreshCw, Rocket, Trash2, X } from 'lucide-react';
import {
  flowOrder,
  LOB_COLORS,
  LOB_LIMITS,
  LOB_UNITS,
  validateFlowDocument,
  validateFlowForLaunch,
  type FlowService,
  type ServiceFlow,
  type ServiceFlowDocument,
} from '@/domain/lob';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { formatTimestamp, workPath } from '@/shared/format';
import { createFlow, deleteFlow, isLobConflict, updateFlow } from './lob-api';
import { FlowNetwork, lagLabel } from './flow-network';

/** Editor de um fluxo de serviços (tela 2 do modelo aprovado de 04/11/2026): nome, sentido, rede
 * desenhada sozinha e a tabela editável de serviços. Salva sozinho 1 s depois da última alteração,
 * com trava de revisão como o Planejador: se outra pessoa salvou antes, a tela fica somente leitura
 * até recarregar. Um documento inválido (nome vazio, ciclo, duração fora da faixa) fica na tela com
 * o motivo em vermelho e não vai ao servidor até ser corrigido. */

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
type Popover = { kind: 'color'; serviceId: string } | { kind: 'dep'; serviceId: string; predecessorId?: string };
const SAVE_DELAY = 1000;
const newId = () => crypto.randomUUID();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "Brizz", "Brizz e Atmos", "Brizz, Atmos e Tauá". */
export const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;

/** Cópia editável do fluxo: o editor nunca mexe no objeto que veio da lista. */
const toDocument = (flow: ServiceFlow): ServiceFlowDocument => ({
  name: flow.name,
  direction: flow.direction,
  services: flow.services.map(s => ({ ...s, predecessors: s.predecessors.map(p => ({ ...p })) })),
});
/** Primeira cor da série ainda não usada; com as oito ocupadas, volta ao início pela posição. */
export function nextColor(services: FlowService[]) {
  const used = new Set(services.map(s => s.color.toLowerCase()));
  return LOB_COLORS.find(c => !used.has(c)) ?? LOB_COLORS[services.length % LOB_COLORS.length];
}
/** "Novo serviço", "Novo serviço 2", "Novo serviço 3"… sem repetir nome (a validação recusa repetido). */
export function uniqueName(base: string, taken: string[]) {
  const set = new Set(taken.map(n => n.trim().toLowerCase()));
  if (!set.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!set.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
/** Verdadeiro se ligar `predecessorId` → `successorId` fecharia um ciclo: a ordem topológica falha. */
function wouldCycle(services: FlowService[], successorId: string, predecessorId: string) {
  if (successorId === predecessorId) return true;
  const trial = services.map(s =>
    s.id === successorId ? { ...s, predecessors: [...s.predecessors, { serviceId: predecessorId, lagDays: 0 }] } : s,
  );
  try {
    flowOrder(trial);
    return false;
  } catch {
    return true;
  }
}
/** Fluxo de partida do botão "Novo fluxo": dois serviços de exemplo encadeados, para a rede e a
 * tabela já mostrarem como funciona. Quem cria troca os nomes e segue. */
export function exampleFlowDocument(name: string): ServiceFlowDocument {
  const first = newId();
  const second = newId();
  return {
    name,
    direction: 'bottom_up',
    services: [
      { id: first, name: 'Estrutura', color: LOB_COLORS[0], durationDays: 10, team: undefined, unit: 'laje', predecessors: [] },
      {
        id: second,
        name: 'Alvenaria',
        color: LOB_COLORS[1],
        durationDays: 10,
        team: undefined,
        unit: 'm²',
        predecessors: [{ serviceId: first, lagDays: 10 }],
      },
    ],
  };
}

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
/** "Salvo às 15:42" para hoje; com data para dias anteriores, como o restante do sistema. */
function savedLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Salvo';
  const sameDay = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });
  return sameDay.format(date) === sameDay.format(new Date()) ? `Salvo às ${timeFormat.format(date)}` : `Salvo em ${formatTimestamp(iso)}`;
}

/** Janela pequena ancorada num botão da tabela. Fica em `position: fixed` (e não absoluta dentro da
 * célula) porque o contêiner da tabela rola na horizontal e cortaria uma janela que saísse dele;
 * qualquer rolagem fecha a janela em vez de tentar acompanhar o botão. Fecha com Esc ou clique fora. */
function Anchored({ anchor, label, onClose, children }: { anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const rect = anchor.getBoundingClientRect();
  const width = 272;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + 240 < window.innerHeight || rect.top < 240;
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);
  return (
    <div
      ref={root}
      role="dialog"
      aria-label={label}
      className="fixed z-40 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
      style={{ left, width, ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) }}
    >
      {children}
    </div>
  );
}

export function FlowEditor({
  flow,
  workId,
  readOnly,
  onSaved,
  onDeleted,
  onReload,
}: {
  flow: ServiceFlow;
  workId: string;
  readOnly: boolean;
  /** Fluxo gravado (o próprio, com revisão nova, ou a cópia do "Duplicar"). */
  onSaved: (flow: ServiceFlow) => void;
  onDeleted: (flowId: string) => void;
  /** Relê a lista de fluxos (botão "Recarregar" depois de um conflito). */
  onReload?: () => Promise<void> | void;
}) {
  const uid = useId();
  const context = usePlanning();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => toDocument(flow));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  /** Motivo pelo qual o documento atual não pode ser salvo (validação no navegador). */
  const [problem, setProblem] = useState('');
  const [savedAt, setSavedAt] = useState(flow.updatedAt);
  const [savedBy, setSavedBy] = useState(flow.updatedBy);
  const [popover, setPopover] = useState<Popover>();
  const [anchor, setAnchor] = useState<HTMLElement>();
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState<'duplicate' | 'delete'>();
  const [lagDraft, setLagDraft] = useState('0');
  const [predDraft, setPredDraft] = useState('');
  const revision = useRef(flow.revision);
  const pending = useRef<ServiceFlowDocument | undefined>(undefined);
  /** Gravação em andamento, como promessa: a gravação na saída da tela encadeia depois dela. */
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const focusName = useRef<string>(undefined);
  /** Últimos valores das props e do toast para quem roda fora do ciclo de renderização (timer,
   * gravação na saída da tela). */
  const latest = useRef({ onSaved, toast, flow });
  /** A própria `flush`, para o temporizador disparado dentro dela sem referência circular. */
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    latest.current = { onSaved, toast, flow };
  });

  const ready = context.state === 'ready' ? context : undefined;
  const teamNames = useMemo(
    () =>
      ready
        ? [...new Set(ready.planning.data.teams.filter(t => t.workId === workId).map(t => t.name.trim()))]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        : [],
    [ready, workId],
  );
  const userName = (id: string) => ready?.planning.data.users.find(u => u.id === id)?.name;

  const flush = useCallback(() => {
    if (inFlight.current || !pending.current) return;
    const document = pending.current;
    pending.current = undefined;
    setSaveState('saving');
    let retry = false;
    inFlight.current = updateFlow(flow.id, revision.current, document)
      .then(saved => {
        revision.current = saved.revision;
        setSavedAt(saved.updatedAt);
        setSavedBy(saved.updatedBy);
        setSaveError('');
        // A resposta do PUT não traz `usedIn`; a lista continua com o que tinha.
        latest.current.onSaved({ ...saved, usedIn: latest.current.flow.usedIn });
        setSaveState(pending.current ? 'pending' : 'saved');
        retry = true;
      })
      .catch(error => {
        if (isLobConflict(error)) {
          // O que estava na tela não pode mais ser gravado por cima: a pessoa recarrega e refaz.
          pending.current = undefined;
          setSaveState('conflict');
          setSaveError(error instanceof Error ? error.message : 'Outra pessoa salvou este fluxo.');
        } else {
          pending.current ??= document;
          setSaveState('error');
          setSaveError(error instanceof Error ? error.message : 'Sem conexão com o servidor. As alterações continuam nesta tela.');
        }
      })
      .finally(() => {
        inFlight.current = undefined;
        // Edição feita durante a gravação vai na próxima; falha de rede espera o botão "Tentar de novo"
        // ou a próxima alteração, para não martelar o servidor a cada segundo sem conexão.
        if (retry && pending.current) timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY);
      });
  }, [flow.id]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Fechar a aba com alteração não gravada perde trabalho: o navegador pergunta antes.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  // Trocar de fluxo (o editor é remontado pela chave) a menos de 1 s de uma alteração gravaria
  // nada: o que estava pendente sobe na saída, e a lista recebe a revisão nova pelo `onSaved`.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const leftover = pending.current;
      if (!leftover) return;
      pending.current = undefined;
      // Depois da gravação em andamento, se houver: ela atualiza a revisão que esta vai usar.
      (inFlight.current ?? Promise.resolve())
        .then(() => updateFlow(flow.id, revision.current, leftover))
        .then(saved => latest.current.onSaved({ ...saved, usedIn: latest.current.flow.usedIn }))
        .catch(error =>
          latest.current.toast({
            title: `Não foi possível salvar "${leftover.name}"`,
            description: error instanceof Error ? error.message : undefined,
            tone: 'danger',
          }),
        );
    },
    [flow.id],
  );
  // Revisão diferente da conhecida: outra pessoa salvou e a lista foi relida (ou "Recarregar" depois
  // do conflito). O editor volta ao que está no servidor; a própria gravação não passa por aqui,
  // porque `flush` registra a revisão antes de avisar a lista.
  useEffect(() => {
    if (flow.revision === revision.current) return;
    revision.current = flow.revision;
    pending.current = undefined;
    clearTimeout(timer.current);
    setDraft(toDocument(flow));
    setSaveState('idle');
    setSaveError('');
    setProblem('');
    setSavedAt(flow.updatedAt);
    setSavedBy(flow.updatedBy);
  }, [flow]);
  // Serviço recém-adicionado: o cursor vai para o nome, já selecionado, para digitar por cima.
  useEffect(() => {
    if (!focusName.current) return;
    const input = document.getElementById(`${uid}-nome-${focusName.current}`) as HTMLInputElement | null;
    focusName.current = undefined;
    input?.focus();
    input?.select();
  });

  const locked = readOnly || saveState === 'conflict';
  const closePopover = useCallback(() => setPopover(undefined), []);

  /** Toda alteração passa aqui: valida no navegador e agenda a gravação. Documento inválido fica na
   * tela (nada se perde) com o motivo em vermelho, e nada sobe até ser corrigido. */
  const update = (change: (document: ServiceFlowDocument) => ServiceFlowDocument) => {
    if (locked) return;
    const next = change(draft);
    setDraft(next);
    clearTimeout(timer.current);
    try {
      validateFlowDocument(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Fluxo inválido.');
      pending.current = undefined;
      return;
    }
    setProblem('');
    pending.current = next;
    setSaveState('pending');
    timer.current = setTimeout(flush, SAVE_DELAY);
  };
  const updateServices = (change: (services: FlowService[]) => FlowService[]) => update(d => ({ ...d, services: change(d.services) }));
  const patchService = (id: string, patch: Partial<FlowService>) =>
    updateServices(list => list.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const addService = () => {
    const id = newId();
    const last = draft.services[draft.services.length - 1];
    focusName.current = id;
    updateServices(list => [
      ...list,
      {
        id,
        name: uniqueName(
          'Novo serviço',
          list.map(s => s.name),
        ),
        color: nextColor(list),
        durationDays: 5,
        predecessors: last ? [{ serviceId: last.id, lagDays: 0 }] : [],
      },
    ]);
  };
  const duplicateService = (id: string) => {
    const index = draft.services.findIndex(s => s.id === id);
    if (index < 0) return;
    const source = draft.services[index];
    const copyId = newId();
    focusName.current = copyId;
    updateServices(list => {
      const copy: FlowService = {
        ...source,
        id: copyId,
        name: uniqueName(
          `${source.name} (cópia)`,
          list.map(s => s.name),
        ).slice(0, LOB_LIMITS.name),
        predecessors: source.predecessors.map(p => ({ ...p })),
      };
      return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
    });
  };
  const removeService = async (id: string) => {
    const service = draft.services.find(s => s.id === id);
    if (!service) return;
    const dependents = draft.services.filter(s => s.predecessors.some(p => p.serviceId === id));
    const ok = await confirm({
      title: `Excluir o serviço "${service.name}"?`,
      description: dependents.length
        ? `${listNames(dependents.map(d => d.name))} ${dependents.length === 1 ? 'depende' : 'dependem'} dele e ${dependents.length === 1 ? 'perde' : 'perdem'} essa ligação. Blocos já lançados nas obras não mudam.`
        : 'Blocos já lançados nas obras não mudam.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    setSelectedId(current => (current === id ? undefined : current));
    updateServices(list =>
      list.filter(s => s.id !== id).map(s => ({ ...s, predecessors: s.predecessors.filter(p => p.serviceId !== id) })),
    );
  };
  const moveService = (id: string, delta: -1 | 1) =>
    updateServices(list => {
      const index = list.findIndex(s => s.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const addPredecessor = (successorId: string, predecessorId: string, lagDays: number) =>
    patchService(successorId, {
      predecessors: [
        ...(draft.services.find(s => s.id === successorId)?.predecessors.filter(p => p.serviceId !== predecessorId) ?? []),
        { serviceId: predecessorId, lagDays },
      ],
    });
  const removePredecessor = (successorId: string, predecessorId: string) =>
    patchService(successorId, {
      predecessors: draft.services.find(s => s.id === successorId)?.predecessors.filter(p => p.serviceId !== predecessorId) ?? [],
    });

  const openPopover = (next: Popover, element: HTMLElement) => {
    // Clicar de novo no mesmo botão fecha a janela.
    if (
      popover &&
      popover.serviceId === next.serviceId &&
      ((popover.kind === 'color' && next.kind === 'color') ||
        (popover.kind === 'dep' && next.kind === 'dep' && popover.predecessorId === next.predecessorId))
    ) {
      setPopover(undefined);
      return;
    }
    if (next.kind === 'dep') {
      const service = draft.services.find(s => s.id === next.serviceId);
      const current = next.predecessorId ? service?.predecessors.find(p => p.serviceId === next.predecessorId) : undefined;
      setLagDraft(String(current?.lagDays ?? 0));
      setPredDraft(next.predecessorId ?? '');
    }
    setAnchor(element);
    setPopover(next);
  };

  const duplicateFlow = async () => {
    let document: ServiceFlowDocument;
    try {
      document = validateFlowDocument(draft);
    } catch (error) {
      toast({
        title: 'Corrija o fluxo antes de duplicar',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      });
      return;
    }
    // Identificadores novos: a cópia é um fluxo próprio, sem nada em comum com o original.
    const ids = new Map(document.services.map(s => [s.id, newId()]));
    const copy: ServiceFlowDocument = {
      ...document,
      name: `${document.name} (cópia)`.slice(0, LOB_LIMITS.name),
      services: document.services.map(s => ({
        ...s,
        id: ids.get(s.id)!,
        predecessors: s.predecessors.map(p => ({ ...p, serviceId: ids.get(p.serviceId)! })),
      })),
    };
    setBusy('duplicate');
    try {
      const created = await createFlow(copy);
      onSaved({ ...created, usedIn: [] });
      toast({ title: `Fluxo "${created.name}" criado`, description: 'A cópia está aberta no editor.' });
    } catch (error) {
      toast({
        title: 'Não foi possível duplicar o fluxo',
        description: error instanceof Error ? error.message : undefined,
        tone: 'danger',
      });
    } finally {
      setBusy(undefined);
    }
  };
  const removeFlow = async () => {
    const used = flow.usedIn?.length
      ? `Ele já foi lançado em ${listNames(flow.usedIn)}: os blocos dessas obras continuam como estão (regra 12).`
      : 'Ele nunca foi lançado; nada muda nas obras.';
    const ok = await confirm({
      title: `Excluir o fluxo "${draft.name || flow.name}"?`,
      description: used,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    clearTimeout(timer.current);
    pending.current = undefined;
    setBusy('delete');
    try {
      await deleteFlow(flow.id);
      toast({ title: `Fluxo "${draft.name || flow.name}" excluído` });
      onDeleted(flow.id);
    } catch (error) {
      toast({ title: 'Não foi possível excluir o fluxo', description: error instanceof Error ? error.message : undefined, tone: 'danger' });
      setBusy(undefined);
    }
  };

  // Travas do lançamento (regra 7): o botão fica desabilitado com o motivo à vista.
  const launchBlock = useMemo(() => {
    try {
      validateFlowForLaunch(draft);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : 'O fluxo não pode ser lançado.';
    }
  }, [draft]);
  const unsaved = !!problem || saveState === 'pending' || saveState === 'saving' || saveState === 'error';
  const launchReason = readOnly
    ? 'Seu acesso é de consulta.'
    : saveState === 'conflict'
      ? 'Recarregue o fluxo antes de lançar.'
      : launchBlock || (problem ? 'Corrija o fluxo antes de lançar.' : unsaved ? 'Aguardando salvar as alterações…' : '');
  const launchHref = `${workPath(workId, 'longo-prazo')}?lancar=${encodeURIComponent(flow.id)}`;

  const status = problem
    ? 'Não salvo'
    : {
        idle: savedAt ? `${savedLabel(savedAt)}${userName(savedBy) ? ` · ${userName(savedBy)}` : ''}` : 'Ainda não salvo',
        pending: 'Alterações não salvas…',
        saving: 'Salvando…',
        saved: `${savedLabel(savedAt)}${userName(savedBy) ? ` · ${userName(savedBy)}` : ''}`,
        error: 'Não salvo',
        conflict: 'Somente leitura',
      }[saveState];
  const statusTone =
    problem || saveState === 'error' || saveState === 'conflict'
      ? 'text-danger'
      : saveState === 'saved'
        ? 'text-success'
        : 'text-slate-500';

  const byId = new Map(draft.services.map(s => [s.id, s]));
  const teamsListId = `${uid}-equipes`;
  const popoverService = popover ? byId.get(popover.serviceId) : undefined;
  const candidates =
    popover?.kind === 'dep' && popoverService && !popover.predecessorId
      ? draft.services.filter(
          s =>
            s.id !== popoverService.id &&
            !popoverService.predecessors.some(p => p.serviceId === s.id) &&
            !wouldCycle(draft.services, popoverService.id, s.id),
        )
      : [];
  const lagValue = /^\s*-?\d+\s*$/.test(lagDraft) ? Number(lagDraft) : NaN;
  const lagOk = Number.isInteger(lagValue) && Math.abs(lagValue) <= LOB_LIMITS.lagDays;

  return (
    <section aria-label={`Fluxo ${flow.name}`} className="panel p-4 sm:p-5">
      {/* Cabeçalho: nome editável em linha, pills e ações. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          aria-label="Nome do fluxo"
          value={draft.name}
          disabled={locked}
          maxLength={LOB_LIMITS.name}
          onChange={e => update(d => ({ ...d, name: e.target.value }))}
          className="min-w-0 flex-1 basis-56 border-0 border-b border-dashed border-slate-300 bg-transparent px-0 py-1 text-lg font-bold text-slate-900 outline-none focus-visible:border-primary focus-visible:border-solid disabled:text-slate-700"
        />
        <span className="badge-muted">{plural(draft.services.length, 'serviço', 'serviços')}</span>
        <button
          type="button"
          disabled={locked}
          title="Sentido padrão sugerido ao lançar; clique para alternar"
          onClick={() => update(d => ({ ...d, direction: d.direction === 'bottom_up' ? 'top_down' : 'bottom_up' }))}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-900 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <ArrowLeftRight size={12} aria-hidden />
          {draft.direction === 'bottom_up' ? 'Base → topo' : 'Topo → base'}
        </button>
        <span className="flex-1" />
        <button type="button" className="button-ghost" disabled={locked || !!busy} onClick={duplicateFlow}>
          <Copy size={15} aria-hidden />
          Duplicar
        </button>
        <button type="button" className="button-ghost text-danger hover:text-danger" disabled={locked || !!busy} onClick={removeFlow}>
          <Trash2 size={15} aria-hidden />
          Excluir
        </button>
        {launchReason ? (
          <button data-tour="longo-fluxos-lancar" type="button" className="button" disabled title={launchReason}>
            <Rocket size={15} aria-hidden />
            Lançar na Linha de Balanço
          </button>
        ) : (
          <Link data-tour="longo-fluxos-lancar" href={launchHref} className="button">
            <Rocket size={15} aria-hidden />
            Lançar na Linha de Balanço
          </Link>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {readOnly && <Callout tone="info">Seu acesso é de consulta: os fluxos aparecem aqui, mas não podem ser alterados.</Callout>}
        {saveState === 'conflict' && (
          <Callout tone="danger" role="alert">
            {saveError}{' '}
            {onReload && (
              <button type="button" className="text-link inline-flex items-center gap-1" onClick={() => onReload()}>
                <RefreshCw size={13} aria-hidden />
                Recarregar
              </button>
            )}
          </Callout>
        )}
        {saveState === 'error' && !problem && (
          <Callout tone="danger" role="alert">
            {saveError} {/* Em erro de rede o documento recusado volta para a fila, então sempre há o que tentar de novo. */}
            <button
              type="button"
              className="text-link"
              onClick={() => {
                clearTimeout(timer.current);
                flush();
              }}
            >
              Tentar salvar de novo
            </button>
          </Callout>
        )}
        {problem && (
          <Callout tone="danger" role="alert">
            {problem} Nada foi salvo: corrija para a gravação continuar.
          </Callout>
        )}
        {!problem && launchBlock && !readOnly && saveState !== 'conflict' && (
          <Callout tone="warning">{launchBlock} Enquanto isso, o fluxo fica salvo mas não pode ser lançado (regra 7).</Callout>
        )}
      </div>

      <div data-tour="longo-fluxos-rede" className="mt-4">
        <FlowNetwork services={draft.services} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div data-tour="longo-fluxos-tabela" className="relative mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="data-table [&_tbody_td]:px-2 [&_tbody_td]:py-1.5 [&_tbody_td]:align-middle [&_thead_th]:px-2 [&_thead_th]:py-2.5">
          <thead>
            <tr>
              <th scope="col" className="w-8">
                <span className="sr-only">Ordem</span>
              </th>
              <th scope="col">Serviço</th>
              <th scope="col">Cor</th>
              <th scope="col">Duração por local</th>
              <th scope="col">Equipe</th>
              <th scope="col">Unidade</th>
              <th scope="col">Depois de</th>
              <th scope="col" className="w-20">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.services.map((service, index) => {
              const nameId = `${uid}-nome-${service.id}`;
              const selected = service.id === selectedId;
              return (
                <tr
                  key={service.id}
                  className={selected ? 'bg-primary-soft/60 hover:bg-primary-soft/60' : undefined}
                  // Linha e cartão da rede se destacam juntos: foco em qualquer campo da linha seleciona o serviço.
                  onFocusCapture={() => setSelectedId(service.id)}
                >
                  <td>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-800 disabled:opacity-30"
                        aria-label={`Subir ${service.name}`}
                        disabled={locked || index === 0}
                        onClick={() => moveService(service.id, -1)}
                      >
                        <ArrowUp size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-800 disabled:opacity-30"
                        aria-label={`Descer ${service.name}`}
                        disabled={locked || index === draft.services.length - 1}
                        onClick={() => moveService(service.id, 1)}
                      >
                        <ArrowDown size={13} aria-hidden />
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      id={nameId}
                      aria-label={`Nome do serviço ${index + 1}`}
                      className="field min-w-[11rem] py-1.5"
                      value={service.name}
                      disabled={locked}
                      maxLength={LOB_LIMITS.name}
                      onChange={e => patchService(service.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Cor de ${service.name}`}
                      aria-haspopup="dialog"
                      aria-expanded={popover?.kind === 'color' && popover.serviceId === service.id}
                      disabled={locked}
                      onClick={e => openPopover({ kind: 'color', serviceId: service.id }, e.currentTarget)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 shadow-sm hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <span className="h-4 w-4 rounded" style={{ background: service.color }} aria-hidden />
                      <ChevronDown size={12} className="text-slate-400" aria-hidden />
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <input
                        aria-label={`Duração por local de ${service.name}, em dias úteis`}
                        className="field w-[4.5rem] py-1.5 text-right tabular-nums"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={LOB_LIMITS.durationDays}
                        step={1}
                        disabled={locked}
                        value={Number.isFinite(service.durationDays) ? service.durationDays : ''}
                        // Campo vazio no meio da digitação fica NaN: a validação barra a gravação em vez de gravar zero.
                        onChange={e => patchService(service.id, { durationDays: e.target.value === '' ? NaN : Number(e.target.value) })}
                      />
                      <span className="text-xs text-slate-500">dias úteis</span>
                    </div>
                  </td>
                  <td>
                    <input
                      aria-label={`Equipe de ${service.name}`}
                      className="field min-w-[9rem] py-1.5"
                      list={teamNames.length ? teamsListId : undefined}
                      placeholder="Equipe"
                      disabled={locked}
                      maxLength={LOB_LIMITS.name}
                      value={service.team ?? ''}
                      onChange={e => patchService(service.id, { team: e.target.value || undefined })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Unidade de medição de ${service.name}`}
                      className="field min-w-[7rem] py-1.5"
                      disabled={locked}
                      value={service.unit && LOB_UNITS.includes(service.unit) ? service.unit : service.unit ? '__outra' : ''}
                      onChange={e =>
                        patchService(service.id, {
                          unit: e.target.value === '' || e.target.value === '__outra' ? undefined : e.target.value,
                        })
                      }
                    >
                      <option value="">—</option>
                      {LOB_UNITS.map(unit => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                      {service.unit && !LOB_UNITS.includes(service.unit) && <option value="__outra">{service.unit}</option>}
                    </select>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1">
                      {service.predecessors.map(link => {
                        const pred = byId.get(link.serviceId);
                        return (
                          <span
                            key={link.serviceId}
                            className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 pl-2 pr-1 text-xs font-semibold text-slate-700"
                          >
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: pred?.color ?? '#8ea4b7' }} aria-hidden />
                            <button
                              type="button"
                              className="hover:underline disabled:no-underline"
                              disabled={locked}
                              title="Alterar a espera"
                              aria-label={`${pred?.name ?? 'Serviço fora do fluxo'}, espera ${lagLabel(link.lagDays)}; clique para alterar`}
                              onClick={e =>
                                openPopover({ kind: 'dep', serviceId: service.id, predecessorId: link.serviceId }, e.currentTarget)
                              }
                            >
                              {pred?.name ?? 'Serviço fora do fluxo'} <b className="tabular-nums">{lagLabel(link.lagDays)}</b>
                            </button>
                            <button
                              type="button"
                              className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-danger disabled:hidden"
                              disabled={locked}
                              aria-label={`Remover predecessora ${pred?.name ?? ''}`.trim()}
                              onClick={() => removePredecessor(service.id, link.serviceId)}
                            >
                              <X size={12} aria-hidden />
                            </button>
                          </span>
                        );
                      })}
                      {!locked && (
                        <button
                          type="button"
                          aria-label={`Adicionar predecessora de ${service.name}`}
                          aria-haspopup="dialog"
                          aria-expanded={popover?.kind === 'dep' && popover.serviceId === service.id && !popover.predecessorId}
                          onClick={e => openPopover({ kind: 'dep', serviceId: service.id }, e.currentTarget)}
                          className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-slate-300 px-2 text-xs text-slate-500 hover:border-primary hover:text-primary"
                        >
                          <Plus size={12} aria-hidden />
                          {service.predecessors.length ? '' : 'serviço inicial'}
                        </button>
                      )}
                      {locked && !service.predecessors.length && <span className="text-xs text-slate-400">serviço inicial</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-brand-300 hover:text-brand-900 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Duplicar ${service.name}`}
                        disabled={locked}
                        onClick={() => duplicateService(service.id)}
                      >
                        <Copy size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-danger-ring hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Excluir ${service.name}`}
                        disabled={locked}
                        onClick={() => removeService(service.id)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!draft.services.length && (
              <tr>
                <td colSpan={8} className="text-center text-sm text-slate-500">
                  Nenhum serviço neste fluxo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {teamNames.length > 0 && (
        <datalist id={teamsListId}>
          {teamNames.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!locked && (
          <button type="button" className="button-ghost" onClick={addService} disabled={draft.services.length >= LOB_LIMITS.flowServices}>
            <Plus size={15} aria-hidden />
            Adicionar serviço
          </button>
        )}
        <p className="text-xs text-slate-500">
          Duração em dias úteis (segunda a sexta). A rede acima é desenhada a partir da coluna "Depois de"; a espera pode ser negativa
          (antecipação).
        </p>
        <p role="status" className={`ml-auto text-xs font-semibold ${statusTone}`}>
          {readOnly ? 'Somente leitura' : status}
        </p>
      </div>

      {/* Janelas da tabela: cor e predecessora. Só uma aberta por vez. */}
      {popover?.kind === 'color' && anchor && popoverService && (
        <Anchored anchor={anchor} label={`Cor de ${popoverService.name}`} onClose={closePopover}>
          <p className="mb-2 text-xs font-semibold text-slate-500">Cor do serviço</p>
          <div className="flex flex-wrap gap-2">
            {LOB_COLORS.map(color => {
              const active = popoverService.color.toLowerCase() === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Cor ${color}`}
                  aria-pressed={active}
                  onClick={() => {
                    patchService(popoverService.id, { color });
                    closePopover();
                  }}
                  className={`h-7 w-7 rounded-md border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? 'scale-110 border-slate-800' : 'border-transparent'}`}
                  style={{ background: color }}
                />
              );
            })}
          </div>
        </Anchored>
      )}
      {popover?.kind === 'dep' && anchor && popoverService && (
        <Anchored
          anchor={anchor}
          label={popover.predecessorId ? `Espera de ${popoverService.name}` : `Predecessora de ${popoverService.name}`}
          onClose={closePopover}
        >
          <form
            className="space-y-2"
            onSubmit={e => {
              e.preventDefault();
              const predecessorId = popover.predecessorId ?? predDraft;
              if (!predecessorId || !lagOk) return;
              addPredecessor(popoverService.id, predecessorId, lagValue);
              closePopover();
            }}
          >
            <div>
              <label htmlFor={`${uid}-pred`} className="mb-1 block text-xs font-semibold text-slate-500">
                {popoverService.name} começa depois de
              </label>
              {popover.predecessorId ? (
                <p className="text-sm font-semibold text-slate-800">{byId.get(popover.predecessorId)?.name ?? 'Serviço fora do fluxo'}</p>
              ) : candidates.length ? (
                <select id={`${uid}-pred`} className="field py-1.5" value={predDraft} onChange={e => setPredDraft(e.target.value)} required>
                  <option value="">Escolha o serviço…</option>
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-slate-500">
                  Nenhum serviço disponível: os demais já são predecessores ou dependem deste (fechariam um ciclo).
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${uid}-lag`} className="mb-1 block text-xs font-semibold text-slate-500">
                Espera em dias úteis (negativa = antecipação)
              </label>
              <input
                id={`${uid}-lag`}
                className="field py-1.5 tabular-nums"
                type="number"
                inputMode="numeric"
                step={1}
                min={-LOB_LIMITS.lagDays}
                max={LOB_LIMITS.lagDays}
                value={lagDraft}
                onChange={e => setLagDraft(e.target.value)}
                aria-invalid={!lagOk}
              />
              {!lagOk && (
                <p className="mt-1 text-xs text-danger">
                  Use um número inteiro de −{LOB_LIMITS.lagDays} a {LOB_LIMITS.lagDays}.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="button-ghost py-1.5" onClick={closePopover}>
                Cancelar
              </button>
              <button
                type="submit"
                className="button py-1.5"
                disabled={!lagOk || (!popover.predecessorId && (!predDraft || !candidates.length))}
              >
                {popover.predecessorId ? 'Aplicar' : 'Adicionar'}
              </button>
            </div>
          </form>
        </Anchored>
      )}
    </section>
  );
}
