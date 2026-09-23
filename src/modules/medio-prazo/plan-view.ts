import type { LinkType, PlanTask } from '@/domain/entities';

export type PlanRowFilter = 'all' | 'incomplete' | 'conflicts';

interface PlanRowOptions {
  query: string;
  filter: PlanRowFilter;
  conflictTaskIds: ReadonlySet<string>;
  folded: ReadonlySet<string>;
}

const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Recebe a ordem integral do plano. A busca muda somente a leitura: não renumera,
 * reordena nem altera tarefas. Os ancestrais contextualizam os resultados mesmo
 * quando estavam recolhidos; ao limpar a busca, a preferência volta a valer. */
export function filterPlanRows(tasks: PlanTask[], { query, filter, conflictTaskIds, folded }: PlanRowOptions): PlanTask[] {
  const tokens = normalized(query).trim().split(/\s+/).filter(Boolean);
  const filtering = tokens.length > 0 || filter !== 'all';
  const ancestors: number[] = [];
  const included = new Set<number>();

  tasks.forEach((task, index) => {
    while (ancestors.length && tasks[ancestors.at(-1)!].level >= task.level) ancestors.pop();

    if (!filtering) {
      if (!ancestors.some(parent => folded.has(tasks[parent].id))) included.add(index);
    } else {
      const summary = !!tasks[index + 1] && tasks[index + 1].level > task.level;
      const matchesFilter = filter === 'all'
        || (filter === 'incomplete' && !summary && task.progress < 100)
        || (filter === 'conflicts' && conflictTaskIds.has(task.id));
      const name = normalized(task.name);
      if (matchesFilter && tokens.every(token => name.includes(token))) {
        included.add(index);
        ancestors.forEach(parent => included.add(parent));
      }
    }

    ancestors.push(index);
  });

  return tasks.filter((_, index) => included.has(index));
}

/** A primeira letra é a ponta da predecessora; a segunda, a da sucessora. */
export function dependencyAnchors(type: LinkType): { from: 'start' | 'end'; to: 'start' | 'end' } {
  return { from: type[0] === 'I' ? 'start' : 'end', to: type[1] === 'I' ? 'start' : 'end' };
}
