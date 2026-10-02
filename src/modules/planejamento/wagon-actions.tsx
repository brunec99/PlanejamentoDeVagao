'use client';
import type { Activity } from '@/domain/entities';
import { assessRelease } from '@/application/use-cases/commands';
import { formatDate } from '@/shared/format';
import { usePlanning } from './planning-provider';
import { Check, CommandForm, Field, Reason, Responsible, TextField, checked, number, value } from './forms';

/** Lê os campos comuns de uma atividade. Criar e atualizar usam a mesma leitura, para os dois
 * comandos aceitarem exatamente o mesmo conjunto de campos. */
const activityInput = (d: FormData) => ({
  name: value(d, 'name'),
  locationId: value(d, 'locationId'),
  responsibleId: value(d, 'responsibleId'),
  plannedStart: value(d, 'plannedStart'),
  plannedEnd: value(d, 'plannedEnd'),
  weight: number(d, 'weight'),
  mandatory: checked(d, 'mandatory'),
});

/** Campos de uma atividade. As datas ficam presas ao período do vagão (`min`/`max`): a atividade
 * precisa caber inteira nele, e o domínio recusa o que escapar. */
function ActivityFields({ workId, start, end, activity }: { workId: string; start: string; end: string; activity?: Activity }) {
  const c = usePlanning();
  if (c.state !== 'ready') return null;
  const locations = c.planning.data.locations.filter(l => l.workId === workId);
  return (
    <>
      <TextField name="name" label="Atividade" defaultValue={activity?.name} />
      <Field label="Local da atividade">
        <select name="locationId" className="field" required defaultValue={activity?.locationId}>
          <option value="">Selecione</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Responsible workId={workId} defaultValue={activity?.responsibleId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          name="plannedStart"
          label="Início previsto"
          type="date"
          defaultValue={activity?.plannedStart ?? start}
          min={start}
          max={end}
        />
        <TextField
          name="plannedEnd"
          label="Término previsto"
          type="date"
          defaultValue={activity?.plannedEnd ?? end}
          min={start}
          max={end}
        />
      </div>
      <TextField name="weight" label="Peso no progresso" type="number" min={0.01} step="any" defaultValue={activity?.weight ?? 1} />
      <Check name="mandatory" label="Obrigatória para terminalidade" defaultChecked={activity?.mandatory ?? true} />
      <Reason />
    </>
  );
}

/** Botão "Editar" de uma linha da tabela de atividades. Abre a gaveta com todos os campos da
 * atividade, progresso e status incluídos; o nome da atividade vai no texto só para leitor de
 * tela, para cada "Editar" da tabela ser distinguível. */
export function ActivityEditor({ workId, activity }: { workId: string; activity: Activity }) {
  const c = usePlanning();
  if (c.state !== 'ready') return null;
  const wagon = c.planning.data.wagons.find(w => w.id === activity.wagonId)!;
  return (
    <CommandForm
      title="Atualizar atividade"
      description={activity.name}
      trigger={
        <>
          Editar<span className="sr-only"> {activity.name}</span>
        </>
      }
      tone="link"
      icon="none"
      success="Atividade atualizada."
      command={d => ({
        type: 'update_activity',
        activityId: activity.id,
        activity: activityInput(d),
        progress: number(d, 'progress'),
        status: value(d, 'status') as Activity['status'],
        reason: value(d, 'reason'),
      })}
    >
      <ActivityFields workId={workId} start={wagon.plannedStart} end={wagon.plannedEnd} activity={activity} />
      <TextField name="progress" label="Progresso (%)" type="number" min={0} max={100} step="any" defaultValue={activity.progress} />
      <Field label="Status">
        <select className="field" name="status" defaultValue={activity.status}>
          <option value="not_started">Não iniciada</option>
          <option value="in_progress">Em andamento</option>
          <option value="completed">Concluída</option>
        </select>
      </Field>
    </CommandForm>
  );
}

/** Barra de ações do vagão. Cada botão abre uma gaveta com o formulário, em vez de cinco caixas
 * recolhidas empilhadas na tela. O perfil de consulta não tem ação nenhuma, então a barra não
 * aparece (o tour pula o passo quando não encontra o alvo). */
export function WagonActions({ workId, wagonId }: { workId: string; wagonId: string }) {
  const c = usePlanning();
  if (c.state !== 'ready') return null;
  const { data } = c.planning;
  if (data.users.find(u => u.id === c.actorId)?.role === 'viewer') return null;
  const wagon = data.wagons.find(w => w.id === wagonId)!;
  const activities = data.activities.filter(a => a.wagonId === wagonId);
  const released = data.releases.some(r => r.wagonId === wagonId);
  const period = `${formatDate(wagon.plannedStart)} a ${formatDate(wagon.plannedEnd)}`;
  /** Pendência e restrição podem apontar para uma atividade ou valer para o vagão inteiro. */
  const selectActivity = (
    <Field label="Atividade vinculada">
      <select className="field" name="activityId">
        <option value="">Todo o vagão</option>
        {activities.map(a => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <div role="toolbar" aria-label="Ações do vagão" data-tour="vagao-actions" className="flex flex-wrap items-center gap-2">
      <CommandForm
        title="Adicionar atividade"
        description={`A atividade precisa caber no período do vagão, ${period}.`}
        tone="primary"
        success="Atividade adicionada."
        command={d => ({ type: 'create_activity', wagonId, activity: activityInput(d), reason: value(d, 'reason') })}
      >
        <ActivityFields workId={workId} start={wagon.plannedStart} end={wagon.plannedEnd} />
      </CommandForm>

      <CommandForm
        title="Critério de terminalidade"
        description="Condição de aceite ligada a uma atividade deste vagão. Os obrigatórios precisam ser confirmados para o vagão virar terminal."
        success="Critério adicionado."
        command={d => ({
          type: 'create_criterion',
          activityId: value(d, 'activityId'),
          description: value(d, 'description'),
          mandatory: checked(d, 'mandatory'),
          reason: value(d, 'reason'),
        })}
      >
        <Field label="Atividade">
          <select className="field" name="activityId" required>
            <option value="">Selecione</option>
            {activities.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <TextField name="description" label="Critério de aceite" />
        <Check name="mandatory" label="Obrigatório" defaultChecked />
        <Reason />
      </CommandForm>

      <CommandForm
        title="Pendência"
        description="Item em aberto deste período. Enquanto bloquear a terminalidade, o vagão não vira terminal."
        success="Pendência registrada."
        command={d => ({
          type: 'create_pending',
          wagonId,
          activityId: value(d, 'activityId') || undefined,
          description: value(d, 'description'),
          responsibleId: value(d, 'responsibleId'),
          dueDate: value(d, 'dueDate'),
          blocksTerminality: checked(d, 'blocksTerminality'),
          reason: value(d, 'reason'),
        })}
      >
        <TextField name="description" label="Pendência" />
        {selectActivity}
        <Responsible workId={workId} />
        <TextField name="dueDate" label="Prazo" type="date" />
        <Check name="blocksTerminality" label="Bloqueia terminalidade" defaultChecked />
        <Reason />
      </CommandForm>

      <CommandForm
        title="Restrição"
        description="Pode bloquear a execução, a terminalidade ou ambas. Restrição impeditiva não é contornada por liberação excepcional."
        success="Restrição registrada."
        command={d => ({
          type: 'create_restriction',
          wagonId,
          activityId: value(d, 'activityId') || undefined,
          description: value(d, 'description'),
          responsibleId: value(d, 'responsibleId'),
          dueDate: value(d, 'dueDate'),
          blocksTerminality: checked(d, 'blocksTerminality'),
          blocksExecution: checked(d, 'blocksExecution'),
          reason: value(d, 'reason'),
        })}
      >
        <TextField name="description" label="Restrição" />
        {selectActivity}
        <Responsible workId={workId} />
        <TextField name="dueDate" label="Prazo" type="date" />
        <Check name="blocksTerminality" label="Bloqueia terminalidade" defaultChecked />
        <Check name="blocksExecution" label="Bloqueia execução" defaultChecked />
        <Reason />
      </CommandForm>

      {/* Vagão liberado não muda de período nesta versão: a ação some em vez de falhar no servidor. */}
      {!released && (
        <CommandForm
          title="Editar período"
          description="Marcos e responsável do vagão. Depois da liberação, o período não muda."
          icon="none"
          success="Período atualizado."
          command={d => ({
            type: 'edit_wagon',
            wagonId,
            plannedStart: value(d, 'plannedStart'),
            plannedEnd: value(d, 'plannedEnd'),
            responsibleId: value(d, 'responsibleId'),
          })}
        >
          <TextField name="plannedStart" label="Marco inicial" type="date" defaultValue={wagon.plannedStart} />
          <TextField name="plannedEnd" label="Marco final" type="date" defaultValue={wagon.plannedEnd} />
          <Responsible workId={workId} defaultValue={wagon.responsibleIds[0]} />
        </CommandForm>
      )}
    </div>
  );
}

const MODE_LABELS = { initial: 'inicial', normal: 'normal', exceptional: 'excepcional' } as const;

/** Liberação do vagão. A avaliação fica sempre visível — restrições impeditivas, condições do
 * antecessor sem pendência registrada e pendências que a liberação excepcional vai aceitar —,
 * porque é ela que diz qual tipo de liberação cabe. Só o formulário vai para a gaveta. */
export function ReleaseForm({ workId, wagonId }: { workId: string; wagonId: string }) {
  const c = usePlanning();
  if (c.state !== 'ready') return null;
  const { data } = c.planning;
  const assessment = assessRelease(data, wagonId);
  if (data.releases.some(r => r.wagonId === wagonId)) return null;
  const mode = !assessment.previous ? 'initial' : assessment.normal ? 'normal' : 'exceptional';
  return (
    <div className="mt-4 space-y-3">
      {assessment.restrictions.length > 0 && (
        <p className="text-sm font-medium text-danger">
          Restrições impeditivas: {assessment.restrictions.map(r => r.description).join('; ')}.
        </p>
      )}
      {assessment.uncovered.length > 0 && (
        <p className="text-sm font-medium text-warning">Condições ainda sem pendência registrada: {assessment.uncovered.join('; ')}.</p>
      )}
      {assessment.pending.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-600">
          {assessment.pending.map(p => (
            <li key={p.id}>Pendência a aceitar: {p.description}</li>
          ))}
        </ul>
      )}
      <CommandForm
        title={`Liberar vagão (${MODE_LABELS[mode]})`}
        tone="primary"
        icon="none"
        submit="Registrar liberação"
        success="Liberação registrada."
        command={d => ({
          type: 'release',
          wagonId,
          mode,
          justification: value(d, 'justification'),
          responsibleId: value(d, 'responsibleId'),
          dueDate: value(d, 'dueDate'),
        })}
      >
        {mode === 'exceptional' ? (
          <>
            <TextField name="justification" label="Justificativa da liberação excepcional" />
            <Responsible workId={workId} />
            <TextField name="dueDate" label="Prazo futuro de regularização" type="date" />
            <p className="text-sm text-slate-600">
              Todas as pendências listadas serão registradas nesta autorização. Dívidas anteriores preservam o prazo originalmente assumido.
            </p>
          </>
        ) : (
          <p className="text-sm">A liberação será registrada em seu nome.</p>
        )}
      </CommandForm>
    </div>
  );
}

/** Confirmar ou reabrir um critério. Reabrir pede justificativa, porque pode tirar a
 * terminalidade de um vagão já usado como base para liberar o seguinte. */
export function CriterionAction({ id, fulfilled }: { id: string; fulfilled: boolean }) {
  return (
    <CommandForm
      title={fulfilled ? 'Reabrir critério' : 'Confirmar critério'}
      tone="link"
      icon="none"
      success={fulfilled ? 'Critério reaberto.' : 'Critério confirmado.'}
      command={d => ({ type: 'set_criterion', criterionId: id, fulfilled: !fulfilled, reason: value(d, 'reason') })}
    >
      {fulfilled ? <Reason /> : <p className="text-sm">Confirme que o critério foi atendido.</p>}
    </CommandForm>
  );
}

/** Resolver uma pendência ou uma restrição. Resolver a pendência de origem encerra a dívida de
 * terminalidade que ela gerou, sem apagar o registro. */
export function ResolveAction({ id, kind }: { id: string; kind: 'pending' | 'restriction' }) {
  return (
    <CommandForm
      title="Registrar resolução"
      tone="link"
      icon="none"
      success="Resolução registrada."
      command={d =>
        kind === 'pending'
          ? { type: 'resolve_pending', pendingId: id, resolution: value(d, 'resolution') }
          : { type: 'resolve_restriction', restrictionId: id, resolution: value(d, 'resolution') }
      }
    >
      <TextField name="resolution" label="Como foi resolvido?" />
    </CommandForm>
  );
}
