'use client';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { Check, RefreshCw, Send, Sparkles } from 'lucide-react';
import type { AgentProposal, ProposalKind } from '@/application/use-cases/agent-tools';
import type { AgentBriefing, BriefingLevel, FindingLevel, FindingSeverity } from '@/domain/agent-briefing';
import { formatUsd } from '@/domain/agent-cost';
import { renderMarkdown } from '@/modules/curto-prazo/justifications-view';
import { Drawer } from '@/modules/layout/drawer';
import { useToast } from '@/modules/layout/toast';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { formatDate, formatTimestamp } from '@/shared/format';
import { AGENT } from './agent-identity';

/** Painel do agente de IA (27/10/2026): botão no cabeçalho que abre uma gaveta com a leitura guardada
 * da obra, o radar determinístico (achados do dossiê, que funciona sem chave da API), a conversa com
 * propostas de edição aplicáveis e o uso do mês. Toda a sessão vive aqui, no botão, e não na gaveta:
 * a `Drawer` desmonta os filhos ao fechar, e a conversa precisa sobreviver a fechar e reabrir. */

/** Contrato de `GET /api/agente` e das respostas do `POST`, escrito pela rota em paralelo. */
interface AgentReading {
  markdown: string;
  model: string;
  generatedAt: string;
  generatedBy: { id: string; name: string };
  costUsd: number;
  hash: string;
  /** A leitura foi feita sobre os dados atuais (mesmo `hash` do dossiê). */
  current: boolean;
}
interface AgentUsage {
  monthUsd: number;
  budgetUsd: number;
  workUsd: number;
  workBudgetUsd: number;
  userUsd: number;
  userLimitUsd: number | null;
  model: string;
}
interface AgentOverview {
  agent: { name: string; tagline: string };
  briefing: AgentBriefing;
  reading: AgentReading | null;
  usage: AgentUsage;
  configured: boolean;
  migrationMissing: boolean;
  canEdit: boolean;
  blocked: boolean;
  /** Decisão do teto no momento do GET: a rota manda a mensagem pronta, mostrada antes de a pessoa perguntar e levar um 429. */
  budget?: { allowed: boolean; reason?: string; message?: string };
}
type OverviewState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: AgentOverview };

type ProposalState =
  | { status: 'pendente' }
  | { status: 'aplicando'; done: number }
  | { status: 'aplicada' }
  | { status: 'descartada' }
  /** `done` é quantos comandos já foram gravados: "Tentar de novo" continua dali, sem repetir. */
  | { status: 'falhou'; done: number; message: string };
interface ProposalCard {
  proposal: AgentProposal;
  state: ProposalState;
}
/** Uma rodada da conversa: a pergunta e, quando chega, a resposta com as propostas, ou o erro. */
interface Turn {
  id: number;
  question: string;
  answer?: string;
  proposals: ProposalCard[];
  error?: string;
}
/** A sessão é presa à obra: na troca de obra ela é ignorada e uma nova nasce no próximo clique, o que
 * zera a conversa sem efeito de limpeza. Respostas que chegam depois da troca são descartadas. */
interface Session {
  workId: string;
  open: boolean;
  overview: OverviewState;
  turns: Turn[];
  question: string;
  /** Pedido de nova leitura em andamento. */
  requesting: boolean;
  readingError?: string;
}

const SUGGESTIONS = [
  'O que do plano do mês não está na semana atual?',
  'Leve para a semana atual os Não da semana passada',
  'Resuma os riscos da obra em 5 pontos',
];
const SEVERITY: Record<FindingSeverity, { label: string; className: string }> = {
  alerta: { label: 'Alerta', className: 'border-danger-ring bg-danger-soft text-danger' },
  atencao: { label: 'Atenção', className: 'border-warning-ring bg-warning-soft text-warning' },
  positivo: { label: 'Positivo', className: 'border-success-ring bg-success-soft text-success' },
  info: { label: 'Info', className: 'border-slate-200 bg-slate-100 text-slate-600' },
};
const LEVEL_LABEL: Record<FindingLevel, string> = { cruzado: 'Cruzado', curto: 'Curto', medio: 'Médio', longo: 'Longo' };
const READ_LEVEL: Record<BriefingLevel, string> = { longo: 'longo', medio: 'médio', curto: 'curto' };
const KIND_LABEL: Record<ProposalKind, string> = { levar: 'Levar', criar: 'Criar', apontar: 'Apontar' };
/** Linhas da proposta mostradas abertas; o resto fica num "Ver as outras", porque uma proposta pode
 * ter até 60 linhas e o painel é estreito. */
