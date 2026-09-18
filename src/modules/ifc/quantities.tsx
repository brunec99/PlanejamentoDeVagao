'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Ruler } from 'lucide-react';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { groupOf } from './groups';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import type { QuantityKind } from './extract-ifc';

interface Distribution { nome: string; total: number }
interface QuantityRow { nome: string; kind: string; unidade: string | null; total: number; itens: number }
interface Summary { elementos: number; porClasse: Distribution[]; porPavimento: Distribution[]; quantidades: QuantityRow[] }
interface ElementRow { express_id: number; global_id: string | null; ifc_class: string; name: string | null; object_type: string | null; storey: string | null }
interface ElementPage { pagina: number; porPagina: number; total: number; elementos: ElementRow[] }

const kindLabels: Record<QuantityKind, string> = { area: 'Área', volume: 'Volume', length: 'Comprimento', count: 'Contagem', weight: 'Peso', time: 'Tempo' };
const kindLabel = (kind: string) => kindLabels[kind as QuantityKind] ?? kind;
const count = (value: number) => value.toLocaleString('pt-BR');
const amount = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const share = (part: number, whole: number) => (whole === 0 ? '—' : `${((part / whole) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const byText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const dash = (value: string | null) => value ?? '—';

/** O resumo agrupa elemento sem pavimento sob este rótulo, que não é um pavimento de verdade:
 * filtrar por ele devolveria zero linhas, então ele fica fora do seletor de pavimento. */
const SEM_INFO = 'Sem informação';

async function readJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? fallback);
  return body;
}

const slug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'modelo';

/** O destino é a planilha da obra: o Excel em pt-BR lê `;` como separador e vírgula como decimal,
 * e sem o BOM ele mostra os acentos quebrados. */
function downloadCsv(fileName: string, rows: (string | number)[][]) {
  const text = rows.map(row => row.map(cell => (typeof cell === 'number'
    ? cell.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 2 })
    : `"${cell.replace(/"/g, '""')}"`)).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function IfcQuantities({ workId }: { workId: string }) {
  const context = usePlanning();
  const [modelId, setModelId] = useState('');
  const [versionId, setVersionId] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;

  const models = data.ifcModels.filter(m => m.workId === workId).slice().sort((a, b) => byText(a.name, b.name));
  // Trocar de modelo deixa para trás uma versão que não é dele; nesse caso vale a mais nova do modelo escolhido.
  const model = models.find(m => m.id === modelId) ?? models[0];
  const versions = model ? data.ifcVersions.filter(v => v.modelId === model.id).slice().sort((a, b) => b.version - a.version) : [];
  const version = versions.find(v => v.id === versionId) ?? versions[0];

  return <section data-tour="ifc-quantitativo" className="panel mt-8 overflow-hidden" aria-labelledby="quantitativo-title">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h2 id="quantitativo-title" className="flex items-center gap-2 text-sm font-bold text-slate-800"><Ruler size={15} className="text-blue-600" />Quantitativo</h2>
      <p className="mt-0.5 text-xs text-slate-500">Consulta as tabelas transcritas do IFC: as quantidades somadas por nome, a distribuição dos elementos e a lista elemento a elemento — com exportação para a planilha da obra.</p>
    </div>

    {models.length === 0
      ? <div className="p-5"><Empty>Nenhum modelo cadastrado nesta obra. Cadastre o modelo e envie um arquivo IFC na seção de modelos acima para ter quantitativo.</Empty></div>
      : <div className="p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Modelo</span>
              <select className="field w-full sm:w-72" aria-label="Modelo do quantitativo" value={model?.id ?? ''} onChange={event => { setModelId(event.target.value); setVersionId(''); }}>
                {models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.discipline}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Versão</span>
              <select className="field w-full sm:w-72" aria-label="Versão do modelo" value={version?.id ?? ''} disabled={versions.length === 0} onChange={event => setVersionId(event.target.value)}>
                {versions.length === 0
                  ? <option value="">Nenhuma versão enviada</option>
                  : versions.map((item, index) => <option key={item.id} value={item.id}>v{item.version} · {item.fileName}{index === 0 ? ' · versão atual' : ''}</option>)}
              </select>
            </label>
          </div>

          {version
            ? <VersionQuantities key={version.id} versionId={version.id} fileStem={`${slug(model.name)}-v${version.version}`} />
            : <div className="mt-4"><Empty>Este modelo ainda não tem versão enviada. Envie o arquivo IFC na seção de modelos acima.</Empty></div>}
        </div>}
  </section>;
}

