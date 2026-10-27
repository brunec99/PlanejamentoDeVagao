'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, ChevronLeft, ChevronRight, RefreshCw, ShieldOff, ShieldCheck, Users } from 'lucide-react';
import { Callout, Empty, LoadState, StatCard } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { formatUsd } from '@/domain/agent-cost';
import { formatTimestamp, roleLabels } from '@/shared/format';
import { AGENT } from './agent-identity';

/** Painel do administrador sobre o agente de IA (27/10/2026): quanto cada pessoa e cada obra gastaram
 * no mês, o limite mensal por pessoa e o corte de acesso. Lê `GET /api/admin/agente?month=` e grava
 * com `PUT /api/admin/agente/{userId}`; cada gravação atualiza só a linha, sem reler tudo. */

export interface AgentAdminUser {
  id: string;
  name: string;
  role: keyof typeof roleLabels;
  usd: number;
  calls: number;
  leituras: number;
  perguntas: number;
  lastAt: string | null;
  monthlyLimitUsd: number | null;
  blocked: boolean;
}
export interface AgentAdminWork {
  id: string;
  code: string;
  name: string;
  active: boolean;
  usd: number;
  calls: number;
  workBudgetUsd: number;
}
export interface AgentAdminReport {
  month: string;
  budgetUsd: number;
  model: string;
  migrationMissing: boolean;
  totals: { monthUsd: number; calls: number };
  users: AgentAdminUser[];
  works: AgentAdminWork[];
}
type UserPatch = { monthlyLimitUsd?: number | null; blocked?: boolean };
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; report: AgentAdminReport };

const TIME_ZONE = 'America/Sao_Paulo';
/** Mês de hoje no fuso da obra, como `YYYY-MM` (o `en-CA` escreve a data nessa ordem). */
const currentMonth = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};
/** "outubro de 2026", como a pessoa fala. */
const monthLabel = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, index - 1, 1)),
  );
};
const formatCalls = (calls: number) => calls.toLocaleString('pt-BR');
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.max(0, (part / whole) * 100) : 0);
/** Cor do gasto contra o teto: perigo a partir de 90%, aviso a partir de 70%. */
const toneOf = (ratio: number): 'default' | 'warning' | 'danger' => (ratio >= 0.9 ? 'danger' : ratio >= 0.7 ? 'warning' : 'default');
const BAR_COLOR = { default: 'bg-primary', warning: 'bg-warning', danger: 'bg-danger' } as const;

async function readError(res: Response, fallback: string) {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) return body.error;
  } catch {}
  return fallback;
}
async function saveUser(userId: string, patch: UserPatch): Promise<{ id: string; monthlyLimitUsd: number | null; blocked: boolean }> {
  const res = await fetch(`/api/admin/agente/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readError(res, 'Não foi possível salvar.'));
  return res.json();
}

/** Barra horizontal de uso contra um limite, com o percentual em texto ao lado. */
function UsageBar({
  value,
  label,
  tone = 'default',
  wide = false,
}: {
  value: number;
  label: string;
  tone?: keyof typeof BAR_COLOR;
  wide?: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2.5">
      <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${wide ? 'flex-1' : 'w-24'}`}>
        <div
          className={`h-full rounded-full transition-all ${BAR_COLOR[tone]}`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(value)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-500">{Math.round(value)}%</span>
    </div>
  );
}

/** Limite mensal da pessoa em dólares. Salva ao sair do campo ou com Enter; vazio é sem limite. Valor
 * inválido ou negativo avisa e volta ao anterior, para o campo nunca mostrar o que não foi salvo. */