const VISIBLE_LINES = 10;
const CHIP = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function workIdOf(pathname: string | null): string | null {
  const match = /^\/obras\/([^/]+)/.exec(pathname ?? '');
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Lê o JSON e transforma status de erro em `Error` com o `error` do corpo, mostrado como veio
 * (o 429 do limite mensal, por exemplo, já explica o que houve). */
async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Partial<T> & { error?: unknown };
  if (!response.ok) {
    const error = typeof body.error === 'string' && body.error ? body.error : `O servidor respondeu com erro (HTTP ${response.status}).`;
    throw new Error(error);
  }
  return body as T;
}
const messageOf = (cause: unknown) => {
  if (cause instanceof TypeError) return 'Sem conexão com o servidor. Verifique a rede e tente de novo.';
  return cause instanceof Error && cause.message ? cause.message : 'Não foi possível falar com o servidor.';
};

const freshSession = (workId: string): Session => ({
  workId,
  open: true,
  overview: { status: 'loading' },
  turns: [],
  question: '',
  requesting: false,
});
const withData = (session: Session, update: (data: AgentOverview) => AgentOverview): Session =>
  session.overview.status === 'ready' ? { ...session, overview: { status: 'ready', data: update(session.overview.data) } } : session;

/** Título do aviso de sucesso: "3 linhas criadas na semana de 27/10/2026". Conta por linha, não por
 * comando, porque o apontamento vai num comando só com várias linhas. */
function appliedTitle(proposal: AgentProposal) {
  const count = proposal.lines.length;
  const verbs: Record<ProposalKind, [string, string, string]> = {
    levar: ['levada', 'levadas', 'para a'],
    criar: ['criada', 'criadas', 'na'],
    apontar: ['apontada', 'apontadas', 'na'],
  };
  const [one, many, preposition] = verbs[proposal.kind];
  const lines = count === 1 ? `1 linha ${one}` : `${count} linhas ${many}`;
  return proposal.weekStart ? `${lines} ${preposition} semana de ${formatDate(proposal.weekStart)}.` : `${lines}.`;
}

