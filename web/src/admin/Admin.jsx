import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { setTimezone } from '../shared/format.js';
import { OrdersPage } from './OrdersPage.jsx';
import { MenuPage } from './MenuPage.jsx';
import { CustomersPage, SettingsPage, StaffPage, ReportsPage, ProfilePage } from './OwnerPages.jsx';

const PAGES = [
  { id: 'orders', title: 'Заказы' },
  { id: 'menu', title: 'Меню' },
  { id: 'customers', title: 'Клиенты', owner: true },
  { id: 'settings', title: 'Настройки' },
  { id: 'reports', title: 'Отчёты', owner: true },
  { id: 'staff', title: 'Сотрудники', owner: true },
  { id: 'profile', title: 'Профиль' },
];

export const ERRORS = {
  bad_login: 'Неверный логин или пароль',
  locked: 'Слишком много попыток. Вход закрыт на 15 минут.',
  bad_password: 'Текущий пароль указан неверно',
  weak_password: 'Пароль должен быть не короче 8 символов',
  login_taken: 'Такой логин уже есть',
  owner_only: 'Это может сделать только владелец',
  too_early: 'Отметить «Не забрали» можно позже',
  bad_status: 'Заказ уже в другом статусе, обновите страницу',
  name_required: 'Укажите название по-русски',
  bad_price: 'Проверьте цену',
};
export const errText = (e) => ERRORS[e?.code] || (e?.code?.startsWith('invalid:') ? 'Проверьте значение поля' : 'Не получилось, попробуйте ещё раз');

function Login({ onDone }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/login', { method: 'POST', body: { login, password } });
      onDone();
    } catch (err) { setError(errText(err)); }
  };
  return (
    <div className="login-wrap">
      <form className="login card" onSubmit={submit}>
        <span className="logo display">ШАУРМА</span>
        <h1>Вход для сотрудников</h1>
        <label className="field"><span>Логин</span>
          <input id="login" className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field"><span>Пароль</span>
          <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="note" role="alert">{error}</p>}
        <button type="submit" className="btn">Войти</button>
      </form>
    </div>
  );
}

export function Admin() {
  const [me, setMe] = useState(undefined);
  const [page, setPage] = useState(() => location.hash.slice(1) || 'orders');
  const [newCount, setNewCount] = useState(0);

  const load = useCallback(() => api('/admin/me').then((m) => { setTimezone(m.timezone); setMe(m); }).catch(() => setMe(null)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onHash = () => setPage(location.hash.slice(1) || 'orders');
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (me === undefined) return null;
  if (!me) return <Login onDone={load} />;

  const isOwner = me.admin.role === 'owner';
  const pages = PAGES.filter((p) => !p.owner || isOwner);
  const current = pages.find((p) => p.id === page) ? page : 'orders';
  const logout = async () => { await api('/admin/logout', { method: 'POST' }); setMe(null); };
  const props = { me: me.admin, isOwner, vapidPublicKey: me.vapidPublicKey };

  return (
    <div className="admin">
      <nav className="side">
        <span className="logo display">ШАУРМА</span>
        {pages.map((p) => (
          <a key={p.id} href={`#${p.id}`} className={p.id === current ? 'on' : ''}>
            {p.title}{p.id === 'orders' && newCount > 0 && <em>{newCount}</em>}
          </a>
        ))}
        <div className="who">
          <span>{me.admin.name || me.admin.login} · {isOwner ? 'владелец' : 'продавец'}</span>
          <button type="button" className="link" onClick={logout}>Выйти</button>
        </div>
      </nav>
      <main className="main">
        {current === 'orders' && <OrdersPage {...props} onNewCount={setNewCount} />}
        {current === 'menu' && <MenuPage {...props} />}
        {current === 'customers' && <CustomersPage {...props} />}
        {current === 'settings' && <SettingsPage {...props} />}
        {current === 'reports' && <ReportsPage {...props} />}
        {current === 'staff' && <StaffPage {...props} />}
        {current === 'profile' && <ProfilePage {...props} />}
      </main>
    </div>
  );
}
