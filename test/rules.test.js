import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderBlocker, needsManualConfirm, banAfterStrikes, countUnits } from '../server/rules.js';
import { DEFAULT_SETTINGS as settings } from '../server/config.js';
import { isDisposableEmail } from '../server/disposable.js';

const now = Date.parse('2026-10-28T10:00:00Z');
const shawarma = (qty) => ({ qty, categoryId: 1, counted: true, available: true });
const fries = (qty) => ({ qty, categoryId: 2, counted: true, available: true });
const drink = (qty) => ({ qty, categoryId: 3, counted: false, available: true });

test('кухня считает шаурму и закуски, но не напитки', () => {
  assert.equal(countUnits([shawarma(2), fries(1), drink(2)]), 3);
});

test('по 2 штуки из каждого раздела', () => {
  assert.equal(orderBlocker({ settings, lines: [shawarma(2), fries(2), drink(2)], customer: {}, hasActiveOrder: false, now }), null);
  assert.equal(orderBlocker({ settings, lines: [shawarma(1), fries(1)], customer: {}, hasActiveOrder: false, now }), null);
  assert.equal(orderBlocker({ settings, lines: [drink(3)], customer: {}, hasActiveOrder: false, now }), 'limit');
  assert.equal(orderBlocker({ settings, lines: [shawarma(1), { ...shawarma(2), id: 2 }], customer: {}, hasActiveOrder: false, now }), 'limit');
});

test('больше 2 шаурм нельзя', () => {
  assert.equal(orderBlocker({ settings, lines: [shawarma(3)], customer: {}, hasActiveOrder: false, now }), 'limit');
});

test('второй активный заказ нельзя', () => {
  assert.equal(orderBlocker({ settings, lines: [shawarma(1)], customer: {}, hasActiveOrder: true, now }), 'active_order');
});

test('заблокированный клиент не может заказать', () => {
  const customer = { banned_until: new Date(now + 1000).toISOString() };
  assert.equal(orderBlocker({ settings, lines: [shawarma(1)], customer, hasActiveOrder: false, now }), 'banned');
  const expired = { banned_until: new Date(now - 1000).toISOString() };
  assert.equal(orderBlocker({ settings, lines: [shawarma(1)], customer: expired, hasActiveOrder: false, now }), null);
});

test('пауза приёма и позиции на стопе', () => {
  assert.equal(orderBlocker({ settings: { ...settings, accepting: false }, lines: [shawarma(1)], customer: {}, hasActiveOrder: false, now }), 'paused');
  assert.equal(orderBlocker({ settings, lines: [{ ...shawarma(1), available: false }], customer: {}, hasActiveOrder: false, now }), 'unavailable');
});

test('после «Не забрали» заказы подтверждаются вручную', () => {
  assert.equal(needsManualConfirm({ settings, customerNoShows: 0, deviceNoShows: 0 }), false);
  assert.equal(needsManualConfirm({ settings, customerNoShows: 1, deviceNoShows: 0 }), true);
  assert.equal(needsManualConfirm({ settings, customerNoShows: 0, deviceNoShows: 1 }), true, 'новая почта на том же телефоне');
  assert.equal(needsManualConfirm({ settings: { ...settings, manualConfirm: 'all' }, customerNoShows: 0, deviceNoShows: 0 }), true);
});

test('третий незабранный заказ блокирует на 30 дней', () => {
  assert.equal(banAfterStrikes({ settings, strikes: 2, now }), null);
  assert.equal(banAfterStrikes({ settings, strikes: 3, now }).getTime(), now + 30 * 86_400_000);
});

test('одноразовая почта не принимается', () => {
  assert.equal(isDisposableEmail('x@mailinator.com'), true);
  assert.equal(isDisposableEmail('x@mail.ru'), false);
});
