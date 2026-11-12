'use client';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { checklistPublicPath, type ChecklistEquipment, type ChecklistResponse } from '@/domain/equipment-checklist';
import { QrCode } from './qr';

/** Folha de etiquetas (12/11/2026): uma por equipamento ativo, com o QR do link do operador, o nome e a
 * instrução. Três por linha no A4; cada etiqueta não quebra entre páginas. */

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; work: string; equipment: ChecklistEquipment[] };

export function ChecklistLabels({ workId, only }: { workId: string; only?: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const checklist = await fetch(`/api/checklist?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' });
        const body = (await checklist.json().catch(() => ({}))) as ChecklistResponse & { error?: string };
        if (!checklist.ok) throw new Error(body.error ?? 'Não foi possível carregar os equipamentos.');
        if (!body.available) throw new Error('O checklist de equipamentos não está disponível neste ambiente.');
        if (!body.canEdit) throw new Error('Só técnicos de segurança (TST) e administradores imprimem as etiquetas.');
        const equipment = body.equipment
          .filter(e => e.active && e.publicToken && (!only || e.id === only))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
        if (active) setState({ status: 'ready', work: body.work?.name ?? '', equipment });
      } catch (error) {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar.' });
      }
    })();
    return () => {
      active = false;
    };
  }, [workId, only]);

  if (state.status === 'loading') return <p className="p-8 text-sm text-slate-500">Carregando as etiquetas…</p>;
  if (state.status === 'error')
    return (
      <p role="alert" className="p-8 text-sm text-danger">
        {state.message}
      </p>
    );
  if (!state.equipment.length)
    return (
      <p className="p-8 text-sm text-slate-600">
        Nenhum equipamento ativo com link nesta obra. Se a migração 0048 ainda não foi aplicada, os links não existem.
      </p>
    );

  const origin = window.location.origin;
  return (
    <main className="mx-auto max-w-[210mm] bg-white p-6 print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-600">
          {state.equipment.length === 1 ? '1 etiqueta' : `${state.equipment.length} etiquetas`} · imprima, recorte e cole no equipamento (de
          preferência plastificada).
        </p>
        <button type="button" className="button" onClick={() => window.print()}>
          <Printer size={15} aria-hidden />
          Imprimir
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
        {state.equipment.map(equipment => (
          <li
            key={equipment.id}
            className="flex break-inside-avoid flex-col items-center gap-1.5 rounded-lg border border-slate-400 p-4 text-center text-black"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide">{state.work ? `ATR · ${state.work}` : 'ATR'}</span>
            <QrCode
              value={`${origin}${checklistPublicPath(equipment.publicToken)}`}
              size={150}
              label={`QR do checklist de ${equipment.name}`}
            />
            <strong className="text-base leading-tight">{equipment.name}</strong>
            <span className="text-[11px] leading-snug">Aponte a câmera do celular e faça o checklist antes de operar</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
