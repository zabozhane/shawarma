import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribe } from '../shared/api.js';
import { enablePush, pushSupported } from '../shared/push.js';
import { errText } from './Admin.jsx';
import { clock as time } from '../shared/format.js';

const LANG_NAMES = { ru: 'русский', en: 'английский', zh: 'китайский', ko: 'корейский', az: 'азербайджанский', uz: 'узбекский', tg: 'таджикский', tr: 'турецкий', kk: 'казахский' };
const minsSince = (d) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));

// Короткий громкий сигнал о новом заказе. Браузер разрешает звук только после нажатия, поэтому есть кнопка «Начать смену».
function beep(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime;
  [0, 0.25, 0.5].forEach((d) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, now + d);
    g.gain.exponentialRampToValueAtTime(0.4, now + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(now + d);
    o.stop(now + d + 0.22);
  });
}

function OrderCard({ o, act, isOwner }) {
  const items = o.items.map((i) => `${i.names.ru} × ${i.qty}`).join(', ');
  const waiting = o.status === 'ready' ? minsSince(o.readyMarkedAt) : 0;
  return (
    <article className={`ord card${o.status === 'ready' && o.canNoShow ? ' late' : ''}`}>
      <div className="r">
        <b className="display num">{o.number}</b>
        <span className="tags">
          {o.noShows > 0 && <span className="tag red">Не забирал: {o.noShows}</span>}
          {o.lang !== 'ru' && <span className="tag yellow">язык: {LANG_NAMES[o.lang]}</span>}
        </span>
      </div>
      <small className="muted">
        {o.name || 'Без имени'} · к {time(o.readyAt)}
        {['new', 'accepted'].includes(o.status) && ` · начать в ${time(o.startAt)}`}
        {o.status === 'ready' && ` · ждёт ${waiting} мин`}
      </small>
      <span className="items">{items}</span>
      <small className="muted">{o.total} ₽ на месте</small>
      <div className="btns">
        {o.status === 'new' && <>
          <button type="button" className="btn small" onClick={() => act(o, 'accept')}>Принять</button>
          <button type="button" className="btn small ghost" onClick={() => act(o, 'reject')}>Отклонить</button>
        </>}
        {o.status === 'accepted' && <>
          <button type="button" className="btn small" onClick={() => act(o, 'cook')}>Готовлю</button>
          <button type="button" className="btn small ghost" onClick={() => act(o, 'ready')}>Готово</button>
        </>}
        {o.status === 'cooking' && <button type="button" className="btn small" onClick={() => act(o, 'ready')}>Готово</button>}
        {['new', 'accepted', 'cooking'].includes(o.status) && (
          <button type="button" className="btn small ghost" onClick={() => act(o, 'delay')} title="Клиенту придёт новое время">+10 мин</button>
        )}
        {o.status === 'accepted' && <button type="button" className="btn small ghost" onClick={() => act(o, 'reject')}>Отменить</button>}
        {o.status === 'ready' && <>
          <button type="button" className="btn small" onClick={() => act(o, 'pickup')}>Выдан</button>
          {o.canNoShow && <button type="button" className="btn small danger" onClick={() => act(o, 'no_show')}>Не забрали</button>}
        </>}
        {o.status === 'no_show' && isOwner && (
          <button type="button" className="btn small ghost" onClick={() => act(o, 'clear_no_show')} title="Если отметили по ошибке">Снять отметку</button>
        )}
      </div>
    </article>
  );
}

const DONE_TITLES = { picked_up: 'Выдан', no_show: 'Не забрали', cancelled: 'Отменён', rejected: 'Отклонён' };