/** Textarea de 2 linhas que cresce com o texto até o `max-h` do CSS. */
const grow = (element: HTMLTextAreaElement) => {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

export function AgentButton() {
  const pathname = usePathname();
  const workId = workIdOf(pathname);
  const planning = usePlanning();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const endOfChat = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);

  const current = session && workId && session.workId === workId ? session : null;
  const isOpen = current?.open ?? false;
  const ready = current?.overview.status === 'ready';
  const asking = current?.turns.some(t => t.answer === undefined && !t.error) ?? false;
  const lastTurn = current?.turns[current.turns.length - 1];
  const lastTurnKey = lastTurn ? `${lastTurn.id}:${lastTurn.answer !== undefined}:${lastTurn.error ?? ''}` : '';

  /** Altera a sessão só se ela ainda é a da obra `id`. */
  const patch = useCallback((id: string, update: (session: Session) => Session) => {
    setSession(previous => (previous && previous.workId === id ? update(previous) : previous));
  }, []);

  /** O GET monta o radar e traz a leitura guardada. `silent` recarrega por trás do conteúdo que já
   * está na tela (reabertura do painel, depois de aplicar uma proposta), sem esqueleto. */
  const load = useCallback(
    async (id: string, silent = false) => {
      if (!silent) patch(id, s => ({ ...s, overview: { status: 'loading' } }));
      try {
        const response = await fetch(`/api/agente?workId=${encodeURIComponent(id)}`);
        const data = await readJson<AgentOverview>(response);
        patch(id, s => ({ ...s, overview: { status: 'ready', data } }));
      } catch (cause) {
        if (silent) return;
        patch(id, s => ({ ...s, overview: { status: 'error', message: messageOf(cause) } }));
      }
    },
    [patch],
  );

  useEffect(() => {
    // O foco vai ao campo de pergunta sem rolar: a leitura e o radar, no alto, são o que se vê primeiro.
    if (isOpen && ready) textarea.current?.focus({ preventScroll: true });
  }, [isOpen, ready]);
  useEffect(() => {
    if (textarea.current) grow(textarea.current);
  }, [current?.question, isOpen, ready]);
  useEffect(() => {
    if (lastTurnKey) endOfChat.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [lastTurnKey]);

  if (!workId) return null;

  const openPanel = () => {
    if (current) {
      setSession({ ...current, open: true });
      // Carga em andamento não é repetida; painel já carregado é atualizado por trás do conteúdo.
      if (current.overview.status !== 'loading') void load(workId, current.overview.status === 'ready');
    } else {
      setSession(freshSession(workId));
      void load(workId);
    }
  };
  const closePanel = () => patch(workId, s => ({ ...s, open: false }));
  const setQuestion = (question: string) => patch(workId, s => ({ ...s, question }));

  const requestReading = async () => {
    patch(workId, s => ({ ...s, requesting: true, readingError: undefined }));
    try {
      const response = await fetch('/api/agente', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ workId, kind: 'leitura' }),
      });
      const body = await readJson<{ reading?: AgentReading | null; usage?: AgentUsage; unchanged?: boolean }>(response);
      patch(workId, s =>
        withData({ ...s, requesting: false }, data => ({
          ...data,
          reading: body.reading ?? data.reading,
          usage: body.usage ?? data.usage,
        })),
      );
      if (body.unchanged)
        toast({
          title: 'Os dados não mudaram desde a última leitura.',
          description: 'A leitura guardada continua valendo; o modelo não foi chamado.',
          tone: 'info',
        });
      else toast({ title: `${AGENT.name} leu a obra.`, tone: 'success' });
    } catch (cause) {
      patch(workId, s => ({ ...s, requesting: false, readingError: messageOf(cause) }));
    }
  };

  const ask = async (text: string) => {
    const question = text.trim();
    if (!current || !ready || !question || asking) return;
    const turnId = ++sequence.current;
    // O histórico leva só as rodadas respondidas, como texto: propostas e erros ficam de fora.
    const history = current.turns
      .filter((t): t is Turn & { answer: string } => typeof t.answer === 'string')
      .flatMap(t => [
        { role: 'user' as const, content: t.question },
        { role: 'assistant' as const, content: t.answer },
      ]);
    patch(workId, s => ({ ...s, question: '', turns: [...s.turns, { id: turnId, question, proposals: [] }] }));
    try {
      const response = await fetch('/api/agente', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ workId, kind: 'pergunta', question, history }),
      });
      const body = await readJson<{ answer?: string; proposals?: AgentProposal[]; usage?: AgentUsage }>(response);
      const proposals = (body.proposals ?? []).map(proposal => ({ proposal, state: { status: 'pendente' } as const }));
      patch(workId, s =>
        withData({ ...s, turns: s.turns.map(t => (t.id === turnId ? { ...t, answer: body.answer ?? '', proposals } : t)) }, data => ({
          ...data,
          usage: body.usage ?? data.usage,
        })),
      );
    } catch (cause) {
      patch(workId, s => ({ ...s, turns: s.turns.map(t => (t.id === turnId ? { ...t, error: messageOf(cause) } : t)) }));
    }
  };

  const setProposalState = (turnId: number, proposalId: string, state: ProposalState) =>
    patch(workId, s => ({
      ...s,
      turns: s.turns.map(t =>
        t.id === turnId ? { ...t, proposals: t.proposals.map(p => (p.proposal.id === proposalId ? { ...p, state } : p)) } : t,
      ),
    }));

  /** Aplica pelo caminho normal de gravação (`execute`: permissões, projeção otimista, recarga), um
   * comando por vez; em erro para no comando que falhou e guarda quantos já entraram. */
  const applyProposal = async (turnId: number, card: ProposalCard) => {
    if (planning.state !== 'ready') {
      toast({
        title: 'Os dados da obra ainda não carregaram.',
        description: 'Espere a tela terminar de carregar e tente de novo.',
        tone: 'info',
      });
      return;
    }
    const { proposal, state } = card;
    let done = state.status === 'falhou' ? state.done : 0;
    try {
      for (; done < proposal.commands.length; done += 1) {
        setProposalState(turnId, proposal.id, { status: 'aplicando', done });
        await planning.execute(proposal.commands[done]);
      }
      setProposalState(turnId, proposal.id, { status: 'aplicada' });
      toast({ title: appliedTitle(proposal), tone: 'success' });
      // Os dados mudaram: o radar e a marca "dados mudaram" da leitura são refeitos por trás.
      void load(workId, true);
    } catch (cause) {
      const message = messageOf(cause);
      setProposalState(turnId, proposal.id, { status: 'falhou', done, message });
      toast({ title: 'Não foi possível aplicar a proposta.', description: message, tone: 'danger' });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        data-tour="agente"
        aria-label={`Abrir ${AGENT.name}, ${AGENT.tagline}`}
        title={`${AGENT.name}, ${AGENT.tagline}`}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-brand-50 hover:text-primary"
      >
        <Sparkles size={18} aria-hidden />
        <span className="hidden md:inline">{AGENT.name}</span>
      </button>
      <Drawer open={isOpen} onClose={closePanel} title={AGENT.name} description={AGENT.tagline} width="lg">
        {current?.overview.status === 'loading' && <PanelSkeleton />}
        {current?.overview.status === 'error' && (
          <div className="space-y-3">
            <Callout tone="danger" role="alert">
              {current.overview.message}
            </Callout>
            <button type="button" className="button-ghost" onClick={() => void load(workId)}>
              <RefreshCw size={15} aria-hidden />
              Tentar de novo
            </button>
          </div>
        )}
        {current?.overview.status === 'ready' && (
          <PanelBody
            data={current.overview.data}
            session={current}
            asking={asking}
            textarea={textarea}
            endOfChat={endOfChat}
            onRead={requestReading}
            onAsk={ask}
            onQuestion={setQuestion}
            onApply={applyProposal}
            onDiscard={(turnId, card) => setProposalState(turnId, card.proposal.id, { status: 'descartada' })}
          />
        )}
      </Drawer>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div role="status" aria-label={`Carregando ${AGENT.name}`} className="space-y-4">
      <div className="skeleton h-3 w-32" />
      <div className="skeleton h-24" />
      <div className="skeleton h-3 w-16" />
      <div className="skeleton h-14" />
      <div className="skeleton h-14" />
      <div className="skeleton h-3 w-20" />
      <div className="skeleton h-12" />
    </div>
  );
}

