'use client';
import { useEffect, useRef, useState } from 'react';
import { safetyDays, type SafetyData, type SafetyItem, type SafetyPhoto } from '@/domain/safety';
import { formatDate } from '@/shared/format';
import { DonutRing, donutColor, sharePercent } from '@/modules/terminalidade/donut-chart';
import type { SafetyPrintOptions } from './print-options';
import {
  GROUPINGS,
  NONE,
  OPEN_OVER_DAYS,
  SORT_COLUMNS,
  daysLabel,
  donutSlices,
  filterItems,
  groupItems,
  groupOf,
  hasPeriod,
  indexSafety,
  locationKey,
  locationLabel,
  percentLabel,
  periodLabel,
  photosOfKind,
  sortItems,
  summarize,
  typeName,
  type DonutField,
  type DonutSlice,
  type SafetyIndex,
} from './safety-view';

/** PDF da vistoria de segurança do trabalho (aba 6, 05/11/2026), no desenho do PDF da lista de pendências
 * da aba 5: na primeira folha, os cartões de totais e três roscas (por tipo, por consequência e por
 * probabilidade); depois os apontamentos agrupados por tipo, local ou consequência, com a situação, os dias
 * e as fotos do apontamento e da correção. Abre numa aba própria, fora do layout do sistema, e chama a
 * impressão do navegador ("Salvar como PDF") quando as fotos terminam de carregar. Os dados vêm de
 * /api/seguranca/campo, que traz a obra e os apontamentos com as URLs das fotos e confere o acesso. */

type Loaded = { work: { id: string; name: string; code: string }; data: SafetyData };
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | ({ status: 'ready' } & Loaded);

const DONUTS: { field: DonutField; title: string; plural: string }[] = [
  { field: 'tipo', title: 'Por tipo', plural: 'tipos' },
  { field: 'consequencia', title: 'Por consequência', plural: 'consequências' },
  { field: 'probabilidade', title: 'Por probabilidade', plural: 'probabilidades' },
];
/** Fotos por célula: as primeiras de cada tipo; o resto vira "+N". */
const MAX_PHOTOS = 2;
/** Tempo máximo esperando as fotos antes de abrir a impressão assim mesmo. */
const IMAGES_TIMEOUT_MS = 20000;
const SITUATION_TITLE = { open: 'Abertos', resolved: 'Finalizados', all: 'Abertos e finalizados' } as const;

/** Data civil de hoje em São Paulo (AAAA-MM-DD), a mesma conta do servidor: é dela que saem os "dias em
 * aberto" e a data do cabeçalho. */
