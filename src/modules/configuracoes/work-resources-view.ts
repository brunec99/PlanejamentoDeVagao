import type { Team } from '@/domain/entities';
import { compareText, textKey } from '@/modules/curto-prazo/sheet-view';

type TeamLike = Pick<Team, 'id' | 'company' | 'name' | 'weeklyCapacity'>;

/** Um empreiteiro da obra com suas equipes. A chave ignora acento, caixa e espaço repetido, como o
 * curto prazo faz com o fornecedor, então "Hidrotec " e "HIDROTEC" caem no mesmo empreiteiro. A
 * chave vazia é a empresa não informada. */
export interface CompanyGroup<T extends TeamLike = Team> {
  key: string;
  /** Grafia exibida: a mais usada entre as equipes; em empate, a da primeira equipe em ordem alfabética. */
  company: string;
  /** Grafias distintas do mesmo empreiteiro, para o cadastro apontar o que unificar. */
  spellings: string[];
  /** Em ordem alfabética pelo nome. */
  teams: T[];
  /** Soma das capacidades semanais. */
  capacity: number;
  /** Soma dos vínculos no planejamento. */
  usage: number;
}

/** Agrupa as equipes por empreiteiro, em ordem alfabética, com a empresa não informada por último. */
export function groupTeamsByCompany<T extends TeamLike>(teams: T[], usageOf: (teamId: string) => number = () => 0): CompanyGroup<T>[] {
  const groups = new Map<string, CompanyGroup<T>>();
  const counts = new Map<string, Map<string, number>>();
  // Ordenar pela chave, e não pela grafia, faz o nome da equipe decidir o empate entre grafias.
  for (const team of [...teams].sort((a, b) => compareText(textKey(a.company), textKey(b.company)) || compareText(a.name, b.name))) {
    const key = textKey(team.company);
    const spelling = team.company.trim();
    const group = groups.get(key) ?? { key, company: spelling, spellings: [], teams: [], capacity: 0, usage: 0 };
    const seen = counts.get(key) ?? new Map<string, number>();
    seen.set(spelling, (seen.get(spelling) ?? 0) + 1);
    if (seen.get(spelling)! > (seen.get(group.company) ?? 0)) group.company = spelling;
    if (!group.spellings.includes(spelling)) group.spellings.push(spelling);
    group.teams.push(team);
    group.capacity += team.weeklyCapacity;
    group.usage += usageOf(team.id);
    groups.set(key, group);
    counts.set(key, seen);
  }
  return [...groups.values()].sort((a, b) =>
    (a.key === '') !== (b.key === '') ? (a.key === '' ? 1 : -1) : compareText(a.company, b.company),
  );
}

export interface CompanyHit<T extends TeamLike = Team> {
  group: CompanyGroup<T>;
  /** As equipes a listar: todas quando a busca bate no empreiteiro, só as que batem quando bate no nome da equipe. */
  teams: T[];
  /** A busca só bateu em equipes; a linha abre sozinha para mostrá-las. */
  byTeam: boolean;
}

/** Busca por empreiteiro ou equipe, sem acento nem caixa. Sem texto, devolve todos os grupos. */
export function searchCompanies<T extends TeamLike>(groups: CompanyGroup<T>[], query: string): CompanyHit<T>[] {
  const needle = textKey(query);
  if (!needle) return groups.map(group => ({ group, teams: group.teams, byTeam: false }));
  const hits: CompanyHit<T>[] = [];
  for (const group of groups) {
    if (group.key.includes(needle)) {
      hits.push({ group, teams: group.teams, byTeam: false });
      continue;
    }
    const teams = group.teams.filter(team => textKey(team.name).includes(needle));
    if (teams.length) hits.push({ group, teams, byTeam: true });
  }
  return hits;
}

/** Capacidade digitada na linha da equipe: só inteiro positivo vale, como o comando exige. */
export function parseCapacity(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
