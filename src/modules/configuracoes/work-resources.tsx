'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import type { Command } from '@/application/use-cases/commands';
import type { Team } from '@/domain/entities';
import { teamLabel, teamUsage } from '@/domain/resources';
import { useDeveloper, usePlanning } from '@/modules/planejamento/planning-provider';
import { Field } from '@/modules/planejamento/forms';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { Drawer } from '@/modules/layout/drawer';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { workPath } from '@/shared/format';

/** Cabeçalho único da página de configurações da obra. Vive aqui, e não na página, porque o
 * código e o nome da obra vêm do planejamento carregado no cliente; enquanto ele carrega, o
 * esqueleto de `WorkResources` já mostra a forma da tela. */
export function WorkSettingsHeader({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return null;
  const { data } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  const work = data.works.find(w => w.id === workId);
  if (!work || !actor?.workIds.includes(workId)) return null;
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">
          Apoio · {work.code} · {work.name}
        </p>
        <h1 className="page-title">Configurações da obra</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-slate-500">Quem executa nesta obra e qual é a semana 1 do cronograma de curto prazo.</p>
          <HelpNote title="Como funciona: configurações da obra" compact>
            <p>
              <strong>Empreiteiros e equipes</strong> é o cadastro de quem executa. As mesmas equipes aparecem como recurso no cronograma de
              médio prazo e como opção na planilha do curto prazo; a capacidade é o número de atividades que a equipe atende por semana, e é
              ela que sinaliza sobrecarga.
            </p>
            <p>
              <strong>Numeração das semanas</strong> define a semana 1 da obra. É dela que sai o número de cada semana no curto prazo — use
              o mesmo da planilha que a equipe já preenche.
            </p>
            <p>Quem tem perfil de consulta vê as duas seções, mas não edita.</p>
          </HelpNote>
        </div>
      </div>
    </header>
  );
}

