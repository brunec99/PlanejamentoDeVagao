'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import type { Command } from '@/application/use-cases/commands';
import type { Team } from '@/domain/entities';
import { teamLabel, teamUsage } from '@/domain/resources';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Field } from '@/modules/planejamento/forms';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { workPath } from '@/shared/format';

export function WorkResources({ workId }: { workId: string }) {
  const context = usePlanning();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const editor = useRef<HTMLDivElement>(null);
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { data } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  const work = data.works.find(w => w.id === workId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const readOnly = actor.role === 'viewer';
  const teams = data.teams.filter(t => t.workId === workId).sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const shown = teams.filter(t => normalize(teamLabel(t)).includes(normalize(query.trim())));
  const companies = [...new Set(teams.map(t => t.company).filter(Boolean))];
  const usages = new Map(teams.map(t => [t.id, teamUsage(data, t.id)]));
  const allocated = teams.filter(t => usages.get(t.id)!.total > 0).length;
  const current = teams.find(t => t.id === editing);

  const close = () => { setCreating(false); setEditing(undefined); setError(''); };
  const open = (team?: Team) => {
    setCreating(!team); setEditing(team?.id); setRemoving(''); setError(''); setMessage('');
    requestAnimationFrame(() => { editor.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); editor.current?.querySelector('input')?.focus(); });
  };
  const save = async (command: Command, success: string) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await context.execute(command); close(); setRemoving(''); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o recurso.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">{work.code} · Configurações da obra</p>
        <h1 className="page-title">Empreiteiros e equipes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Cadastre quem executa nesta obra. As mesmas equipes ficam disponíveis para alocar recursos no planejamento de médio e curto prazo.</p>
      </div>
      {!readOnly && <button type="button" className="button" onClick={() => open()} disabled={busy}><Plus size={16} />Nova equipe</button>}
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: 'Empreiteiros', value: new Set(companies.map(c => normalize(c))).size, Icon: Building2 }, { label: 'Equipes cadastradas', value: teams.length, Icon: Users }, { label: 'Equipes com vínculos', value: allocated, Icon: ArrowRight }].map(({ label, value, Icon }) => <div key={label} className="panel flex items-center gap-3 px-4 py-3">
        <span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Icon size={18} /></span>
        <div><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold tabular-nums text-slate-900">{value}</p></div>
      </div>)}
    </div>

    {(creating || current) && !readOnly && <div ref={editor} className="panel border-blue-200 p-5">
      <ResourceForm key={current?.id ?? 'new'} team={current} companies={companies} busy={busy} onCancel={close}
        onSave={fields => save(current ? { type: 'update_team', teamId: current.id, ...fields } : { type: 'create_team', workId, ...fields }, current ? 'Equipe atualizada. As alocações foram mantidas.' : 'Equipe cadastrada e disponível nos dois planejamentos.')} />
    </div>}
    {error && <Callout tone="danger" role="alert">{error}</Callout>}
    {message && <Callout tone="success" role="status">{message}</Callout>}

    <section className="panel overflow-hidden" aria-labelledby="resources-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div><h2 id="resources-title" className="text-sm font-bold text-slate-800">Recursos da obra</h2><p className="mt-1 text-xs text-slate-500">{shown.length} de {teams.length} equipes</p></div>
        <label className="relative w-full sm:max-w-xs"><span className="sr-only">Buscar empreiteiro ou equipe</span><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} /><input type="search" className="field pl-9" placeholder="Buscar empreiteiro ou equipe" value={query} onChange={e => setQuery(e.target.value)} /></label>
      </div>
      {shown.length === 0 ? <div className="p-8 text-center">
        <Users className="mx-auto mb-3 text-slate-300" size={30} />
        <p className="mb-1 text-sm font-semibold text-slate-800">{teams.length ? 'Nenhum recurso encontrado' : 'Cadastre a primeira equipe desta obra'}</p>
        <Empty>{teams.length ? 'Tente buscar pelo nome da empresa ou da equipe.' : 'Informe o empreiteiro, o nome da equipe e sua capacidade semanal.'}</Empty>
        {teams.length ? <button type="button" className="text-link mt-3 text-sm" onClick={() => setQuery('')}>Limpar busca</button> : !readOnly && !creating && <button className="button mt-4" type="button" onClick={() => open()}><Plus size={15} />Cadastrar equipe</button>}
      </div> : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Equipes cadastradas por empreiteiro" tabIndex={0}>
        <table className="data-table w-full min-w-[730px]">
          <thead><tr><th scope="col">Empreiteiro / empresa</th><th scope="col">Equipe</th><th scope="col">Capacidade semanal</th><th scope="col">Vínculos no planejamento</th>{!readOnly && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
          <tbody>{shown.map(team => {
            const usage = usages.get(team.id)!;
            return <tr key={team.id}>
              <td className="font-semibold text-slate-800">{team.company || <span className="text-amber-700">Empresa não informada</span>}</td>
              <th scope="row" className="font-medium">{team.name}</th>
              <td><span className="font-semibold tabular-nums">{team.weeklyCapacity}</span><span className="ml-1 text-xs text-slate-500">atividades / semana</span></td>
              <td><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <Link className="text-link" href={workPath(workId, 'medio-prazo')}>{usage.medium} no médio</Link>
                <Link className="text-link" href={workPath(workId, 'curto-prazo')}>{usage.short} no curto</Link>
                {usage.activities > 0 && <span className="text-slate-500">{usage.activities} em atividades</span>}
                {usage.baselines > 0 && <span className="text-slate-500">{usage.baselines} em linhas de base</span>}
              </div></td>
              {!readOnly && <td><div className="flex flex-wrap items-center justify-end gap-2">
                <button className="button-secondary px-2 py-1.5 text-xs" type="button" disabled={busy} aria-label={`Editar ${teamLabel(team)}`} onClick={() => open(team)}><Pencil size={13} />Editar</button>
                {removing === team.id ? <span className="flex items-center gap-2 text-xs"><button type="button" className="font-semibold text-rose-700" disabled={busy} onClick={() => save({ type: 'delete_team', teamId: team.id }, 'Equipe excluída.')}>Confirmar exclusão</button><button type="button" disabled={busy} className="text-slate-500" onClick={() => setRemoving('')}>Cancelar</button></span>
                  : <span title={usage.total ? 'A equipe tem vínculos. Preserve o cadastro ou remova suas alocações antes de excluir.' : 'Excluir equipe sem vínculos'}><button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35" type="button" disabled={busy || usage.total > 0} aria-label={`Excluir ${teamLabel(team)}`} onClick={() => { setRemoving(team.id); setError(''); }}><Trash2 size={15} /></button></span>}
              </div></td>}
            </tr>;
          })}</tbody>
        </table>
      </div>}
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs leading-5 text-slate-500">Os vínculos incluem registros anteriores e linhas de base; não representam a carga de uma semana. Equipes em uso permanecem no cadastro para preservar as referências.</div>
    </section>

    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="text-slate-500">Alocar recursos:</span>
      <Link className="text-link inline-flex items-center gap-1" href={workPath(workId, 'medio-prazo')}>Médio prazo <ArrowRight size={14} /></Link>
      <Link className="text-link inline-flex items-center gap-1" href={workPath(workId, 'curto-prazo')}>Curto prazo <ArrowRight size={14} /></Link>
      {readOnly && <span className="text-xs text-slate-400">Seu perfil permite consulta ao cadastro.</span>}
    </div>
  </div>;
}

function ResourceForm({ team, companies, busy, onSave, onCancel }: { team?: Team; companies: string[]; busy: boolean; onSave: (fields: Pick<Team, 'company' | 'name' | 'weeklyCapacity'>) => Promise<void>; onCancel: () => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void onSave({ company: String(values.get('company') ?? '').trim(), name: String(values.get('name') ?? '').trim(), weeklyCapacity: Number(values.get('capacity')) });
  };
  return <form onSubmit={submit}>
    <h2 className="text-sm font-bold text-slate-800">{team ? 'Editar equipe' : 'Nova equipe'}</h2>
    <fieldset disabled={busy} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_220px]">
        <Field label="Empreiteiro / empresa"><input className="field" name="company" list="resource-companies" defaultValue={team?.company ?? ''} required placeholder="Ex.: Construtora Alfa" /><datalist id="resource-companies">{companies.map(company => <option key={company} value={company} />)}</datalist></Field>
        <Field label="Nome da equipe"><input className="field" name="name" defaultValue={team?.name ?? ''} required placeholder="Ex.: Alvenaria · equipe 01" /></Field>
        <Field label="Capacidade (atividades / semana)"><input className="field" name="capacity" type="number" min={1} step={1} defaultValue={team?.weeklyCapacity ?? 1} required /></Field>
      </div>
      <p className="text-xs leading-5 text-slate-500">A capacidade indica quantas atividades a equipe pode atender por semana. Use o mesmo empreiteiro para cadastrar suas diferentes equipes.{team && ' A edição mantém os vínculos existentes e não altera o fornecedor registrado nos compromissos semanais.'}</p>
      <div className="flex gap-2"><button className="button" type="submit">{busy ? 'Salvando…' : team ? 'Salvar equipe' : 'Cadastrar equipe'}</button><button className="button-secondary" type="button" onClick={onCancel}>Cancelar</button></div>
    </fieldset>
  </form>;
}
