'use client';
import { useRouter } from 'next/navigation';
import { usePlanning } from './planning-provider';
import { CommandForm, Field, Responsible, TextField, number, value } from './forms';
import { wagonPath } from '@/shared/format';
export function WorkActions() {
  const router = useRouter(); const c = usePlanning(); if (c.state !== 'ready' || c.planning.data.users.find(u => u.id === c.actorId)?.role !== 'manager') return null;
  return <div className="mt-6"><CommandForm title="Cadastrar obra" command={d => ({ type:'create_work', name:value(d,'name'), code:value(d,'code') })} onDone={id => router.push(`/obras/${id}/planejamento`)}><TextField name="name" label="Nome da obra"/><TextField name="code" label="Código"/></CommandForm></div>;
}
export function PlanningActions({ workId }: { workId: string }) {
  const context = usePlanning(); const router = useRouter();
  if (context.state !== 'ready') return null;
  const { data } = context.planning;
  const sequences = data.sequences.filter(s => s.workId === workId);
  return <div className="mb-6 grid items-start gap-4 lg:grid-cols-3"><CommandForm title="Criar sequência temporal" command={d => ({ type:'create_sequence',workId,name:value(d,'name'),taktDays:number(d,'taktDays'),calendar:value(d,'calendar') as 'calendar_days'|'business_days' })}><TextField name="name" label="Nome da sequência"/><TextField name="taktDays" label="Takt padrão (dias)" type="number" min={1} max={365} defaultValue={5}/><Field label="Calendário"><select name="calendar" className="field"><option value="calendar_days">Dias corridos</option><option value="business_days">Dias úteis (segunda a sexta)</option></select></Field></CommandForm>
  <CommandForm title="Criar vagão" command={d => ({type:'create_wagon',sequenceId:value(d,'sequenceId'),number:number(d,'number'),predecessorId:value(d,'predecessorId') || undefined,plannedStart:value(d,'plannedStart'),plannedEnd:value(d,'plannedEnd'),responsibleId:value(d,'responsibleId')})} onDone={id => router.push(wagonPath(workId,id))}><Field label="Sequência"><select className="field" name="sequenceId" required><option value="">Selecione</option>{sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field><TextField name="number" label="Número do vagão" type="number" min={1}/><Field label="Vagão anterior"><select className="field" name="predecessorId"><option value="">Primeiro da sequência</option>{data.wagons.filter(w => sequences.some(s => s.id === w.sequenceId) && !data.wagons.some(n => n.predecessorId === w.id)).map(w => <option key={w.id} value={w.id}>Vagão {w.number} · {sequences.find(s => s.id === w.sequenceId)?.name}</option>)}</select></Field><TextField name="plannedStart" label="Marco inicial" type="date"/><TextField name="plannedEnd" label="Marco final previsto" type="date"/><Responsible workId={workId}/></CommandForm>
  <CommandForm title="Cadastrar local de atividade" command={d => ({type:'create_location',workId,name:value(d,'name')})}><TextField name="name" label="Nome do local / zona"/></CommandForm></div>;
}