export function WorkResources({ workId }: { workId: string }) {
  const context = usePlanning();
  // O médio prazo ainda está em desenvolvimento: fora dele, o uso aparece sem o atalho.
  const developer = useDeveloper();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { data } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  const work = data.works.find(w => w.id === workId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const readOnly = actor.role === 'viewer';
  const teams = data.teams
    .filter(t => t.workId === workId)
    .sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
  const shown = teams.filter(t => normalize(teamLabel(t)).includes(normalize(query.trim())));
  const companies = [...new Set(teams.map(t => t.company).filter(Boolean))];
  const usages = new Map(teams.map(t => [t.id, teamUsage(data, t.id)]));
  const allocated = teams.filter(t => usages.get(t.id)!.total > 0).length;
  const current = teams.find(t => t.id === editing);
  const drawerOpen = (creating || !!current) && !readOnly;

  const close = () => {
    setCreating(false);
    setEditing(undefined);
    setError('');
  };
  const open = (team?: Team) => {
    setCreating(!team);
    setEditing(team?.id);
    setError('');
  };
  const save = async (command: Command, success: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await context.execute(command);
      close();
      toast({ title: success, tone: 'success' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível salvar o recurso.';
      // Com a gaveta aberta o erro fica perto dos campos; na exclusão não há formulário, então vai ao toast.
      if (command.type === 'delete_team') toast({ title: 'Não foi possível excluir a equipe.', description: message, tone: 'danger' });
      else setError(message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (team: Team) => {
    const ok = await confirm({
      title: `Excluir ${teamLabel(team)}?`,
      description: 'A equipe sai do cadastro desta obra. Equipes com vínculos no planejamento não podem ser excluídas.',
      confirmLabel: 'Excluir equipe',
      tone: 'danger',
    });
    if (ok) save({ type: 'delete_team', teamId: team.id }, 'Equipe excluída.');
  };

  return (
    <section className="space-y-4" aria-labelledby="resources-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="resources-title" className="text-base font-bold text-slate-900">
            Empreiteiros e equipes
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-slate-500">Cadastre quem executa; as equipes valem para o médio e o curto prazo.</p>
            <HelpNote title="Como funciona: empreiteiros e equipes" compact>
              <p>
                Cada equipe pertence a um empreiteiro (a empresa) e tem uma capacidade: quantas atividades atende por semana. Use o mesmo
                empreiteiro para cadastrar as diferentes equipes dele.
              </p>
              <p>
                Os vínculos contam onde a equipe aparece: tarefas do médio prazo, linhas da planilha do curto prazo, atividades dos vagões e
                linhas de base. Incluem registros anteriores, então não representam a carga de uma semana.
              </p>
              <p>
                Equipes com vínculos permanecem no cadastro para preservar as referências; a edição mantém os vínculos e não altera o
                fornecedor registrado nos compromissos semanais.
              </p>
            </HelpNote>
          </div>
        </div>
        {!readOnly && (
          <button type="button" className="button" aria-haspopup="dialog" onClick={() => open()} disabled={busy}>
            <Plus size={16} aria-hidden />
            Nova equipe
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Empreiteiros" value={new Set(companies.map(c => normalize(c))).size} />
        <StatCard label="Equipes cadastradas" value={teams.length} />
        <StatCard
          label="Equipes com vínculos"
          value={allocated}
          hint={teams.length ? `${teams.length - allocated} sem vínculo` : undefined}
        />
      </div>

      {!readOnly && (
        <Drawer
          open={drawerOpen}
          onClose={() => {
            if (!busy) close();
          }}
          title={current ? 'Editar equipe' : 'Nova equipe'}
          description={
            current ? 'A edição mantém os vínculos existentes.' : 'Informe o empreiteiro, o nome da equipe e sua capacidade semanal.'
          }
        >
          <ResourceForm
            key={current?.id ?? 'new'}
            team={current}
            companies={companies}
            busy={busy}
            error={error}
            onCancel={close}
            onSave={fields =>
              save(
                current ? { type: 'update_team', teamId: current.id, ...fields } : { type: 'create_team', workId, ...fields },
                current ? 'Equipe atualizada. As alocações foram mantidas.' : 'Equipe cadastrada e disponível nos dois planejamentos.',
              )
            }
          />
        </Drawer>
      )}

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Recursos da obra</h3>
            <p className="mt-1 text-xs text-slate-500">
              {shown.length} de {teams.length} equipes
            </p>
          </div>
          <label className="relative w-full sm:max-w-xs">
            <span className="sr-only">Buscar empreiteiro ou equipe</span>
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} aria-hidden />
            <input
              type="search"
              className="field pl-9"
              placeholder="Buscar empreiteiro ou equipe"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>
        {shown.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto mb-3 text-slate-300" size={30} aria-hidden />
            <p className="mb-1 text-sm font-semibold text-slate-800">
              {teams.length ? 'Nenhum recurso encontrado' : 'Cadastre a primeira equipe desta obra'}
            </p>
            <Empty>
              {teams.length
                ? 'Tente buscar pelo nome da empresa ou da equipe.'
                : 'Informe o empreiteiro, o nome da equipe e sua capacidade semanal.'}
            </Empty>
            {teams.length ? (
              <button type="button" className="text-link mt-3 text-sm" onClick={() => setQuery('')}>
                Limpar busca
              </button>
            ) : (
              !readOnly && (
                <button className="button mt-4" type="button" aria-haspopup="dialog" onClick={() => open()}>
                  <Plus size={15} aria-hidden />
                  Cadastrar equipe
                </button>
              )
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Equipes cadastradas por empreiteiro" tabIndex={0}>
            <table className="data-table w-full min-w-[730px]">
              <thead>
                <tr>
                  <th scope="col">Empreiteiro / empresa</th>
                  <th scope="col">Equipe</th>
                  <th scope="col">Capacidade semanal</th>
                  <th scope="col">Vínculos no planejamento</th>
                  {!readOnly && (
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map(team => {
                  const usage = usages.get(team.id)!;
                  return (
                    <tr key={team.id}>
                      <td className="font-semibold text-slate-800">
                        {team.company || <span className="text-warning">Empresa não informada</span>}
                      </td>
                      <th scope="row" className="font-medium">
                        {team.name}
                      </th>
                      <td>
                        <span className="font-semibold tabular-nums">{team.weeklyCapacity}</span>
                        <span className="ml-1 text-xs text-slate-500">atividades / semana</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {developer ? (
                            <Link className="text-link" href={workPath(workId, 'medio-prazo')}>
                              {usage.medium} no médio
                            </Link>
                          ) : (
                            <span className="text-slate-500">{usage.medium} no médio</span>
                          )}
                          <Link className="text-link" href={workPath(workId, 'curto-prazo')}>
                            {usage.short} no curto
                          </Link>
                          {usage.activities > 0 && <span className="text-slate-500">{usage.activities} em atividades</span>}
                          {usage.baselines > 0 && <span className="text-slate-500">{usage.baselines} em linhas de base</span>}
                        </div>
                      </td>
                      {!readOnly && (
                        <td>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              className="button-secondary px-2 py-1.5 text-xs"
                              type="button"
                              disabled={busy}
                              aria-haspopup="dialog"
                              aria-label={`Editar ${teamLabel(team)}`}
                              onClick={() => open(team)}
                            >
                              <Pencil size={13} aria-hidden />
                              Editar
                            </button>
                            <span
                              title={
                                usage.total
                                  ? 'A equipe tem vínculos. Preserve o cadastro ou remova suas alocações antes de excluir.'
                                  : 'Excluir equipe sem vínculos'
                              }
                            >
                              <button
                                className="rounded-lg p-2 text-slate-400 hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-35"
                                type="button"
                                disabled={busy || usage.total > 0}
                                aria-label={`Excluir ${teamLabel(team)}`}
                                onClick={() => remove(team)}
                              >
                                <Trash2 size={15} aria-hidden />
                              </button>
                            </span>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="text-slate-500">Alocar recursos:</span>
        {developer && (
          <Link className="text-link inline-flex items-center gap-1" href={workPath(workId, 'medio-prazo')}>
            Médio prazo <ArrowRight size={14} aria-hidden />
          </Link>
        )}
        <Link className="text-link inline-flex items-center gap-1" href={workPath(workId, 'curto-prazo')}>
          Curto prazo <ArrowRight size={14} aria-hidden />
        </Link>
        {readOnly && <span className="text-xs text-slate-400">Seu perfil permite consulta ao cadastro.</span>}
      </div>
    </section>
  );
}

/** O formulário da equipe, dentro da gaveta. O erro de salvar fica aqui, perto dos campos. */
function ResourceForm({
  team,
  companies,
  busy,
  error,
  onSave,
  onCancel,
}: {
  team?: Team;
  companies: string[];
  busy: boolean;
  error: string;
  onSave: (fields: Pick<Team, 'company' | 'name' | 'weeklyCapacity'>) => Promise<void>;
  onCancel: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void onSave({
      company: String(values.get('company') ?? '').trim(),
      name: String(values.get('name') ?? '').trim(),
      weeklyCapacity: Number(values.get('capacity')),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <Field label="Empreiteiro / empresa" hint="Use o mesmo empreiteiro para cadastrar suas diferentes equipes.">
          <input
            className="field"
            name="company"
            list="resource-companies"
            defaultValue={team?.company ?? ''}
            required
            placeholder="Ex.: Construtora Alfa"
          />
          <datalist id="resource-companies">
            {companies.map(company => (
              <option key={company} value={company} />
            ))}
          </datalist>
        </Field>
        <Field label="Nome da equipe">
          <input className="field" name="name" defaultValue={team?.name ?? ''} required placeholder="Ex.: Alvenaria · equipe 01" />
        </Field>
        <Field
          label="Capacidade (atividades / semana)"
          hint="Quantas atividades a equipe atende por semana; é o que sinaliza sobrecarga no médio prazo."
        >
          <input className="field" name="capacity" type="number" min={1} step={1} defaultValue={team?.weeklyCapacity ?? 1} required />
        </Field>
        {team && (
          <p className="text-xs leading-5 text-slate-500">
            A edição mantém os vínculos existentes e não altera o fornecedor registrado nos compromissos semanais.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="button" type="submit">
            {busy ? 'Salvando…' : team ? 'Salvar equipe' : 'Cadastrar equipe'}
          </button>
          <button className="button-ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </fieldset>
      {error && (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      )}
    </form>
  );
}
