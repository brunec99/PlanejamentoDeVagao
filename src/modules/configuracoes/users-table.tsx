'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCheck, Search, Trash2, X } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import type { Command } from '@/application/use-cases/commands';
import type { User, Work } from '@/domain/entities';
import { MODULES, accessBatchChange, type ModuleInfo } from '@/application/module-access';
import {
  DEFAULT_USER_SORT,
  EMPTY_USER_FILTER,
  NO_WORK,
  USER_TYPE_LABELS,
  USER_TYPE_ORDER,
  isFiltered,
  listUsers,
  nextUserSort,
  worksByName,
  type UserFilter,
  type UserSort,
  type UserSortKey,
  type UserType,
  typeToProfile,
  userType,
} from './user-list';

/** Grade de acessos (28/10/2026): uma linha por pessoa e uma coluna por obra, ou por módulo em
 * desenvolvimento. Substituiu os cartões empilhados, um por pessoa com um chip por obra e por módulo,
 * que com dezenas de pessoas viravam centenas de chips sem ordem nem busca. */
type View = 'obras' | 'modulos';
const RESTRICTED_MODULES = MODULES.filter(m => !m.open);
const OPEN_MODULES = MODULES.filter(m => m.open);

/** Comando de acesso na grade: o provedor projeta a mudança no clique e o servidor confirma por trás.
 * A recusa vira aviso, porque não cabe mensagem embaixo de cada célula; a recarga desfaz a célula. */
