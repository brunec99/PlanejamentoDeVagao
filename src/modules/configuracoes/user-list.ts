import type { User, Work } from '@/domain/entities';

/** Lista da tela de usuários (Configurações): pesquisa, filtros e ordem, sem estado de tela. Com
 * dezenas de pessoas, a lista na ordem do banco obrigava a procurar cada nome rolando a página. */
export type UserSortKey = 'name' | 'role';
export type UserSort = { key: UserSortKey; dir: 'asc' | 'desc' };
export const DEFAULT_USER_SORT: UserSort = { key: 'name', dir: 'asc' };

/** Valor do filtro de obra para "quem não tem nenhuma obra liberada" (cadastro recém-aprovado). */
export const NO_WORK = 'sem-obra';
export interface UserFilter {
  query: string;
  role: User['role'] | '';
  /** Id da obra, `NO_WORK` ou vazio (todas). */
  workId: string;
}
export const EMPTY_USER_FILTER: UserFilter = { query: '', role: '', workId: '' };

/** Do menor ao maior poder, a ordem do seletor de papel. */
export const ROLE_ORDER: readonly User['role'][] = ['viewer', 'planner', 'manager', 'admin'];

const textKey = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true });

/** Cada palavra pesquisada precisa aparecer no nome ou no e-mail, sem diferença de acento ou caixa. */
export function matchesUser(user: User, email: string | undefined, query: string) {
  const haystack = textKey(`${user.name} ${email ?? ''}`);
  return textKey(query)
    .split(' ')
    .filter(Boolean)
    .every(term => haystack.includes(term));
}

export function listUsers(users: readonly User[], emails: Record<string, string>, filter: UserFilter, sort: UserSort): User[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return users
    .filter(user => {
      if (filter.role && user.role !== filter.role) return false;
      if (filter.workId === NO_WORK ? user.workIds.length > 0 : filter.workId && !user.workIds.includes(filter.workId)) return false;
      return matchesUser(user, emails[user.id], filter.query);
    })
    .sort((a, b) =>
      sort.key === 'role'
        ? sign * (ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)) || byName(a, b)
        : sign * byName(a, b) || a.id.localeCompare(b.id),
    );
}

/** Clicar na coluna já ordenada inverte o sentido; outra coluna começa crescente. */
export const nextUserSort = (current: UserSort, key: UserSortKey): UserSort =>
  current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };

export const isFiltered = (filter: UserFilter) => !!(filter.query.trim() || filter.role || filter.workId);

/** Colunas de obra em ordem alfabética, como a lista de obras. */
export const worksByName = (works: readonly Work[]) => [...works].sort(byName);
