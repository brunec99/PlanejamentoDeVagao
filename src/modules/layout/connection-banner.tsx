'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';

const relative = (at: number, now: number) => {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.round(minutes / 60)} h`;
};

/** Faixa fina sob o cabeçalho quando a última recarga falhou: os dados na tela continuam
 * valendo, mas a pessoa precisa saber de quando são. Some sozinha na recarga seguinte. */
export function ConnectionBanner() {
  const context = usePlanning();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (context.state !== 'ready' || !context.stale) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-warning-ring bg-warning-soft px-4 py-2 text-xs text-amber-900"
    >
      <span className="flex items-center gap-2">
        <WifiOff size={14} aria-hidden />
        Sem resposta do servidor. Mostrando os dados de {relative(context.updatedAt, now)}.
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold hover:underline"
        disabled={context.refreshing}
        onClick={() => context.refresh()}
      >
        <RefreshCw size={13} aria-hidden className={context.refreshing ? 'animate-spin' : ''} />
        {context.refreshing ? 'Recarregando…' : 'Tentar de novo'}
      </button>
    </div>
  );
}
