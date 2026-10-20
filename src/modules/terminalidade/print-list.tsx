'use client';
import { useEffect, useRef, useState } from 'react';
import type { TerminalityData, TerminalityItem, TerminalityPhoto } from '@/domain/terminality';
import { formatDate } from '@/shared/format';
import { textKey } from '@/modules/curto-prazo/sheet-view';
import { DonutRing, donutColor, sharePercent } from './donut-chart';
import type { TerminalityPrintOptions } from './print-options';
import {
  NONE,
  SORT_COLUMNS,
  donutSlices,
  filterItems,
  floorName,
  groupItems,
  indexTerminality,
  percentLabel,
  personName,
  photosOf,
  sortItems,
  summarize,
  typeName,
  unitName,
  type DonutField,
  type DonutSlice,
  type TerminalityIndex,
} from './terminality-view';

/** PDF da lista de pendências (pedido do usuário, 20/10/2026): na primeira folha, três roscas (por tipo,
 * por pavimento e por responsável terceiro); depois as pendências agrupadas por pavimento ou por
 * empreiteiro, com responsáveis e fotos do problema e da correção. Abre numa aba própria, fora do layout
 * do sistema, e chama a impressão do navegador ("Salvar como PDF") quando as fotos terminam de carregar.
 * Os dados vêm de /api/terminalidade/campo, que traz a obra e as pendências sem o planejamento inteiro. */

type Loaded = { work: { id: string; name: string; code: string }; data: TerminalityData };
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | ({ status: 'ready' } & Loaded);

const DONUTS: { field: DonutField; title: string; plural: string }[] = [
  { field: 'tipo', title: 'Por tipo', plural: 'tipos' },
  { field: 'pavimento', title: 'Por pavimento', plural: 'pavimentos' },
  { field: 'terceiro', title: 'Por responsável terceiro', plural: 'empreiteiros' },
];
/** Fotos por célula: as primeiras de cada tipo; o resto vira "+N". */
const MAX_PHOTOS = 2;
/** Tempo máximo esperando as fotos antes de abrir a impressão assim mesmo. */
const IMAGES_TIMEOUT_MS = 20000;
const SITUATION_TITLE = { open: 'Abertas', resolved: 'Resolvidas', all: 'Abertas e resolvidas' } as const;

