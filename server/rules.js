// Правила защиты от незабранных заказов. Чистые функции, их проверяют тесты.

const DAY = 86_400_000;

// Сколько позиций заказа готовит кухня (шаурма и закуски, но не напитки и соусы)
export function countUnits(lines) {
  return lines.reduce((sum, l) => sum + (l.counted ? l.qty : 0), 0);
}

// Сколько штук заказано из каждого раздела меню
export function countByCategory(lines) {
  const counts = new Map();
  for (const l of lines) counts.set(l.categoryId, (counts.get(l.categoryId) || 0) + l.qty);
  return counts;
}

// Можно ли оформить заказ. Возвращает код ошибки или null.
export function orderBlocker({ settings, lines, customer, hasActiveOrder, now }) {
  if (!settings.accepting) return 'paused';
  if (!lines.length || lines.every((l) => l.qty <= 0)) return 'empty';
  if (lines.some((l) => !l.available)) return 'unavailable';
  if ([...countByCategory(lines).values()].some((n) => n > settings.maxPerOrder)) return 'limit';
  if (customer?.banned_until && new Date(customer.banned_until).getTime() > now) return 'banned';
  if (hasActiveOrder) return 'active_order';
  return null;
}

// Нужно ли продавцу подтверждать заказ вручную
export function needsManualConfirm({ settings, customerNoShows, deviceNoShows }) {
  if (settings.manualConfirm === 'all') return true;
  if (settings.manualConfirm === 'none') return false;
  return customerNoShows > 0 || deviceNoShows > 0;
}

// После отметки «Не забрали»: до какого времени блокировать клиента (или null)
export function banAfterStrikes({ settings, strikes, now }) {
  if (strikes < settings.banStrikes) return null;
  return new Date(now + settings.banDays * DAY);
}

export const strikeWindowStart = (settings, now) => new Date(now - settings.strikeWindowDays * DAY);
