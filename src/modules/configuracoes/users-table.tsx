'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Search, Trash2 } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { roleLabels } from '@/shared/format';
import type { Command } from '@/application/use-cases/commands';
import type { User, Work } from '@/domain/entities';
import { MODULES, type ModuleInfo } from '@/application/module-access';
import {
  DEFAULT_USER_SORT,
  EMPTY_USER_FILTER,
  NO_WORK,
  ROLE_ORDER,
  isFiltered,
  listUsers,
  nextUserSort,
  worksByName,
  type UserFilter,
  type UserSort,
  type UserSortKey,
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

function RoleSelect({ user, self }: { user: User; self: boolean }) {
  const { busy, run } = useAccessCommand();
  return (
    <select
      data-tour="config-user-role"
      className="field w-auto py-1 text-xs"
      value={user.role}
      disabled={busy || self}
      aria-label={`Papel de ${user.name}`}
      title={self ? 'Ninguém tira o próprio acesso de administrador.' : undefined}
      onChange={e => run({ type: 'set_role', userId: user.id, role: e.target.value as User['role'] })}
    >
      {ROLE_ORDER.map(r => (
        <option key={r} value={r}>
          {roleLabels[r]}
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

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: UserSortKey;
  sort: UserSort;
  onSort: (key: UserSortKey) => void;
  className: string;
}) {
  const active = sort.key === sortKey ? sort.dir : undefined;
  const order = sortKey === 'name' ? (active === 'asc' ? 'Z a A' : 'A a Z') : active === 'asc' ? 'admin primeiro' : 'consulta primeiro';
  return (
    <th scope="col" aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'} className={className}>
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
  const rows = useMemo(() => listUsers(users, emails, filter, sort), [users, emails, filter, sort]);
  const columns = useMemo(() => worksByName(works), [works]);
  const patch = (change: Partial<UserFilter>) => setFilter(current => ({ ...current, ...change }));
  const total = users.length === 1 ? '1 usuário' : `${users.length} usuários`;
  const shown = rows.length === users.length ? total : `${rows.length} de ${total}`;
  const span = 3 + (view === 'obras' ? columns.length : RESTRICTED_MODULES.length);

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
          {ROLE_ORDER.map(r => (
            <option key={r} value={r}>
              {roleLabels[r]}
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
              return (
                <tr key={user.id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-44 border-b border-r border-slate-100 bg-white px-3 py-2 text-left font-normal group-hover:bg-brand-50 sm:max-w-72 sm:px-4"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <span className="truncate">{user.name}</span>
                      {self && <span className="badge-muted shrink-0">você</span>}
                    </span>
                    <span className="block truncate text-xs text-slate-400">{emails[user.id] ?? '—'}</span>
                    {view === 'obras' && user.workIds.length === 0 && (
                      <span className="block text-xs font-semibold text-warning">Sem obra liberada</span>
                    )}
                  </th>
                  <td className={CELL}>
                    <RoleSelect user={user} self={self} />
                  </td>
                  {view === 'obras'
                    ? columns.map(work => (
                        <td key={work.id} className={`${CELL} text-center`}>
                          <AccessCell user={user} work={work} />
                        </td>
                      ))
                    : RESTRICTED_MODULES.map(module => (
                        <td key={module.section} className={`${CELL} text-center`}>
                          <ModuleCell user={user} module={module} />
                        </td>
                      ))}
                  <td className={`${CELL} text-center`}>{!self && <DeleteUserButton user={user} onDone={onDeleted} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        {view === 'obras'
          ? 'Clique na célula para liberar ou revogar a obra; vale na hora, sem botão de salvar. Quem não tem a obra liberada não a vê na lista de obras. O número no cabeçalho é quantos dos usuários listados têm a obra.'
          : `${OPEN_MODULES.map(m => m.label).join(', ')} são abertos a todos e não aparecem aqui. Administradores veem todos os módulos, por isso as células deles ficam marcadas em cinza, sem clique. O número no cabeçalho é quantos dos usuários listados têm o módulo.`}
      </p>
    </div>
  );
}
