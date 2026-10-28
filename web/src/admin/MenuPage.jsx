import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api.js';
import { errText } from './Admin.jsx';

const LANG_LABELS = { ru: 'Русский', en: 'English', zh: '中文', ko: '한국어', az: 'Azərbaycan', uz: 'Oʻzbek', tg: 'Тоҷикӣ', tr: 'Türkçe', kk: 'Қазақша' };

function ItemEditor({ item, categories, langs, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    names: { ...item.names }, descriptions: { ...item.descriptions }, price: item.price ?? '', categoryId: item.categoryId ?? categories[0]?.id, available: item.available ?? true,
  }));
  const [error, setError] = useState('');
  const setText = (field, l, v) => setForm((f) => ({ ...f, [field]: { ...f[field], [l]: v } }));
  const save = async (e) => {
    e.preventDefault();
    setError('');
    try { await onSave({ ...form, price: Number(form.price), categoryId: Number(form.categoryId) }); } catch (err) { setError(errText(err)); }
  };
  return (
    <form className="editor card" onSubmit={save}>
      <h2>{item.id ? 'Изменить позицию' : 'Новая позиция'}</h2>
      <div className="grid2">
        <label className="field"><span>Цена, ₽</span>
          <input id="item-price" className="input" type="number" min="0" step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
        </label>
        <label className="field"><span>Категория</span>
          <select id="item-category" className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.names.ru}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">Обязательно только название по-русски. На других языках, если перевода нет, клиент увидит русское название.</p>
      <div className="langs-table">
        <span className="th">Язык</span><span className="th">Название</span><span className="th">Описание</span>
        {langs.map((l) => (
          <React.Fragment key={l}>
            <span className="lang-name">{LANG_LABELS[l]}</span>
            <input id={`name-${l}`} className="input" lang={l} value={form.names[l] || ''} onChange={(e) => setText('names', l, e.target.value)} required={l === 'ru'} maxLength={120} />
            <input id={`desc-${l}`} className="input" lang={l} value={form.descriptions[l] || ''} onChange={(e) => setText('descriptions', l, e.target.value)} maxLength={120} />
          </React.Fragment>
        ))}
      </div>
      {error && <p className="note" role="alert">{error}</p>}
      <div className="btns">
        <button type="submit" className="btn">Сохранить</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

export function MenuPage({ isOwner }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api('/admin/menu').then(setData), []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  if (!data) return null;

  const run = async (fn) => {
    setError('');
    try { await fn(); await load(); } catch (e) { setError(errText(e)); }
  };
  const save = async (form) => {
    if (editing.id) await api(`/admin/menu/items/${editing.id}`, { method: 'PUT', body: form });
    else await api('/admin/menu/items', { method: 'POST', body: form });
    setEditing(null);
    await load();
  };
  const savePrice = (it, value) => {
    const price = Number(value);
    if (!Number.isInteger(price) || price === it.price) return;
    run(() => api(`/admin/menu/items/${it.id}`, { method: 'PUT', body: { ...it, price } }));
  };

  if (editing) {
    return <div className="page"><ItemEditor item={editing} categories={data.categories} langs={data.langs} onSave={save} onCancel={() => setEditing(null)} /></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Меню</h1>
        {isOwner && <button type="button" className="btn small" onClick={() => setEditing({ names: {}, descriptions: {} })}>+ Добавить позицию</button>}
      </div>
      {!isOwner && <p className="muted">Продавец может ставить позиции на стоп. Цены и состав меняет владелец.</p>}
      {error && <p className="note" role="alert">{error}</p>}

      {data.categories.map((c) => {
        const items = data.items.filter((i) => i.categoryId === c.id);
        return (
          <section key={c.id} className="menu-cat">
            <div className="page-head">
              <h2>{c.names.ru}</h2>
              {isOwner ? (
                <label className="check">
                  <input type="checkbox" id={`limit-${c.id}`} checked={c.countsInLimit}
                    onChange={(e) => run(() => api(`/admin/menu/categories/${c.id}`, { method: 'PUT', body: { names: c.names, countsInLimit: e.target.checked } }))} />
                  <span>Готовит кухня (занимает место в окне)</span>
                </label>
              ) : <span className="muted">{c.countsInLimit ? 'Готовит кухня' : 'Не нагружает кухню'}</span>}
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Позиция</th><th>Цена</th><th>Языки</th><th>В продаже</th>{isOwner && <th />}</tr></thead>
                <tbody>
                  {items.map((it) => {
                    const translated = data.langs.filter((l) => it.names[l]).length;
                    return (
                      <tr key={it.id} className={it.available ? '' : 'stopped'}>
                        <td><b>{it.names.ru}</b>{it.descriptions?.ru && <small className="muted"><br />{it.descriptions.ru}</small>}</td>
                        <td>
                          {isOwner
                            ? <input id={`price-${it.id}`} className="input price" type="number" min="0" defaultValue={it.price} key={it.price}
                                onBlur={(e) => savePrice(it, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label={`Цена: ${it.names.ru}`} />
                            : `${it.price} ₽`}
                        </td>
                        <td className={translated < data.langs.length ? 'warn' : ''}>{translated}/{data.langs.length}</td>
                        <td>
                          <input type="checkbox" className="switch" id={`avail-${it.id}`} checked={it.available} aria-label={`В продаже: ${it.names.ru}`}
                            onChange={(e) => run(() => api(`/admin/menu/items/${it.id}/available`, { method: 'PATCH', body: { available: e.target.checked } }))} />
                          {!it.available && <small className="muted"> стоп</small>}
                        </td>
                        {isOwner && (
                          <td className="row-actions">
                            <button type="button" className="btn small ghost" onClick={() => setEditing(it)}>Изменить</button>
                            {removing === it.id
                              ? <button type="button" className="btn small danger" onClick={() => run(() => api(`/admin/menu/items/${it.id}`, { method: 'DELETE' }))}>Точно убрать</button>
                              : <button type="button" className="btn small ghost" onClick={() => setRemoving(it.id)}>Убрать</button>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