const todayInSaoPaulo = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nounCount = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SafetyPrint({ workId, options }: { workId: string; options: SafetyPrintOptions }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [today] = useState(todayInSaoPaulo);
  const root = useRef<HTMLDivElement>(null);
  const printed = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/seguranca/campo?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' })
      .then(async res => {
        const body = (await res.json().catch(() => ({}))) as Partial<Loaded> & { available?: boolean; error?: string };
        if (!active) return;
        if (!res.ok) setState({ status: 'error', message: body.error ?? 'Não foi possível carregar os apontamentos.' });
        else if (body.available === false || !body.work || !body.data) setState({ status: 'unavailable' });
        else setState({ status: 'ready', work: body.work, data: body.data });
      })
      .catch(() => active && setState({ status: 'error', message: 'Falha na comunicação com o servidor.' }));
    return () => {
      active = false;
    };
  }, [workId]);

  const ready = state.status === 'ready' ? state : undefined;
  const index = ready ? indexSafety(ready.data) : undefined;
  const grouping = GROUPINGS.find(g => g.value === options.grouping) ?? GROUPINGS[0];
  const listed = ready && index ? sortItems(filterItems(ready.data.items, options.filters, index), index, options.sort, today) : [];
  // Só os grupos marcados na janela; as roscas e os totais da primeira folha contam o mesmo recorte.
  const chosen = options.groups ? new Set(options.groups) : undefined;
  const items = chosen && index ? listed.filter(item => chosen.has(groupOf(index, item, options.grouping).key)) : listed;
  const groupLabel = `Por ${grouping.one}`;
  const stamp = formatDate(today);
  const title = ready ? `Segurança ${ready.work.code || ready.work.name} - ${groupLabel} - ${stamp.replaceAll('/', '-')}` : 'Segurança';

  // A impressão espera as fotos (URLs assinadas, valem 1 h): imprimir antes sairia com quadros vazios.
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    document.title = title;
    const images = [...(root.current?.querySelectorAll('img') ?? [])];
    const loaded = Promise.all(
      images.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>(resolve => (timer = setTimeout(resolve, IMAGES_TIMEOUT_MS)));
    let cancelled = false;
    void Promise.race([loaded, limit]).then(() => {
      if (!cancelled) setTimeout(() => window.print(), 300);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, title]);

  if (state.status === 'loading') return <p className="p-6 text-sm text-slate-500">Preparando o PDF…</p>;
  if (state.status === 'error') return <p className="p-6 text-sm text-danger">{state.message}</p>;
  if (state.status === 'unavailable' || !ready || !index)
    return <p className="p-6 text-sm text-slate-500">A segurança do trabalho não está disponível nesta obra.</p>;

  const summary = summarize(items, today);
  const groups = groupItems(items, index, options.grouping);
  const available = groupItems(listed, index, options.grouping).length;
  const chosenNote =
    chosen && groups.length < available
      ? `${groups.length} de ${available} ${grouping.plural}${groups.length <= 8 ? `: ${groups.map(g => g.label).join(', ')}` : ''}`
      : '';
  const numbers = new Map(groups.flatMap(g => g.items).map((item, i) => [item.id, i + 1]));
  const scope = describeScope(options, index);
  const locations = new Set(items.map(item => locationKey(item.location)).filter(Boolean)).size;
  const averageOpenDays = items.length ? items.reduce((sum, item) => sum + safetyDays(item, today), 0) / items.length : null;
  // Abertos, finalizados e % só dizem algo quando o PDF tem as duas situações; com uma só, "0 finalizados"
  // enganaria. Aí os cartões contam há quanto tempo estão abertos (ou quanto levaram) e onde estão.
  const stats: { value: string | number; label: string }[] =
    options.filters.situation === 'all'
      ? [
          { value: summary.total, label: 'apontamentos neste PDF' },
          { value: summary.open, label: 'abertos' },
          { value: summary.resolved, label: 'finalizados' },
          { value: percentLabel(summary), label: 'do total finalizado' },
          { value: daysLabel(summary.avgDaysToResolve), label: 'dias para resolver, em média (finalizados)' },
        ]
      : options.filters.situation === 'open'
        ? [
            { value: summary.total, label: 'apontamentos abertos neste PDF' },
            { value: summary.openOverDays, label: `abertos há mais de ${OPEN_OVER_DAYS} dias` },
            { value: daysLabel(averageOpenDays), label: 'dias em aberto, em média' },
            { value: locations, label: 'locais com apontamento aberto' },
          ]
        : [
            { value: summary.total, label: 'apontamentos finalizados neste PDF' },
            { value: daysLabel(summary.avgDaysToResolve), label: 'dias para resolver, em média' },
            {
              value: items.filter(item => safetyDays(item, today) <= OPEN_OVER_DAYS).length,
              label: `finalizados em até ${OPEN_OVER_DAYS} dias`,
            },
            { value: locations, label: 'locais com apontamento' },
          ];
  const showType = options.grouping !== 'tipo';
  const showConsequence = options.grouping !== 'consequencia';
  const showLocal = options.grouping !== 'local';
  const photos = options.photos;
  // Nº, Probabilidade, Descrição, Data e Situação, mais as colunas que dependem das opções.
  const columns = 5 + (showType ? 1 : 0) + (showConsequence ? 1 : 0) + (showLocal ? 1 : 0) + (photos ? 2 : 0);

  return (
    <div className="tp-print" ref={root}>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        .tp-print { font-family: Arial, Helvetica, sans-serif; color: #0b0b0b; background: #fff; padding: 12px; }
        .tp-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
        .tp-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; font-size: 13px; }
        .tp-band { display: flex; align-items: center; gap: 12px; background: #6d9eeb; padding: 6px 10px; }
        .tp-logos { display: inline-flex; align-items: center; gap: 8px; background: #fff; border-radius: 6px; padding: 3px 8px; }
        .tp-logos img { height: 22px; width: auto; display: block; }
        .tp-logos-sep { width: 1px; height: 20px; background: #cbd5e1; }
        .tp-title { flex: 1; text-align: center; font-size: 15px; font-weight: 700; }
        .tp-meta { text-align: right; font-size: 9.5px; line-height: 1.5; }
        .tp-scope { margin: 8px 0 0; font-size: 10px; color: #52514e; }
        .tp-stats { display: flex; gap: 8px; margin-top: 10px; }
        .tp-stat { flex: 1; border: 1px solid #d6d5cf; border-radius: 6px; padding: 6px 10px; }
        .tp-stat b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
        .tp-stat span { font-size: 9.5px; color: #52514e; }
        .tp-charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; break-inside: avoid; page-break-inside: avoid; }
        .tp-chart { border: 1px solid #d6d5cf; border-radius: 6px; padding: 8px 10px; display: flex; gap: 10px; align-items: flex-start; }
        .tp-chart h2 { margin: 0 0 6px; font-size: 11px; font-weight: 700; }
        .tp-chart svg { width: 112px; height: 112px; flex: none; }
        .tp-legend { flex: 1; min-width: 0; border-collapse: collapse; font-size: 9px; }
        .tp-legend td { padding: 2px 3px; vertical-align: middle; border-bottom: 1px solid #f0efec; }
        .tp-legend .tp-name { max-width: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tp-legend .tp-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; color: #0b0b0b; }
        .tp-legend .tp-share { color: #52514e; }
        .tp-swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; vertical-align: middle; }
        .tp-group { margin-top: 14px; }
        .tp-group.tp-break { break-before: page; page-break-before: always; margin-top: 0; }
        .tp-print table.tp-list { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .tp-list thead { display: table-header-group; }
        .tp-list tr { break-inside: avoid; page-break-inside: avoid; }
        .tp-list th, .tp-list td { border: 1px solid #1f2937; padding: 3px 4px; font-size: 8.5px; vertical-align: top; overflow: hidden; overflow-wrap: anywhere; }
        .tp-list th { background: #c9daf8; font-weight: 700; text-align: left; }
        .tp-list .tp-group-title th { background: #6d9eeb; font-size: 11px; padding: 5px 6px; }
        .tp-list .tp-group-title span { font-weight: 400; font-size: 9.5px; }
        .tp-center { text-align: center; }
        .tp-open { color: #cc0000; font-weight: 700; }
        .tp-done { color: #38761d; font-weight: 700; }
        .tp-days { color: #52514e; }
        .tp-note { margin-top: 2px; color: #52514e; }
        .tp-photos { display: flex; flex-wrap: wrap; gap: 3px; align-items: flex-start; }
        .tp-photos img { width: calc(50% - 2px); height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 2px; border: 1px solid #d6d5cf; display: block; }
        .tp-more { width: 100%; font-size: 8px; color: #52514e; }
        .tp-empty { margin-top: 12px; font-size: 12px; }
        @media print { .tp-toolbar { display: none; } .tp-print { padding: 0; } }
      `}</style>
      <div className="tp-toolbar">
        <button type="button" className="button" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
        <span className="text-slate-500">
          No diálogo, escolha &quot;Salvar como PDF&quot; e o modo paisagem. {nounCount(items.length, 'apontamento', 'apontamentos')},{' '}
          {groupLabel.toLowerCase()}
          {photos ? ', com fotos' : ', sem fotos'}.
        </span>
      </div>

      <header className="tp-band">
        <span className="tp-logos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-atr.png" alt="ATR Incorporadora" />
          <span className="tp-logos-sep" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-takt.png" alt="Takt Engenharia" />
        </span>
        <h1 className="tp-title">VISTORIA DE SEGURANÇA DO TRABALHO {ready.work.name.toUpperCase()}</h1>
        <div className="tp-meta">
          {groupLabel} · {SITUATION_TITLE[options.filters.situation]}
          <br />
          Gerado em {stamp}
        </div>
      </header>
      {scope.filters && <p className="tp-scope">Filtros: {scope.filters}</p>}
      {chosenNote && <p className="tp-scope">Só os escolhidos: {chosenNote}</p>}
      {scope.order && <p className="tp-scope">Ordem dentro de cada grupo: {scope.order}</p>}

      <div className="tp-stats">
        {stats.map(stat => (
          <div key={stat.label} className="tp-stat">
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <section className="tp-charts" aria-label="Apontamentos por tipo, consequência e probabilidade">
          {DONUTS.map(donut => (
            <DonutCard
              key={donut.field}
              title={donut.title}
              plural={donut.plural}
              slices={donutSlices(items, index, donut.field)}
              total={items.length}
            />
          ))}
        </section>
      )}

      {items.length === 0 && <p className="tp-empty">Nenhum apontamento com esses filtros.</p>}

      {groups.map(group => {
        const open = group.items.filter(item => item.status === 'open').length;
        return (
          <section key={group.key} className={`tp-group${options.pageBreak ? ' tp-break' : ''}`}>
            <table className="tp-list">
              <colgroup>
                <col style={{ width: '3.5%' }} />
                {showType && <col style={{ width: '10%' }} />}
                {showConsequence && <col style={{ width: '7.5%' }} />}
                <col style={{ width: '7%' }} />
                <col />
                {showLocal && <col style={{ width: '8.5%' }} />}
                <col style={{ width: '6.5%' }} />
                <col style={{ width: '11%' }} />
                {photos && (
                  <>
                    <col style={{ width: '13.5%' }} />
                    <col style={{ width: '13.5%' }} />
                  </>
                )}
              </colgroup>
              <thead>
                {/* O título do grupo fica no cabeçalho da tabela para repetir em cada folha do grupo. */}
                <tr className="tp-group-title">
                  <th colSpan={columns}>
                    {group.label}{' '}
                    <span>
                      · {nounCount(group.items.length, 'apontamento', 'apontamentos')}
                      {options.filters.situation === 'all' ? ` (${nounCount(open, 'aberto', 'abertos')})` : ''}
                    </span>
                  </th>
                </tr>
                <tr>
                  <th className="tp-center">Nº</th>
                  {showType && <th>Tipo</th>}
                  {showConsequence && <th>Consequência</th>}
                  <th>Probabilidade</th>
                  <th>Descrição</th>
                  {showLocal && <th>Local</th>}
                  <th>Data do apontamento</th>
                  <th>Situação</th>
                  {photos && (
                    <>
                      <th>Foto</th>
                      <th>Foto da correção</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {group.items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    today={today}
                    number={numbers.get(item.id) ?? 0}
                    showType={showType}
                    showConsequence={showConsequence}
                    showLocal={showLocal}
                    photos={photos}
                  />
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function ItemRow({
  item,
  index,
  today,
  number,
  showType,
  showConsequence,
  showLocal,
  photos,
}: {
  item: SafetyItem;
  index: SafetyIndex;
  today: string;
  number: number;
  showType: boolean;
  showConsequence: boolean;
  showLocal: boolean;
  photos: boolean;
}) {
  const resolved = item.status === 'resolved';
  const days = safetyDays(item, today);
  return (
    <tr>
      <td className="tp-center">{number}</td>
      {showType && <td>{typeName(index, item) || '—'}</td>}
      {showConsequence && <td>{item.consequence}</td>}
      <td>{item.probability}</td>
      <td>{item.description}</td>
      {showLocal && <td>{locationLabel(index, item) || '—'}</td>}
      <td>{formatDate(item.observedOn)}</td>
      <td>
        {resolved ? (
          <>
            <span className="tp-done">Finalizado{item.correctedOn ? ` em ${formatDate(item.correctedOn)}` : ''}</span>
            {item.correctedOn && <span className="tp-days"> · {days ? nounCount(days, 'dia', 'dias') : 'no mesmo dia'}</span>}
          </>
        ) : (
          <span className="tp-open">{days ? `Aberto há ${nounCount(days, 'dia', 'dias')}` : 'Aberto hoje'}</span>
        )}
        {resolved && item.resolutionNote && <div className="tp-note">Correção: {item.resolutionNote}</div>}
      </td>
      {photos && (
        <>
          <td>
            <Photos photos={photosOfKind(index, item.id, 'issue')} label="Foto do apontamento" />
          </td>
          <td>
            <Photos photos={photosOfKind(index, item.id, 'correction')} label="Foto da correção" />
          </td>
        </>
      )}
    </tr>
  );
}

function Photos({ photos, label }: { photos: SafetyPhoto[]; label: string }) {
  const shown = photos.filter(photo => photo.thumbUrl || photo.url).slice(0, MAX_PHOTOS);
  if (!photos.length) return <>—</>;
  return (
    <div className="tp-photos">
      {shown.map((photo, i) => (
        // A miniatura (~320 px) basta para 30 mm impressos e deixa o PDF leve.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={photo.id} src={photo.thumbUrl ?? photo.url} alt={`${label} ${i + 1}`} />
      ))}
      {photos.length > shown.length && <span className="tp-more">+{photos.length - shown.length}</span>}
    </div>
  );
}

/** Uma rosca com o total no centro e a legenda ao lado: cor, nome, quantidade e percentual. A legenda é a
 * leitura de verdade (o número nunca depende só da cor); a rosca dá a proporção num olhar. */
function DonutCard({ title, plural, slices, total }: { title: string; plural: string; slices: DonutSlice[]; total: number }) {
  return (
    <figure className="tp-chart" style={{ margin: 0 }}>
      <DonutRing slices={slices} total={total} title={title} noun={['apontamento', 'apontamentos']} />
      <figcaption style={{ flex: 1, minWidth: 0 }}>
        <h2>{title}</h2>
        <table className="tp-legend">
          <tbody>
            {slices.map((slice, i) => (
              <tr key={slice.key}>
                <td>
                  <span className="tp-swatch" style={{ background: donutColor(slice, i) }} aria-hidden />
                </td>
                <td className="tp-name" title={slice.label}>
                  {slice.others ? `Outros (${slice.others} ${plural})` : slice.label}
                </td>
                <td className="tp-num">{slice.count}</td>
                <td className="tp-num tp-share">{sharePercent(slice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** Os filtros e a classificação da lista em texto, para o PDF dizer o que ficou de fora e em que ordem. */
function describeScope(options: SafetyPrintOptions, index: SafetyIndex) {
  const { filters, sort } = options;
  const types = filters.typeIds.map(id => (id === NONE ? '(sem tipo)' : (index.types.get(id)?.name ?? '(removido)')));
  // Local vai pela chave; o nome é a grafia mais usada na obra (a chave, se nenhum apontamento a usa mais).
  const locations = filters.locations.map(key => (key === NONE ? '(sem local)' : (index.locationLabels.get(key) ?? key)));
  const parts = [
    hasPeriod(filters) && `apontados ${periodLabel(filters)}`,
    types.length > 0 && `tipo ${types.join(', ')}`,
    filters.consequences.length > 0 && `consequência ${filters.consequences.join(', ')}`,
    filters.probabilities.length > 0 && `probabilidade ${filters.probabilities.join(', ')}`,
    locations.length > 0 && `local ${locations.join(', ')}`,
    filters.search.trim() && `busca “${filters.search.trim()}”`,
  ].filter(Boolean);
  const order = sort
    ? `${SORT_COLUMNS.find(c => c.value === sort.column)?.label ?? ''} (${sort.dir === 'asc' ? 'crescente' : 'decrescente'})`
    : '';
  return { filters: parts.join(' · '), order };
}