function VersionQuantities({ versionId, fileStem }: { versionId: string; fileStem: string }) {
  const [summary, setSummary] = useState<Summary>();
  const [summaryError, setSummaryError] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [storey, setStorey] = useState('');
  const [ifcClass, setIfcClass] = useState('');
  const [page, setPage] = useState(0);
  const [list, setList] = useState<ElementPage>();
  const [listError, setListError] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    let dropped = false;
    setLoadingSummary(true); setSummaryError(''); setSummary(undefined);
    readJson<Summary>(`/api/ifc/elements?versionId=${encodeURIComponent(versionId)}&resumo=1`, 'Falha ao ler o resumo do modelo.')
      .then(body => { if (!dropped) setSummary(body); })
      .catch((cause: unknown) => { if (!dropped) setSummaryError(cause instanceof Error ? cause.message : 'Falha ao ler o resumo do modelo.'); })
      .finally(() => { if (!dropped) setLoadingSummary(false); });
    return () => { dropped = true; };
  }, [versionId]);

  const hasElements = (summary?.elementos ?? 0) > 0;

  useEffect(() => {
    if (!hasElements) { setList(undefined); return; }
    let dropped = false;
    setLoadingList(true); setListError('');
    const query = new URLSearchParams({ versionId, pagina: String(page) });
    if (storey) query.set('pavimento', storey);
    if (ifcClass) query.set('classe', ifcClass);
    readJson<ElementPage>(`/api/ifc/elements?${query.toString()}`, 'Falha ao consultar os elementos do modelo.')
      .then(body => { if (!dropped) setList(body); })
      // A página anterior continua na tela: apagá-la tiraria também os botões de navegação, que são a saída do erro.
      .catch((cause: unknown) => { if (!dropped) setListError(cause instanceof Error ? cause.message : 'Falha ao consultar os elementos do modelo.'); })
      .finally(() => { if (!dropped) setLoadingList(false); });
    return () => { dropped = true; };
  }, [versionId, hasElements, page, storey, ifcClass]);

  if (loadingSummary) return <p role="status" className="mt-4 text-xs font-semibold text-blue-700">Somando as quantidades do modelo…</p>;
  if (summaryError) return <div className="mt-4"><Callout tone="danger" role="alert">{summaryError}</Callout></div>;
  if (!summary) return null;
  if (summary.elementos === 0) return <div className="mt-4"><Callout tone="info" role="status">Esta versão ainda não foi transcrita para as tabelas de consulta, então não há quantitativo para mostrar. A transcrição acontece no envio do arquivo: reenvie o IFC na seção de modelos acima para que os elementos, as propriedades e as quantidades sejam gravados.</Callout></div>;

  const storeys = summary.porPavimento.map(p => p.nome).filter(nome => nome !== SEM_INFO).sort(byText);
  const classes = summary.porClasse.map(c => c.nome).slice().sort(byText);
  const semPavimento = summary.porPavimento.find(p => p.nome === SEM_INFO);
  // A faixa exibida sai da página que a rota devolveu, não do estado: enquanto a próxima carrega, a tela mostra a lista que está nela.
  const first = list ? list.pagina * list.porPagina + 1 : 1;
  const last = list ? first + list.elementos.length - 1 : 1;
  const lastPage = list ? Math.max(0, Math.ceil(list.total / list.porPagina) - 1) : 0;

  const exportQuantities = () => downloadCsv(`quantitativo-${fileStem}.csv`, [
    ['Quantidade', 'Tipo', 'Unidade', 'Total', 'Itens'],
    ...summary.quantidades.map(q => [q.nome, kindLabel(q.kind), q.unidade ?? '', q.total, q.itens]),
  ]);
  const exportElements = () => { if (list) downloadCsv(`elementos-${fileStem}-pagina-${list.pagina + 1}.csv`, [
    ['Express ID', 'GlobalId', 'Elemento', 'Classe IFC', 'Nome', 'Tipo', 'Pavimento'],
    ...list.elementos.map(e => [e.express_id, e.global_id ?? '', groupOf(e.ifc_class), e.ifc_class, e.name ?? '', e.object_type ?? '', e.storey ?? '']),
  ]); };

  return <>
    <div className="my-5 grid gap-4 sm:grid-cols-3">
      <StatCard label="Elementos transcritos" value={count(summary.elementos)} />
      <StatCard label="Classes IFC distintas" value={count(summary.porClasse.length)} />
      <StatCard label="Pavimentos distintos" value={count(storeys.length)} />
    </div>

    <section className="panel overflow-hidden" aria-labelledby="quantitativo-somas-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h3 id="quantitativo-somas-title" className="text-sm font-bold text-slate-800">Quantidades do modelo</h3>
        {summary.quantidades.length > 0 && <button type="button" className="button-ghost" onClick={exportQuantities}><Download size={15} />Exportar CSV</button>}
      </div>
      {summary.quantidades.length === 0
        ? <div className="p-5"><Empty>Os elementos foram transcritos, mas nenhuma quantidade (área, volume, comprimento…) veio declarada no arquivo. Sem quantidade no IFC não há o que somar — o quantitativo desta versão sai apenas por contagem de elementos.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Quantidades somadas do modelo" tabIndex={0}>
            <table className="data-table min-w-[720px]">
              <thead><tr>{['Quantidade', 'Tipo', 'Unidade', 'Total', 'Itens'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{summary.quantidades.map(q => <tr key={`${q.nome}|${q.kind}`}>
                <th scope="row">{q.nome}</th>
                <td>{kindLabel(q.kind)}</td>
                <td>{q.unidade ? <span className="badge-muted px-2 py-0.5 text-[11px]">{q.unidade}</span> : <span className="text-slate-300">—</span>}</td>
                <td className="font-semibold tabular-nums text-slate-800">{amount(q.total)}</td>
                <td className="tabular-nums">{count(q.itens)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </section>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <DistributionPanel title="Elementos por classe IFC" label="Distribuição dos elementos por classe IFC" rows={summary.porClasse} total={summary.elementos} head="Elemento" translate={groupOf} />
      <DistributionPanel title="Elementos por pavimento" label="Distribuição dos elementos por pavimento" rows={summary.porPavimento} total={summary.elementos} head="Pavimento" />
    </div>

    {semPavimento && <div className="mt-5"><Callout tone="warning" role="status">{count(semPavimento.total)} {semPavimento.total === 1 ? 'elemento não tem pavimento' : 'elementos não têm pavimento'} na estrutura espacial do arquivo e {semPavimento.total === 1 ? 'aparece' : 'aparecem'} como “{SEM_INFO}”. {semPavimento.total === 1 ? 'Ele fica' : 'Eles ficam'} fora de qualquer filtro por pavimento.</Callout></div>}

    <section className="panel mt-5 overflow-hidden" aria-labelledby="quantitativo-elementos-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h3 id="quantitativo-elementos-title" className="text-sm font-bold text-slate-800">Consulta de elementos</h3>
        {list && list.elementos.length > 0 && <button type="button" className="button-ghost" onClick={exportElements}><Download size={15} />Exportar esta página (CSV)</button>}
      </div>

      <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 px-5 py-4">
        <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Pavimento</span>
          {/* Trocar o filtro muda o conjunto inteiro: manter a página atual mostraria uma faixa que talvez não exista mais. */}
          <select className="field w-full sm:w-56" aria-label="Filtrar elementos por pavimento" value={storey} disabled={storeys.length === 0} onChange={event => { setStorey(event.target.value); setPage(0); }}>
            <option value="">Todos os pavimentos</option>
            {storeys.map(nome => <option key={nome} value={nome}>{nome}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Classe IFC</span>
          <select className="field w-full sm:w-56" aria-label="Filtrar elementos por classe IFC" value={ifcClass} onChange={event => { setIfcClass(event.target.value); setPage(0); }}>
            <option value="">Todas as classes</option>
            {classes.map(nome => <option key={nome} value={nome}>{groupOf(nome)} · {nome}</option>)}
          </select>
        </label>
        {(storey || ifcClass) && <button type="button" className="button-ghost" onClick={() => { setStorey(''); setIfcClass(''); setPage(0); }}>Limpar filtros</button>}
      </div>

      {listError && <div className="px-5 pt-4"><Callout tone="danger" role="alert">{listError}</Callout></div>}
      {loadingList && !list
        ? <p role="status" className="px-5 py-4 text-xs font-semibold text-blue-700">Consultando os elementos…</p>
        : !list
          ? null
          : list.total === 0
              ? <div className="p-5"><Empty>Nenhum elemento com esse filtro nesta versão. Limpe o filtro para ver a lista completa.</Empty></div>
              : <>
                  <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Elementos transcritos do modelo" tabIndex={0}>
                    <table className="data-table min-w-[900px]">
                      <thead><tr>{['Express ID', 'GlobalId', 'Classe IFC', 'Nome', 'Tipo', 'Pavimento'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
                      <tbody>{list.elementos.map(e => <tr key={e.express_id}>
                        <th scope="row" className="tabular-nums">{e.express_id}</th>
                        <td className="font-mono text-xs break-all">{dash(e.global_id)}</td>
                        <td className="whitespace-nowrap">{groupOf(e.ifc_class)}
                          <span className="mt-0.5 block text-[11px] text-slate-400">{e.ifc_class}</span></td>
                        <td>{dash(e.name)}</td>
                        <td>{dash(e.object_type)}</td>
                        <td className="whitespace-nowrap">{dash(e.storey)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
                    <p role="status" className="text-xs text-slate-500">{loadingList ? 'Consultando os elementos…' : <>Mostrando {count(first)} a {count(last)} de {count(list.total)} · página {count(page + 1)} de {count(lastPage + 1)}</>}</p>
                    <div className="flex items-center gap-2">
                      <button type="button" className="button-ghost" disabled={loadingList || page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft size={15} />Anterior</button>
                      <button type="button" className="button-ghost" disabled={loadingList || page >= lastPage} onClick={() => setPage(p => p + 1)}>Próxima<ChevronRight size={15} /></button>
                    </div>
                  </div>
                </>}
    </section>
  </>;
}

function DistributionPanel({ title, label, rows, total, head, translate }: { title: string; label: string; rows: Distribution[]; total: number; head: string; translate?: (nome: string) => string }) {
  return <section className="panel overflow-hidden" aria-label={title}>
    <h3 className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">{title}</h3>
    {rows.length === 0
      ? <div className="p-5"><Empty>Nenhuma informação transcrita.</Empty></div>
      : <div className="max-h-80 overflow-y-auto custom-scrollbar" role="region" aria-label={label} tabIndex={0}>
          <table className="data-table">
            <thead><tr>{[head, 'Elementos', 'Participação'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.nome}>
              <th scope="row">{translate ? translate(row.nome) : row.nome}
                {translate && <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{row.nome}</span>}</th>
              <td className="tabular-nums">{count(row.total)}</td>
              <td className="tabular-nums">{share(row.total, total)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
  </section>;
}
