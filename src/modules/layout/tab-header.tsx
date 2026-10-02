'use client';
import type { ReactNode } from 'react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { WORK_TABS } from '@/modules/layout/work-nav';
import { HelpNote } from '@/modules/layout/help-note';

type Section = (typeof WORK_TABS)[number]['section'];

/** Cabeçalho comum às quatro abas: número, código da obra, título, uma linha do que a aba responde e,
 * quando houver, a ajuda "Como funciona" com a explicação longa. `children` são as ações e os
 * alternadores da aba, à direita. */
export function TabHeader({
  workId,
  section,
  description,
  help,
  helpTitle,
  children,
}: {
  workId: string;
  section: Section;
  description?: ReactNode;
  help?: ReactNode;
  helpTitle?: string;
  children?: ReactNode;
}) {
  const context = usePlanning();
  const index = WORK_TABS.findIndex(tab => tab.section === section);
  const tab = WORK_TABS[index];
  const work = context.state === 'ready' ? context.planning.data.works.find(w => w.id === workId) : undefined;
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">
          Aba {index + 1}
          {work ? ` · ${work.code} · ${work.name}` : ''}
        </p>
        <h1 className="page-title">{tab.label}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-slate-500">{description ?? tab.hint}</p>
          {help && (
            <HelpNote title={helpTitle ?? `Como funciona: ${tab.label.toLowerCase()}`} compact>
              {help}
            </HelpNote>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
