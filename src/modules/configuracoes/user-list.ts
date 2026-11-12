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
  /** Tipo de usuário (papel ou "tst"); vazio = todos. */
  role: UserType | '';
  /** Id da obra, `NO_WORK` ou vazio (todas). */
  workId: string;
}
export const EMPTY_USER_FILTER: UserFilter = { query: '', role: '', workId: '' };

/** Do menor ao maior poder, a ordem do seletor de papel. */
export const ROLE_ORDER: readonly User['role'][] = ['viewer', 'planner', 'manager', 'admin'];

/** Tipo de usuário mostrado no seletor "Papel" (05/11/2026): os quatro papéis e o TST, técnico de segurança
 * do trabalho. No banco, o TST é o papel consulta com a marca `profiles.tst`: ele lança e finaliza na aba 6
 * (Segurança do trabalho) e, no resto do sistema, consulta. Guardar assim evita um quinto papel que
 * passaria pelos testes de "não é consulta" das outras telas e ganharia escrita no planejamento. */
export type UserType = User['role'] | 'tst';
export const USER_TYPE_ORDER: readonly UserType[] = ['viewer', 'tst', 'planner', 'manager', 'admin'];
export const USER_TYPE_LABELS: Record<UserType, string> = {
  viewer: 'Consulta',
  tst: 'TST',
  planner: 'Planejador',
  manager: 'Gestor',
  admin: 'Admin',
};
export const userType = (user: Pick<User, 'role' | 'tst'>): UserType => (user.role === 'viewer' && user.tst ? 'tst' : user.role);
/** O que gravar para dar à pessoa um tipo: o papel e a marca de TST. */
export const typeToProfile = (type: UserType): { role: User['role']; tst: boolean } =>
  type === 'tst' ? { role: 'viewer', tst: true } : { role: type, tst: false };

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
      if (filter.role && userType(user) !== filter.role) return false;
      if (filter.workId === NO_WORK ? user.workIds.length > 0 : filter.workId && !user.workIds.includes(filter.workId)) return false;
      return matchesUser(user, emails[user.id], filter.query);
    })
    .sort((a, b) =>
      sort.key === 'role'
        ? sign * (USER_TYPE_ORDER.indexOf(userType(a)) - USER_TYPE_ORDER.indexOf(userType(b))) || byName(a, b)
        : sign * byName(a, b) || a.id.localeCompare(b.id),
    );
}

/** Clicar na coluna já ordenada inverte o sentido; outra coluna começa crescente. */
export const nextUserSort = (current: UserSort, key: UserSortKey): UserSort =>
  current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };

export const isFiltered = (filter: UserFilter) => !!(filter.query.trim() || filter.role || filter.workId);

/** Colunas de obra em ordem alfabética, como a lista de obras. */
export const worksByName = (works: readonly Work[]) => [...works].sort(byName);

/** O que o lote de acessos leva, por extenso (12/11/2026): "Mozine", "Mozine e Curto prazo", "Atmos, Mozine e
 * Curto prazo"; de quatro itens em diante, só a contagem por campo ("5 obras e 2 módulos"). */
export function bulkTargetsLabel(workNames: readonly string[], moduleNames: readonly string[]): string {
  const names = [...workNames, ...moduleNames];
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  return [
    workNames.length ? count(workNames.length, 'obra', 'obras') : '',
    moduleNames.length ? count(moduleNames.length, 'módulo', 'módulos') : '',
  ]
    .filter(Boolean)
    .join(' e ');
}