function useAccessCommand() {
  const c = usePlanning();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (command: Command) => {
    if (c.state !== 'ready' || busy) return;
    setBusy(true);
    try {
      await c.execute(command);
    } catch (cause) {
      toast({ title: 'Não foi possível salvar.', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Célula da grade. O estado vai no `aria-pressed`, no título e no visto, nunca só na cor. */
function Toggle({
  on,
  label,
  title,
  locked,
  busy,
  tourId,
  onClick,
}: {
  on: boolean;
  label: string;
  title: string;
  locked?: boolean;
  busy: boolean;
  tourId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-tour={tourId}
      aria-pressed={on}
      aria-label={label}
      title={title}
      disabled={busy || locked}
      onClick={onClick}
      className={`mx-auto flex size-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default ${
        on
          ? locked
            ? 'border-slate-200 bg-slate-100 text-slate-500'
            : 'border-primary bg-primary text-white hover:bg-primary-strong'
          : 'border-slate-300 bg-white text-transparent hover:border-primary hover:bg-primary-soft hover:text-primary/50'
      } ${busy ? 'opacity-60' : ''}`}
    >
      <Check size={16} strokeWidth={3} aria-hidden />
    </button>
  );
}

function AccessCell({ user, work }: { user: User; work: Work }) {
  const { busy, run } = useAccessCommand();
  const granted = user.workIds.includes(work.id);
  return (
    <Toggle
      tourId="config-user-works"
      on={granted}
      busy={busy}
      label={`${work.name} para ${user.name}`}
      title={`${user.name} · ${work.name}: ${granted ? 'liberada. Clique para revogar.' : 'sem acesso. Clique para liberar.'}`}
      onClick={() => run({ type: granted ? 'revoke_access' : 'grant_access', userId: user.id, workId: work.id })}
    />
  );
}

function ModuleCell({ user, module }: { user: User; module: ModuleInfo }) {
  const { busy, run } = useAccessCommand();
  const admin = user.role === 'admin';
  const granted = admin || (user.modules ?? []).includes(module.section);
  return (
    <Toggle
      tourId="config-user-modules"
      on={granted}
      locked={admin}
      busy={busy}
      label={`${module.label} para ${user.name}`}
      title={
        admin
          ? `${module.label}: administradores veem todos os módulos.`
          : `${user.name} · ${module.label} (${module.hint}): ${granted ? 'liberado. Clique para bloquear.' : 'bloqueado. Clique para liberar.'}`
      }
      onClick={() => run({ type: 'set_module_access', userId: user.id, section: module.section, enabled: !granted })}
    />
  );
}

/** Seletor "Papel", o tipo de usuário (05/11/2026): Consulta, TST, Planejador, Gestor e Admin. O TST
 * (técnico de segurança do trabalho) lança e finaliza apontamentos na aba 6 e consulta o resto do sistema;
 * no banco ele é o papel consulta com a marca `profiles.tst` (`typeToProfile`). O papel passa pelo
 * planejamento (`set_role`); a marca, que fica fora do `commit_planning`, pela rota própria, e a lista
 * recarrega depois. Admin já grava na aba 6 sem a marca. */
function RoleSelect({ user, self }: { user: User; self: boolean }) {
  const c = usePlanning();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const current = userType(user);
  const change = async (next: UserType) => {
    if (busy || c.state !== 'ready' || next === current) return;
    const target = typeToProfile(next);
    setBusy(true);
    try {
      if (target.role !== user.role) await c.execute({ type: 'set_role', userId: user.id, role: target.role });
      if (target.tst !== (user.tst === true)) {
        const res = await fetch('/api/seguranca/tst', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, enabled: target.tst }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Não foi possível salvar.');
        await c.refresh();
      }
      if (next === 'tst')
        toast({
          title: `${user.name} agora é TST.`,
          description: 'Lança e finaliza apontamentos na aba 6, Segurança do trabalho, nas obras liberadas; no resto do sistema, consulta.',
          tone: 'success',
        });
    } catch (cause) {
      toast({ title: 'Não foi possível salvar.', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <select
      data-tour="config-user-role"
      className="field w-auto py-1 text-xs"
      value={current}
      disabled={busy || self}
      aria-label={`Papel de ${user.name}`}
      title={self ? 'Ninguém tira o próprio acesso de administrador.' : current === 'tst' ? 'Técnico de segurança do trabalho' : undefined}
      onChange={e => void change(e.target.value as UserType)}
    >
      {USER_TYPE_ORDER.map(type => (
        <option key={type} value={type}>
          {USER_TYPE_LABELS[type]}
        </option>
      ))}
    </select>
  );
}

function DeleteUserButton({ user, onDone }: { user: User; onDone: () => void }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-tour="config-user-delete"
      disabled={busy}
      aria-label={`Excluir ${user.name}`}
      title="Excluir usuário"
      className="mx-auto flex size-8 items-center justify-center rounded-lg border border-transparent text-slate-400 transition-colors hover:border-danger-ring hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      onClick={async () => {
        // O diálogo do sistema no lugar do `window.confirm`: mesmo visual, foco preso, Esc cancela.
        const ok = await confirm({
          title: `Excluir ${user.name}?`,
          description:
            'A pessoa perde o acesso ao Obra 360 e precisa ser cadastrada de novo. A conta de login continua valendo nos outros sistemas da ATR.',
          confirmLabel: 'Excluir usuário',
          tone: 'danger',
        });
        if (!ok) return;
        setBusy(true);
        try {
          const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? 'Não foi possível excluir.');
          toast({ title: `${user.name} foi excluído.`, tone: 'success' });
          onDone();
        } catch (cause) {
          toast({ title: 'Não foi possível excluir.', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Trash2 size={15} aria-hidden />
    </button>
  );
}

const HEAD =
  'sticky top-0 z-20 border-b border-brand-100 bg-brand-50 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-brand-800';
const CELL = 'border-b border-slate-100 px-2 py-2 align-middle group-hover:bg-brand-50';
const CHECKBOX = 'size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-default';

const people = (n: number) => (n === 1 ? '1 pessoa' : `${n} pessoas`);
/** "Mozine", "Mozine e Tauá", "Atmos, Mozine e Tauá"; de quatro em diante, só a contagem. */
function joinNames(names: readonly string[], many: string) {
  if (names.length > 3) return `${names.length} ${many}`;
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** Liberação em lote (08/11/2026): o admin marca várias pessoas na grade e libera ou revoga as mesmas obras
 * (ou módulos, na visão Módulos) de uma vez, numa gravação só (`set_access_batch`), em vez de um clique por
 * célula. A seleção sobrevive à pesquisa e aos filtros, para dar para montar a turma pesquisando nome a
 * nome; quem saiu da lista continua marcado, entra no lote e a barra avisa quantos são. Os botões dizem
 * quantas pessoas mudam de fato, pela mesma conta do servidor (`accessBatchChange`), e só elas vão no comando. */
function BulkAccessBar({
  view,
  selected,
  hidden,
  works,
  onClear,
}: {
  view: View;
  selected: User[];
  hidden: number;
  works: Work[];
  onClear: () => void;
}) {
  const c = usePlanning();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const obras = view === 'obras';
  const options = obras
    ? works.map(w => ({ id: w.id, short: w.code, name: w.name }))
    : RESTRICTED_MODULES.map(m => ({ id: m.section, short: m.label, name: m.label }));
  const chosen = options.filter(o => targets.includes(o.id));
  const batch = (enabled: boolean) => (obras ? { workIds: targets, enabled } : { sections: targets, enabled });
  const changing = (enabled: boolean) => (targets.length ? selected.filter(user => accessBatchChange(user, batch(enabled))) : []);
  const toGrant = changing(true);
  const toRevoke = changing(false);
  const admins = obras ? 0 : selected.filter(u => u.role === 'admin').length;
  const all = options.length > 0 && chosen.length === options.length;
  const what = joinNames(
    chosen.map(o => o.name),
    obras ? 'obras' : 'módulos',
  );

  const apply = async (enabled: boolean) => {
    const users = enabled ? toGrant : toRevoke;
    if (busy || c.state !== 'ready' || users.length === 0) return;
    if (!enabled) {
      const ok = await confirm({
        title: `Revogar ${what} de ${people(users.length)}?`,
        description: obras
          ? 'Quem perde a obra deixa de vê-la na lista de obras. Dá para liberar de novo pela mesma barra ou pela célula.'
          : 'Quem perde o módulo deixa de ver a aba dele. Dá para liberar de novo pela mesma barra ou pela célula.',
        confirmLabel: 'Revogar',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await c.execute({ type: 'set_access_batch', userIds: users.map(u => u.id), ...batch(enabled) });
      toast({
        title: enabled ? `Acesso liberado: ${what} para ${people(users.length)}.` : `Acesso revogado: ${what} de ${people(users.length)}.`,
        tone: 'success',
      });
    } catch (cause) {
      toast({ title: 'Não foi possível salvar.', description: cause instanceof Error ? cause.message : undefined, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
      on
        ? 'border-primary bg-primary text-white hover:bg-primary-strong'
        : 'border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary-ink'
    }`;
  const hint = !targets.length
    ? obras
      ? 'Escolha uma ou mais obras.'
      : 'Escolha um ou mais módulos.'
    : admins > 0
      ? admins === selected.length
        ? 'Admins já veem todos os módulos.'
        : admins === 1
          ? '1 admin já vê todos os módulos e fica de fora.'
          : `${admins} admins já veem todos os módulos e ficam de fora.`
      : '';

  return (
    <div
      role="region"
      aria-label="Usuários selecionados"
      data-tour="config-users-bulk"
      className="space-y-2 border-b border-primary-ring bg-primary-soft px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-slate-800" aria-live="polite">
          {selected.length === 1 ? '1 usuário selecionado' : `${selected.length} usuários selecionados`}
        </span>
        {hidden > 0 && (
          <span className="text-xs text-slate-500">
            {hidden === 1 ? '1 está fora da lista atual e também entra.' : `${hidden} estão fora da lista atual e também entram.`}
          </span>
        )}
        <button type="button" className="text-link text-xs" onClick={onClear} disabled={busy}>
          Limpar seleção
        </button>
      </div>
      <div role="group" aria-label={obras ? 'Obras do lote' : 'Módulos do lote'} className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{obras ? 'Obras' : 'Módulos'}</span>
        <button
          type="button"
          aria-pressed={all}
          className={chip(all)}
          disabled={busy}
          onClick={() => setTargets(all ? [] : options.map(o => o.id))}
        >
          {obras ? 'Todas' : 'Todos'}
        </button>
        {options.map(o => {
          const on = targets.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              aria-label={obras ? `${o.name} (${o.short})` : o.name}
              title={o.name}
              className={chip(on)}
              disabled={busy}
              onClick={() => setTargets(current => (on ? current.filter(id => id !== o.id) : [...current, o.id]))}
            >
              {o.short}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="button px-3 py-1.5 text-xs"
          disabled={busy || toGrant.length === 0}
          onClick={() => void apply(true)}
          title={toGrant.length === 0 && targets.length ? 'Todos os selecionados já têm esse acesso.' : undefined}
        >
          <CheckCheck size={14} aria-hidden />
          {busy ? 'Salvando…' : toGrant.length ? `Liberar para ${people(toGrant.length)}` : 'Liberar'}
        </button>
        <button
          type="button"
          className="button-ghost px-3 py-1.5 text-xs"
          disabled={busy || toRevoke.length === 0}
          onClick={() => void apply(false)}
          title={toRevoke.length === 0 && targets.length ? 'Nenhum dos selecionados tem esse acesso.' : undefined}
        >
          <X size={14} aria-hidden />
          {toRevoke.length ? `Revogar de ${people(toRevoke.length)}` : 'Revogar'}
        </button>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  lead,
}: {
  label: string;
  sortKey: UserSortKey;
  sort: UserSort;
  onSort: (key: UserSortKey) => void;
  className: string;
  /** O que vem antes do rótulo, na mesma célula (a caixa "selecionar todos" da coluna Usuário). */
  lead?: ReactNode;
}) {
  const active = sort.key === sortKey ? sort.dir : undefined;
  const order = sortKey === 'name' ? (active === 'asc' ? 'Z a A' : 'A a Z') : active === 'asc' ? 'admin primeiro' : 'consulta primeiro';
  return (
    <th scope="col" aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'} className={className}>
      <span className="inline-flex items-center gap-2.5">
        {lead}
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          title={`Ordenar por ${label.toLowerCase()} (${order})`}
          className="inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          {label}
          {active === 'asc' ? (
            <ArrowUp size={12} aria-hidden />
          ) : active === 'desc' ? (
            <ArrowDown size={12} aria-hidden />
          ) : (
            <ArrowUpDown size={12} className="opacity-40" aria-hidden />
          )}
        </button>
      </span>
    </th>
  );
}

export function UsersTable({
  users,
  works,
  emails,
  actorId,
  onDeleted,
}: {
  users: User[];
  works: Work[];
  emails: Record<string, string>;
  actorId: string;
  onDeleted: () => void;
}) {
  const [filter, setFilter] = useState<UserFilter>(EMPTY_USER_FILTER);
  const [sort, setSort] = useState<UserSort>(DEFAULT_USER_SORT);
  const [view, setView] = useState<View>('obras');
  // Seleção para o lote (08/11/2026), por id: não se perde ao pesquisar, filtrar, ordenar ou trocar de visão.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Última caixa clicada, para Shift+clique marcar (ou desmarcar) o intervalo até ela na ordem da lista.
  const anchor = useRef<string | null>(null);
  const rows = useMemo(() => listUsers(users, emails, filter, sort), [users, emails, filter, sort]);
  const columns = useMemo(() => worksByName(works), [works]);
  const patch = (change: Partial<UserFilter>) => setFilter(current => ({ ...current, ...change }));
  const total = users.length === 1 ? '1 usuário' : `${users.length} usuários`;
  const shown = rows.length === users.length ? total : `${rows.length} de ${total}`;
  const span = 3 + (view === 'obras' ? columns.length : RESTRICTED_MODULES.length);
  // Quem foi excluído some da seleção sozinho: ela é lida contra a lista de usuários.
  const selectedUsers = users.filter(u => selected.has(u.id));
  const listedSelected = rows.filter(u => selected.has(u.id)).length;
  const allListed = rows.length > 0 && listedSelected === rows.length;
  const mark = (ids: readonly string[], on: boolean) =>
    setSelected(current => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const toggleRow = (userId: string, on: boolean, range: boolean) => {
    const from = range && anchor.current ? rows.findIndex(u => u.id === anchor.current) : -1;
    const to = rows.findIndex(u => u.id === userId);
    mark(from >= 0 ? rows.slice(Math.min(from, to), Math.max(from, to) + 1).map(u => u.id) : [userId], on);
    anchor.current = userId;
  };

  return (
    <div data-tour="config-users" className="panel overflow-hidden">
      <div data-tour="config-users-filters" className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <label className="relative block w-full sm:w-64">
          <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={filter.query}
            onChange={e => patch({ query: e.target.value })}
            aria-label="Pesquisar usuário por nome ou e-mail"
            placeholder="Pesquisar nome ou e-mail"
            className="field py-1.5 pl-7 text-xs"
          />
        </label>
        <select
          aria-label="Filtrar por papel"
          className="field w-auto py-1.5 text-xs"
          value={filter.role}
          onChange={e => patch({ role: e.target.value as UserFilter['role'] })}
        >
          <option value="">Todos os papéis</option>
          {USER_TYPE_ORDER.map(type => (
            <option key={type} value={type}>
              {USER_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por obra"
          className="field w-auto max-w-56 py-1.5 text-xs"
          value={filter.workId}
          onChange={e => patch({ workId: e.target.value })}
        >
          <option value="">Todas as obras</option>
          <option value={NO_WORK}>Sem obra liberada</option>
          {columns.map(w => (
            <option key={w.id} value={w.id}>
              Com acesso a {w.name}
            </option>
          ))}
        </select>
        {isFiltered(filter) && (
          <button type="button" className="text-link text-xs" onClick={() => setFilter(EMPTY_USER_FILTER)}>
            Limpar filtros
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-xs tabular-nums text-slate-500" aria-live="polite">
            {shown}
          </span>
          <div
            data-tour="config-users-view"
            role="group"
            aria-label="Mostrar acessos por"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1"
          >
            {(['obras', 'modulos'] as const).map(v => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${view === v ? 'bg-white text-primary-ink shadow-sm ring-1 ring-primary-ring' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {v === 'obras' ? 'Obras' : 'Módulos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedUsers.length > 0 && (
        <BulkAccessBar
          key={view}
          view={view}
          selected={selectedUsers}
          hidden={selectedUsers.length - listedSelected}
          works={columns}
          onClear={() => {
            setSelected(new Set());
            anchor.current = null;
          }}
        />
      )}

      <div className="max-h-[70vh] overflow-auto custom-scrollbar" role="region" aria-label="Grade de acessos" tabIndex={0}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <SortHeader
                label="Usuário"
                sortKey="name"
                sort={sort}
                onSort={key => setSort(current => nextUserSort(current, key))}
                className={`${HEAD} left-0 z-30 min-w-40 border-r text-left sm:min-w-56`}
                lead={
                  <input
                    type="checkbox"
                    data-tour="config-users-select"
                    className={CHECKBOX}
                    checked={allListed}
                    disabled={rows.length === 0}
                    ref={el => {
                      if (el) el.indeterminate = listedSelected > 0 && !allListed;
                    }}
                    onChange={() =>
                      mark(
                        rows.map(u => u.id),
                        !allListed,
                      )
                    }
                    aria-label={allListed ? 'Desmarcar os usuários listados' : 'Selecionar todos os usuários listados'}
                    title={allListed ? 'Desmarcar os usuários listados' : 'Selecionar todos os usuários listados'}
                  />
                }
              />
              <SortHeader
                label="Papel"
                sortKey="role"
                sort={sort}
                onSort={key => setSort(current => nextUserSort(current, key))}
                className={`${HEAD} text-left`}
              />
              {view === 'obras'
                ? columns.map(work => {
                    const count = rows.filter(u => u.workIds.includes(work.id)).length;
                    return (
                      <th
                        key={work.id}
                        scope="col"
                        title={`${work.name}: ${count} de ${rows.length} usuários listados com acesso`}
                        className={`${HEAD} min-w-[5.5rem] text-center align-bottom`}
                      >
                        <span className="block">{work.code}</span>
                        <span className="mx-auto block max-w-[5.5rem] truncate text-[10px] font-medium normal-case tracking-normal text-brand-700">
                          {work.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-semibold normal-case tracking-normal tabular-nums text-slate-500">
                          {count}
                        </span>
                      </th>
                    );
                  })
                : RESTRICTED_MODULES.map(module => {
                    const count = rows.filter(u => u.role === 'admin' || (u.modules ?? []).includes(module.section)).length;
                    return (
                      <th
                        key={module.section}
                        scope="col"
                        title={`${module.label} (${module.hint}): ${count} de ${rows.length} usuários listados com acesso`}
                        className={`${HEAD} min-w-[5.5rem] text-center align-bottom`}
                      >
                        <span className="mx-auto block max-w-[6rem] text-[11px] leading-tight">{module.label}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold tabular-nums text-slate-500">{count}</span>
                      </th>
                    );
                  })}
              <th scope="col" className={`${HEAD} w-12`}>
                <span className="sr-only">Excluir</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={span} className="px-4 py-8 text-center text-sm text-slate-500">
                  Nenhum usuário com esses filtros.{' '}
                  <button type="button" className="text-link" onClick={() => setFilter(EMPTY_USER_FILTER)}>
                    Limpar filtros
                  </button>
                </td>
              </tr>
            )}
            {rows.map(user => {
              const self = user.id === actorId;
              const checked = selected.has(user.id);
              const cell = `${CELL} ${checked ? 'bg-primary-soft' : ''}`;
              return (
                <tr key={user.id} className="group">
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 max-w-44 border-b border-r border-slate-100 px-3 py-2 text-left font-normal group-hover:bg-brand-50 sm:max-w-72 sm:px-4 ${checked ? 'bg-primary-soft' : 'bg-white'}`}
                  >
                    <span className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        className={`${CHECKBOX} mt-0.5`}
                        checked={checked}
                        onChange={e => toggleRow(user.id, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey === true)}
                        aria-label={`Selecionar ${user.name}`}
                        title="Selecionar para liberar ou revogar em lote (Shift+clique marca o intervalo)"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                          <span className="truncate">{user.name}</span>
                          {self && <span className="badge-muted shrink-0">você</span>}
                        </span>
                        <span className="block truncate text-xs text-slate-400">{emails[user.id] ?? '—'}</span>
                        {view === 'obras' && user.workIds.length === 0 && (
                          <span className="block text-xs font-semibold text-warning">Sem obra liberada</span>
                        )}
                      </span>
                    </span>
                  </th>
                  <td className={cell}>
                    <RoleSelect user={user} self={self} />
                  </td>
                  {view === 'obras'
                    ? columns.map(work => (
                        <td key={work.id} className={`${cell} text-center`}>
                          <AccessCell user={user} work={work} />
                        </td>
                      ))
                    : RESTRICTED_MODULES.map(module => (
                        <td key={module.section} className={`${cell} text-center`}>
                          <ModuleCell user={user} module={module} />
                        </td>
                      ))}
                  <td className={`${cell} text-center`}>{!self && <DeleteUserButton user={user} onDone={onDeleted} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        O papel TST (técnico de segurança do trabalho) lança e finaliza apontamentos na aba 6, Segurança do trabalho, nas obras liberadas
        para a pessoa, e consulta o resto do sistema; o admin também lança na aba 6.{' '}
        {view === 'obras'
          ? 'Clique na célula para liberar ou revogar a obra; vale na hora, sem botão de salvar. Quem não tem a obra liberada não a vê na lista de obras. O número no cabeçalho é quantos dos usuários listados têm a obra.'
          : `${OPEN_MODULES.map(m => m.label).join(', ')} são abertos a todos e não aparecem aqui. Administradores veem todos os módulos, por isso as células deles ficam marcadas em cinza, sem clique. O número no cabeçalho é quantos dos usuários listados têm o módulo.`}{' '}
        Para várias pessoas de uma vez, marque a caixa ao lado do nome (Shift+clique marca o intervalo; a do cabeçalho marca todos os
        listados), escolha {view === 'obras' ? 'as obras' : 'os módulos'} na barra que aparece e clique em Liberar ou Revogar.
      </p>
    </div>
  );
}