function PanelBody({
  data,
  session,
  asking,
  textarea,
  endOfChat,
  onRead,
  onAsk,
  onQuestion,
  onApply,
  onDiscard,
}: {
  data: AgentOverview;
  session: Session;
  asking: boolean;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  endOfChat: React.RefObject<HTMLDivElement | null>;
  onRead: () => void;
  onAsk: (question: string) => void;
  onQuestion: (question: string) => void;
  onApply: (turnId: number, card: ProposalCard) => void;
  onDiscard: (turnId: number, card: ProposalCard) => void;
}) {
  const { briefing, reading, usage, configured, migrationMissing, canEdit, blocked, budget } = data;
  const modelOff = !configured || blocked;
  const canSend = !modelOff && !asking && session.question.trim().length > 0;
  const readTitle = reading?.current
    ? 'Os dados não mudaram desde a última leitura'
    : !configured
      ? 'A IA não está configurada no servidor'
      : blocked
        ? 'Seu acesso ao agente foi cortado'
        : `Pede ao modelo uma leitura nova da obra (10 a 30 s)`;
  const firstProposalTurn = session.turns.find(t => t.proposals.length > 0)?.id;
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra linha. Durante a composição (acentos no celular) o Enter é do teclado.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onAsk(session.question);
  };

  return (
    <div className="flex min-h-full flex-col gap-6">
      {(!configured || migrationMissing || blocked || budget?.allowed === false) && (
        <div className="space-y-2">
          {!configured && (
            <Callout tone="warning" role="status">
              A IA não está configurada no servidor (ANTHROPIC_API_KEY). O radar abaixo continua funcionando.
            </Callout>
          )}
          {migrationMissing && (
            <Callout tone="warning" role="status">
              Aplique a migração 0035_agent.sql para guardar leituras e controlar o uso.
            </Callout>
          )}
          {blocked && (
            <Callout tone="danger" role="alert">
              Seu acesso ao agente foi cortado pelo administrador. O radar continua disponível.
            </Callout>
          )}
          {budget?.allowed === false && !blocked && (
            <Callout tone="warning" role="status">
              {budget.message ?? 'O limite mensal de IA foi atingido. O radar continua funcionando.'}
            </Callout>
          )}
        </div>
      )}

      <section data-tour="agente-leitura" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="eyebrow">Leitura de {AGENT.name}</h3>
          <button
            type="button"
            className="button-secondary px-3 py-1.5 text-xs"
            disabled={session.requesting || modelOff || reading?.current === true}
            title={readTitle}
            onClick={onRead}
          >
            <RefreshCw size={14} aria-hidden className={session.requesting ? 'animate-spin' : undefined} />
            {session.requesting ? 'Lendo…' : 'Nova leitura'}
          </button>
        </div>
        {session.requesting && (
          <p role="status" className="text-xs text-slate-500">
            Lendo a obra… (10 a 30 s)
          </p>
        )}
        {session.readingError && (
          <Callout tone="danger" role="alert">
            {session.readingError}
          </Callout>
        )}
        {reading ? (
          <>
            {!reading.current && (
              <span className={`${CHIP} border-warning-ring bg-warning-soft text-warning`}>Os dados mudaram desde esta leitura</span>
            )}
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800 [&>*:last-child]:mb-0">
              {renderMarkdown(reading.markdown)}
            </div>
            <p className="text-xs text-slate-500">
              Leitura de {formatTimestamp(reading.generatedAt)} por {reading.generatedBy.name} · {reading.model} ·{' '}
              {formatUsd(reading.costUsd)}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Ainda não há leitura desta obra.</p>
        )}
      </section>

      <section data-tour="agente-radar" className="space-y-3">
        <h3 className="eyebrow">Radar</h3>
        {briefing.findings.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum achado nos níveis lidos.</p>
        ) : (
          <ul className="space-y-2">
            {briefing.findings.map((finding, index) => (
              <li key={`${finding.id}-${index}`} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${CHIP} ${SEVERITY[finding.severity].className}`}>{SEVERITY[finding.severity].label}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{LEVEL_LABEL[finding.level]}</span>
                </div>
                <p className="mt-1 font-semibold text-slate-900">{finding.title}</p>
                <p className="leading-5 text-slate-600">{finding.detail}</p>
                {finding.items && finding.items.length > 0 && (
                  <details className="mt-1">
                    <summary className="text-link cursor-pointer text-xs">Ver itens</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                      {finding.items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">Níveis lidos: {briefing.levels.map(level => READ_LEVEL[level]).join(', ')}</p>
      </section>

      <section data-tour="agente-conversa" className="space-y-3">
        <h3 className="eyebrow">Conversa</h3>
        <div aria-live="polite" className="space-y-3">
          {session.turns.map(turn => (
            <div key={turn.id} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-50 px-3.5 py-2 text-sm text-slate-800">
                {turn.question}
              </p>
              {turn.answer === undefined && !turn.error && (
                <p role="status" className="text-xs text-slate-500">
                  {AGENT.name} está lendo…
                </p>
              )}
              {turn.error && (
                <Callout tone="warning" role="alert">
                  {turn.error}
                </Callout>
              )}
              {turn.answer !== undefined && (
                <div className="mr-auto rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 [&>*:last-child]:mb-0">
                  {renderMarkdown(turn.answer)}
                </div>
              )}
              {turn.proposals.map((card, index) => (
                <ProposalCardView
                  key={card.proposal.id}
                  card={card}
                  first={turn.id === firstProposalTurn && index === 0}
                  canEdit={canEdit}
                  onApply={() => onApply(turn.id, card)}
                  onDiscard={() => onDiscard(turn.id, card)}
                />
              ))}
            </div>
          ))}
          <div ref={endOfChat} aria-hidden />
        </div>
        {session.turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                className="button-ghost px-2.5 py-1 text-left text-xs font-medium"
                disabled={modelOff || asking}
                onClick={() => onAsk(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={event => {
            event.preventDefault();
            if (canSend) onAsk(session.question);
          }}
        >
          <label htmlFor="agente-pergunta" className="sr-only">
            Pergunta para {AGENT.name}
          </label>
          <textarea
            id="agente-pergunta"
            ref={textarea}
            rows={2}
            value={session.question}
            onChange={event => onQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Pergunte para ${AGENT.name} ou peça uma edição…`}
            className="field max-h-40 min-w-0 flex-1 resize-none overflow-y-auto leading-6"
          />
          <button type="submit" className="button shrink-0" disabled={!canSend}>
            <Send size={15} aria-hidden />
            Perguntar
          </button>
        </form>
      </section>

      <details className="command-box">
        <summary>O que o agente leu</summary>
        <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{briefing.text}</pre>
      </details>

      <footer
        data-tour="agente-uso"
        className="sticky bottom-0 -mx-5 -mb-4 mt-auto border-t border-slate-100 bg-white/95 px-5 py-2 text-xs text-slate-500 backdrop-blur"
      >
        Uso de IA no mês: {formatUsd(usage.monthUsd)} de {formatUsd(usage.budgetUsd)} · esta obra: {formatUsd(usage.workUsd)} de{' '}
        {formatUsd(usage.workBudgetUsd)}
        {usage.userLimitUsd != null ? ` · você: ${formatUsd(usage.userUsd)} de ${formatUsd(usage.userLimitUsd)}` : ''} · {usage.model}
      </footer>
    </div>
  );
}

function ProposalCardView({
  card,
  first,
  canEdit,
  onApply,
  onDiscard,
}: {
  card: ProposalCard;
  first: boolean;
  canEdit: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { proposal, state } = card;
  const total = proposal.commands.length;
  const shown = proposal.lines.slice(0, VISIBLE_LINES);
  const rest = proposal.lines.slice(VISIBLE_LINES);
  const tone =
    state.status === 'aplicada'
      ? 'border-success-ring bg-success-soft'
      : state.status === 'descartada'
        ? 'border-slate-200 bg-slate-50 opacity-70'
        : 'border-primary-ring bg-white';
  return (
    <div data-tour={first ? 'agente-proposta' : undefined} className={`rounded-xl border px-3.5 py-3 text-sm ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${CHIP} border-primary-ring bg-primary-soft text-primary-ink`}>{KIND_LABEL[proposal.kind]}</span>
        <p className="font-semibold text-slate-900">{proposal.title}</p>
      </div>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-slate-700">
        {shown.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="mt-1">
          <summary className="text-link cursor-pointer text-xs">Ver as outras {rest.length}</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700">
            {rest.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
      {proposal.skipped.length > 0 && <p className="mt-1.5 text-xs text-slate-500">Ficaram de fora: {proposal.skipped.join('; ')}.</p>}
      {state.status === 'falhou' && (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {state.message}
          {state.done > 0 ? ` (${state.done} de ${total} já gravados.)` : ''}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {state.status === 'aplicada' && (
          <span className={`${CHIP} border-success-ring bg-success-soft text-success`}>
            <Check size={12} aria-hidden />
            Aplicada
          </span>
        )}
        {state.status === 'descartada' && <span className={`${CHIP} border-slate-200 bg-slate-100 text-slate-600`}>Descartada</span>}
        {state.status === 'aplicando' && (
          <span role="status" className="text-xs font-semibold text-slate-600">
            Aplicando {Math.min(state.done + 1, total)} de {total}…
          </span>
        )}
        {(state.status === 'pendente' || state.status === 'falhou') && (
          <>
            {canEdit ? (
              <button type="button" className="button px-3 py-1.5 text-xs" onClick={onApply}>
                {state.status === 'falhou' ? 'Tentar de novo' : 'Aplicar'}
              </button>
            ) : (
              <span className="text-xs text-slate-500">Só quem edita a obra pode aplicar.</span>
            )}
            <button type="button" className="button-ghost px-3 py-1.5 text-xs" onClick={onDiscard}>
              Descartar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
