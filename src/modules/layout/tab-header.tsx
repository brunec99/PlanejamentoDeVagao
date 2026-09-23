'use client';
import type { ReactNode } from 'react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { WORK_TABS } from '@/modules/layout/work-nav';

type Section = (typeof WORK_TABS)[number]['section'];

/** Cabeçalho comum às seis abas: número, código da obra, título e o que a aba responde. */
export function TabHeader({ workId, section, description, children }: { workId: string; section: Section; description?: ReactNode; children?: ReactNode }) {
  const context = usePlanning();
  const index = WORK_TABS.findIndex(tab => tab.section === section);
  const tab = WORK_TABS[index];
  const work = context.state === 'ready' ? context.planning.data.works.find(w => w.id === workId) : undefined;
  return <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p className="eyebrow">Aba {index + 1}{work ? ` · ${work.code} · ${work.name}` : ''}</p>
      <h1 className="page-title">{tab.label}</h1>
      <p className="mt-1 text-sm text-slate-500">{description ?? tab.hint}</p>
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>;
}
