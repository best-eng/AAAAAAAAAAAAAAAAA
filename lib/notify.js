'use strict';
/*
 * Отправка уведомлений о новой брони в Telegram.
 * Токен и chat_id берутся из переменных окружения — в браузер не попадают.
 * Если не заданы — уведомления просто отключены (бронь всё равно в БД).
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const BRAND = process.env.BRAND_NAME || 'Уютный Квадрат';

const escHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

const money = (n) => (n || 0).toLocaleString('ru-RU') + ' ₽';

function buildText(b) {
  return [
    `<b>🏠 Новая бронь — ${escHtml(BRAND)}</b>`,
    `№ ${escHtml(b.id)}`,
    '',
    `<b>Квартира:</b> ${escHtml(b.apartmentTitle)}`,
    `<b>Заезд:</b> ${b.checkin}  <b>Выезд:</b> ${b.checkout}  (${b.nights} ноч.)`,
    `<b>Гостей:</b> ${escHtml(b.guests)}`,
    `<b>Имя:</b> ${escHtml(b.name)}`,
    `<b>Телефон:</b> ${escHtml(b.phone)}`,
    `<b>E-mail:</b> ${escHtml(b.email || '—')}`,
    `<b>Комментарий:</b> ${escHtml(b.comment || '—')}`,
    `<b>Итого:</b> ${money(b.total)}`,
  ].join('\n');
}

async function notifyNewBooking(b) {
  if (!TOKEN || !CHAT_ID) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: buildText(b), parse_mode: 'HTML' }),
    });
    if (!r.ok) console.error('[notify] Telegram ответил', r.status);
    return r.ok;
  } catch (e) {
    console.error('[notify] Ошибка отправки в Telegram:', e.message);
    return false;
  }
}

module.exports = { notifyNewBooking, enabled: Boolean(TOKEN && CHAT_ID) };
