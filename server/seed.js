// Стартовые данные: первый владелец и примерное меню, если база пустая
import { config } from './config.js';
import { query, tx } from './db.js';
import { hashPassword } from './auth.js';

const CATEGORIES = [
  { names: { ru: 'Шаурма', en: 'Shawarma', zh: '沙威玛', ko: '샤와르마', az: 'Şaurma', uz: 'Shaurma', tg: 'Шаурма', tr: 'Şavurma', kk: 'Шаурма' }, counts: true },
  { names: { ru: 'Закуски', en: 'Sides', zh: '小吃', ko: '사이드', az: 'Qəlyanaltılar', uz: 'Gazaklar', tg: 'Газакҳо', tr: 'Atıştırmalık', kk: 'Тіскебасарлар' }, counts: false },
  { names: { ru: 'Напитки', en: 'Drinks', zh: '饮料', ko: '음료', az: 'İçkilər', uz: 'Ichimliklar', tg: 'Нӯшокиҳо', tr: 'İçecekler', kk: 'Сусындар' }, counts: false },
  { names: { ru: 'Соусы', en: 'Sauces', zh: '酱料', ko: '소스', az: 'Souslar', uz: 'Souslar', tg: 'Чошниҳо', tr: 'Soslar', kk: 'Тұздықтар' }, counts: false },
];

