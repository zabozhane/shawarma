import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asap, planFor, timeOptions, isOpenSlot, onlineCapacity } from '../server/slots.js';
import { DEFAULT_SETTINGS } from '../server/config.js';

const tz = 'Europe/Moscow';
const MIN = 60_000;
// 2026-10-28 13:15 по Москве (UTC+3)
const at = (hhmm) => Date.parse(`2026-10-28T${hhmm}:00+03:00`);
const ctx = (now, used = new Map(), patch = {}) => ({ now, used, tz, settings: { ...DEFAULT_SETTINGS, ...patch } });

test('в час пик онлайну достаётся одно место из двух', () => {
  const s = DEFAULT_SETTINGS;
  assert.equal(onlineCapacity(at('13:20'), s, tz), 1);
  assert.equal(onlineCapacity(at('16:00'), s, tz), 2);
});

test('окна вне часов работы закрыты', () => {
  const s = DEFAULT_SETTINGS;
  assert.equal(isOpenSlot(at('09:50'), s, tz), false);
  assert.equal(isOpenSlot(at('10:00'), s, tz), true);
  assert.equal(isOpenSlot(at('22:50'), s, tz), true);
  assert.equal(isOpenSlot(at('23:00'), s, tz), false);
});

test('пример из концепта: заказ из 2 шаурм встаёт в 13:50 и 14:00', () => {
  const used = new Map([[at('13:20'), 1], [at('13:30'), 1], [at('13:40'), 1]]);
  const plan = asap(2, ctx(at('13:15'), used));
  assert.equal(plan.readyAt, at('14:10'));
  assert.deepEqual(plan.slots.map((s) => s.start), [at('13:50'), at('14:00')]);
  assert.equal(plan.startAt, at('13:50'));
});

test('нельзя приготовить быстрее минимального времени', () => {
  const plan = asap(1, ctx(at('13:15')));
  // 13:15 + 10 минут = 13:25, ближайшее окно заканчивается в 13:30
  assert.equal(plan.readyAt, at('13:30'));
});

test('кнопка «+10 мин» сдвигает время', () => {
  const plan = asap(1, ctx(at('13:15'), new Map(), { delayMinutes: 10 }));
  assert.equal(plan.readyAt, at('13:40'));
});

test('заказ ко времени использует окна до этого времени', () => {
  const plan = planFor(at('14:00'), 2, ctx(at('13:15')));
  assert.deepEqual(plan.slots.map((s) => s.start), [at('13:40'), at('13:50')]);
  assert.equal(planFor(at('14:05'), 1, ctx(at('13:15'))), null, 'время не по сетке окон');
});

test('занятые окна помечаются недоступными', () => {
  const used = new Map([[at('13:20'), 1], [at('13:30'), 1]]);
  const { options } = timeOptions(1, ctx(at('13:15'), used), 3);
  assert.deepEqual(options.map((o) => [o.readyAt, o.available]), [
    [at('13:30'), false], [at('13:40'), false], [at('13:50'), true],
  ]);
});

test('после закрытия заказ не принимается', () => {
  assert.equal(asap(1, ctx(at('22:55')), 3), null);
});

test('вне часа пик два места в окне', () => {
  const plan = asap(2, ctx(at('16:00')));
  assert.equal(plan.readyAt, at('16:10'));
  assert.deepEqual(plan.slots, [{ start: at('16:00'), units: 2 }]);
  assert.equal(plan.readyAt - plan.startAt, 10 * MIN);
});
