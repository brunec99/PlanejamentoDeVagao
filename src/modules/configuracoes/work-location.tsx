'use client';
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { startOfWeek } from '@/domain/validation';
import { weekdayName, type PlaceOption, type WeatherDay, type WeatherResponse, type WeatherWeek } from '@/domain/weather';
import { formatDate } from '@/shared/format';
import { useWorkSettings } from './work-settings';

/** Quatro casas (~11 m), com ponto: é como mapas mostram e como se cola numa busca. */
export const formatCoordinates = (latitude: number, longitude: number) => `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

/** Uma linha por dia na prévia: "segunda · Chuva · 18/27 °C · 12 mm". Dado ausente vira travessão. */
export function weatherDayLine(day: WeatherDay): string {
  const temp = day.tMin !== null && day.tMax !== null ? `${Math.round(day.tMin)}/${Math.round(day.tMax)} °C` : '—';
  const rain = day.rainMm === null ? '—' : day.rainMm > 0 && day.rainMm < 1 ? '<1 mm' : `${Math.round(day.rainMm)} mm`;
  return `${weekdayName(day.date)} · ${day.label} · ${temp} · ${rain}`;
}

type Preview = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; week: WeatherWeek };

/** O local da obra: de onde saem as coordenadas da previsão do tempo nos PDFs do curto prazo. A
 * pessoa digita a cidade ou o endereço, escolhe entre os lugares encontrados e pronto. */
export function WorkLocation({ workId }: { workId: string }) {
  const context = usePlanning();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { state, location, locationAvailable, saveLocation } = useWorkSettings(workId);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview>({ status: 'idle' });

  // Busca 700 ms depois da última tecla (o Nominatim pede no máximo 1 pedido por segundo); a resposta
  // de uma busca antiga é descartada pelo abort.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/clima/geocode?q=${encodeURIComponent(text)}`, { signal: controller.signal, cache: 'no-store' });
        const body = (await res.json()) as { places?: PlaceOption[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? 'Não foi possível buscar o local.');
        const places = body.places ?? [];
        setOptions(places);
        setSearchError(
          places.length ? '' : 'Nenhum lugar encontrado. Tente rua e cidade, só a cidade, ou cole as coordenadas (ex.: -25.43, -49.27).',
        );
      } catch (cause) {
        if (controller.signal.aborted) return;
        setSearchError(cause instanceof Error ? cause.message : 'Não foi possível buscar o local.');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (context.state !== 'ready' || state.status === 'loading') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  const readOnly = !actor || actor.role === 'viewer';
  const currentWeek = startOfWeek(context.planning.today);
  const canEdit = !readOnly && state.status === 'ready' && state.available && locationAvailable;

  const type = (value: string) => {
    setQuery(value);
    setOptions([]);
    setSearchError('');
  };
  // Sucesso vai ao toast, como nas demais telas; o erro fica no painel, perto do formulário.
  const persist = async (value: PlaceOption | null) => {
    setBusy(true);
    setError('');
    try {
      await saveLocation(value ? { place: value.label, latitude: value.latitude, longitude: value.longitude } : null);
      toast(
        value
          ? { title: 'Local da obra salvo.', description: value.label, tone: 'success' }
          : { title: 'Local da obra removido. Os PDFs saem sem a faixa do tempo.', tone: 'success' },
      );
      type('');
      setPreview({ status: 'idle' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: 'Remover o local da obra?',
      description: 'Os PDFs do curto prazo saem sem a previsão do tempo até um novo local ser informado.',
      confirmLabel: 'Remover local',
      tone: 'danger',
    });
    if (ok) persist(null);
  };
  const loadPreview = async () => {
    setPreview({ status: 'loading' });
    try {
      const res = await fetch(`/api/clima?workId=${encodeURIComponent(workId)}&semana=${currentWeek}`, { cache: 'no-store' });
      const body = (await res.json()) as WeatherResponse | { error: string };
      if ('error' in body) throw new Error(body.error);
      if (!body.available) throw new Error(body.message);
      setPreview({ status: 'ready', week: body });
    } catch (cause) {
      setPreview({ status: 'error', message: cause instanceof Error ? cause.message : 'Não foi possível consultar o tempo.' });
    }
  };

  return (
    <section className="panel p-5" aria-labelledby="local-obra-title">
      <div className="flex items-start gap-3">
        <MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="local-obra-title" className="text-base font-bold text-slate-900">
            Local da obra
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-slate-500">A cidade ou o endereço da obra, de onde sai a previsão do tempo do curto prazo.</p>
            <HelpNote title="Como funciona: local da obra" compact>
              <p>
                Usado para a <strong>previsão do tempo</strong> nos PDFs do curto prazo (planejamento) e o <strong>tempo observado</strong>{' '}
                (fechamento).
              </p>
              <p>
                Digite a cidade ou o endereço e escolha o lugar certo na lista. O sistema guarda o nome e as coordenadas; a previsão vem de
                um serviço público, dia a dia, para a semana impressa.
              </p>
              <p>Sem local informado, os PDFs saem sem a faixa do tempo.</p>
            </HelpNote>
          </div>

          <p className="mt-3 text-sm text-slate-700">
            {location ? (
              <>
                Local: <strong>{location.place}</strong>{' '}
                <span className="tabular-nums text-slate-500">({formatCoordinates(location.latitude, location.longitude)})</span>
              </>
            ) : (
              <>Não informado.</>
            )}
          </p>

          {state.status === 'error' && (
            <div className="mt-3">
              <Callout tone="danger" role="alert">
                Não foi possível ler a configuração. Atualize a página para tentar de novo.
              </Callout>
            </div>
          )}
          {state.status === 'ready' && !state.available && (
            <div className="mt-3">
              <Callout tone="warning">
                Para salvar o local da obra, aplique as migrações <code>0025_work_settings.sql</code> e <code>0029_work_location.sql</code>{' '}
                no Supabase. Até lá, os PDFs saem sem a faixa do tempo.
              </Callout>
            </div>
          )}
          {state.status === 'ready' && state.available && !locationAvailable && (
            <div className="mt-3">
              <Callout tone="warning">
                Para salvar o local da obra, aplique a migração <code>0029_work_location.sql</code> no Supabase. Até lá, os PDFs saem sem a
                faixa do tempo.
              </Callout>
            </div>
          )}

          {canEdit && (
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                {location ? 'Trocar o local' : 'Buscar o local'}
                <input
                  className="field mt-1 block w-full sm:max-w-md"
                  type="search"
                  placeholder="Cidade ou endereço, ex.: Curitiba, PR"
                  autoComplete="off"
                  value={query}
                  disabled={busy}
                  onChange={e => type(e.target.value)}
                />
              </label>
              {searching && (
                <p className="text-xs text-slate-500" role="status">
                  Buscando…
                </p>
              )}
              {options.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 sm:max-w-md" aria-label="Lugares encontrados">
                  {options.map(option => (
                    <li key={`${option.latitude},${option.longitude}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => persist(option)}
                      >
                        <span className="min-w-0 truncate">{option.label}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-400">
                          {formatCoordinates(option.latitude, option.longitude)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searchError && (
                <p className="text-xs text-slate-500" role="status">
                  {searchError}
                </p>
              )}
              {location && (
                <button className="button-ghost" type="button" disabled={busy} onClick={remove}>
                  Remover local
                </button>
              )}
            </div>
          )}

          {location && (
            <div className="mt-4 space-y-2">
              <button className="button-secondary" type="button" disabled={preview.status === 'loading'} onClick={loadPreview}>
                {preview.status === 'loading' ? 'Consultando…' : 'Ver o tempo desta semana'}
              </button>
              {preview.status === 'error' && (
                <Callout tone="warning" role="status">
                  {preview.message}
                </Callout>
              )}
              {preview.status === 'ready' && (
                <div className="text-sm text-slate-700">
                  <p className="text-xs text-slate-500">
                    Semana de {formatDate(preview.week.weekStart)} · {preview.week.place} · {preview.week.summary}
                  </p>
                  <ul className="mt-1 space-y-0.5 tabular-nums">
                    {preview.week.days.map(day => (
                      <li key={day.date}>
                        {weatherDayLine(day)}
                        {day.observed && <span className="ml-1 text-xs text-slate-400">(observado)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3">
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            </div>
          )}
          {readOnly && <p className="mt-3 text-xs text-slate-400">Seu perfil permite consulta ao local da obra.</p>}
        </div>
      </div>
    </section>
  );
}
