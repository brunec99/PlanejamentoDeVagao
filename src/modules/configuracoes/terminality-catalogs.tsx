'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  ClipboardCheck,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  TERMINALITY_LIMITS,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityFloor,
  type TerminalityUnit,
} from '@/domain/terminality';
import { useTerminality } from '@/modules/terminalidade/api';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import {
  floorNames,
  missingNames,
  nameKey,
  parseFloorNumber,
  parseNameList,
  planUnitsForFloors,
  previewNames,
  unitNames,
} from './terminality-generator';

/** Os tipos da planilha "Lista de pendências" usada na obra até 08/10/2026: o ponto de partida. */
const SPREADSHEET_TYPES = ['A/C', 'RI', 'PINTURA'];
const MAX_NAME = TERMINALITY_LIMITS.maxName;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : 'Tente de novo em instantes.');
const tooLong = (names: string[]) => names.find(name => name.length > MAX_NAME);

type Messages = { success?: string; failure: string };
type Step = { command: TerminalityCommand; label: string };
type Progress = { done: number; total: number; current: string };
/** Executa um comando; sucesso e erro vão ao toast. Devolve se deu certo, para o formulário limpar. */
type Run = (command: TerminalityCommand, messages: Messages) => Promise<boolean>;
/** Vários comandos em sequência, parando no primeiro erro. Devolve quantos passaram. */
type RunMany = (steps: Step[], messages: Required<Messages>, onProgress?: (progress: Progress | null) => void) => Promise<number>;

/** Cadastros da aba 5 (Terminalidade) nas configurações da obra: pavimentos e unidades, tipos de
 * pendência e responsáveis ATR. Os dados vêm da API própria da aba (migração 0028), não do snapshot
 * do planejamento; do planejamento vem só o perfil, para quem é de consulta não editar. */
