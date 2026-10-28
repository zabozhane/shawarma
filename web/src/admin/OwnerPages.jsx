import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { errText } from './Admin.jsx';

const date = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const load = useCallback(() => api(`/admin/customers?q=${encodeURIComponent(q)}`).then((r) => setList(r.customers)), [q]);
  useEffect(() => {
    const timer = setTimeout(() => load().catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [load]);
  const ban = async (c, days) => { await api(`/admin/customers/${c.id}/ban`, { method: 'POST', body: { days } }); await load(); };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Клиенты</h1>
        <input id="customer-search" className="input search" placeholder="Почта или имя" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="muted">Сначала те, кто чаще не забирал заказы. Третий незабранный заказ за 60 дней блокирует почту на 30 дней автоматически.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Клиент</th><th>Заказов</th><th>Забрал</th><th>Не забрал</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {list.map((c) => {
              const banned = c.bannedUntil && new Date(c.bannedUntil) > new Date();
              return (
                <tr key={c.id}>
                  <td><b>{c.name || 'Без имени'}</b><br /><small className="muted">{c.email}</small></td>
                  <td>{c.orders}</td>
                  <td>{c.picked}</td>
                  <td className={c.noShows ? 'warn' : ''}>{c.noShows}</td>
                  <td>{banned ? <span className="tag red">Заблокирован до {date(c.bannedUntil)}</span> : <span className="tag green">Активен</span>}</td>
                  <td className="row-actions">
                    {banned
                      ? <button type="button" className="btn small ghost" onClick={() => ban(c, 0)}>Разблокировать</button>
                      : <button type="button" className="btn small ghost" onClick={() => ban(c, 30)}>Заблокировать на 30 дней</button>}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan="6" className="muted">Клиентов пока нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FIELDS = [
  ['Заказ', [
    ['maxPerOrder', 'Шаурм в одном заказе', 'number'],
    ['manualConfirm', 'Подтверждать заказы вручную', 'select', [['flagged', 'Только после «Не забрали»'], ['all', 'Все заказы'], ['none', 'Никогда']]],
  ]],
  ['Кухня', [
    ['slotMinutes', 'Длина окна, мин', 'select', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30']]],
    ['capacityPerSlot', 'Кухня успевает за окно, шаурм', 'number'],
    ['onlinePerSlotPeak', 'Онлайн-мест в окне в час пик', 'number'],
    ['onlinePerSlotOffPeak', 'Онлайн-мест в окне вне пика', 'number'],
    ['peakHours', 'Часы пик', 'peaks'],
    ['minPrepMinutes', 'Минимум на приготовление, мин', 'number'],
  ]],
  ['Часы работы', [
    ['openFrom', 'Открываемся', 'time'],
    ['openTo', 'Закрываемся', 'time'],
  ]],
  ['Незабранные заказы', [
    ['reminderAfterMinutes', 'Напомнить клиенту через, мин', 'number'],
    ['noShowAfterMinutes', '«Не забрали» доступно через, мин', 'number'],
    ['banStrikes', 'Блокировать после, раз', 'number'],
    ['strikeWindowDays', 'За сколько дней считать, дней', 'number'],
    ['banDays', 'Блокировать на, дней', 'number'],
  ]],
];

const peaksToText = (p) => p.map(([a, b]) => `${a}-${b}`).join(', ');
const textToPeaks = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split('-').map((n) => Number(n.trim())));

export function SettingsPage({ isOwner }) {
  const [form, setForm] = useState(null);
  const [peaks, setPeaks] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    api('/admin/settings').then((r) => { setForm(r.settings); setPeaks(peaksToText(r.settings.peakHours)); });
  }, []);
  if (!form) return null;

  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    const patch = {};
    for (const [, fields] of FIELDS) for (const [key] of fields) patch[key] = form[key];
    patch.peakHours = textToPeaks(peaks);
    try {
      const r = await api('/admin/settings', { method: 'PUT', body: patch });
      setForm(r.settings);
      setMsg({ ok: true, text: 'Сохранено' });
    } catch (err) { setMsg({ ok: false, text: errText(err) }); }
  };
  const set = (key, type) => (e) => setForm({ ...form, [key]: type === 'number' || key === 'slotMinutes' ? Number(e.target.value) : e.target.value });

  return (
    <form className="page" onSubmit={save}>
      <div className="page-head">
        <h1>Настройки</h1>
        {isOwner && <button type="submit" className="btn small">Сохранить</button>}
      </div>
      {!isOwner && <p className="muted">Настройки меняет владелец. Пауза приёма и «+10 мин» доступны на странице заказов.</p>}
      {msg && <p className={`note ${msg.ok ? 'ok' : ''}`} role="status">{msg.text}</p>}
      <fieldset disabled={!isOwner} className="settings-grid">
        {FIELDS.map(([title, fields]) => (
          <section key={title} className="card set-group">
            <h2>{title}</h2>
            {fields.map(([key, label, type, options]) => (
              <label key={key} className="field"><span>{label}</span>
                {type === 'select' && (
                  <select id={`s-${key}`} className="input" value={form[key]} onChange={set(key, type)}>
                    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                )}
                {type === 'number' && <input id={`s-${key}`} className="input" type="number" min="0" value={form[key]} onChange={set(key, type)} />}
                {type === 'time' && <input id={`s-${key}`} className="input" type="time" value={form[key]} onChange={set(key, type)} />}
                {type === 'peaks' && <input id={`s-${key}`} className="input" value={peaks} onChange={(e) => setPeaks(e.target.value)} placeholder="12-15, 18-21" />}
              </label>
            ))}
          </section>
        ))}
      </fieldset>
      <p className="muted">Пример: кухня делает 2 шаурмы за 10 минут, в час пик сайту достаётся 1 место, второе остаётся живой очереди.</p>
    </form>
  );
}

export function ReportsPage() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/admin/stats').then(setS); }, []);
  if (!s) return null;
  const tiles = [
    ['Заказов за сутки', s.today.orders], ['Выдано', s.today.picked], ['Выручка с сайта за сутки', `${s.today.revenue} ₽`],
    ['Не забрали за сутки', s.today.no_shows], ['Отменено', s.today.cancelled],
    ['Заказов за 7 дней', s.week.orders], ['Выручка за 7 дней', `${s.week.revenue} ₽`], ['Не забрали за 7 дней', s.week.no_shows],
  ];
  return (
    <div className="page">
      <h1>Отчёты</h1>
      <div className="tiles">
        {tiles.map(([label, value]) => <div key={label} className="tile card"><span className="muted">{label}</span><b>{value}</b></div>)}
      </div>
      <p className="muted">Здесь только заказы через сайт. Продажи у окошка сюда не попадают.</p>
    </div>
  );
}

export function StaffPage({ me }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ login: '', name: '', password: '', role: 'seller' });
  const [reset, setReset] = useState({});
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => api('/admin/staff').then((r) => setStaff(r.staff)), []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setMsg(null);
    try { await fn(); await load(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const add = (e) => {
    e.preventDefault();
    run(async () => { await api('/admin/staff', { method: 'POST', body: form }); setForm({ login: '', name: '', password: '', role: 'seller' }); }, 'Сотрудник добавлен');
  };

  return (
    <div className="page">
      <h1>Сотрудники</h1>
      {msg && <p className={`note ${msg.ok ? 'ok' : ''}`} role="status">{msg.text}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Новый пароль</th><th /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td><b>{s.login}</b></td>
                <td>{s.name}</td>
                <td>{s.role === 'owner' ? 'Владелец' : 'Продавец'}</td>
                <td>
                  <span className="inline">
                    <input id={`reset-${s.id}`} className="input" type="password" placeholder="не короче 8 символов" value={reset[s.id] || ''}
                      onChange={(e) => setReset({ ...reset, [s.id]: e.target.value })} autoComplete="new-password" />
                    <button type="button" className="btn small ghost" disabled={!reset[s.id]}
                      onClick={() => run(async () => { await api(`/admin/staff/${s.id}/password`, { method: 'PUT', body: { password: reset[s.id] } }); setReset({ ...reset, [s.id]: '' }); }, 'Пароль изменён')}>Сменить</button>
                  </span>
                </td>
                <td>{s.id !== me.id && <button type="button" className="btn small danger" onClick={() => run(() => api(`/admin/staff/${s.id}`, { method: 'DELETE' }), 'Сотрудник удалён')}>Удалить</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card add-staff" onSubmit={add}>
        <h2>Добавить сотрудника</h2>
        <div className="grid4">
          <label className="field"><span>Логин</span><input id="new-login" className="input" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required pattern="[a-zA-Z0-9_.\-]{3,30}" title="Латиница и цифры, от 3 символов" /></label>
          <label className="field"><span>Имя</span><input id="new-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Пароль</span><input id="new-password" className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
          <label className="field"><span>Роль</span>
            <select id="new-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="seller">Продавец</option><option value="owner">Владелец</option>
            </select>
          </label>
        </div>
        <button type="submit" className="btn small">Добавить</button>
      </form>
    </div>
  );
}

export function ProfilePage({ me }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api('/admin/me/password', { method: 'PUT', body: { current, next } });
      setCurrent(''); setNext('');
      setMsg({ ok: true, text: 'Пароль изменён' });
    } catch (err) { setMsg({ ok: false, text: errText(err) }); }
  };
  return (
    <div className="page">
      <h1>Профиль</h1>
      <p className="muted">Логин: {me.login}</p>
      <form className="card narrow" onSubmit={save}>
        <h2>Сменить пароль</h2>
        <label className="field"><span>Текущий пароль</span><input id="cur-password" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></label>
        <label className="field"><span>Новый пароль</span><input id="next-password" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
        {msg && <p className={`note ${msg.ok ? 'ok' : ''}`} role="status">{msg.text}</p>}
        <button type="submit" className="btn small">Сохранить</button>
      </form>
    </div>
  );
}