export function TerminalityPrint({ workId, options }: { workId: string; options: TerminalityPrintOptions }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const root = useRef<HTMLDivElement>(null);
  const printed = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/terminalidade/campo?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' })
      .then(async res => {
        const body = (await res.json().catch(() => ({}))) as Partial<Loaded> & { available?: boolean; error?: string };
        if (!active) return;
        if (!res.ok) setState({ status: 'error', message: body.error ?? 'Não foi possível carregar as pendências.' });
        else if (body.available === false || !body.work || !body.data) setState({ status: 'unavailable' });
        else setState({ status: 'ready', work: body.work, data: body.data });
      })
      .catch(() => active && setState({ status: 'error', message: 'Falha na comunicação com o servidor.' }));
    return () => {
      active = false;
    };
  }, [workId]);

  const ready = state.status === 'ready' ? state : undefined;
  const index = ready ? indexTerminality(ready.data) : undefined;
  const items = ready && index ? sortItems(filterItems(ready.data.items, options.filters), index, options.sort) : [];
  const groupLabel = options.grouping === 'pavimento' ? 'Por pavimento' : 'Por empreiteiro';
  const stamp = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const title = ready ? `Pendências ${ready.work.code || ready.work.name} - ${groupLabel} - ${stamp.replaceAll('/', '-')}` : 'Pendências';

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
    return <p className="p-6 text-sm text-slate-500">A terminalidade não está disponível nesta obra.</p>;

  const summary = summarize(items, index);
  const groups = groupItems(items, index, options.grouping);
  const numbers = new Map(groups.flatMap(g => g.items).map((item, i) => [item.id, i + 1]));
  const scope = describeScope(options, index);
  // Abertas, resolvidas e % só dizem algo quando o PDF tem as duas situações; com uma só, "0 resolvidas"
  // enganaria. Aí os cartões contam onde estão as pendências.
  const stats: { value: string | number; label: string }[] =
    options.filters.situation === 'all'
      ? [
          { value: summary.total, label: 'pendências neste PDF' },
          { value: summary.open, label: 'abertas' },
          { value: summary.resolved, label: 'resolvidas' },
          { value: percentLabel(summary), label: 'resolvida' },
        ]
      : [
          { value: summary.total, label: `pendências ${options.filters.situation === 'open' ? 'abertas' : 'resolvidas'} neste PDF` },
          { value: new Set(items.map(item => item.floorId)).size, label: 'pavimentos com pendência' },
          { value: new Set(items.map(item => textKey(item.contractor ?? '')).filter(Boolean)).size, label: 'empreiteiros com pendência' },
          { value: items.filter(item => !item.contractor?.trim()).length, label: 'sem responsável terceiro' },
        ];
  const showLocal = options.grouping !== 'pavimento';
  const showContractor = options.grouping !== 'empreiteiro';
  const photos = options.photos;
  // Nº, Apto, Descrição, Tipo, Data, Responsável ATR e Situação, mais as colunas que dependem das opções.
  const columns = 7 + (showLocal ? 1 : 0) + (showContractor ? 1 : 0) + (photos ? 2 : 0);

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
        .tp-list th, .tp-list td { border: 1px solid #1f2937; padding: 3px 4px; font-size: 8.5px; vertical-align: top; overflow: hidden; }
        .tp-list th { background: #c9daf8; font-weight: 700; text-align: left; }
        .tp-list .tp-group-title th { background: #6d9eeb; font-size: 11px; padding: 5px 6px; }
        .tp-list .tp-group-title span { font-weight: 400; font-size: 9.5px; }
        .tp-center { text-align: center; }
        .tp-open { color: #cc0000; font-weight: 700; }
        .tp-done { color: #38761d; font-weight: 700; }
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
          No diálogo, escolha &quot;Salvar como PDF&quot; e o modo paisagem. {items.length}{' '}
          {items.length === 1 ? 'pendência' : 'pendências'}, {groupLabel.toLowerCase()}
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
        <h1 className="tp-title">LISTA DE PENDÊNCIAS {ready.work.name.toUpperCase()}</h1>
        <div className="tp-meta">
          {groupLabel} · {SITUATION_TITLE[options.filters.situation]}
          <br />
          Gerado em {stamp}
        </div>
      </header>
      {scope.filters && <p className="tp-scope">Filtros: {scope.filters}</p>}
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
        <section className="tp-charts" aria-label="Pendências por tipo, pavimento e responsável terceiro">
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

      {items.length === 0 && <p className="tp-empty">Nenhuma pendência com esses filtros.</p>}

      {groups.map(group => {
        const open = group.items.filter(item => item.status === 'open').length;
        return (
          <section key={group.key} className={`tp-group${options.pageBreak ? ' tp-break' : ''}`}>
            <table className="tp-list">
              <colgroup>
                <col style={{ width: '3.5%' }} />
                {showLocal && <col style={{ width: '8%' }} />}
                <col style={{ width: '5%' }} />
                <col />
                <col style={{ width: '7%' }} />
                <col style={{ width: '6.5%' }} />
                <col style={{ width: '9%' }} />
                {showContractor && <col style={{ width: '10%' }} />}
                <col style={{ width: '11%' }} />
                {photos && (
                  <>
                    <col style={{ width: '14.5%' }} />
                    <col style={{ width: '14.5%' }} />
                  </>
                )}
              </colgroup>
              <thead>
                {/* O título do grupo fica no cabeçalho da tabela para repetir em cada folha do grupo. */}
                <tr className="tp-group-title">
                  <th colSpan={columns}>
                    {group.label}{' '}
                    <span>
                      · {group.items.length} {group.items.length === 1 ? 'pendência' : 'pendências'}
                      {options.filters.situation === 'all' ? ` (${open} ${open === 1 ? 'aberta' : 'abertas'})` : ''}
                    </span>
                  </th>
                </tr>
                <tr>
                  <th className="tp-center">Nº</th>
                  {showLocal && <th>Local</th>}
                  <th>Apto</th>
                  <th>Descrição da pendência</th>
                  <th>Tipo</th>
                  <th>Data observação</th>
                  <th>Responsável ATR</th>
                  {showContractor && <th>Responsável terceiro</th>}
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
                    number={numbers.get(item.id) ?? 0}
                    showLocal={showLocal}
                    showContractor={showContractor}
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
  number,
  showLocal,
  showContractor,
  photos,
}: {
  item: TerminalityItem;
  index: TerminalityIndex;
  number: number;
  showLocal: boolean;
  showContractor: boolean;
  photos: boolean;
}) {
  const { issue, correction } = photosOf(index, item.id);
  const resolved = item.status === 'resolved';
  return (
    <tr>
      <td className="tp-center">{number}</td>
      {showLocal && <td>{floorName(index, item)}</td>}
      <td>{unitName(index, item) || '—'}</td>
      <td>{item.description}</td>
      <td>{typeName(index, item) || '—'}</td>
      <td>{formatDate(item.observedOn)}</td>
      <td>{personName(index, item) || '—'}</td>
      {showContractor && <td>{item.contractor?.trim() || '—'}</td>}
      <td>
        {resolved ? (
          <span className="tp-done">Resolvida{item.correctedOn ? ` em ${formatDate(item.correctedOn)}` : ''}</span>
        ) : (
          <span className="tp-open">Aberta</span>
        )}
        {resolved && item.resolutionNote && <div className="tp-note">Correção: {item.resolutionNote}</div>}
      </td>
      {photos && (
        <>
          <td>
            <Photos photos={issue} label="Foto do problema" />
          </td>
          <td>
            <Photos photos={correction} label="Foto da correção" />
          </td>
        </>
      )}
    </tr>
  );
}

function Photos({ photos, label }: { photos: TerminalityPhoto[]; label: string }) {
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
      <DonutRing slices={slices} total={total} title={title} />
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
function describeScope(options: TerminalityPrintOptions, index: TerminalityIndex) {
  const { filters, sort } = options;
  const named = (value: string, name: (id: string) => string | undefined, empty: string) =>
    value === NONE ? empty : (name(value) ?? '(removido)');
  const parts = [
    filters.floorId && `pavimento ${named(filters.floorId, id => index.floors.get(id)?.name, '(sem pavimento)')}`,
    filters.unitId && `apto ${named(filters.unitId, id => index.units.get(id)?.name, '(sem apto)')}`,
    filters.typeId && `tipo ${named(filters.typeId, id => index.types.get(id)?.name, '(sem tipo)')}`,
    filters.contractor && `responsável terceiro ${filters.contractor === NONE ? '(sem responsável)' : filters.contractor}`,
    filters.atrPersonId && `responsável ATR ${named(filters.atrPersonId, id => index.people.get(id)?.name, '(sem responsável)')}`,
    filters.search && `descrição com “${filters.search}”`,
  ].filter(Boolean);
  const order = sort
    ? `${SORT_COLUMNS.find(c => c.value === sort.column)?.label ?? ''} (${sort.dir === 'asc' ? 'crescente' : 'decrescente'})`
    : '';
  return { filters: parts.join(' · '), order };
}