export function OrdersPage({ isOwner, vapidPublicKey, onNewCount }) {
  const [orders, setOrders] = useState([]);
  const [load, setLoad] = useState(null);
  const [shift, setShift] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef(null);

  const refresh = useCallback(async () => {
    const [o, l] = await Promise.all([api('/admin/orders'), api('/admin/load')]);
    setOrders(o.orders);
    setLoad(l);
    onNewCount(o.orders.filter((x) => x.status === 'new').length);
  }, [onNewCount]);

  useEffect(() => {
    refresh().catch(() => {});
    const timer = setInterval(() => refresh().catch(() => {}), 30_000);
    const stop = subscribe('/admin/stream', {
      order: () => refresh().catch(() => {}),
      staff: (e) => {
        if (e.title?.startsWith('Новый заказ')) beep(audio.current);
        refresh().catch(() => {});
      },
    });
    return () => { clearInterval(timer); stop(); };
  }, [refresh]);

  const act = async (o, action) => {
    setError('');
    try { await api(`/admin/orders/${o.id}/${action}`, { method: 'POST' }); await refresh(); } catch (e) { setError(errText(e)); }
  };
  const setShop = async (patch) => {
    try { await api('/admin/settings', { method: 'PUT', body: patch }); await refresh(); } catch (e) { setError(errText(e)); }
  };
  const startShift = async () => {
    audio.current = audio.current || new AudioContext();
    await audio.current.resume();
    beep(audio.current);
    setShift(true);
    if (pushSupported()) enablePush(vapidPublicKey, '/admin/push/subscribe').catch(() => {});
  };

  const by = (statuses) => orders.filter((o) => statuses.includes(o.status));
  const done = orders.filter((o) => DONE_TITLES[o.status]).reverse();
  const wait = load?.waitMinutes;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Заказы сегодня</h1>
        <div className="ctrls">
          {load && !load.accepting && <span className="tag red">Приём на паузе</span>}
          {load?.accepting && wait != null && (
            <span className={`tag ${wait > 25 ? 'red' : 'green'}`}>Онлайн-заказ будет готов через ~{wait} мин</span>
          )}
          {load?.delayMinutes > 0 && <span className="tag yellow">Задержка +{load.delayMinutes} мин</span>}
          <button type="button" className="btn small ghost" onClick={() => setShop({ delayMinutes: (load?.delayMinutes || 0) + 10 })}>+10 мин</button>
          {load?.delayMinutes > 0 && <button type="button" className="btn small ghost" onClick={() => setShop({ delayMinutes: 0 })}>Без задержки</button>}
          <button type="button" className={`btn small ${load?.accepting ? 'ghost' : ''}`} onClick={() => setShop({ accepting: !load?.accepting })}>
            {load?.accepting ? 'Пауза приёма' : 'Возобновить приём'}
          </button>
          {!shift && <button type="button" className="btn small dark" onClick={startShift}>Начать смену: звук и пуш</button>}
        </div>
      </div>
      {error && <p className="note" role="alert">{error}</p>}

      <div className="cols">
        <section className="col"><h2>Новые <span>{by(['new']).length}</span></h2>
          {by(['new']).map((o) => <OrderCard key={o.id} o={o} act={act} isOwner={isOwner} />)}
          {by(['new']).length === 0 && <p className="empty">Новые заказы появятся здесь со звуком</p>}
        </section>
        <section className="col"><h2>Готовятся <span>{by(['accepted', 'cooking']).length}</span></h2>
          {by(['accepted', 'cooking']).map((o) => <OrderCard key={o.id} o={o} act={act} isOwner={isOwner} />)}
        </section>
        <section className="col"><h2>Ждут выдачи <span>{by(['ready']).length}</span></h2>
          {by(['ready']).map((o) => <OrderCard key={o.id} o={o} act={act} isOwner={isOwner} />)}
        </section>
      </div>

      {done.length > 0 && (
        <details className="done">
          <summary>Завершённые за 3 часа: {done.length}</summary>
          <div className="done-list">
            {done.map((o) => (
              <div key={o.id} className="done-row">
                <b className="display">{o.number}</b>
                <span>{o.name}</span>
                <span className="muted">{o.items.map((i) => `${i.names.ru} × ${i.qty}`).join(', ')}</span>
                <span className={`tag ${o.status === 'picked_up' ? 'green' : 'red'}`}>{DONE_TITLES[o.status]}</span>
                {o.status === 'no_show' && isOwner && <button type="button" className="btn small ghost" onClick={() => act(o, 'clear_no_show')}>Снять отметку</button>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
