import React, { useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { pushSupported, enablePush, disablePush, currentSubscription } from '../shared/push.js';
import { LANGS } from './i18n.js';
import { money, clock, dayMonth } from '../shared/format.js';

export function AccountScreen({ t, lang, setLang, go, me, setMe, refreshMe, name, setCart, menu }) {
  const [orders, setOrders] = useState([]);
  const [pushOn, setPushOn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const customer = me.customer;

  useEffect(() => {
    if (!customer) return;
    api('/orders').then((r) => setOrders(r.orders)).catch(() => {});
    currentSubscription().then((s) => setPushOn(Boolean(s)));
  }, [customer?.email, me.activeOrder?.status]);

  if (!customer) {
    return (
      <div className="stack">
        <h1 className="display">{t('cabinet')}</h1>
        <p className="muted">{t('noOrders')}</p>
        <button type="button" className="btn" onClick={() => go('/')}>{t('menu')}</button>
      </div>
    );
  }

  const repeat = (o) => {
    const ids = new Set(menu?.items.filter((i) => i.available).map((i) => i.id));
    const cart = {};
    for (const i of o.items) if (ids.has(i.itemId)) cart[i.itemId] = i.qty;
    setCart(cart);
    go('/checkout');
  };
  const setMail = async (on) => {
    const r = await api('/me', { method: 'PATCH', body: { emailNotifications: on } });
    setMe((m) => ({ ...m, customer: r.customer }));
  };
  const togglePush = async (on) => {
    if (on) setPushOn(await enablePush(me.vapidPublicKey));
    else { await disablePush(); setPushOn(false); }
  };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); await refreshMe(); go('/'); };
  const remove = async () => { await api('/me', { method: 'DELETE' }); setCart({}); await refreshMe(); go('/'); };

  const active = me.activeOrder;
  const banned = customer.bannedUntil && new Date(customer.bannedUntil) > new Date();
  const past = orders.filter((o) => o.id !== active?.id);

  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="display">{t('cabinet')}</h1>
        <button type="button" className="link" onClick={() => go('/')}>{t('menu')}</button>
      </div>
      <p className="muted">{customer.name} · {customer.email}</p>
      {banned && <p className="note">{t('bannedUntil', { t: dayMonth(customer.bannedUntil) })}</p>}

      {active && (
        <button type="button" className="active-order" onClick={() => go(`/order/${active.id}`)}>
          <span><small>{t('activeOrder')}</small><b className="display">№ {active.number}</b></span>
          <span className="right">{t('readyBy', { t: clock(active.readyAt) })}<br /><small>{t('open_')} →</small></span>
        </button>
      )}

      <h2 className="display h2">{t('history')}</h2>
      {past.length === 0 && <p className="muted">{t('noOrders')}</p>}
      <ul className="history">
        {past.map((o) => (
          <li key={o.id} className="card">
            <div>
              <b>{o.items.map((i) => name(i)).join(', ')}</b>
              <small className="muted">{dayMonth(o.createdAt)} · {money(o.total)} · {t(`st_${o.status}`)}</small>
            </div>
            <button type="button" className="btn small ghost" onClick={() => repeat(o)}>{t('repeat')}</button>
          </li>
        ))}
      </ul>

      <div className="settings card">
        <label className="row-between"><span>{t('language')}</span>
          <select id="account-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        {pushSupported() && (
          <label className="row-between"><span>{t('push')}</span>
            <input id="push" type="checkbox" className="switch" checked={pushOn} onChange={(e) => togglePush(e.target.checked)} />
          </label>
        )}
        <label className="row-between"><span>{t('emails')}</span>
          <input id="emails" type="checkbox" className="switch" checked={customer.emailNotifications} onChange={(e) => setMail(e.target.checked)} />
        </label>
      </div>

      <div className="row-between">
        {!confirmDelete
          ? <button type="button" className="link muted" onClick={() => setConfirmDelete(true)}>{t('deleteAccount')}</button>
          : <span className="confirm"><span>{t('deleteConfirm')}</span> <button type="button" className="btn small danger" onClick={remove}>{t('deleteAccount')}</button></span>}
        <button type="button" className="link" onClick={logout}>{t('logout')}</button>
      </div>
    </div>
  );
}