const ITEMS = [
  [0, 280, { ru: 'Шаурма классическая', en: 'Classic shawarma', zh: '经典沙威玛', ko: '클래식 샤와르마', az: 'Klassik şaurma', uz: 'Klassik shaurma', tg: 'Шаурмаи классикӣ', tr: 'Klasik şavurma', kk: 'Классикалық шаурма' },
    { ru: 'Курица, овощи, чесночный соус', en: 'Chicken, vegetables, garlic sauce', zh: '鸡肉、蔬菜、蒜蓉酱', ko: '닭고기, 채소, 마늘 소스', az: 'Toyuq, tərəvəz, sarımsaq sousu', uz: 'Tovuq, sabzavotlar, sarimsoq sousi', tg: 'Мурғ, сабзавот, чошнии сирпиёз', tr: 'Tavuk, sebze, sarımsaklı sos', kk: 'Тауық, көкөніс, сарымсақ тұздығы' }],
  [0, 320, { ru: 'Шаурма сырная', en: 'Cheese shawarma', zh: '芝士沙威玛', ko: '치즈 샤와르마', az: 'Pendirli şaurma', uz: 'Pishloqli shaurma', tg: 'Шаурмаи панирдор', tr: 'Peynirli şavurma', kk: 'Ірімшікті шаурма' },
    { ru: 'Курица, сыр, халапеньо', en: 'Chicken, cheese, jalapeño', zh: '鸡肉、芝士、墨西哥辣椒', ko: '닭고기, 치즈, 할라피뇨', az: 'Toyuq, pendir, halapenyo', uz: 'Tovuq, pishloq, xalapenyo', tg: 'Мурғ, панир, халапеньо', tr: 'Tavuk, peynir, jalapeño', kk: 'Тауық, ірімшік, халапеньо' }],
  [0, 390, { ru: 'Шаурма XL', en: 'Shawarma XL', zh: '加大沙威玛', ko: '샤와르마 XL', az: 'Şaurma XL', uz: 'Shaurma XL', tg: 'Шаурма XL', tr: 'Şavurma XL', kk: 'Шаурма XL' },
    { ru: 'Двойное мясо', en: 'Double meat', zh: '双倍肉', ko: '고기 두 배', az: 'İkiqat ət', uz: 'Ikki barobar goʻsht', tg: 'Гӯшти дучанд', tr: 'Duble et', kk: 'Екі есе ет' }],
  [0, 360, { ru: 'Шаурма с говядиной', en: 'Beef shawarma', zh: '牛肉沙威玛', ko: '소고기 샤와르마', az: 'Mal ətli şaurma', uz: 'Mol goʻshtli shaurma', tg: 'Шаурма бо гӯшти гов', tr: 'Dana etli şavurma', kk: 'Сиыр етінен шаурма' },
    { ru: 'Говядина, овощи, томатный соус', en: 'Beef, vegetables, tomato sauce', zh: '牛肉、蔬菜、番茄酱', ko: '소고기, 채소, 토마토 소스', az: 'Mal əti, tərəvəz, pomidor sousu', uz: 'Mol goʻshti, sabzavotlar, pomidor sousi', tg: 'Гӯшти гов, сабзавот, чошнии помидор', tr: 'Dana eti, sebze, domates sosu', kk: 'Сиыр еті, көкөніс, қызанақ тұздығы' }],
  [0, 260, { ru: 'Фалафель в лаваше', en: 'Falafel wrap', zh: '炸豆丸卷饼', ko: '팔라펠 랩', az: 'Lavaşda falafel', uz: 'Lavashda falafel', tg: 'Фалафел дар лаваш', tr: 'Lavaşta falafel', kk: 'Лаваштағы фалафель' },
    { ru: 'Без мяса', en: 'Meat-free', zh: '素食', ko: '고기 없음', az: 'Ətsiz', uz: 'Goʻshtsiz', tg: 'Бе гӯшт', tr: 'Etsiz', kk: 'Етсіз' }],
  [1, 150, { ru: 'Картошка фри', en: 'French fries', zh: '薯条', ko: '감자튀김', az: 'Kartof fri', uz: 'Kartoshka fri', tg: 'Картошкаи фри', tr: 'Patates kızartması', kk: 'Фри картобы' }, {}],
  [2, 90, { ru: 'Айран', en: 'Ayran', zh: '艾兰酸奶', ko: '아이란', az: 'Ayran', uz: 'Ayron', tg: 'Айрон', tr: 'Ayran', kk: 'Айран' }, {}],
  [2, 100, { ru: 'Морс клюквенный', en: 'Cranberry mors', zh: '蔓越莓果汁', ko: '크랜베리 주스', az: 'Mərcanı şirəsi', uz: 'Klyukva sharbati', tg: 'Шарбати клюква', tr: 'Kızılcık şerbeti', kk: 'Мүкжидек шырыны' }, {}],
  [3, 40, { ru: 'Чесночный соус', en: 'Garlic sauce', zh: '蒜蓉酱', ko: '마늘 소스', az: 'Sarımsaq sousu', uz: 'Sarimsoq sousi', tg: 'Чошнии сирпиёз', tr: 'Sarımsaklı sos', kk: 'Сарымсақ тұздығы' }, {}],
  [3, 40, { ru: 'Острый соус', en: 'Hot sauce', zh: '辣酱', ko: '매운 소스', az: 'Acı sous', uz: 'Achchiq sous', tg: 'Чошнии тунд', tr: 'Acı sos', kk: 'Ащы тұздық' }, {}],
];

export async function seed() {
  const { rows: admins } = await query('SELECT count(*)::int AS n FROM admins');
  if (admins[0].n === 0) {
    await query("INSERT INTO admins (login, name, password_hash, role) VALUES ($1, 'Владелец', $2, 'owner')",
      [config.ownerLogin, await hashPassword(config.ownerPassword)]);
    console.log(`Создан владелец: логин «${config.ownerLogin}». Смените пароль в админке.`);
  }
  const { rows: cats } = await query('SELECT count(*)::int AS n FROM categories');
  if (cats[0].n > 0) return;
  await tx(async (db) => {
    const ids = [];
    for (const [i, c] of CATEGORIES.entries()) {
      const { rows } = await db.query('INSERT INTO categories (names, counts_in_limit, sort) VALUES ($1, $2, $3) RETURNING id', [c.names, c.counts, i]);
      ids.push(rows[0].id);
    }
    for (const [i, [cat, price, names, descriptions]] of ITEMS.entries()) {
      await db.query('INSERT INTO menu_items (category_id, names, descriptions, price, sort) VALUES ($1, $2, $3, $4, $5)',
        [ids[cat], names, descriptions, price, i]);
    }
  });
  console.log('Добавлено примерное меню.');
}
