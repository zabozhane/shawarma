// Самые распространённые сервисы одноразовой почты. Список можно дополнять.
const DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'sharklasers.com', 'grr.la', 'mailinator.com', 'mailinator.net', 'yopmail.com', 'yopmail.net',
  'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempail.com',
  'trashmail.com', 'trashmail.net', 'dispostable.com', 'throwawaymail.com', 'getnada.com', 'nada.email',
  'maildrop.cc', 'mohmal.com', 'fakeinbox.com', 'emailondeck.com', 'mintemail.com', 'mytemp.email',
  'tempr.email', 'discard.email', 'spamgourmet.com', 'mailnesia.com', 'burnermail.io', 'inboxkitten.com',
  'dropmail.me', '1secmail.com', '1secmail.net', 'crazymailing.com', 'emailfake.com', 'generator.email',
  'mail.tm', 'linshiyouxiang.net', 'cryptogmail.com', 'tmail.ws', 'tmpmail.org', 'tmpmail.net',
]);

export function isDisposableEmail(email) {
  const domain = String(email).split('@')[1] || '';
  return DOMAINS.has(domain) || [...DOMAINS].some((d) => domain.endsWith(`.${d}`));
}
