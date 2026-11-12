import test from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, isNationalHoliday, isWorkday, nationalHolidayName, workdaysIn } from '../src/domain/holidays';

/** Feriados nacionais (12/11/2026, regra 14 do resumo semanal): datas fixas e Sexta-feira Santa. */

test('Páscoa e Sexta-feira Santa: 2026 (05/04 e 03/04), 2027 (28/03 e 26/03) e 2025 (20/04 e 18/04)', () => {
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(nationalHolidayName('2026-04-03'), 'Sexta-feira Santa');
  assert.ok(isNationalHoliday('2027-03-26'));
  assert.ok(isNationalHoliday('2025-04-18'));
});

test('datas fixas valem todo ano; a Consciência Negra só a partir de 2024', () => {
  for (const day of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'])
    assert.ok(isNationalHoliday(`2026-${day}`), day);
  assert.ok(isNationalHoliday('2026-11-20'));
  assert.ok(isNationalHoliday('2024-11-20'));
  assert.ok(!isNationalHoliday('2023-11-20'));
});

test('Carnaval e Corpus Christi não são feriado nacional', () => {
  assert.ok(!isNationalHoliday('2026-02-17')); // terça de Carnaval
  assert.ok(!isNationalHoliday('2026-06-04')); // Corpus Christi
  assert.ok(isWorkday('2026-02-17'));
});

test('dia útil é de segunda a sexta, fora feriado', () => {
  assert.ok(isWorkday('2026-11-12')); // quinta
  assert.ok(!isWorkday('2026-11-14')); // sábado
  assert.ok(!isWorkday('2026-11-15')); // domingo e feriado
  assert.ok(!isWorkday('2026-11-20')); // sexta, Consciência Negra
  assert.ok(!isWorkday('2026-11-02')); // segunda, Finados
});

test('workdaysIn: inclusive nas duas pontas, sem fim de semana nem feriado; vazio com o intervalo invertido', () => {
  assert.deepEqual(workdaysIn('2026-11-09', '2026-11-14'), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
  // Semana de 16/11: a sexta 20/11 é feriado.
  assert.deepEqual(workdaysIn('2026-11-16', '2026-11-21'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  assert.deepEqual(workdaysIn('2026-11-13', '2026-11-12'), []);
});
