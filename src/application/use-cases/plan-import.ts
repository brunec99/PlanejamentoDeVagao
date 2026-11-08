import type { LinkType, PlanDependency, PlanTask, Team } from '../../domain/entities';
import { scheduleTasks, type TaskDuration, type WorkCalendar } from '../../domain/plan-schedule';
import type { Command, ImportedPlanResource } from './commands';

/** Entre o arquivo lido (`src/domain/mspdi-import.ts`) e o comando `import_plan` (08/11/2026): a
 * sugestão de equipe para cada recurso do Project, a montagem do comando e a comparação entre as datas
 * que o Project mostra e as que o motor do sistema calcula. A tela de importação e o script da carga
 * (`scripts/import-medio-prazo.ts`) usam as mesmas funções. */

/** O mínimo do rascunho da importação de que estas funções precisam. */
export interface ImportDraftLike {
  name: string;
  calendar: WorkCalendar;
  tasks: {
    key: string;
    name: string;
    level: number;
    duration?: TaskDuration;
    plannedStart: string;
    plannedEnd: string;
    actualStart?: string;
    actualEnd?: string;
    progress: number;
    constraintType?: PlanTask['constraintType'];
    constraintDate?: string;
    deadline?: string;
    notes?: string;
    resourceName?: string;
  }[];
  links: { predecessorKey: string; successorKey: string; type: LinkType; lagDays: number; lagBusiness: boolean }[];
  baseline?: Record<string, { start: string; end: string }>;
  fileDates: Record<string, { start: string; end: string }>;
  resources: { name: string; taskCount: number }[];
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Destino de um recurso: equipe existente, equipe nova ou nenhum (as tarefas ficam sem recurso). */
export type ResourceChoice =
  | { name: string; taskCount: number; kind: 'team'; teamId: string }
  | { name: string; taskCount: number; kind: 'create'; teamName: string; company: string }
  | { name: string; taskCount: number; kind: 'none' };

/** Regra 3 do modelo aprovado: liga à equipe da obra quando o nome bate, sem diferenciar acento e
 * maiúscula, também no formato "EMPRESA - NOME" (e "EMPRESA - NOME" casa com a equipe NOME da empresa
 * que começa por EMPRESA, como "ATR - Adenir" com "adenir · ATR OBRA"). Mais de uma equipe candidata
 * não é escolha automática. Sem candidata, cria a equipe com o nome do Project e a empresa antes do
 * " - " (o nome inteiro, se não houver); a empresa que já existe na obra mantém a grafia de lá. */
export function suggestResourceChoices(resources: { name: string; taskCount: number }[], teams: Team[]): ResourceChoice[] {
  const companies = new Map<string, string>();
  for (const team of teams) if (!companies.has(fold(team.company))) companies.set(fold(team.company), team.company.trim());
  return resources.map(({ name, taskCount }) => {
    const target = fold(name);
    let candidates = teams.filter(t => fold(t.name) === target || fold(`${t.company} - ${t.name}`) === target);
    const dash = name.indexOf(' - ');
    if (!candidates.length && dash > 0) {
      const company = fold(name.slice(0, dash)),
        person = fold(name.slice(dash + 3));
      candidates = teams.filter(t => fold(t.name) === person && fold(t.company).startsWith(company));
    }
    if (candidates.length === 1) return { name, taskCount, kind: 'team', teamId: candidates[0].id };
    const company = (dash > 0 ? name.slice(0, dash) : name).trim();
    return { name, taskCount, kind: 'create', teamName: name.trim(), company: companies.get(fold(company)) ?? company };
  });
}

/** O comando `import_plan` a partir do rascunho e das escolhas de recurso da conferência. */
export function toImportCommand(
  draft: ImportDraftLike,
  choices: ResourceChoice[],
  options: { workId: string; month: string; fileName: string; name?: string; baselineName?: string },
): Extract<Command, { type: 'import_plan' }> {
  const resources: ImportedPlanResource[] = choices.map(choice =>
    choice.kind === 'team'
      ? { name: choice.name, teamId: choice.teamId }
      : choice.kind === 'create'
        ? { name: choice.name, create: { name: choice.teamName, company: choice.company } }
        : { name: choice.name },
  );
  return {
    type: 'import_plan',
    workId: options.workId,
    month: options.month,
    name: options.name?.trim() || draft.name,
    fileName: options.fileName,
    calendar: draft.calendar,
    tasks: draft.tasks.map(t => ({
      key: t.key,
      name: t.name,
      level: t.level,
      duration: t.duration,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      progress: t.progress,
      constraintType: t.constraintType,
      constraintDate: t.constraintDate,
      deadline: t.deadline,
      notes: t.notes,
      resource: t.resourceName,
      baseline: draft.baseline?.[t.key],
    })),
    links: draft.links.map(l => ({ ...l })),
    resources,
    baselineName: options.baselineName,
  };
}

/** Linha em que a data do sistema difere da que o Project mostra. `row` é a posição na tabela (o Id). */
export interface DateDifference {
  key: string;
  row: number;
  name: string;
  project: { start: string; end: string };
  system: { start: string; end: string };
}

/** As datas que o motor calcula para o rascunho, pela mesma função que o servidor usa ao gravar, e as
 * linhas em que elas diferem do arquivo. Só folhas: o resumo é o envelope delas. */
export function compareWithProject(draft: ImportDraftLike): { differences: DateDifference[]; compared: number } {
  const stamp = '1970-01-01T00:00:00Z';
  const tasks: PlanTask[] = draft.tasks.map((t, index) => ({
    id: t.key,
    createdAt: stamp,
    updatedAt: stamp,
    planId: 'importacao',
    name: t.name,
    level: t.level,
    order: index + 1,
    duration: t.duration,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    actualStart: t.actualStart,
    actualEnd: t.actualEnd,
    progress: t.progress,
    constraintType: t.constraintType,
    constraintDate: t.constraintDate,
    deadline: t.deadline,
  }));
  const links: PlanDependency[] = draft.links.map((l, index) => ({
    id: `v${index}`,
    createdAt: stamp,
    updatedAt: stamp,
    predecessorId: l.predecessorKey,
    successorId: l.successorKey,
    type: l.type,
    lagDays: l.lagDays,
    lagBusiness: l.lagBusiness,
  }));
  const scheduled = new Map(scheduleTasks(tasks, links, draft.calendar).map(t => [t.id, t]));
  const differences: DateDifference[] = [];
  let compared = 0;
  draft.tasks.forEach((t, index) => {
    const summary = (draft.tasks[index + 1]?.level ?? -1) > t.level;
    const file = draft.fileDates[t.key],
      system = scheduled.get(t.key);
    if (summary || !file || !system) return;
    compared++;
    if (file.start !== system.plannedStart || file.end !== system.plannedEnd)
      differences.push({
        key: t.key,
        row: index + 1,
        name: t.name,
        project: file,
        system: { start: system.plannedStart, end: system.plannedEnd },
      });
  });
  return { differences, compared };
}
