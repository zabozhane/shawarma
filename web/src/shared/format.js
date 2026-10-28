// Время показываем в часовом поясе ларька, даже если телефон настроен на другой
let timeZone;
export const setTimezone = (tz) => { timeZone = tz; };

export const money = (n) => `${n.toLocaleString('ru-RU')} ₽`;
export const clock = (date) => new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone });
export const dayMonth = (date) => new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: '2-digit', timeZone });

export const errorText = (t, err) => {
  const key = `e_${err?.code}`;
  const text = t(key);
  return text === key ? t('e_generic') : text;
};
