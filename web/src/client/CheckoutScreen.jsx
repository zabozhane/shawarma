import React, { useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { money, clock, errorText } from '../shared/format.js';

// Вход по почте: имя и адрес → код из письма. Это и есть регистрация.
function LoginForm({ t, lang, onDone }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/auth/request', { method: 'POST', body: { email, lang } });
      setSent(true);
    } catch (err) { setError(errorText(t, err)); }
    setBusy(false);
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/auth/verify', { method: 'POST', body: { email, code, name, lang } });
      await onDone();
    } catch (err) { setError(errorText(t, err)); setBusy(false); }
  };

  if (!sent) {
    return (
      <form className="stack" onSubmit={request}>
        <label className="field"><span>{t('yourName')}</span>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" required />
        </label>
        <label className="field"><span>{t('email')}</span>
          <input id="email" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="check">
          <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>{t('consent')}</span>
        </label>
        {error && <p className="note" role="alert">{error}</p>}
        <button type="submit" className="btn" disabled={busy || !consent}>{t('sendCode')}</button>
      </form>
    );
  }
  return (
    <form className="stack" onSubmit={verify}>
      <p className="note ok">{t('codeSent', { email })}</p>
      <label className="field"><span>{t('code')}</span>
        <input id="code" className="input code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric" autoComplete="one-time-code" pattern="\d{4}" required autoFocus />
      </label>
      {error && <p className="note" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={busy || code.length !== 4}>{t('confirm')}</button>
      <button type="button" className="link" onClick={() => { setSent(false); setCode(''); setError(''); }}>{t('otherEmail')}</button>
    </form>
  );
}

export function CheckoutScreen({ t, lang, go, me, refreshMe, lines, units, total, name, setCart }) {
  const [avail, setAvail] = useState(null);
  const [choice, setChoice] = useState('asap');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/availability?units=${Math.max(1, units)}`).then(setAvail).catch(() => {});
  }, [units]);

  if (!lines.length) {
    return (
      <div className="stack">
        <p className="muted">{t('noOrders')}</p>
        <button type="button" className="btn" onClick={() => go('/')}>{t('menu')}</button>
      </div>
    );
  }

  const place = async () => {
    setBusy(true); setError('');
    try {
      const body = { lines: lines.map((l) => ({ itemId: l.item.id, qty: l.qty })), lang };
      if (choice !== 'asap') body.readyAt = choice;
      const { order } = await api('/orders', { method: 'POST', body });
      setCart({});
      await refreshMe();
      go(`/order/${order.id}`, true);
    } catch (err) {
      setError(errorText(t, err));
      api(`/availability?units=${Math.max(1, units)}`).then(setAvail).catch(() => {});
      setBusy(false);
    }
  };

  const customer = me.customer;
  return (
    <div className="stack">
      <div className="row-between">
        <h1 className="display">{t('order')}</h1>
        <button type="button" className="link" onClick={() => go('/')}>{t('back')}</button>
      </div>
      <p className="muted">{t('payAtWindow')}</p>

      <ul className="lines card">
        {lines.map((l) => (
          <li key={l.item.id}><span>{name(l.item)} × {l.qty}</span><b>{money(l.item.price * l.qty)}</b></li>
        ))}
        <li className="sum"><span>{t('toPay')}</span><b>{money(total)}</b></li>
      </ul>

      {!customer && <LoginForm t={t} lang={lang} onDone={refreshMe} />}

      {customer && (
        <>
          <p className="muted">{customer.name} · {customer.email}</p>
          <fieldset className="times">
            <legend>{t('when')}</legend>
            {avail?.asap && (
              <label className={choice === 'asap' ? 'on' : ''}>
                <input type="radio" name="when" checked={choice === 'asap'} onChange={() => setChoice('asap')} />
                {t('asap', { t: clock(avail.asap) })}
              </label>
            )}
            {avail?.options.filter((o) => new Date(o.readyAt).getTime() !== new Date(avail.asap).getTime()).map((o) => {
              const iso = new Date(o.readyAt).toISOString();
              return (
                <label key={iso} className={`${choice === iso ? 'on' : ''}${o.available ? '' : ' no'}`}>
                  <input type="radio" name="when" disabled={!o.available} checked={choice === iso} onChange={() => setChoice(iso)} />
                  {clock(o.readyAt)}{o.available ? '' : ` · ${t('full')}`}
                </label>
              );
            })}
          </fieldset>
          {avail && !avail.accepting && <p className="note">{t('paused')}</p>}
          <p className="note ok">{t('cookNote')}</p>
          {error && <p className="note" role="alert">{error}</p>}
          <button type="button" className="btn dark wide" disabled={busy || !avail?.accepting || !avail?.asap} onClick={place}>
            <span>{t('place')}</span><span>{money(total)}</span>
          </button>
        </>
      )}
    </div>
  );
}
