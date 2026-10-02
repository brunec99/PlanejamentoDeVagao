'use client';
import { useRouter } from 'next/navigation';
import { usePlanning } from './planning-provider';
import { CommandForm, Field, Responsible, TextField, number, value } from './forms';
import { wagonPath } from '@/shared/format';
import { actsAsManager } from '@/domain/rules';

/** Cadastro de obra, só para quem age como gestor (gestor ou admin, `actsAsManager`). Ao salvar,
 * abre a obra nova na aba de vagões. */
export function WorkActions() {
  const router = useRouter();
  const c = usePlanning();
  if (c.state !== 'ready' || !actsAsManager(c.planning.data.users.find(u => u.id === c.actorId)?.role)) return null;
  return (
    <div className="mt-6">
      <CommandForm
        title="Cadastrar obra"
        success="Obra cadastrada."
        command={d => ({ type: 'create_work', name: value(d, 'name'), code: value(d, 'code') })}
        onDone={id => router.push(`/obras/${id}/vagoes`)}
      >
        <TextField name="name" label="Nome da obra" />
        <TextField name="code" label="Código" />
      </CommandForm>
    </div>
  );
}

/** Barra de ações da lista de vagões; cada botão abre uma gaveta. Sem sequência, criar uma é o
 * passo que falta e leva o destaque; com sequência, o destaque vai para o vagão. O perfil de
 * consulta não tem ação e a barra não aparece. */
export function PlanningActions({ workId }: { workId: string }) {
  const context = usePlanning();
  const router = useRouter();
  if (context.state !== 'ready') return null;
  const { data } = context.planning;
  if (data.users.find(u => u.id === context.actorId)?.role === 'viewer') return null;
  const sequences = data.sequences.filter(s => s.workId === workId);
  const sequenceIds = new Set(sequences.map(s => s.id));
  /** Só o último vagão de cada sequência pode ser o antecessor de um vagão novo. */
  const tails = data.wagons.filter(w => sequenceIds.has(w.sequenceId) && !data.wagons.some(n => n.predecessorId === w.id));
  const noSequence = sequences.length === 0;
  return (
    <div role="toolbar" aria-label="Ações do planejamento" className="flex flex-wrap items-center gap-2">
      <CommandForm
        title="Criar sequência"
        description="Sequência temporal de produção: o takt padrão e o calendário valem para os vagões dela."
        tone={noSequence ? 'primary' : 'ghost'}
        success="Sequência criada."
        command={d => ({
          type: 'create_sequence',
          workId,
          name: value(d, 'name'),
          taktDays: number(d, 'taktDays'),
          calendar: value(d, 'calendar') as 'calendar_days' | 'business_days',
        })}
      >
        <TextField name="name" label="Nome da sequência" />
        <TextField name="taktDays" label="Takt padrão (dias)" type="number" min={1} max={365} defaultValue={5} />
        <Field label="Calendário">
          <select name="calendar" className="field">
            <option value="calendar_days">Dias corridos</option>
            <option value="business_days">Dias úteis (segunda a sexta)</option>
          </select>
        </Field>
      </CommandForm>

      <CommandForm
        title="Criar vagão"
        description="Um período de takt dentro de uma sequência. Ao salvar, o detalhe do vagão abre."
        tone={noSequence ? 'ghost' : 'primary'}
        success="Vagão criado."
        command={d => ({
          type: 'create_wagon',
          sequenceId: value(d, 'sequenceId'),
          number: number(d, 'number'),
          predecessorId: value(d, 'predecessorId') || undefined,
          plannedStart: value(d, 'plannedStart'),
          plannedEnd: value(d, 'plannedEnd'),
          responsibleId: value(d, 'responsibleId'),
        })}
        onDone={id => router.push(wagonPath(workId, id))}
      >
        <Field label="Sequência">
          <select className="field" name="sequenceId" required>
            <option value="">Selecione</option>
            {sequences.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <TextField name="number" label="Número do vagão" type="number" min={1} />
        <Field label="Vagão anterior">
          <select className="field" name="predecessorId">
            <option value="">Primeiro da sequência</option>
            {tails.map(w => (
              <option key={w.id} value={w.id}>
                Vagão {w.number} · {sequences.find(s => s.id === w.sequenceId)?.name}
              </option>
            ))}
          </select>
        </Field>
        <TextField name="plannedStart" label="Marco inicial" type="date" />
        <TextField name="plannedEnd" label="Marco final previsto" type="date" />
        <Responsible workId={workId} />
      </CommandForm>

      <CommandForm
        title="Cadastrar local"
        description="Pavimento, zona ou frente. Os locais pertencem às atividades, não aos vagões."
        success="Local cadastrado."
        command={d => ({ type: 'create_location', workId, name: value(d, 'name') })}
      >
        <TextField name="name" label="Nome do local / zona" />
      </CommandForm>
    </div>
  );
}
