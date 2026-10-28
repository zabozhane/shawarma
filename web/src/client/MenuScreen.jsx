import React, { useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { money, clock } from '../shared/format.js';

export function MenuScreen({ t, lang, go, me, menu, cart, setCart, units, total, name }) {
  const [avail, setAvail] = useState(null);
  const max = menu?.maxPerOrder ?? 2;

  useEffect(() => {
    const load = () => api(`/availability?units=${Math.max(1, units)}`).then(setAvail).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [units]);

  if (!menu) return <div className="loading" aria-busy="true" />;

  const inCategory = new Map();
  for (const it of menu.items) if (cart[it.id]) inCategory.set(it.categoryId, (inCategory.get(it.categoryId) || 0) + cart[it.id]);
  const full = menu.categories.filter((c) => (inCategory.get(c.id) || 0) >= max);
  const change = (item, d) => setCart((c) => {
    const next = { ...c, [item.id]: Math.max(0, (c[item.id] || 0) + d) };
    if (!next[item.id]) delete next[item.id];
    return next;
  });
  const active = me.activeOrder;

  return (
    <div className="menu">
      {active && (
        <button type="button" className="active-order" onClick={() => go(`/order/${active.id}`)}>
          <span><small>{t('activeOrder')}</small><b className="display">№ {active.number}</b></span>
          <span className="right">{t(`st_${active.status}`)}<br /><small>{t('readyBy', { t: clock(active.readyAt) })}</small></span>
        </button>
      )}

      {avail && !avail.accepting && <p className="note">{t('paused')}</p>}
      {avail?.accepting && avail.waitMinutes != null && (
        <p className={`note ${avail.waitMinutes > 25 ? 'info' : 'ok'}`}>
          {avail.waitMinutes > 25 ? t('busy', { m: avail.waitMinutes }) : t('wait', { m: avail.waitMinutes })}
        </p>
      )}
      {avail?.accepting && avail.waitMinutes == null && <p className="note info">{t('closed')}</p>}

      <nav className="chips" aria-label={t('menu')}>
        {menu.categories.map((c) => (
          <a key={c.id} href={`#cat-${c.id}`}>{c.names[lang] || c.names.ru}</a>
        ))}
      </nav>

      {menu.categories.map((c) => {
        const items = menu.items.filter((it) => it.categoryId === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id} id={`cat-${c.id}`} className="cat">
            <h2 className="display">{c.names[lang] || c.names.ru}</h2>
            {items.map((it) => {
              const qty = cart[it.id] || 0;
              const blocked = !it.available || (inCategory.get(c.id) || 0) >= max;
              const desc = it.descriptions?.[lang] || it.descriptions?.ru;
              return (
                <article key={it.id} className={`item card${it.available ? '' : ' off'}`}>
                  <div className={`pic c${(menu.categories.indexOf(c) % 4) + 1}`} aria-hidden="true" />
                  <div className="item-text">
                    <h3>{name(it)}</h3>
                    <p className="muted">
                      {!it.available ? t('soldOut') : desc}
                    </p>
                    <b className="price">{money(it.price)}</b>
                  </div>
                  <div className="qty">
                    {qty > 0 && (
                      <>
                        <button type="button" className="minus" onClick={() => change(it, -1)} aria-label={`− ${name(it)}`}>−</button>
                        <span aria-live="polite">{qty}</span>
                      </>
                    )}
                    <button type="button" onClick={() => change(it, 1)} disabled={blocked} aria-label={`+ ${name(it)}`}>+</button>
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}

      <div className="cart-bar">
        {full.length
          ? full.map((c) => <p key={c.id} className="note">{t('limitMax', { c: c.names[lang] || c.names.ru, n: max })}</p>)
          : <p className="hint muted">{t('limitHint', { n: max })}</p>}
        <button type="button" className="btn dark wide" disabled={total === 0} onClick={() => go('/checkout')}>
          <span>{t('checkout')}</span><span>{money(total)}</span>
        </button>
      </div>
    </div>
  );
}
