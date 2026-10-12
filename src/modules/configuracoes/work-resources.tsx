'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronRight, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
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
import { groupTeamsByCompany, parseCapacity, searchCompanies } from './work-resources-view';

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
          <p className="text-sm text-slate-500">
            Quem executa nesta obra, qual é a semana 1 do curto prazo e os cadastros da terminalidade.
          </p>
          <HelpNote title="Como funciona: configurações da obra" compact>
            <p>
              <strong>Empreiteiros e equipes</strong> é o cadastro de quem executa. A lista mostra os empreiteiros; cada um abre nas suas
              equipes e na capacidade de cada uma. As mesmas equipes aparecem como recurso no cronograma de médio prazo e como opção na
              planilha do curto prazo; a capacidade é o número de atividades que a equipe atende por semana, e é ela que sinaliza
              sobrecarga.
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

type Usage = ReturnType<typeof teamUsage>;
type TeamFields = Pick<Team, 'company' | 'name' | 'weeklyCapacity'>;

export function WorkResources({ workId }: { workId: string }) {
  const context = usePlanning();
  // O médio prazo ainda está em desenvolvimento: fora dele, o uso aparece sem o atalho.
  const developer = useDeveloper();
  const { toast } = useToast();
  const confirm = useConfirm();
  const id = useId();
  const [query, setQuery] = useState('');
  // Empreiteiros abertos, pela chave sem acento; começam todos fechados.
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<string>();
  const [creating, setCreating] = useState(false);
  // Empreiteiro com o formulário "Adicionar equipe" aberto na própria linha; o erro dele fica ali.
  const [adding, setAdding] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inlineError, setInlineError] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { data } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  const work = data.works.find(w => w.id === workId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const readOnly = actor.role === 'viewer';
  const teams = data.teams.filter(t => t.workId === workId);
  const usages = new Map(teams.map(t => [t.id, teamUsage(data, t.id)]));
  const groups = groupTeamsByCompany(teams, teamId => usages.get(teamId)?.total ?? 0);
  const shown = searchCompanies(groups, query);
  // Uma grafia por empreiteiro na sugestão do formulário, para não multiplicar variantes.
  const companies = groups.filter(g => g.key).map(g => g.company);
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
  const toggle = (key: string) =>
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /** Executa o comando e avisa; o erro vai para onde `fail` manda (perto dos campos ou ao toast). */
  const save = async (command: Command, success: string, fail: (message: string) => void) => {
    if (busy) return false;
    setBusy(true);
    try {
      await context.execute(command);
      toast({ title: success, tone: 'success' });
      return true;
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Não foi possível salvar o recurso.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveInDrawer = async (command: Command, success: string) => {
    setError('');
    if (await save(command, success, setError)) close();
  };
  const addTeam = async (company: string, fields: TeamFields) => {
    setInlineError('');
    const ok = await save(
      { type: 'create_team', workId, ...fields, company },
      'Equipe cadastrada e disponível nos dois planejamentos.',
      setInlineError,
    );
    if (ok) setAdding(undefined);
  };
  /** Capacidade editada na linha: devolve se o valor novo foi gravado, para o campo voltar ao antigo quando não foi. */
  const changeCapacity = async (team: Team, raw: string) => {
    const weeklyCapacity = parseCapacity(raw);
    if (weeklyCapacity === team.weeklyCapacity) return true;
    if (weeklyCapacity === undefined) {
      toast({ title: 'Capacidade inválida.', description: 'Informe um número inteiro positivo de atividades por semana.', tone: 'danger' });
      return false;
    }
    return save(
      { type: 'update_team', teamId: team.id, company: team.company, name: team.name, weeklyCapacity },
      `${teamLabel(team)}: ${weeklyCapacity} ${weeklyCapacity === 1 ? 'atividade' : 'atividades'} por semana.`,
      message => toast({ title: 'Não foi possível alterar a capacidade.', description: message, tone: 'danger' }),
    );
  };
  const remove = async (team: Team) => {
    const ok = await confirm({
      title: `Excluir ${teamLabel(team)}?`,
      description: 'A equipe sai do cadastro desta obra. Equipes com vínculos no planejamento não podem ser excluídas.',
      confirmLabel: 'Excluir equipe',
      tone: 'danger',
    });
    if (ok)
      save({ type: 'delete_team', teamId: team.id }, 'Equipe excluída.', message =>
        toast({ title: 'Não foi possível excluir a equipe.', description: message, tone: 'danger' }),
      );
  };

  return (
    <section className="space-y-4" aria-labelledby="resources-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="resources-title" className="text-base font-bold text-slate-900">
            Empreiteiros e equipes
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-slate-500">
              Cadastre quem executa; abra o empreiteiro para ver as equipes e a capacidade de cada uma.
            </p>
            <HelpNote title="Como funciona: empreiteiros e equipes" compact>
              <p>
                A lista mostra um empreiteiro (a empresa) por linha, com o total de equipes e de capacidade. Clique nele para ver as
                equipes: cada uma tem uma capacidade, quantas atividades atende por semana, editável ali mesmo. Para mais uma equipe do
                mesmo empreiteiro, use "Adicionar equipe" dentro dele; "Novo empreiteiro / equipe" cadastra uma empresa nova.
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
          <button type="button" className="button min-h-10" aria-haspopup="dialog" onClick={() => open()} disabled={busy}>
            <Plus size={16} aria-hidden />
            Novo empreiteiro / equipe
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Empreiteiros" value={companies.length} />
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
          title={current ? 'Editar equipe' : 'Novo empreiteiro / equipe'}
          description={
            current
              ? 'A edição mantém os vínculos existentes.'
              : 'Informe o empreiteiro, o nome da equipe e sua capacidade semanal. Para mais uma equipe de um empreiteiro já cadastrado, abra-o na lista.'
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
              saveInDrawer(
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
              {shown.length} de {groups.length} {groups.length === 1 ? 'empreiteiro' : 'empreiteiros'} · {teams.length}{' '}
              {teams.length === 1 ? 'equipe' : 'equipes'}
            </p>
          </div>
          <label className="relative w-full sm:max-w-xs">
            <span className="sr-only">Buscar empreiteiro ou equipe</span>
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} aria-hidden />
            <input
              type="search"
              className="field min-h-10 pl-9"
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
              {teams.length ? 'Nenhum empreiteiro encontrado' : 'Cadastre o primeiro empreiteiro desta obra'}
            </p>
            <Empty>
              {teams.length
                ? 'Tente buscar pelo nome da empresa ou da equipe.'
                : 'Informe o empreiteiro, o nome da equipe e sua capacidade semanal.'}
            </Empty>
            {teams.length ? (
              <button type="button" className="text-link mt-3 min-h-10 text-sm" onClick={() => setQuery('')}>
                Limpar busca
              </button>
            ) : (
              !readOnly && (
                <button className="button mt-4 min-h-10" type="button" aria-haspopup="dialog" onClick={() => open()}>
                  <Plus size={15} aria-hidden />
                  Cadastrar empreiteiro
                </button>
              )
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Empreiteiros da obra">
            {shown.map(({ group, teams: visible, byTeam }) => {
              // A busca que bate só em equipes abre a linha para mostrá-las; o clique continua
              // guardando a escolha, que volta a valer quando a busca é limpa.
              const expanded = byTeam || openKeys.has(group.key);
              const panelId = `${id}-${encodeURIComponent(group.key) || 'sem-empresa'}`;
              const label = group.company || 'Empresa não informada';
              return (
                <li key={group.key || '∅'}>
                  <h4>
                    <button
                      type="button"
                      className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-brand-50/60"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => toggle(group.key)}
                    >
                      <ChevronRight
                        size={16}
                        className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">
                        {group.company || <span className="text-warning">Empresa não informada</span>}
                      </span>
                      <span className="flex flex-wrap gap-x-4 gap-y-0.5 pl-7 text-xs text-slate-500 tabular-nums sm:pl-0">
                        <span>
                          {byTeam ? `${visible.length} de ${group.teams.length}` : group.teams.length}{' '}
                          {group.teams.length === 1 ? 'equipe' : 'equipes'}
                        </span>
                        <span>
                          <strong className="font-semibold text-slate-700">{group.capacity}</strong> atividades / semana
                        </span>
                        <span>{group.usage ? `${group.usage} ${group.usage === 1 ? 'vínculo' : 'vínculos'}` : 'sem vínculos'}</span>
                        {group.spellings.length > 1 && <span className="font-semibold text-warning">{group.spellings.length} grafias</span>}
                      </span>
                    </button>
                  </h4>
                  {expanded && (
                    <div id={panelId} className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 sm:pl-11">
                      {group.spellings.length > 1 && (
                        <p className="py-2 text-xs text-warning">
                          O mesmo empreiteiro está escrito de formas diferentes ({group.spellings.join(', ')}). Edite as equipes para
                          unificar a grafia.
                        </p>
                      )}
                      <ul className="divide-y divide-slate-100" aria-label={`Equipes de ${label}`}>
                        {visible.map(team => (
                          <TeamRow
                            key={team.id}
                            team={team}
                            usage={usages.get(team.id)!}
                            workId={workId}
                            developer={developer}
                            readOnly={readOnly}
                            busy={busy}
                            onEdit={() => open(team)}
                            onRemove={() => remove(team)}
                            onCapacity={raw => changeCapacity(team, raw)}
                          />
                        ))}
                      </ul>
                      {!readOnly &&
                        (adding === group.key ? (
                          <div className="border-t border-slate-100 py-3">
                            <ResourceForm
                              key={group.key}
                              company={group.company}
                              companies={companies}
                              busy={busy}
                              error={inlineError}
                              onCancel={() => {
                                setAdding(undefined);
                                setInlineError('');
                              }}
                              onSave={fields => addTeam(group.company, fields)}
                            />
                          </div>
                        ) : (
                          <div className="py-2">
                            <button
                              type="button"
                              className="button-ghost min-h-10 text-xs"
                              disabled={busy}
                              onClick={() => {
                                setAdding(group.key);
                                setInlineError('');
                              }}
                            >
                              <Plus size={14} aria-hidden />
                              Adicionar equipe
                              <span className="sr-only"> a {label}</span>
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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

/** Uma equipe dentro do empreiteiro aberto: capacidade editável na própria linha, vínculos e ações. */
function TeamRow({
  team,
  usage,
  workId,
  developer,
  readOnly,
  busy,
  onEdit,
  onRemove,
  onCapacity,
}: {
  team: Team;
  usage: Usage;
  workId: string;
  developer: boolean;
  readOnly: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onCapacity: (raw: string) => Promise<boolean>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <span className="min-w-40 flex-1 text-sm font-semibold text-slate-800">{team.name}</span>
      <label className="flex items-center gap-2 text-xs text-slate-500">
        {readOnly ? (
          <span className="text-sm font-semibold tabular-nums text-slate-800">{team.weeklyCapacity}</span>
        ) : (
          // Campo não controlado com a chave no valor gravado: a atualização silenciosa remonta o
          // campo com o número novo, e um valor recusado volta ao que está no cadastro.
          <input
            key={team.weeklyCapacity}
            className="field min-h-10 w-20 text-right tabular-nums"
            type="number"
            min={1}
            step={1}
            defaultValue={team.weeklyCapacity}
            disabled={busy}
            aria-label={`Capacidade semanal de ${teamLabel(team)}`}
            onBlur={e => {
              const input = e.target;
              void onCapacity(input.value).then(ok => {
                if (!ok) input.value = String(team.weeklyCapacity);
              });
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        )}
        atividades / semana
      </label>
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
      {!readOnly && (
        <div className="flex items-center gap-1">
          <button
            className="button-secondary min-h-10 px-2.5 text-xs"
            type="button"
            disabled={busy}
            aria-haspopup="dialog"
            aria-label={`Editar ${teamLabel(team)}`}
            onClick={onEdit}
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
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-35"
              type="button"
              disabled={busy || usage.total > 0}
              aria-label={`Excluir ${teamLabel(team)}`}
              onClick={onRemove}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </span>
        </div>
      )}
    </li>
  );
}

/** O formulário da equipe. Na gaveta pede o empreiteiro; dentro de um empreiteiro aberto
 * (`company` informado) ele já vai preenchido e escondido. O erro de salvar fica perto dos campos. */
function ResourceForm({
  team,
  company,
  companies,
  busy,
  error,
  onSave,
  onCancel,
}: {
  team?: Team;
  company?: string;
  companies: string[];
  busy: boolean;
  error: string;
  onSave: (fields: TeamFields) => Promise<void>;
  onCancel: () => void;
}) {
  const listId = useId();
  const inline = company !== undefined;
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
    <form onSubmit={submit} className="space-y-3" aria-label={inline ? `Nova equipe de ${company}` : undefined}>
      <fieldset disabled={busy} className={inline ? 'grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end' : 'space-y-4'}>
        {inline ? (
          <input type="hidden" name="company" value={company} />
        ) : (
          <Field label="Empreiteiro / empresa" hint="Use o mesmo empreiteiro para cadastrar suas diferentes equipes.">
            <input
              className="field min-h-10"
              name="company"
              list={listId}
              defaultValue={team?.company ?? ''}
              required
              placeholder="Ex.: Construtora Alfa"
            />
            <datalist id={listId}>
              {companies.map(item => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label="Nome da equipe">
          <input
            className="field min-h-10"
            name="name"
            defaultValue={team?.name ?? ''}
            required
            autoFocus={inline}
            placeholder="Ex.: Alvenaria · equipe 01"
          />
        </Field>
        <Field
          label={inline ? 'Capacidade / semana' : 'Capacidade (atividades / semana)'}
          hint={inline ? undefined : 'Quantas atividades a equipe atende por semana; é o que sinaliza sobrecarga no médio prazo.'}
        >
          <input
            className={`field min-h-10 ${inline ? 'w-full sm:w-28' : ''}`}
            name="capacity"
            type="number"
            min={1}
            step={1}
            defaultValue={team?.weeklyCapacity ?? 1}
            required
          />
        </Field>
        {team && (
          <p className="text-xs leading-5 text-slate-500">
            A edição mantém os vínculos existentes e não altera o fornecedor registrado nos compromissos semanais.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1 sm:pt-0">
          <button className="button min-h-10" type="submit">
            {busy ? 'Salvando…' : team ? 'Salvar equipe' : 'Cadastrar equipe'}
          </button>
          <button className="button-ghost min-h-10" type="button" onClick={onCancel}>
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