export function TerminalityCatalogs({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, reload, execute } = useTerminality(workId);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (!actor?.workIds.includes(workId)) return null;
  const readOnly = actor.role === 'viewer';

  const run: Run = async (command, { success, failure }) => {
    if (busy) return false;
    setBusy(true);
    try {
      await execute(command);
      if (success) toast({ title: success, tone: 'success' });
      return true;
    } catch (cause) {
      toast({ title: failure, description: messageOf(cause), tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const runMany: RunMany = async (steps, { success, failure }, onProgress) => {
    if (busy) return 0;
    setBusy(true);
    let done = 0;
    try {
      for (const step of steps) {
        onProgress?.({ done, total: steps.length, current: step.label });
        try {
          await execute(step.command);
          done += 1;
        } catch (cause) {
          const saved = done ? ` Os ${done} anteriores já foram salvos.` : '';
          toast({ title: failure, description: `Parou em ${step.label}: ${messageOf(cause)}${saved}`, tone: 'danger' });
          return done;
        }
      }
      toast({ title: success, tone: 'success' });
      return done;
    } finally {
      onProgress?.(null);
      setBusy(false);
    }
  };
  const retry = async () => {
    setRetrying(true);
    await reload();
    setRetrying(false);
  };

  let body: ReactNode;
  if (state.status === 'loading')
    body = (
      <div className="panel p-5" role="status" aria-label="Carregando cadastros da terminalidade">
        <div className="space-y-3" aria-hidden>
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </div>
    );
  else if (state.status === 'error')
    body = (
      <div className="panel p-5">
        <p role="alert" className="text-sm font-semibold text-slate-800">
          Não foi possível carregar os cadastros da terminalidade.
        </p>
        <p className="mt-1 text-sm text-slate-500">{state.message}</p>
        <button type="button" className="button-ghost mt-4" onClick={retry} disabled={retrying}>
          <RefreshCw size={15} aria-hidden />
          {retrying ? 'Tentando…' : 'Tentar de novo'}
        </button>
      </div>
    );
  else if (state.status === 'unavailable')
    body = (
      <Callout tone="warning">
        Para cadastrar pavimentos, tipos e responsáveis, aplique a migração <code>0028_terminality.sql</code> no Supabase.
      </Callout>
    );
  else
    body = (
      <div className="space-y-3">
        <FloorsSection workId={workId} data={state.data} readOnly={readOnly} busy={busy} run={run} runMany={runMany} />
        <TypesSection workId={workId} data={state.data} readOnly={readOnly} busy={busy} run={run} runMany={runMany} />
        <PeopleSection workId={workId} data={state.data} readOnly={readOnly} busy={busy} run={run} />
        {readOnly && <p className="text-xs text-slate-400">Seu perfil permite consulta aos cadastros.</p>}
      </div>
    );

  return (
    <section className="space-y-4" aria-labelledby="terminalidade-title">
      <div className="min-w-0">
        <h2 id="terminalidade-title" className="text-base font-bold text-slate-900">
          Terminalidade
        </h2>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-slate-500">Pavimentos, unidades, tipos de pendência e responsáveis usados na lista de pendências.</p>
          <HelpNote title="Como funciona: cadastros da terminalidade" compact>
            <p>
              A lista de pendências registra cada problema por <strong>pavimento</strong> e <strong>unidade</strong>. Gere os pavimentos em
              sequência ("do 1° ao 20° pavto", com Térreo e Cobertura se houver) e aplique o mesmo padrão de unidades a todos de uma vez: de
              01 a 04 vira 401 a 404 no 4° pavimento. O que fugir do padrão entra pela lista livre.
            </p>
            <p>
              Pavimentos e unidades só podem ser excluídos enquanto não têm pendências (e o pavimento, enquanto não tem unidades). Tipos e
              responsáveis não são excluídos: desativados, saem das opções de novas pendências e continuam no histórico.
            </p>
            <p>Os responsáveis ATR são só nomes; não precisam ter acesso ao sistema.</p>
          </HelpNote>
        </div>
      </div>
      {body}
    </section>
  );
}

/** Painel recolhível. Começa aberto quando ainda não há nada cadastrado e quem vê pode cadastrar. */
function Disclosure({
  id,
  icon,
  title,
  summary,
  defaultOpen,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  summary: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel overflow-hidden">
      <h3>
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-brand-50/60"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          <span className="shrink-0 text-primary">{icon}</span>
          <span className="text-sm font-bold text-slate-800">{title}</span>
          <span className="ml-auto text-xs text-slate-500">{summary}</span>
        </button>
      </h3>
      {open && (
        <div id={id} className="border-t border-slate-100 p-4">
          {children}
        </div>
      )}
    </div>
  );
}

type SectionProps = { workId: string; data: TerminalityData; readOnly: boolean; busy: boolean; run: Run; runMany: RunMany };

// ---------------------------------------------------------------- Pavimentos e unidades

function FloorsSection({ workId, data, readOnly, busy, run, runMany }: SectionProps) {
  const confirm = useConfirm();
  const floors = data.floors.filter(f => f.workId === workId).sort((a, b) => a.orderIndex - b.orderIndex || byName(a.name, b.name));
  const unitsByFloor = new Map<string, TerminalityUnit[]>(floors.map(f => [f.id, []]));
  for (const unit of data.units) unitsByFloor.get(unit.floorId)?.push(unit);
  for (const list of unitsByFloor.values()) list.sort((a, b) => a.orderIndex - b.orderIndex || byName(a.name, b.name));
  const itemsByFloor = new Map<string, number>();
  const itemsByUnit = new Map<string, number>();
  for (const item of data.items) {
    itemsByFloor.set(item.floorId, (itemsByFloor.get(item.floorId) ?? 0) + 1);
    if (item.unitId) itemsByUnit.set(item.unitId, (itemsByUnit.get(item.unitId) ?? 0) + 1);
  }
  const unitCount = floors.reduce((sum, f) => sum + unitsByFloor.get(f.id)!.length, 0);
  const [tool, setTool] = useState<'pavimentos' | 'padrao' | null>(floors.length || readOnly ? null : 'pavimentos');
  const [expanded, setExpanded] = useState<string>();
  const [progress, setProgress] = useState<Progress | null>(null);

  const move = (index: number, delta: -1 | 1) => {
    const ids = floors.map(f => f.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void run({ type: 'reorder_floors', workId, floorIds: ids }, { failure: 'Não foi possível reordenar os pavimentos.' });
  };
  const removeFloor = async (floor: TerminalityFloor) => {
    const ok = await confirm({
      title: `Excluir ${floor.name}?`,
      description: 'O pavimento sai do cadastro desta obra. Só é possível excluir pavimentos sem unidades e sem pendências.',
      confirmLabel: 'Excluir pavimento',
      tone: 'danger',
    });
    if (ok)
      await run(
        { type: 'delete_floor', floorId: floor.id },
        { success: 'Pavimento excluído.', failure: 'Não foi possível excluir o pavimento.' },
      );
  };
  const removeUnit = async (unit: TerminalityUnit, floor: TerminalityFloor) => {
    const ok = await confirm({
      title: `Excluir a unidade ${unit.name} (${floor.name})?`,
      description: 'Só é possível excluir unidades sem pendências.',
      confirmLabel: 'Excluir unidade',
      tone: 'danger',
    });
    if (ok)
      await run({ type: 'delete_unit', unitId: unit.id }, { success: 'Unidade excluída.', failure: 'Não foi possível excluir a unidade.' });
  };

  return (
    <Disclosure
      id="terminalidade-pavimentos"
      icon={<Layers size={16} aria-hidden />}
      title="Pavimentos e unidades"
      summary={`${plural(floors.length, 'pavimento', 'pavimentos')} · ${plural(unitCount, 'unidade', 'unidades')}`}
      defaultOpen={!floors.length && !readOnly}
    >
      <div className="space-y-4">
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={tool === 'pavimentos' ? 'button-secondary' : 'button-ghost'}
              aria-expanded={tool === 'pavimentos'}
              onClick={() => setTool(tool === 'pavimentos' ? null : 'pavimentos')}
            >
              <Plus size={15} aria-hidden />
              Adicionar pavimentos
            </button>
            {floors.length > 0 && (
              <button
                type="button"
                className={tool === 'padrao' ? 'button-secondary' : 'button-ghost'}
                aria-expanded={tool === 'padrao'}
                onClick={() => setTool(tool === 'padrao' ? null : 'padrao')}
              >
                <Plus size={15} aria-hidden />
                Unidades em todos os pavimentos
              </button>
            )}
          </div>
        )}
        {!readOnly && tool === 'pavimentos' && (
          <AddFloorsForm
            existing={floors.map(f => f.name)}
            busy={busy}
            onSubmit={names =>
              run(
                { type: 'create_floors', workId, names },
                {
                  success: `${plural(names.length, 'pavimento adicionado', 'pavimentos adicionados')}.`,
                  failure: 'Não foi possível adicionar os pavimentos.',
                },
              )
            }
          />
        )}
        {!readOnly && tool === 'padrao' && floors.length > 0 && (
          <UnitPatternForAllForm
            floors={floors}
            unitsByFloor={unitsByFloor}
            busy={busy}
            progress={progress}
            onSubmit={steps =>
              runMany(
                steps,
                { success: 'Unidades criadas em todos os pavimentos.', failure: 'Não foi possível criar todas as unidades.' },
                setProgress,
              )
            }
          />
        )}

        {floors.length === 0 ? (
          <Empty>
            Nenhum pavimento cadastrado.
            {readOnly ? '' : ' Gere a sequência de pavimentos acima ou cole a lista da planilha.'}
          </Empty>
        ) : (
          <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Pavimentos, de baixo para cima">
            {floors.map((floor, index) => (
              <FloorRow
                key={floor.id}
                floor={floor}
                units={unitsByFloor.get(floor.id)!}
                itemCount={itemsByFloor.get(floor.id) ?? 0}
                itemsByUnit={itemsByUnit}
                first={index === 0}
                last={index === floors.length - 1}
                readOnly={readOnly}
                busy={busy}
                expanded={expanded === floor.id}
                onToggle={() => setExpanded(expanded === floor.id ? undefined : floor.id)}
                onMove={delta => move(index, delta)}
                onRemove={() => removeFloor(floor)}
                onRemoveUnit={unit => removeUnit(unit, floor)}
                run={run}
              />
            ))}
          </ol>
        )}
      </div>
    </Disclosure>
  );
}

function AddFloorsForm({
  existing,
  busy,
  onSubmit,
}: {
  existing: string[];
  busy: boolean;
  onSubmit: (names: string[]) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'sequencia' | 'lista'>('sequencia');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('');
  const [suffix, setSuffix] = useState('° pavto');
  const [extras, setExtras] = useState({ garagem: false, terreo: false, cobertura: false });
  const [list, setList] = useState('');

  let candidates: string[] = [];
  let problem = '';
  try {
    if (mode === 'lista') candidates = parseNameList(list, { lines: true });
    else if (from !== '' && to !== '')
      candidates = floorNames({
        from: Number(from),
        to: Number(to),
        suffix,
        extras: {
          before: [...(extras.garagem ? ['Garagem'] : []), ...(extras.terreo ? ['Térreo'] : [])],
          after: extras.cobertura ? ['Cobertura'] : [],
        },
      });
  } catch (cause) {
    problem = messageOf(cause);
  }
  const long = tooLong(candidates);
  if (long) problem = `"${long}" passa de ${MAX_NAME} caracteres.`;
  const fresh = problem ? [] : missingNames(existing, candidates);
  const repeated = candidates.length - fresh.length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!fresh.length) return;
    if (await onSubmit(fresh)) {
      setTo('');
      setList('');
    }
  };

  return (
    <form className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={submit}>
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="sr-only">Adicionar pavimentos</legend>
        <ModeSwitch mode={mode} onChange={setMode} sequenceLabel="Em sequência" listLabel="Lista livre (um por linha)" />
        {mode === 'sequencia' ? (
          <div className="flex flex-wrap items-end gap-3">
            <NumberField label="Do" value={from} onChange={setFrom} />
            <NumberField label="ao" value={to} onChange={setTo} placeholder="20" />
            <label className="text-xs font-semibold text-slate-600">
              Sufixo
              <input className="field mt-1 block w-32" value={suffix} maxLength={30} onChange={e => setSuffix(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-sm text-slate-700">
              {(
                [
                  ['garagem', 'Garagem'],
                  ['terreo', 'Térreo'],
                  ['cobertura', 'Cobertura'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={extras[key]}
                    onChange={e => setExtras({ ...extras, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <label className="block text-xs font-semibold text-slate-600">
            Pavimentos, de baixo para cima
            <textarea
              className="field mt-1 block min-h-28 font-normal"
              value={list}
              placeholder={'Térreo\n1° pavto\n2° pavto\nCobertura'}
              onChange={e => setList(e.target.value)}
            />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="button" disabled={!fresh.length}>
            {busy ? 'Salvando…' : fresh.length ? `Adicionar ${plural(fresh.length, 'pavimento', 'pavimentos')}` : 'Adicionar pavimentos'}
          </button>
          <Preview problem={problem} names={fresh} repeated={repeated} repeatedLabel={['já cadastrado', 'já cadastrados']} />
        </div>
        <p className="text-xs text-slate-500">Novos pavimentos entram no fim da lista; use as setas para reordenar.</p>
      </fieldset>
    </form>
  );
}

function UnitPatternForAllForm({
  floors,
  unitsByFloor,
  busy,
  progress,
  onSubmit,
}: {
  floors: TerminalityFloor[];
  unitsByFloor: Map<string, TerminalityUnit[]>;
  busy: boolean;
  progress: Progress | null;
  onSubmit: (steps: Step[]) => Promise<number>;
}) {
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('4');
  const [pad, setPad] = useState('2');

  let problem = '';
  let plan: ReturnType<typeof planUnitsForFloors> = [];
  try {
    if (from !== '' && to !== '')
      plan = planUnitsForFloors(floors, new Map([...unitsByFloor].map(([id, units]) => [id, units.map(u => u.name)])), {
        from: Number(from),
        to: Number(to),
        pad: Number(pad),
      });
  } catch (cause) {
    problem = messageOf(cause);
  }
  const targets = plan.filter(p => !p.skipped);
  const withoutNumber = plan.filter(p => p.skipped === 'sem-numero').map(p => p.floorName);
  const complete = plan.filter(p => p.skipped === 'completo').length;
  const total = targets.reduce((sum, p) => sum + p.names.length, 0);
  const example = targets[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!targets.length) return;
    void onSubmit(targets.map(p => ({ command: { type: 'create_units', floorId: p.floorId, names: p.names }, label: p.floorName })));
  };

  return (
    <form className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4" onSubmit={submit}>
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold text-slate-800">Mesmo padrão de unidades em todos os pavimentos</legend>
        <p className="text-xs text-slate-500">
          O número do pavimento vem do nome dele: de 01 a 04 no 4° pavto gera 401 a 404. Unidades que já existem são mantidas.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField label="Unidade de" value={from} onChange={setFrom} />
          <NumberField label="até" value={to} onChange={setTo} />
          <NumberField label="Dígitos" value={pad} onChange={setPad} min={1} max={4} />
          <button type="submit" className="button" disabled={!targets.length}>
            {progress
              ? 'Criando…'
              : targets.length
                ? `Criar ${plural(total, 'unidade', 'unidades')} em ${plural(targets.length, 'pavimento', 'pavimentos')}`
                : 'Criar unidades'}
          </button>
        </div>
        {progress ? (
          <div role="status" className="space-y-1.5">
            <p className="text-xs text-slate-600">
              Criando unidades: {progress.done} de {progress.total} pavimentos — agora em <strong>{progress.current}</strong>.
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-xs text-slate-500" role="status">
            {problem && <p className="text-danger">{problem}</p>}
            {example && (
              <p>
                Ex.: {example.floorName} → <span className="tabular-nums text-slate-700">{previewNames(example.names)}</span>
              </p>
            )}
            {withoutNumber.length > 0 && (
              <p>Ficam de fora, sem número no nome: {withoutNumber.join(', ')}. Use a lista livre de cada um.</p>
            )}
            {complete > 0 && <p>{plural(complete, 'pavimento já tem', 'pavimentos já têm')} todas as unidades do padrão.</p>}
          </div>
        )}
      </fieldset>
    </form>
  );
}

function FloorRow({
  floor,
  units,
  itemCount,
  itemsByUnit,
  first,
  last,
  readOnly,
  busy,
  expanded,
  onToggle,
  onMove,
  onRemove,
  onRemoveUnit,
  run,
}: {
  floor: TerminalityFloor;
  units: TerminalityUnit[];
  itemCount: number;
  itemsByUnit: Map<string, number>;
  first: boolean;
  last: boolean;
  readOnly: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onRemoveUnit: (unit: TerminalityUnit) => void;
  run: Run;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renamingUnit, setRenamingUnit] = useState<string>();
  const used = units.length > 0 || itemCount > 0;
  const editing = expanded && !readOnly;

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {renaming ? (
          <RenameForm
            value={floor.name}
            label={`Novo nome de ${floor.name}`}
            busy={busy}
            onCancel={() => setRenaming(false)}
            onSave={async name => {
              if (
                await run(
                  { type: 'rename_floor', floorId: floor.id, name },
                  { success: 'Pavimento renomeado.', failure: 'Não foi possível renomear.' },
                )
              )
                setRenaming(false);
            }}
          />
        ) : (
          <span className="min-w-24 text-sm font-semibold text-slate-800">{floor.name}</span>
        )}
        <span className="text-xs text-slate-500">
          {plural(units.length, 'unidade', 'unidades')}
          {itemCount > 0 && ` · ${plural(itemCount, 'pendência', 'pendências')}`}
        </span>
        {!readOnly && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              className="button-ghost mr-1 px-2 py-1 text-xs"
              aria-expanded={expanded}
              onClick={onToggle}
              disabled={busy && !expanded}
            >
              {expanded ? 'Concluir' : 'Unidades'}
            </button>
            <IconButton label={`Mover ${floor.name} para cima na lista`} disabled={busy || first} onClick={() => onMove(-1)}>
              <ArrowUp size={14} aria-hidden />
            </IconButton>
            <IconButton label={`Mover ${floor.name} para baixo na lista`} disabled={busy || last} onClick={() => onMove(1)}>
              <ArrowDown size={14} aria-hidden />
            </IconButton>
            <IconButton label={`Renomear ${floor.name}`} disabled={busy || renaming} onClick={() => setRenaming(true)}>
              <Pencil size={14} aria-hidden />
            </IconButton>
            <span title={used ? 'Exclua as unidades e as pendências do pavimento antes.' : 'Excluir pavimento sem unidades'}>
              <IconButton label={`Excluir ${floor.name}`} tone="danger" disabled={busy || used} onClick={onRemove}>
                <Trash2 size={14} aria-hidden />
              </IconButton>
            </span>
          </div>
        )}
      </div>

      {units.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Unidades de ${floor.name}`}>
          {units.map(unit => {
            const items = itemsByUnit.get(unit.id) ?? 0;
            if (editing && renamingUnit === unit.id)
              return (
                <li key={unit.id}>
                  <RenameForm
                    compact
                    value={unit.name}
                    label={`Novo nome da unidade ${unit.name}`}
                    busy={busy}
                    onCancel={() => setRenamingUnit(undefined)}
                    onSave={async name => {
                      if (
                        await run(
                          { type: 'rename_unit', unitId: unit.id, name },
                          { success: 'Unidade renomeada.', failure: 'Não foi possível renomear.' },
                        )
                      )
                        setRenamingUnit(undefined);
                    }}
                  />
                </li>
              );
            return (
              <li
                key={unit.id}
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 text-xs font-medium tabular-nums text-slate-700"
              >
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="rounded-l-full py-0.5 pr-1 pl-2.5 hover:text-primary disabled:opacity-50"
                      title="Renomear"
                      aria-label={`Renomear unidade ${unit.name}`}
                      disabled={busy}
                      onClick={() => setRenamingUnit(unit.id)}
                    >
                      {unit.name}
                    </button>
                    <span title={items ? `${plural(items, 'pendência', 'pendências')}: não pode ser excluída` : 'Excluir unidade'}>
                      <button
                        type="button"
                        className="rounded-r-full py-1 pr-2 pl-1 text-slate-400 hover:text-danger disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`Excluir unidade ${unit.name}`}
                        disabled={busy || items > 0}
                        onClick={() => onRemoveUnit(unit)}
                      >
                        <X size={12} aria-hidden />
                      </button>
                    </span>
                  </>
                ) : (
                  <span className="px-2.5 py-0.5" title={items ? plural(items, 'pendência', 'pendências') : undefined}>
                    {unit.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <AddUnitsForm
          floor={floor}
          existing={units.map(u => u.name)}
          busy={busy}
          onSubmit={names =>
            run(
              { type: 'create_units', floorId: floor.id, names },
              {
                success: `${plural(names.length, 'unidade adicionada', 'unidades adicionadas')} em ${floor.name}.`,
                failure: 'Não foi possível adicionar as unidades.',
              },
            )
          }
        />
      )}
    </li>
  );
}

function AddUnitsForm({
  floor,
  existing,
  busy,
  onSubmit,
}: {
  floor: TerminalityFloor;
  existing: string[];
  busy: boolean;
  onSubmit: (names: string[]) => Promise<boolean>;
}) {
  const floorNumber = parseFloorNumber(floor.name);
  const [mode, setMode] = useState<'sequencia' | 'lista'>(floorNumber === null ? 'lista' : 'sequencia');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('4');
  const [pad, setPad] = useState('2');
  const [list, setList] = useState('');

  let candidates: string[] = [];
  let problem = '';
  try {
    if (mode === 'lista') candidates = parseNameList(list);
    else if (floorNumber === null) problem = 'O nome do pavimento não tem número; use a lista livre.';
    else if (from !== '' && to !== '') candidates = unitNames({ floorNumber, from: Number(from), to: Number(to), pad: Number(pad) });
  } catch (cause) {
    problem = messageOf(cause);
  }
  const long = tooLong(candidates);
  if (long) problem = `"${long}" passa de ${MAX_NAME} caracteres.`;
  const fresh = problem ? [] : missingNames(existing, candidates);
  const repeated = candidates.length - fresh.length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (fresh.length && (await onSubmit(fresh))) setList('');
  };

  return (
    <form className="mt-3 rounded-xl bg-slate-50 p-3" onSubmit={submit}>
      <fieldset disabled={busy} className="min-w-0 space-y-2.5">
        <legend className="sr-only">Adicionar unidades em {floor.name}</legend>
        <ModeSwitch
          mode={mode}
          onChange={setMode}
          sequenceLabel={floorNumber === null ? 'Em sequência (sem número no nome)' : `Em sequência (${floorNumber}01, ${floorNumber}02…)`}
          listLabel="Lista livre"
          sequenceDisabled={floorNumber === null}
        />
        <div className="flex flex-wrap items-end gap-3">
          {mode === 'sequencia' ? (
            <>
              <NumberField label="Unidade de" value={from} onChange={setFrom} />
              <NumberField label="até" value={to} onChange={setTo} />
              <NumberField label="Dígitos" value={pad} onChange={setPad} min={1} max={4} />
            </>
          ) : (
            <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
              Unidades, separadas por vírgula ou linha
              <input
                className="field mt-1 block font-normal"
                value={list}
                placeholder="401, 402, 403, Hall, Escada"
                onChange={e => setList(e.target.value)}
              />
            </label>
          )}
          <button type="submit" className="button" disabled={!fresh.length}>
            {fresh.length ? `Adicionar ${plural(fresh.length, 'unidade', 'unidades')}` : 'Adicionar unidades'}
          </button>
        </div>
        <Preview problem={problem} names={fresh} repeated={repeated} repeatedLabel={['já existe', 'já existem']} />
      </fieldset>
    </form>
  );
}

// ---------------------------------------------------------------- Tipos e responsáveis

function TypesSection({ workId, data, readOnly, busy, run, runMany }: SectionProps) {
  const types = data.types
    .filter(t => t.workId === workId)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.orderIndex - b.orderIndex || byName(a.name, b.name));
  const usage = new Map<string, number>();
  for (const item of data.items) if (item.typeId) usage.set(item.typeId, (usage.get(item.typeId) ?? 0) + 1);
  const starter = missingNames(
    types.map(t => t.name),
    SPREADSHEET_TYPES,
  );
  const active = types.filter(t => t.active).length;

  return (
    <Disclosure
      id="terminalidade-tipos"
      icon={<Tags size={16} aria-hidden />}
      title="Tipos de pendência"
      summary={`${plural(active, 'ativo', 'ativos')}${types.length > active ? ` · ${types.length - active} inativo(s)` : ''}`}
      defaultOpen={!types.length && !readOnly}
    >
      <NamedCatalog
        entries={types}
        usage={usage}
        readOnly={readOnly}
        busy={busy}
        noun={{ one: 'tipo', addLabel: 'Adicionar tipo', placeholder: 'Ex.: ELÉTRICA', empty: 'Nenhum tipo de pendência cadastrado.' }}
        onCreate={name =>
          run({ type: 'create_type', workId, name }, { success: `Tipo ${name} adicionado.`, failure: 'Não foi possível adicionar o tipo.' })
        }
        onUpdate={(entry, change) =>
          run(
            { type: 'update_type', typeId: entry.id, ...change },
            {
              success: change.name ? 'Tipo renomeado.' : change.active ? `Tipo ${entry.name} reativado.` : `Tipo ${entry.name} desativado.`,
              failure: 'Não foi possível atualizar o tipo.',
            },
          )
        }
        extra={
          !readOnly &&
          starter.length > 0 && (
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() =>
                void runMany(
                  starter.map(name => ({ command: { type: 'create_type', workId, name }, label: name })),
                  {
                    success: `Tipos da planilha adicionados: ${starter.join(', ')}.`,
                    failure: 'Não foi possível adicionar todos os tipos.',
                  },
                )
              }
            >
              <ClipboardCheck size={15} aria-hidden />
              Usar os tipos da planilha ({starter.join(', ')})
            </button>
          )
        }
      />
    </Disclosure>
  );
}

function PeopleSection({ workId, data, readOnly, busy, run }: Omit<SectionProps, 'runMany'>) {
  const people = data.people.filter(p => p.workId === workId).sort((a, b) => Number(b.active) - Number(a.active) || byName(a.name, b.name));
  const usage = new Map<string, number>();
  for (const item of data.items) if (item.atrPersonId) usage.set(item.atrPersonId, (usage.get(item.atrPersonId) ?? 0) + 1);
  const active = people.filter(p => p.active).length;

  return (
    <Disclosure
      id="terminalidade-responsaveis"
      icon={<UserRound size={16} aria-hidden />}
      title="Responsáveis ATR"
      summary={`${plural(active, 'ativo', 'ativos')}${people.length > active ? ` · ${people.length - active} inativo(s)` : ''}`}
      defaultOpen={!people.length && !readOnly}
    >
      <NamedCatalog
        entries={people}
        usage={usage}
        readOnly={readOnly}
        busy={busy}
        noun={{
          one: 'responsável',
          addLabel: 'Adicionar responsável',
          placeholder: 'Nome de quem acompanha na obra',
          empty: 'Nenhum responsável cadastrado. Não precisam ter acesso ao sistema.',
        }}
        onCreate={name =>
          run(
            { type: 'create_person', workId, name },
            { success: `${name} adicionado(a).`, failure: 'Não foi possível adicionar o responsável.' },
          )
        }
        onUpdate={(entry, change) =>
          run(
            { type: 'update_person', personId: entry.id, ...change },
            {
              success: change.name
                ? 'Responsável renomeado.'
                : change.active
                  ? `${entry.name} reativado(a).`
                  : `${entry.name} desativado(a).`,
              failure: 'Não foi possível atualizar o responsável.',
            },
          )
        }
      />
    </Disclosure>
  );
}

type Entry = { id: string; name: string; active: boolean };

/** Lista de nomes com inclusão, renomeação e ativação: serve aos tipos e aos responsáveis. */
function NamedCatalog({
  entries,
  usage,
  readOnly,
  busy,
  noun,
  onCreate,
  onUpdate,
  extra,
}: {
  entries: Entry[];
  usage: Map<string, number>;
  readOnly: boolean;
  busy: boolean;
  noun: { one: string; addLabel: string; placeholder: string; empty: string };
  onCreate: (name: string) => Promise<boolean>;
  onUpdate: (entry: Entry, change: { name?: string; active?: boolean }) => Promise<boolean>;
  extra?: ReactNode;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = name.replace(/\s+/g, ' ').trim();
    if (!value) return;
    const twin = entries.find(e => nameKey(e.name) === nameKey(value));
    if (twin) {
      setError(`Já existe ${twin.active ? '' : 'inativo '}"${twin.name}".${twin.active ? '' : ' Reative-o na lista.'}`);
      return;
    }
    setError('');
    if (await onCreate(value)) setName('');
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-start gap-2">
          <form className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={submit}>
            <label className="min-w-48 flex-1">
              <span className="sr-only">{noun.addLabel}</span>
              <input
                className="field"
                value={name}
                maxLength={MAX_NAME}
                placeholder={noun.placeholder}
                disabled={busy}
                onChange={e => {
                  setName(e.target.value);
                  setError('');
                }}
              />
            </label>
            <button type="submit" className="button" disabled={busy || !name.trim()}>
              <Plus size={15} aria-hidden />
              {noun.addLabel}
            </button>
          </form>
          {extra}
        </div>
      )}
      {error && (
        <Callout tone="warning" role="alert">
          {error}
        </Callout>
      )}
      {entries.length === 0 ? (
        <Empty>{noun.empty}</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {entries.map(entry => {
            const count = usage.get(entry.id) ?? 0;
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                {renaming === entry.id && !readOnly ? (
                  <RenameForm
                    value={entry.name}
                    label={`Novo nome de ${entry.name}`}
                    busy={busy}
                    onCancel={() => setRenaming(undefined)}
                    onSave={async value => {
                      if (await onUpdate(entry, { name: value })) setRenaming(undefined);
                    }}
                  />
                ) : (
                  <span className={`text-sm font-medium ${entry.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                    {entry.name}
                  </span>
                )}
                {!entry.active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Inativo</span>
                )}
                {count > 0 && <span className="text-xs text-slate-500">{plural(count, 'pendência', 'pendências')}</span>}
                {!readOnly && (
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton
                      label={`Renomear ${entry.name}`}
                      disabled={busy || renaming === entry.id}
                      onClick={() => setRenaming(entry.id)}
                    >
                      <Pencil size={14} aria-hidden />
                    </IconButton>
                    <button
                      type="button"
                      className="button-ghost px-2 py-1 text-xs"
                      disabled={busy}
                      onClick={() => void onUpdate(entry, { active: !entry.active })}
                    >
                      {entry.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Peças pequenas

function ModeSwitch({
  mode,
  onChange,
  sequenceLabel,
  listLabel,
  sequenceDisabled = false,
}: {
  mode: 'sequencia' | 'lista';
  onChange: (mode: 'sequencia' | 'lista') => void;
  sequenceLabel: string;
  listLabel: string;
  sequenceDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700" role="radiogroup" aria-label="Como informar">
      <label className={`flex items-center gap-2 ${sequenceDisabled ? 'text-slate-400' : ''}`}>
        <input
          type="radio"
          className="accent-primary"
          checked={mode === 'sequencia'}
          disabled={sequenceDisabled}
          onChange={() => onChange('sequencia')}
        />
        {sequenceLabel}
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" className="accent-primary" checked={mode === 'lista'} onChange={() => onChange('lista')} />
        {listLabel}
      </label>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  min = 0,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        className="field mt-1 block w-20 tabular-nums"
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}

/** O que o botão vai criar, antes de criar. */
function Preview({
  problem,
  names,
  repeated,
  repeatedLabel,
}: {
  problem: string;
  names: string[];
  repeated: number;
  repeatedLabel: [one: string, many: string];
}) {
  if (problem)
    return (
      <p className="text-xs text-danger" role="status">
        {problem}
      </p>
    );
  if (!names.length && !repeated) return null;
  return (
    <p className="text-xs text-slate-500" role="status">
      {names.length > 0 && <span className="tabular-nums text-slate-700">{previewNames(names)}</span>}
      {repeated > 0 && (
        <span>
          {names.length > 0 ? ' · ' : ''}
          {repeated} {repeatedLabel[repeated === 1 ? 0 : 1]}, fica{repeated === 1 ? '' : 'm'} de fora
        </span>
      )}
    </p>
  );
}

function IconButton({
  label,
  tone = 'default',
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-lg p-1.5 text-slate-400 disabled:cursor-not-allowed disabled:opacity-35 ${
        tone === 'danger' ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-brand-50 hover:text-primary'
      }`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Renomeação no lugar do nome: Enter salva, Esc cancela. */
function RenameForm({
  value,
  label,
  busy,
  compact = false,
  onSave,
  onCancel,
}: {
  value: string;
  label: string;
  busy: boolean;
  compact?: boolean;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = text.replace(/\s+/g, ' ').trim();
    if (!name || name === value) onCancel();
    else void onSave(name);
  };
  return (
    <form className="flex items-center gap-1" onSubmit={submit}>
      <input
        ref={input}
        className={`field ${compact ? 'w-24 px-2 py-0.5 text-xs' : 'w-56 py-1'}`}
        aria-label={label}
        value={text}
        maxLength={MAX_NAME}
        disabled={busy}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button
        type="submit"
        className="rounded-lg p-1.5 text-success hover:bg-success-soft disabled:opacity-35"
        aria-label="Salvar nome"
        title="Salvar"
        disabled={busy}
      >
        <Check size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
        aria-label="Cancelar"
        title="Cancelar"
        onClick={onCancel}
      >
        <X size={14} aria-hidden />
      </button>
    </form>
  );
}
