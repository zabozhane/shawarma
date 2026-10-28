import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { pushSupported, enablePush, isIos, isStandalone, currentSubscription } from '../shared/push.js';
import { money, clock, errorText } from '../shared/format.js';

const STEPS = ['accepted', 'cooking', 'ready', 'picked_up'];

export function OrderScreen({ t, go, me, orderId, name, refreshMe }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [push, setPush] = useState('unknown');

  const load = useCallback(() => api(`/orders/${orderId}`).then((r) => setOrder(r.order)).catch((e) => setError(errorText(t, e))), [orderId, t]);
  // Активный заказ из /me обновляется по живому каналу; заодно перечитываем этот заказ
  useEffect(() => { load(); }, [load, me.activeOrder?.status, me.activeOrder?.readyAt]);

  useEffect(() => {
    if (!pushSupported()) { setPush(isIos() && !isStandalone() ? 'ios' : 'none'); return; }
    if (Notification.permission === 'denied') { setPush('none'); return; }
    currentSubscription().then((s) => setPush(s && Notification.permission === 'granted' ? 'on' : 'ask'));
  }, []);

  if (!me.customer && !order) {
    return <div className="stack"><p className="note">{error || t('e_generic')}</p><button type="button" className="btn" onClick={() => go('/')}>{t('menu')}</button></div>;
  }
  if (!order) return <div className="loading" aria-busy="true" />;

  const cancel = async () => {
    try {
      await api(`/orders/${order.id}/cancel`, { method: 'POST' });
      await Promise.all([load(), refreshMe()]);
    } catch (e) { setError(errorText(t, e)); }
  };
  const done = ['picked_up', 'no_show', 'cancelled', 'rejected'].includes(order.status);
  const stepIndex = STEPS.indexOf(order.status);

  return (
    <div className="stack order">
      <div className="row-between">
        <h1 className="display">{t('yourNumber')}</h1>
        <button type="button" className="link" onClick={() => go('/')}>{t('menu')}</button>
      </div>
      <p className="muted">{t('showNumber')}</p>

      <div className={`ticket ${order.status}`}>
        <small>{t(`st_${order.status}`)}</small>
        <span className="display num">{order.number}</span>
        <small>{order.name} · {t('readyBy', { t: clock(order.readyAt) })}</small>
      </div>

      {push === 'ask' && !done && (
        <div className="push-ask card">
          <span>{t('pushAsk')}</span>
          <button type="button" className="btn small" onClick={async () => setPush((await enablePush(me.vapidPublicKey)) ? 'on' : 'none')}>{t('yes')}</button>
        </div>
      )}
      {push === 'ios' && !done && <p className="note info">{t('iosHint')}</p>}

      {!done && (
        <ol className="timeline">
          {order.status === 'new' && <li className="now">{t('st_new')}</li>}
          {STEPS.map((s, i) => (
            <li key={s} className={i < stepIndex ? 'done' : i === stepIndex ? 'now' : ''}>
              {s === 'cooking' && stepIndex < 1 ? t('startAt', { t: clock(order.startAt) }) : t(`st_${s}`)}
            </li>
          ))}
        </ol>
      )}

      <ul className="lines card">
        {order.items.map((i) => <li key={i.itemId ?? name(i)}><span>{name(i)} × {i.qty}</span><b>{money(i.price * i.qty)}</b></li>)}
        <li className="sum"><span>{t('toPay')}</span><b>{money(order.total)}</b></li>
      </ul>

      {error && <p className="note" role="alert">{error}</p>}
      {order.canCancel && <button type="button" className="btn ghost" onClick={cancel}>{t('cancel')}</button>}
    </div>
  );
}