function LimitField({ user, onSaved }: { user: AgentAdminUser; onSaved: (patch: UserPatch) => void }) {
  const { toast } = useToast();
  const asText = (limit: number | null) => (limit === null ? '' : String(limit));
  const [value, setValue] = useState(asText(user.monthlyLimitUsd));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // O limite gravado mudou (outro mês carregado, por exemplo): o campo acompanha, sem efeito.
  const [synced, setSynced] = useState(user.monthlyLimitUsd);
  if (synced !== user.monthlyLimitUsd) {
    setSynced(user.monthlyLimitUsd);
    setValue(asText(user.monthlyLimitUsd));
  }
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );
  const commit = async () => {
    if (busy) return;
    const text = value.trim().replace(',', '.');
    const limit = text === '' ? null : Number(text);
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
      toast({
        title: 'Limite inválido.',
        description: 'Informe um valor em dólares, zero ou maior, ou deixe vazio para sem limite.',
        tone: 'danger',
      });
      setValue(asText(user.monthlyLimitUsd));
      return;
    }
    const rounded = limit === null ? null : Math.round(limit * 100) / 100;
    if (rounded === user.monthlyLimitUsd) {
      setValue(asText(rounded));
      return;
    }
    setBusy(true);
    try {
      const result = await saveUser(user.id, { monthlyLimitUsd: rounded });
      onSaved({ monthlyLimitUsd: result.monthlyLimitUsd });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
      toast({ title: `Limite de ${user.name}: ${result.monthlyLimitUsd === null ? 'sem limite' : formatUsd(result.monthlyLimitUsd)}` });
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : 'Não foi possível salvar o limite.', tone: 'danger' });
      setValue(asText(user.monthlyLimitUsd));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input
        className="field w-28 py-1.5 text-sm tabular-nums"
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        placeholder="sem limite"
        value={value}
        disabled={busy}
        aria-label={`Limite mensal de ${user.name} em dólares`}
        onChange={e => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <span className="min-w-10 text-xs font-semibold text-success" role="status" aria-live="polite">
        {busy ? <span className="text-slate-400">…</span> : saved ? 'Salvo' : ''}
      </span>
    </div>
  );
}

/** Corta ou libera o acesso da pessoa à IA. O estado vai em texto (chip "Cortado" e o rótulo do
 * botão), nunca só na cor da linha. */
