'use client';
import { Fragment, useState, type ReactNode } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Callout, Empty } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';
import { matchesSearch, type CauseGroup } from '@/modules/curto-prazo/justifications';

export interface AnalysisRequest {
  workId: string;
  scope: 'obra' | 'semana';
  weekStart: string;
  companies?: string[];
  teams?: string[];
}

/** "Justificativas por causa": o Pareto diz qual causa pesa; este bloco lê o que foi escrito ao
 * lado dela. Temas saem de termos recorrentes (puro, `justifications.ts`); a leitura com IA é
 * opcional e vive na rota `/api/curto-prazo/analise`. */
export function JustificationsView({ groups, period, request }: { groups: CauseGroup[]; period: string; request: AnalysisRequest }) {
  const [query, setQuery] = useState('');
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const justified = groups.reduce((sum, group) => sum + group.justified, 0);

  return (
    <section data-tour="curto-fechamento-justificativas" className="panel mt-5 p-5" aria-labelledby="justificativas-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 id="justificativas-title" className="text-sm font-bold text-slate-800">
              Justificativas por causa
            </h3>
            <HelpNote title="Como ler as justificativas" label="Como ler as justificativas" compact>
              <p>A causa é a lista fechada; a justificativa é o que foi escrito ao lado dela. O padrão aparece aqui.</p>
              <p>
                Os temas são termos que se repetem nas justificativas da mesma causa, com a contagem. Um tema só se forma com duas ou mais.
              </p>
              <p>
                "Analisar com IA" manda as linhas não cumpridas do recorte atual para um modelo e devolve temas, padrões por empreiteiro e
                ações.
              </p>
            </HelpNote>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {total} {total === 1 ? 'falha' : 'falhas'} {period}, {justified} com justificativa. Mesmo recorte de empreiteiro e equipe da
            série e do Pareto.
          </p>
        </div>
        <label data-tour="curto-fechamento-busca" className="relative block w-full max-w-64">
          <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Pesquisar justificativas"
            placeholder="Pesquisar justificativas"
            className="field py-1.5 pl-7 text-xs"
          />
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="mt-4">
          <Empty>Nenhuma falha com causa {period}. As justificativas aparecem quando as linhas não cumpridas recebem a causa.</Empty>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {groups.map((group, index) => {
            const rows = group.rows.filter(row => matchesSearch(row, query));
            if (query && !rows.length) return null;
            return (
              <details key={group.cause} open={index === 0 || !!query} className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm font-semibold text-slate-800 marker:content-none">
                  <span className="flex-1">{group.cause}</span>
                  <span className="tabular-nums text-xs font-medium text-slate-500">
                    {group.total} {group.total === 1 ? 'falha' : 'falhas'} · {group.justified} justificadas
                  </span>
                </summary>
                <div className="border-t border-slate-100 px-4 py-3">
                  {group.themes.length > 0 && (
                    <ul className="mb-3 flex flex-wrap gap-1.5" aria-label={`Temas de ${group.cause}`}>
                      {group.themes.map(theme => (
                        <li
                          key={theme.label}
                          title={theme.examples.join(' · ')}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                        >
                          {theme.label}
                          <span className="tabular-nums text-slate-500">{theme.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {rows.length ? (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {rows.map(row => (
                        <li key={row.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
                          <span className="w-10 shrink-0 tabular-nums text-xs font-semibold text-slate-500">S{row.week}</span>
                          <span className="min-w-0 flex-1">
                            <span className="text-xs text-slate-500">
                              {row.company || '(sem empreiteiro)'}
                              {row.team && ` · ${row.team}`} · {row.name}
                            </span>
                            <span className={`block leading-snug ${row.justification ? 'text-slate-800' : 'italic text-slate-400'}`}>
                              {row.justification || 'Sem justificativa'}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>Nenhuma justificativa nesta causa.</Empty>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <AiAnalysis request={request} disabled={total === 0} />
    </section>
  );
}

type AiState =
  { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; markdown: string; rows: number };

/** Botão opcional: sem `ANTHROPIC_API_KEY` no servidor a rota responde 503 e o aviso aparece aqui,
 * sem quebrar o resto. A resposta vem em markdown simples e é desenhada pelo conversor abaixo. */
function AiAnalysis({ request, disabled }: { request: AnalysisRequest; disabled: boolean }) {
  const [state, setState] = useState<AiState>({ status: 'idle' });
  const run = async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/curto-prazo/analise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const body = (await response.json().catch(() => ({}))) as { markdown?: string; rows?: number; error?: string };
      if (!response.ok || !body.markdown) throw new Error(body.error || 'Não foi possível analisar agora. Tente de novo em instantes.');
      setState({ status: 'ready', markdown: body.markdown, rows: body.rows ?? 0 });
    } catch (cause) {
      setState({ status: 'error', message: cause instanceof Error ? cause.message : 'Falha na análise.' });
    }
  };
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div data-tour="curto-fechamento-ia" className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="button-secondary px-3 py-1.5 text-xs"
          onClick={run}
          disabled={disabled || state.status === 'loading'}
        >
          <Sparkles aria-hidden size={14} />
          {state.status === 'loading' ? 'Analisando…' : 'Analisar com IA'}
        </button>
        <span className="text-xs text-slate-500">
          Temas por causa, padrões por empreiteiro e ações recomendadas, lidos das justificativas do recorte.
        </span>
      </div>
      {state.status === 'loading' && (
        <p role="status" className="mt-3 text-xs text-slate-500">
          Lendo as justificativas…
        </p>
      )}
      {state.status === 'error' && (
        <div className="mt-3">
          <Callout tone="warning" role="alert">
            {state.message}
          </Callout>
        </div>
      )}
      {state.status === 'ready' && (
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800" aria-live="polite">
          <p className="eyebrow mb-2">Leitura da IA · {state.rows} linhas</p>
          {renderMarkdown(state.markdown)}
        </div>
      )}
    </div>
  );
}

/** Conversor mínimo: `#` vira título, `-`/`*`/`1.` vira lista, `**x**` vira negrito. O resto é parágrafo. */
export function renderMarkdown(markdown: string): ReactNode {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={`mb-2 space-y-0.5 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const ordered = /^\d/.test(line);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    flush();
    if (!line) continue;
    if (heading)
      blocks.push(
        <h4 key={blocks.length} className="mb-1 mt-3 text-sm font-bold text-slate-900 first:mt-0">
          {inline(heading[1])}
        </h4>,
      );
    else
      blocks.push(
        <p key={blocks.length} className="mb-2 leading-6">
          {inline(line)}
        </p>,
      );
  }
  flush();
  return blocks;
}

const inline = (text: string): ReactNode =>
  text
    .split(/(\*\*[^*]+\*\*)/)
    .map((part, i) => (
      <Fragment key={i}>{part.startsWith('**') && part.endsWith('**') ? <strong>{part.slice(2, -2)}</strong> : part}</Fragment>
    ));
