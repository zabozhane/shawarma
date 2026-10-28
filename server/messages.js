// Тексты писем и пуш-уведомлений клиенту на девяти языках.
// {n} — номер заказа, {time} — время готовности, {code} — код входа.
const M = {
  ru: {
    code: ['Код для входа: {code}', 'Ваш код для входа на сайт Шаурма: {code}. Он действует 10 минут.'],
    accepted: ['Заказ №{n} принят', 'Будет готов к {time}. Покажите номер у окошка.'],
    delayed: ['Заказ №{n}: новое время', 'Будет готов к {time}. Если не подходит, заказ можно отменить.'],
    ready: ['Заказ №{n} готов', 'Подходите к окошку и покажите номер.'],
    reminder: ['Заказ №{n} ждёт вас', 'Шаурма готова и остывает. Подходите к окошку.'],
    rejected: ['Заказ №{n} отклонён', 'Ларёк не может принять этот заказ. Попробуйте заказать на месте.'],
  },
  en: {
    code: ['Your login code: {code}', 'Your Shawarma login code: {code}. It is valid for 10 minutes.'],
    accepted: ['Order #{n} accepted', 'Ready by {time}. Show the number at the window.'],
    delayed: ['Order #{n}: new time', "Ready by {time}. If that doesn't suit you, you can cancel the order."],
    ready: ['Order #{n} is ready', 'Come to the window and show your number.'],
    reminder: ['Order #{n} is waiting', 'Your shawarma is ready and getting cold. Come to the window.'],
    rejected: ['Order #{n} declined', "The stall can't take this order. Please order at the window."],
  },
  zh: {
    code: ['您的登录验证码：{code}', '您在沙威玛网站的登录验证码：{code}，10分钟内有效。'],
    accepted: ['订单 {n} 号已接受', '预计 {time} 做好。请在窗口出示订单号。'],
    delayed: ['订单 {n} 号：时间已更改', '预计 {time} 做好。如不合适，可以取消订单。'],
    ready: ['订单 {n} 号已做好', '请到窗口出示订单号取餐。'],
    reminder: ['订单 {n} 号在等您', '沙威玛已做好，快凉了，请尽快到窗口取餐。'],
    rejected: ['订单 {n} 号被拒绝', '店铺无法接受此订单，请到窗口点餐。'],
  },
  ko: {
    code: ['로그인 코드: {code}', '샤와르마 로그인 코드: {code}. 10분 동안 유효합니다.'],
    accepted: ['주문 {n}번 접수됨', '{time}까지 준비됩니다. 창구에서 번호를 보여주세요.'],
    delayed: ['주문 {n}번: 시간 변경', '{time}까지 준비됩니다. 맞지 않으면 주문을 취소할 수 있어요.'],
    ready: ['주문 {n}번 준비 완료', '창구로 오셔서 번호를 보여주세요.'],
    reminder: ['주문 {n}번이 기다리고 있어요', '샤와르마가 식고 있어요. 창구로 와 주세요.'],
    rejected: ['주문 {n}번 거절됨', '가게에서 이 주문을 받을 수 없어요. 매장에서 주문해 주세요.'],
  },
  az: {
    code: ['Giriş kodu: {code}', 'Şaurma saytına giriş kodunuz: {code}. Kod 10 dəqiqə etibarlıdır.'],
    accepted: ['Sifariş №{n} qəbul edildi', '{time} hazır olacaq. Nömrəni pəncərədə göstərin.'],
    delayed: ['Sifariş №{n}: yeni vaxt', '{time} hazır olacaq. Uyğun deyilsə, sifarişi ləğv edə bilərsiniz.'],
    ready: ['Sifariş №{n} hazırdır', 'Pəncərəyə yaxınlaşın və nömrəni göstərin.'],
    reminder: ['Sifariş №{n} sizi gözləyir', 'Şaurma hazırdır və soyuyur. Pəncərəyə yaxınlaşın.'],
    rejected: ['Sifariş №{n} rədd edildi', 'Kiosk bu sifarişi qəbul edə bilmir. Yerində sifariş edin.'],
  },
  uz: {
    code: ['Kirish kodi: {code}', 'Shaurma saytiga kirish kodingiz: {code}. Kod 10 daqiqa amal qiladi.'],
    accepted: ['№{n} buyurtma qabul qilindi', '{time} da tayyor boʻladi. Raqamni darchada koʻrsating.'],
    delayed: ['№{n} buyurtma: yangi vaqt', '{time} da tayyor boʻladi. Toʻgʻri kelmasa, buyurtmani bekor qilishingiz mumkin.'],
    ready: ['№{n} buyurtma tayyor', 'Darchaga keling va raqamni koʻrsating.'],
    reminder: ['№{n} buyurtma sizni kutmoqda', 'Shaurma tayyor va sovumoqda. Darchaga keling.'],
    rejected: ['№{n} buyurtma rad etildi', 'Doʻkon bu buyurtmani qabul qila olmaydi. Joyida buyurtma bering.'],
  },
  tg: {
    code: ['Рамзи воридшавӣ: {code}', 'Рамзи воридшавии шумо ба сайти Шаурма: {code}. Он 10 дақиқа эътибор дорад.'],
    accepted: ['Фармоиши №{n} қабул шуд', 'То соати {time} тайёр мешавад. Рақамро дар тиреза нишон диҳед.'],
    delayed: ['Фармоиши №{n}: вақти нав', 'То соати {time} тайёр мешавад. Агар мувофиқ набошад, фармоишро бекор кардан мумкин аст.'],
    ready: ['Фармоиши №{n} тайёр аст', 'Ба тиреза наздик шавед ва рақамро нишон диҳед.'],
    reminder: ['Фармоиши №{n} шуморо интизор аст', 'Шаурма тайёр аст ва хунук мешавад. Ба тиреза наздик шавед.'],
    rejected: ['Фармоиши №{n} рад шуд', 'Дӯкон ин фармоишро қабул карда наметавонад. Дар ҷо фармоиш диҳед.'],
  },
  tr: {
    code: ['Giriş kodunuz: {code}', 'Şavurma sitesi giriş kodunuz: {code}. 10 dakika geçerlidir.'],
    accepted: ['{n} numaralı sipariş alındı', 'Saat {time} itibarıyla hazır olacak. Numarayı gişede gösterin.'],
    delayed: ['{n} numaralı sipariş: yeni saat', 'Saat {time} itibarıyla hazır olacak. Uygun değilse siparişi iptal edebilirsiniz.'],
    ready: ['{n} numaralı sipariş hazır', 'Gişeye gelip numaranızı gösterin.'],
    reminder: ['{n} numaralı sipariş sizi bekliyor', 'Şavurmanız hazır ve soğuyor. Gişeye gelin.'],
    rejected: ['{n} numaralı sipariş reddedildi', 'Büfe bu siparişi alamıyor. Lütfen yerinde sipariş verin.'],
  },
  kk: {
    code: ['Кіру коды: {code}', 'Шаурма сайтына кіру кодыңыз: {code}. Ол 10 минут жарамды.'],
    accepted: ['№{n} тапсырыс қабылданды', '{time} дайын болады. Нөмірді терезеде көрсетіңіз.'],
    delayed: ['№{n} тапсырыс: жаңа уақыт', '{time} дайын болады. Ыңғайсыз болса, тапсырысты болдырмауға болады.'],
    ready: ['№{n} тапсырыс дайын', 'Терезеге келіп, нөміріңізді көрсетіңіз.'],
    reminder: ['№{n} тапсырыс сізді күтуде', 'Шаурма дайын, суып барады. Терезеге келіңіз.'],
    rejected: ['№{n} тапсырыс қабылданбады', 'Дүкен бұл тапсырысты қабылдай алмайды. Орнында тапсырыс беріңіз.'],
  },
};

export function message(lang, type, vars = {}) {
  const pair = (M[lang] || M.ru)[type] || M.ru[type];
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  return { title: fill(pair[0]), body: fill(pair[1]) };
}
