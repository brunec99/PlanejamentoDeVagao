'use client';
import { useEffect, useRef } from 'react';
import type { WeeklyCommitment } from '@/domain/entities';
import { addDays, startOfWeek } from '@/domain/validation';
import { weekNumberFrom } from '@/domain/week-numbering';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { useWorkSettings } from '@/modules/configuracoes/work-settings';
import { compareText } from '@/modules/curto-prazo/sheet-view';
import { formatDate } from '@/shared/format';

/** Os dois PDFs da semana no formato da planilha "Planejamento de curto prazo" da obra (exemplos do
 * usuário, 08/10/2026: "PCP-BLT - Semana 115" e "PCP-BLT - Resultados Semana 114"). A página abre numa
 * aba própria, fora do layout do sistema, e chama a impressão do navegador ("Salvar como PDF"); o
 * título da página vira o nome do arquivo. O cabeçalho fica no <thead> para repetir em cada folha. */
export type PrintKind = 'planejamento' | 'fechamento';

const DAYS = [
  { day: 1, label: 'Seg.' },
  { day: 2, label: 'Ter.' },
  { day: 3, label: 'Qua.' },
  { day: 4, label: 'Qui.' },
  { day: 5, label: 'Sex.' },
  { day: 6, label: 'Sáb' },
] as const;
const dayMonth = (date: string) => formatDate(date).slice(0, 5);

