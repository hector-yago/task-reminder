import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysLeft, dayKey, diffDays, inYearRange, isoDow, isValidKey, periodEnd, periodStart, weekDays } from '../js/periods.js';

test('semana: empieza en lunes y acaba en domingo', () => {
  assert.equal(periodStart('week', '2026-11-22'), '2026-11-16'); // domingo
  assert.equal(periodStart('week', '2026-11-23'), '2026-11-23'); // lunes
  assert.equal(periodEnd('week', '2026-11-23'), '2026-11-29');
  assert.equal(isoDow('2026-11-22'), 7);
  assert.deepEqual(weekDays('2026-11-25').length, 7);
});

test('mes: febrero bisiesto y fin de mes', () => {
  assert.equal(periodEnd('month', '2028-02-10'), '2028-02-29');
  assert.equal(periodEnd('month', '2026-02-10'), '2026-02-28');
  assert.equal(periodStart('month', '2026-12-31'), '2026-12-01');
});

test('trimestre y semestre', () => {
  assert.equal(periodStart('quarter', '2026-05-17'), '2026-04-01');
  assert.equal(periodEnd('quarter', '2026-05-17'), '2026-06-30');
  assert.equal(periodStart('quarter', '2026-12-31'), '2026-10-01');
  assert.equal(periodEnd('quarter', '2026-12-31'), '2026-12-31');
  assert.equal(periodStart('semester', '2026-06-30'), '2026-01-01');
  assert.equal(periodStart('semester', '2026-07-01'), '2026-07-01');
  assert.equal(periodEnd('semester', '2026-08-01'), '2026-12-31');
  assert.equal(periodEnd('semester', '2026-01-01'), '2026-06-30');
});

test('año y cambio de año', () => {
  assert.equal(periodStart('year', '2026-12-31'), '2026-01-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(periodStart('week', '2027-01-01'), '2026-12-28');
});

test('aritmética de días no se ve afectada por el cambio de horario', () => {
  assert.equal(diffDays('2026-03-30', '2026-03-28'), 2);
  assert.equal(diffDays('2026-10-26', '2026-10-24'), 2);
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(daysLeft('week', '2026-11-29'), 1);
  assert.equal(daysLeft('month', '2026-11-01'), 30);
});

test('dayKey local y validación', () => {
  assert.equal(dayKey(new Date(2026, 10, 22, 23, 59)), '2026-11-22');
  assert.ok(isValidKey('2028-02-29'));
  assert.ok(!isValidKey('2026-02-29'));
  assert.ok(!isValidKey('2026-2-1'));
});

test('rango anual que cruza fin de año', () => {
  assert.ok(inYearRange('2026-07-15', '06-15', '09-15'));
  assert.ok(!inYearRange('2026-09-16', '06-15', '09-15'));
  assert.ok(inYearRange('2026-12-31', '11-01', '03-31'));
  assert.ok(inYearRange('2027-02-01', '11-01', '03-31'));
  assert.ok(!inYearRange('2026-06-01', '11-01', '03-31'));
});
