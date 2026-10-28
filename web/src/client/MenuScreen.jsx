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

  const cats = new Map(menu.categories.map((c) => [c.id, c]));
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
              const counted = cats.get(it.categoryId)?.countsInLimit;
              const blocked = !it.available || (counted && units >= max);
              const desc = it.descriptions?.[lang] || it.descriptions?.ru;
              return (
                <article key={it.id} className={`item card${it.available ? '' : ' off'}`}>
                  <div className={`pic c${(menu.categories.indexOf(c) % 4) + 1}`} aria-hidden="true" />
                  <div className="item-text">
                    <h3>{name(it)}</h3>
                    <p className="muted">
                      {!it.available ? t('soldOut') : [desc, !counted && t('noLimit')].filter(Boolean).join(' · ')}
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
        <div className="meter">
          <span>{t('inOrder')}</span>
          <b>{t('of', { n: units, m: max })}</b>
        </div>
        <div className="pips" aria-hidden="true">
          {Array.from({ length: max }, (_, i) => <i key={i} className={i < units ? 'on' : ''} />)}
        </div>
        {units >= max
          ? <p className="note">{t('limitMax')}</p>
          : <p className="hint muted">{t('limitHint', { n: max })}</p>}
        <button type="button" className="btn dark wide" disabled={total === 0} onClick={() => go('/checkout')}>
          <span>{t('checkout')}</span><span>{money(total)}</span>
        </button>
      </div>
    </div>
  );
}
