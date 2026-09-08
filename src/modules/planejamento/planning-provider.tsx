'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getPlanning, type Planning } from '@/application/use-cases/get-planning';
import { applyCommand, type Command } from '@/application/use-cases/commands';
import { MockPlanningRepository } from '@/infrastructure/repositories/mock/planning-repository';
import { DEMO_DATE } from '@/mocks/planning';
type PlanningState = { state: 'loading' } | { state: 'error' } | { state: 'ready'; planning: Planning; actorId: string; setActorId: (id: string) => void; execute: (command: Command) => Promise<string> };
const Context = createContext<PlanningState>({ state: 'loading' });
export function PlanningProvider({ children }: { children: ReactNode }) {
  const repository = useRef<MockPlanningRepository | null>(null);
  const [planning, setPlanning] = useState<Planning>();
  const [error, setError] = useState(false);
  const [actorId, setActorId] = useState('user-1');
  useEffect(() => {
    let active = true;
    repository.current ??= new MockPlanningRepository();
    getPlanning(repository.current, DEMO_DATE).then(result => { if (active) setPlanning(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const execute = async (command: Command) => {
    if (!repository.current) throw new Error('Aguarde o carregamento.');
    const id = await repository.current.transaction(draft => applyCommand(draft, command, { actorId, today: DEMO_DATE, now: `${DEMO_DATE}T${new Date().toISOString().slice(11)}`, newId: () => crypto.randomUUID() }));
    setPlanning(await getPlanning(repository.current, DEMO_DATE));
    return id;
  };
  const value: PlanningState = error ? { state: 'error' } : planning ? { state: 'ready', planning, actorId, setActorId, execute } : { state: 'loading' };
  return <Context.Provider value={value}>{planning && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm"><p>Ambiente de validação · alterações em memória até atualizar a página.</p><label className="flex items-center gap-2">Perfil simulado<select className="field w-auto" value={actorId} onChange={e => setActorId(e.target.value)}>{planning.data.users.map(u => <option key={u.id} value={u.id}>{u.name} · {{manager:'Gestor',planner:'Planejador',viewer:'Consulta'}[u.role]}</option>)}</select></label></div>}{children}</Context.Provider>;
}
export function usePlanning() { return useContext(Context); }