function AccessToggle({ user, onSaved }: { user: AgentAdminUser; onSaved: (patch: UserPatch) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveUser(user.id, { blocked: !user.blocked });
      onSaved({ blocked: result.blocked });
      toast({ title: result.blocked ? `Acesso de ${user.name} cortado` : `Acesso de ${user.name} liberado` });
    } catch (cause) {
      toast({ title: cause instanceof Error ? cause.message : 'Não foi possível alterar o acesso.', tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {user.blocked ? (
        <>
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-danger-ring bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
            <ShieldOff size={12} aria-hidden />
            Cortado
          </span>
          <button
            type="button"
            className="button-secondary whitespace-nowrap px-3 py-1.5 text-xs"
            disabled={busy}
            aria-label={`Liberar acesso de ${user.name} à IA`}
            onClick={() => void toggle()}
          >
            <ShieldCheck size={13} aria-hidden />
            Liberar
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button-ghost whitespace-nowrap px-3 py-1.5 text-xs text-danger hover:border-danger-ring hover:bg-danger-soft hover:text-danger"
          disabled={busy}
          aria-label={`Cortar acesso de ${user.name} à IA`}
          onClick={() => void toggle()}
        >
          <ShieldOff size={13} aria-hidden />
          Cortar acesso
        </button>
      )}
    </div>
  );
}

/** Uma pessoa na tabela. Só a primeira linha leva as marcações do tour (o teste de alvos exige o
 * atributo literal no código, por isso o envoltório condicional). */
function UserRow({ user, first, onSaved }: { user: AgentAdminUser; first: boolean; onSaved: (patch: UserPatch) => void }) {
  const limit = <LimitField user={user} onSaved={onSaved} />;
  const access = <AccessToggle user={user} onSaved={onSaved} />;
  return (
    <tr className={user.blocked ? 'bg-danger-soft' : undefined}>
      <th scope="row">
        <span className="block">{user.name}</span>
        <span className="block text-xs font-normal text-slate-500">{roleLabels[user.role] ?? user.role}</span>
      </th>
      <td className="tabular-nums font-semibold text-slate-800">{formatUsd(user.usd)}</td>
      <td className="tabular-nums">
        <span className="block">{formatCalls(user.calls)}</span>
        <span className="block text-xs text-slate-500">
          {formatCalls(user.leituras)} leituras · {formatCalls(user.perguntas)} perguntas
        </span>
      </td>
      <td className="whitespace-nowrap tabular-nums">{user.lastAt ? formatTimestamp(user.lastAt) : '—'}</td>
      <td>
        {first ? (
          <div data-tour="agente-admin-limite" className="w-fit">
            {limit}
          </div>
        ) : (
          limit
        )}
      </td>
      <td>
        {first ? (
          <div data-tour="agente-admin-corte" className="w-fit">
            {access}
          </div>
        ) : (
          access
        )}
      </td>
    </tr>
  );
}

function SectionTitle({ id, icon, children }: { id: string; icon: ReactNode; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
      {icon}
      {children}
    </h2>
  );
}

export function AgentAdmin() {
  const [month, setMonth] = useState(currentMonth);
  const [attempt, setAttempt] = useState(0);
  // A chave identifica o pedido (mês + tentativa): resposta com outra chave é de um mês que a pessoa já
  // trocou e é descartada; enquanto a chave pedida não tem resposta, a tela está carregando.
  const key = `${month}#${attempt}`;
  const [result, setResult] = useState<{ key: string; outcome: Exclude<Load, { state: 'loading' }> } | null>(null);
  const load: Load = result?.key === key ? result.outcome : { state: 'loading' };
  const today = currentMonth();

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/agente?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error(await readError(res, 'Não foi possível carregar o consumo do agente.'));
        return res.json() as Promise<AgentAdminReport>;
      })
      .then(report => {
        if (active) setResult({ key, outcome: { state: 'ready', report } });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            key,
            outcome: { state: 'error', message: cause instanceof Error ? cause.message : 'Não foi possível carregar o consumo do agente.' },
          });
      });
    return () => {
      active = false;
    };
  }, [key, month]);

  const patchUser = useCallback((userId: string, patch: UserPatch) => {
    setResult(current =>
      current && current.outcome.state === 'ready'
        ? {
            ...current,
            outcome: {
              ...current.outcome,
              report: {
                ...current.outcome.report,
                users: current.outcome.report.users.map(u => (u.id === userId ? { ...u, ...patch } : u)),
              },
            },
          }
        : current,
    );
  }, []);

  const selector = (
    <div data-tour="agente-admin-mes" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label="Mês anterior"
        onClick={() => setMonth(m => shiftMonth(m, -1))}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <p className="min-w-40 text-center text-sm font-semibold capitalize text-slate-800" aria-live="polite">
        {monthLabel(month)}
      </p>
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Mês seguinte"
        disabled={month >= today}
        onClick={() => setMonth(m => (m < today ? shiftMonth(m, 1) : m))}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );

  if (load.state === 'loading')
    return (
      <div className="space-y-6">
        {selector}
        <LoadState rows={4} />
      </div>
    );
  if (load.state === 'error')
    return (
      <div className="space-y-6">
        {selector}
        <div className="space-y-3">
          <Callout tone="danger" role="alert">
            {load.message}
          </Callout>
          <button type="button" className="button-ghost" onClick={() => setAttempt(a => a + 1)}>
            <RefreshCw size={15} aria-hidden />
            Tentar de novo
          </button>
        </div>
      </div>
    );

  const { report } = load;
  const ratio = report.budgetUsd > 0 ? report.totals.monthUsd / report.budgetUsd : 0;
  const tone = toneOf(ratio);
  const users = [...report.users].sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name, 'pt-BR'));
  const works = [...report.works].sort((a, b) => b.usd - a.usd || a.code.localeCompare(b.code, 'pt-BR'));
  const totals = users.reduce(
    (sum, u) => ({
      usd: sum.usd + u.usd,
      calls: sum.calls + u.calls,
      leituras: sum.leituras + u.leituras,
      perguntas: sum.perguntas + u.perguntas,
    }),
    { usd: 0, calls: 0, leituras: 0, perguntas: 0 },
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selector}
        <p className="text-xs text-slate-500">{AGENT.name} · consumo no fuso de Brasília, somado a cada chamada ao modelo.</p>
      </div>

      {report.migrationMissing && (
        <Callout tone="warning" role="alert">
          Aplique a migração 0035_agent.sql no Supabase para o uso ser registrado. Até lá o agente não grava leituras nem contabiliza custo.
        </Callout>
      )}

      <section data-tour="agente-admin-resumo" aria-label="Resumo do mês" className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Gasto no mês"
            tone={tone}
            value={
              <>
                {formatUsd(report.totals.monthUsd)}{' '}
                <span className="text-sm font-medium text-slate-500">de {formatUsd(report.budgetUsd)}</span>
              </>
            }
            hint={`${Math.round(ratio * 100)}% do teto mensal`}
          />
          <StatCard label="Chamadas" value={formatCalls(report.totals.calls)} hint="leituras e perguntas, em todas as obras" />
          <StatCard label="Modelo" value={<span className="break-all text-base">{report.model}</span>} hint="variável AGENT_MODEL" />
        </div>
        <UsageBar value={ratio * 100} label="Gasto do mês contra o teto" tone={tone} wide />
      </section>

      <section aria-labelledby="agente-usuarios-title">
        <SectionTitle id="agente-usuarios-title" icon={<Users size={16} className="text-primary" aria-hidden />}>
          Pessoas
        </SectionTitle>
        <div data-tour="agente-admin-usuarios" className="panel">
          {users.length === 0 ? (
            <div className="p-5">
              <Empty>Nenhum uso neste mês.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Consumo por pessoa" tabIndex={0}>
              <table className="data-table min-w-[880px]">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Gasto no mês</th>
                    <th scope="col">Chamadas</th>
                    <th scope="col">Último uso</th>
                    <th scope="col">Limite mensal (US$)</th>
                    <th scope="col">Acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => (
                    <UserRow key={user.id} user={user} first={index === 0} onSaved={patch => patchUser(user.id, patch)} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                    <th scope="row" className="px-4 py-3 font-bold text-slate-800">
                      Total
                    </th>
                    <td className="px-4 py-3 font-bold tabular-nums text-slate-800">{formatUsd(totals.usd)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      <span className="block font-semibold">{formatCalls(totals.calls)}</span>
                      <span className="block text-xs text-slate-500">
                        {formatCalls(totals.leituras)} leituras · {formatCalls(totals.perguntas)} perguntas
                      </span>
                    </td>
                    <td className="px-4 py-3" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="agente-obras-title">
        <SectionTitle id="agente-obras-title" icon={<Building2 size={16} className="text-primary" aria-hidden />}>
          Obras
        </SectionTitle>
        <div data-tour="agente-admin-obras" className="panel">
          {works.length === 0 ? (
            <div className="p-5">
              <Empty>Nenhuma obra cadastrada.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Consumo por obra" tabIndex={0}>
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Obra</th>
                    <th scope="col">Gasto</th>
                    <th scope="col">Chamadas</th>
                    <th scope="col">Parte do teto</th>
                    <th scope="col">Usado da parte</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map(work => {
                    const used = percentOf(work.usd, work.workBudgetUsd);
                    return (
                      <tr key={work.id} className={work.active ? undefined : 'text-slate-400'}>
                        <th scope="row" className={work.active ? undefined : 'text-slate-400'}>
                          <span className="font-semibold">{work.code}</span>
                          <span className="font-normal"> · {work.name}</span>
                          {!work.active && (
                            <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              inativa
                            </span>
                          )}
                        </th>
                        <td className={`tabular-nums font-semibold ${work.active ? 'text-slate-800' : ''}`}>{formatUsd(work.usd)}</td>
                        <td className="tabular-nums">{formatCalls(work.calls)}</td>
                        <td className="tabular-nums">{formatUsd(work.workBudgetUsd)}</td>
                        <td>
                          <UsageBar value={used} label={`Parte do teto usada por ${work.code}`} tone={toneOf(used / 100)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