export function PrintSheet({ workId, week: requested, kind }: { workId: string; week?: string; kind: PrintKind }) {
  const context = usePlanning();
  const { state: settings, weekOneStart } = useWorkSettings(workId);
  const printed = useRef(false);
  const ready = context.state === 'ready' && settings.status !== 'loading';
  const work = context.state === 'ready' ? context.planning.data.works.find(w => w.id === workId) : undefined;

  const today = context.state === 'ready' ? context.planning.today : '';
  const commitments = context.state === 'ready' ? context.planning.data.commitments.filter(c => c.workId === workId) : [];
  const teams = context.state === 'ready' ? context.planning.data.teams.filter(t => t.workId === workId) : [];
  const currentWeek = today ? startOfWeek(today) : '';
  const week = requested ? startOfWeek(requested) : currentWeek;
  // Mesma regra da planilha: a semana 1 vem das configurações; sem ela, a primeira semana com linha.
  const firstWeek =
    weekOneStart ?? startOfWeek(commitments.reduce((earliest, c) => (c.weekStart < earliest ? c.weekStart : earliest), today || week));
  const number = (start: string) => (start ? weekNumberFrom(firstWeek, start) : '');
  const teamOf = (row: WeeklyCommitment) => teams.find(t => t.id === row.teamId);
  const companyOf = (row: WeeklyCommitment) => row.supplier.trim() || teamOf(row)?.company || '';
  const marked = (row: WeeklyCommitment, day: number) => {
    const date = addDays(row.weekStart, day - 1);
    return row.startDate <= date && date <= row.endDate;
  };
  // Ordem da planilha de origem: as linhas de cada empresa juntas, e dentro dela pela data de início.
  const rows = commitments
    .filter(c => c.weekStart === week)
    .sort((a, b) => {
      const [x, y] = [companyOf(a), companyOf(b)];
      if ((x === '') !== (y === '')) return x === '' ? 1 : -1;
      return compareText(x, y) || a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt);
    });
  const closing = kind === 'fechamento';
  const title = work
    ? `PCP-${work.code || work.name} - ${closing ? 'Resultados ' : ''}Semana ${number(week)}`
    : 'Planejamento de curto prazo';

  useEffect(() => {
    if (!ready || !work || printed.current) return;
    printed.current = true;
    document.title = title;
    // Um respiro para as fontes e o layout assentarem antes do diálogo de impressão.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [ready, work, title]);

  if (context.state === 'error') return <p className="p-6 text-sm text-danger">{context.message}</p>;
  if (!ready) return <p className="p-6 text-sm text-slate-500">Preparando o PDF…</p>;
  if (!work) return <p className="p-6 text-sm text-slate-500">Obra não encontrada ou sem acesso.</p>;

  const columns = closing ? 15 : 12;
  return (
    <div className="pcp-print">
      <style>{`
        @page { size: A4 landscape; margin: 7mm; }
        .pcp-print { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; padding: 12px; }
        .pcp-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .pcp-print table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .pcp-print thead { display: table-header-group; }
        .pcp-print tr { break-inside: avoid; page-break-inside: avoid; }
        .pcp-print td, .pcp-print th { border: 1px solid #1f2937; padding: 0 4px; font-size: ${closing ? '7.5px' : '9.5px'}; overflow: hidden; }
        .pcp-print tbody td { height: ${closing ? '19px' : '30px'}; }
        .pcp-band th { background: #6d9eeb; border-color: #6d9eeb; color: #111; }
        .pcp-sub th { background: #c9daf8; font-weight: 400; }
        .pcp-pill { display: inline-block; min-width: 70%; border-radius: 999px; background: #e5e7eb; padding: 1px 6px; text-align: center; }
        .pcp-x { background: #c9daf8; text-align: center; font-weight: 700; }
        .pcp-sim { background: #d9ead3; color: #38761d; }
        .pcp-nao { background: #f4cccc; color: #cc0000; }
        .pcp-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; font-size: 13px; }
        @media print { .pcp-toolbar { display: none; } .pcp-print { padding: 0; } }
      `}</style>
      <div className="pcp-toolbar">
        <button type="button" className="button" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
        <span className="text-slate-500">
          No diálogo, escolha &quot;Salvar como PDF&quot; e o modo paisagem. {rows.length} linha{rows.length === 1 ? '' : 's'}.
        </span>
      </div>
      <table>
        <colgroup>
          <col style={{ width: '8%' }} />
          <col style={{ width: '4.5%' }} />
          <col style={{ width: '4.5%' }} />
          <col style={{ width: '4.5%' }} />
          <col style={{ width: closing ? '22%' : '38%' }} />
          <col style={{ width: closing ? '6.5%' : '9%' }} />
          {DAYS.map(d => (
            <col key={d.day} style={{ width: closing ? '2.5%' : '4%' }} />
          ))}
          {closing && (
            <>
              <col style={{ width: '5%' }} />
              <col style={{ width: '12.5%' }} />
              <col style={{ width: '17.5%' }} />
            </>
          )}
        </colgroup>
        <thead>
          <tr className="pcp-band">
            <th colSpan={4} style={{ textAlign: 'left', fontSize: closing ? 12 : 15, padding: '6px 8px' }}>
              {work.name}
            </th>
            <th colSpan={columns - 7} style={{ textAlign: 'center', fontSize: closing ? 12 : 15, padding: '6px 8px' }}>
              PLANEJAMENTO DE CURTO PRAZO {work.name.toUpperCase()}
            </th>
            <th colSpan={3} style={{ textAlign: 'right', fontSize: closing ? 8 : 10, padding: '4px 8px', lineHeight: 1.5 }}>
              Semana analisada:{' '}
              <span className="pcp-pill" style={{ minWidth: 0, background: '#fff' }}>
                {number(week)}
              </span>
              <br />
              Semana atual: {number(currentWeek)}
            </th>
          </tr>
          <tr className="pcp-sub">
            <th colSpan={6} />
            {DAYS.map(d => (
              <th key={d.day} style={{ textAlign: 'center' }}>
                {dayMonth(addDays(week, d.day - 1))}
              </th>
            ))}
            {closing && <th colSpan={3} />}
          </tr>
          <tr>
            <th>Empreiteiro</th>
            <th>Semana</th>
            <th>Início</th>
            <th>Término</th>
            <th style={{ textAlign: 'left' }}>Atividade</th>
            <th>Equipe</th>
            {DAYS.map(d => (
              <th key={d.day}>{d.label}</th>
            ))}
            {closing && (
              <>
                <th>Realizado</th>
                <th>Causas</th>
                <th>Justificativa</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td style={{ textAlign: 'center' }}>
                <span className="pcp-pill">{companyOf(row)}</span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className="pcp-pill">{number(row.weekStart)}</span>
              </td>
              <td style={{ textAlign: 'center' }}>{dayMonth(row.startDate)}</td>
              <td style={{ textAlign: 'center' }}>{dayMonth(row.endDate)}</td>
              <td>{row.name}</td>
              <td style={{ textAlign: 'center' }}>{teamOf(row)?.name ?? ''}</td>
              {DAYS.map(d => (
                <td key={d.day} className={marked(row, d.day) ? 'pcp-x' : undefined}>
                  {marked(row, d.day) ? 'x' : ''}
                </td>
              ))}
              {closing && (
                <>
                  <td style={{ textAlign: 'center' }}>
                    {row.fulfilled !== undefined && (
                      <span className={`pcp-pill ${row.fulfilled ? 'pcp-sim' : 'pcp-nao'}`}>{row.fulfilled ? 'Sim' : 'Não'}</span>
                    )}
                  </td>
                  <td>
                    {row.cause && (
                      <span className="pcp-pill" style={{ textAlign: 'left' }}>
                        {row.cause}
                      </span>
                    )}
                  </td>
                  <td>{row.justification ?? ''}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p style={{ marginTop: 12, fontSize: 12 }}>Semana sem linhas no planejamento.</p>}
    </div>
  );
}
