import test from 'node:test';
import assert from 'node:assert/strict';
import type { WeatherDay } from '../src/domain/weather';
import {
  formatFetchedAt,
  formatRain,
  formatTemps,
  printedDays,
  rainyDay,
  shortWeekday,
  sourceLine,
  splitObservedForecast,
  unavailableMessage,
  weatherTitle,
} from '../src/modules/curto-prazo/weather-strip';

// Semana de 12/10/2026 (segunda) a 18/10/2026 (domingo).
const date = (offset: number) => `2026-10-${String(12 + offset).padStart(2, '0')}`;
const day = (offset: number, observed: boolean): WeatherDay => ({
  date: date(offset),
  code: 0,
  label: 'Céu limpo',
  icon: 'sun',
  tMax: 28,
  tMin: 19,
  rainMm: 0,
  rainChance: observed ? null : 10,
  observed,
});
const week = (observedCount: number) => Array.from({ length: 7 }, (_, i) => day(i, i < observedCount));

test('shortWeekday segue os rótulos da planilha', () => {
  assert.equal(shortWeekday('2026-10-12'), 'Seg.');
  assert.equal(shortWeekday('2026-10-17'), 'Sáb');
  assert.equal(shortWeekday('2026-10-18'), 'Dom.');
});

test('printedDays deixa o domingo fora, como a planilha', () => {
  assert.deepEqual(
    printedDays(week(0)).map(d => d.date),
    [0, 1, 2, 3, 4, 5].map(date),
  );
});

test('splitObservedForecast acha o último observado e o primeiro previsto entre seg–sáb', () => {
  assert.deepEqual(splitObservedForecast(week(3)), { observedUntil: date(2), forecastFrom: date(3) });
  assert.deepEqual(splitObservedForecast(week(0)), { observedUntil: null, forecastFrom: date(0) });
  assert.deepEqual(splitObservedForecast(week(7)), { observedUntil: date(5), forecastFrom: null });
  // Só o domingo previsto não conta: ele não é impresso.
  assert.deepEqual(splitObservedForecast(week(6)), { observedUntil: date(5), forecastFrom: null });
  assert.deepEqual(splitObservedForecast([]), { observedUntil: null, forecastFrom: null });
});

test('weatherTitle: previsão, observado ou misto conforme os dias', () => {
  assert.equal(weatherTitle('planejamento', week(0)), 'Previsão do tempo para a semana');
  assert.equal(weatherTitle('fechamento', week(7)), 'Tempo na semana');
  assert.equal(weatherTitle('fechamento', week(3)), 'Tempo na semana (observado até quarta; previsão a partir de quinta)');
  assert.equal(weatherTitle('planejamento', week(1)), 'Tempo na semana (observado até segunda; previsão a partir de terça)');
  // Os dados mandam: planejamento reimpresso de semana passada mostra o observado.
  assert.equal(weatherTitle('planejamento', week(7)), 'Tempo na semana');
  assert.equal(weatherTitle('fechamento', week(0)), 'Previsão do tempo para a semana');
});

test('weatherTitle sem dias cai no tipo do PDF', () => {
  assert.equal(weatherTitle('planejamento', []), 'Previsão do tempo para a semana');
  assert.equal(weatherTitle('fechamento', []), 'Tempo na semana');
});

test('formatTemps arredonda e aceita falta de um dos lados', () => {
  assert.equal(formatTemps(28.4, 18.6), 'máx 28° · mín 19°');
  assert.equal(formatTemps(30, null), 'máx 30°');
  assert.equal(formatTemps(null, 12), 'mín 12°');
  assert.equal(formatTemps(null, null), '—');
});

test('formatRain mostra mm, traço de chuva e probabilidade só quando existe', () => {
  assert.equal(formatRain(12.3, 60), '12 mm · 60 %');
  assert.equal(formatRain(0.4, null), '<1 mm');
  assert.equal(formatRain(0, 5), '0 mm · 5 %');
  assert.equal(formatRain(null, null), '—');
  assert.equal(formatRain(null, 70), '— · 70 %');
});

test('rainyDay usa a mesma régua do resumo: ≥ 1 mm ou ≥ 50 %', () => {
  assert.equal(rainyDay({ rainMm: 1, rainChance: null }), true);
  assert.equal(rainyDay({ rainMm: 0.5, rainChance: 50 }), true);
  assert.equal(rainyDay({ rainMm: 0.5, rainChance: 40 }), false);
  assert.equal(rainyDay({ rainMm: null, rainChance: null }), false);
});

test('formatFetchedAt converte para o fuso da obra (UTC-3)', () => {
  assert.equal(formatFetchedAt('2026-10-12T17:05:00Z'), '12/10 14:05');
  assert.equal(formatFetchedAt('2026-10-13T01:30:00Z'), '12/10 22:30');
  assert.equal(formatFetchedAt('não é data'), '');
});

test('sourceLine omite a consulta quando a data é inválida', () => {
  assert.equal(
    sourceLine({ place: 'Barueri, SP', fetchedAt: '2026-10-12T17:05:00Z' }),
    'Fonte: Open-Meteo · Barueri, SP · consultado em 12/10 14:05',
  );
  assert.equal(sourceLine({ place: 'Barueri, SP', fetchedAt: '' }), 'Fonte: Open-Meteo · Barueri, SP');
});

test('unavailableMessage orienta a configurar o local ou avisa a indisponibilidade', () => {
  assert.equal(unavailableMessage('sem_local'), 'Tempo não incluído: informe o local da obra em Configurações da obra.');
  assert.equal(unavailableMessage('indisponivel'), 'Tempo indisponível no momento.');
});
