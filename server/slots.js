// Расчёт загрузки кухни. День делится на окна по slotMinutes минут.
// В каждое окно кухня успевает сделать capacityPerSlot шаурм, но онлайн-заказам
// в час пик достаётся только onlinePerSlotPeak мест, остальное для живой очереди.
// Заказ из N шаурм занимает свободные онлайн-места в окнах, которые заканчиваются
// не позже времени готовности. Всё здесь — чистые функции, их проверяют тесты.

const MIN = 60_000;

const partsCache = new Map();
function formatter(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }));
  }
  return partsCache.get(tz);
}

// Местные часы, минуты и дата в часовом поясе ларька
export function localParts(ms, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { hour: Number(p.hour), minute: Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

export function isOpenSlot(slotStart, s, tz) {
  const open = toMinutes(s.openFrom);
  let close = toMinutes(s.openTo);
  if (close <= open) close += 1440; // работа после полуночи
  const { hour, minute } = localParts(slotStart, tz);
  let m = hour * 60 + minute;
  if (m < open) m += 1440;
  return m >= open && m + s.slotMinutes <= close;
}

export function isPeak(slotStart, s, tz) {
  const { hour } = localParts(slotStart, tz);
  return s.peakHours.some(([from, to]) => hour >= from && hour < to);
}

export function onlineCapacity(slotStart, s, tz) {
  if (!isOpenSlot(slotStart, s, tz)) return 0;
  const online = isPeak(slotStart, s, tz) ? s.onlinePerSlotPeak : s.onlinePerSlotOffPeak;
  return Math.max(0, Math.min(online, s.capacityPerSlot));
}

// Самое раннее время, к которому можно что-то приготовить
export function earliestReady(now, s) {
  return now + (s.minPrepMinutes + s.delayMinutes) * MIN;
}

const ceilTo = (ms, step) => Math.ceil(ms / step) * step;

// План для заказа «к target»: идём назад от окна, которое заканчивается в target
export function planFor(target, units, ctx) {
  const { now, used, settings: s, tz } = ctx;
  const slotMs = s.slotMinutes * MIN;
  const first = earliestReady(now, s);
  if (target < first || target % slotMs !== 0) return null;
  if (!isOpenSlot(target - slotMs, s, tz)) return null;
  const slots = [];
  let left = units;
  for (let start = target - slotMs; start + slotMs >= first && left > 0; start -= slotMs) {
    const free = onlineCapacity(start, s, tz) - (used.get(start) || 0);
    if (free <= 0) continue;
    const take = Math.min(free, left);
    slots.unshift({ start, units: take });
    left -= take;
  }
  if (left > 0) return null;
  return { readyAt: target, startAt: slots[0].start, slots };
}

// Ближайшее время готовности для заказа из units шаурм
export function asap(units, ctx, horizonSlots = 72) {
  const slotMs = ctx.settings.slotMinutes * MIN;
  let target = ceilTo(earliestReady(ctx.now, ctx.settings), slotMs);
  for (let i = 0; i < horizonSlots; i++, target += slotMs) {
    const plan = planFor(target, units, ctx);
    if (plan) return plan;
  }
  return null;
}

// Варианты «ко времени» для экрана оформления
export function timeOptions(units, ctx, count = 8) {
  const slotMs = ctx.settings.slotMinutes * MIN;
  const best = asap(units, ctx);
  if (!best) return { asap: null, options: [] };
  const options = [];
  let target = ceilTo(earliestReady(ctx.now, ctx.settings), slotMs);
  for (let i = 0; options.length < count && i < 72; i++, target += slotMs) {
    if (!isOpenSlot(target - slotMs, ctx.settings, ctx.tz)) continue;
    options.push({ readyAt: target, available: Boolean(planFor(target, units, ctx)) });
  }
  return { asap: best, options };
}
