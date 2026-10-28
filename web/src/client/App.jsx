import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, subscribe } from '../shared/api.js';
import { LANGS, detectLang, makeT, pick } from './i18n.js';
import { MenuScreen } from './MenuScreen.jsx';
import { CheckoutScreen } from './CheckoutScreen.jsx';
import { OrderScreen } from './OrderScreen.jsx';
import { AccountScreen } from './AccountScreen.jsx';
import { setTimezone } from '../shared/format.js';

// Простой роутер на history API: /, /checkout, /order/:id, /account
function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((to, replace = false) => {
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPath(to);
    scrollTo(0, 0);
  }, []);
  return [path, go];
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '{}'); } catch { return {}; }
}

export function App() {
  const [path, go] = useRoute();
  const [lang, setLangState] = useState(detectLang);
  const t = useMemo(() => makeT(lang), [lang]);
  const [me, setMe] = useState({ customer: null, activeOrder: null, vapidPublicKey: '' });
  const [menu, setMenu] = useState(null);
  const [cart, setCart] = useState(loadCart);

  const refreshMe = useCallback(() => api('/me').then(setMe).catch(() => {}), []);
  useEffect(() => {
    refreshMe();
    api('/menu').then((m) => { setTimezone(m.timezone); setMenu(m); }).catch(() => setMenu({ categories: [], items: [], maxPerOrder: 2, error: true }));
  }, [refreshMe]);

  // Пока есть вход, слушаем изменения своих заказов
  useEffect(() => {
    if (!me.customer) return undefined;
    return subscribe('/stream', { order: () => refreshMe() });
  }, [me.customer?.email, refreshMe]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* без хранилища */ }
  }, [lang]);
  useEffect(() => {
    try { localStorage.setItem('cart', JSON.stringify(cart)); } catch { /* без хранилища */ }
  }, [cart]);

  const setLang = (l) => {
    setLangState(l);
    if (me.customer) api('/me', { method: 'PATCH', body: { lang: l } }).catch(() => {});
  };

  // Корзина: что в ней лежит и сколько позиций идёт в лимит
  const lines = useMemo(() => {
    if (!menu) return [];
    const cats = new Map(menu.categories.map((c) => [c.id, c]));
    return menu.items
      .filter((it) => cart[it.id] > 0)
      .map((it) => ({ item: it, qty: cart[it.id], counted: cats.get(it.categoryId)?.countsInLimit ?? true }));
  }, [menu, cart]);
  const units = lines.reduce((s, l) => s + (l.counted ? l.qty : 0), 0);
  const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);

  const ctx = {
    t, lang, setLang, go, me, setMe, refreshMe, menu, cart, setCart, lines, units, total,
    name: (item) => pick(item.names, lang),
  };

  let screen;
  const orderMatch = path.match(/^\/order\/(\d+)$/);
  if (path === '/checkout') screen = <CheckoutScreen {...ctx} />;
  else if (orderMatch) screen = <OrderScreen {...ctx} orderId={Number(orderMatch[1])} />;
  else if (path === '/account') screen = <AccountScreen {...ctx} />;
  else screen = <MenuScreen {...ctx} />;

  return (
    <div className="app">
      <header className="top">
        <button type="button" className="brand display" onClick={() => go('/')}>ШАУРМА</button>
        <div className="top-actions">
          <label className="lang">
            <span className="sr">{t('language')}</span>
            <select id="lang" value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <button type="button" className="account-btn" onClick={() => go('/account')} aria-label={t('cabinet')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>
      <main className="screen">{screen}</main>
    </div>
  );
}
