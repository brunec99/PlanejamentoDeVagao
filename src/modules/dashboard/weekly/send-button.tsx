'use client';
import { useState } from 'react';
import { Mail } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';

/** "Enviar o resumo agora para mim" (12/11/2026, regra 19 do modelo "Dashboards completos e resumo semanal"): o
 * admin recebe na hora, no próprio e-mail, o resumo semanal da última semana encerrada. Serve para testar e para
 * pedir o resumo fora de hora; não substitui nem consome o envio de sábado. Some para quem não é admin. O
 * resultado aparece ao lado do botão, com texto (nunca só cor). */
export function WeeklySummaryButton() {
  const c = usePlanning();
  const [state, setState] = useState<{ status: 'idle' | 'sending' } | { status: 'sent' } | { status: 'error'; message: string }>({
    status: 'idle',
  });
  if (c.state !== 'ready') return null;
  const actor = c.planning.data.users.find(user => user.id === c.actorId);
  if (actor?.role !== 'admin') return null;
  const send = async () => {
    if (state.status === 'sending') return;
    setState({ status: 'sending' });
    try {
      const res = await fetch('/api/dashboard/resumo-semanal', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível enviar o resumo.');
      setState({ status: 'sent' });
    } catch (cause) {
      setState({ status: 'error', message: cause instanceof Error ? cause.message : 'Não foi possível enviar o resumo.' });
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-tour="geral-resumo-semanal">
      <button
        type="button"
        className="button-secondary"
        onClick={() => void send()}
        disabled={state.status === 'sending'}
        title="Envia agora, para o seu e-mail, o resumo da última semana encerrada: quais obras cumpriram o planejamento, o histograma e a produtividade. O envio automático é todo sábado, às 08:00."
      >
        <Mail size={16} aria-hidden />
        {state.status === 'sending' ? 'Enviando…' : 'Enviar o resumo agora para mim'}
      </button>
      <span role="status" aria-live="polite" className="text-xs">
        {state.status === 'sent' && <span className="font-semibold text-success">Enviado para o seu e-mail. Chega em até 5 minutos.</span>}
        {state.status === 'error' && <span className="font-semibold text-danger">{state.message}</span>}
      </span>
    </span>
  );
}
