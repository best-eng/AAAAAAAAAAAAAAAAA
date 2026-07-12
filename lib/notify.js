'use strict';
/*
 * Отправка уведомлений о бронях в Telegram и обработка нажатий на кнопки.
 * Токен и chat_id берутся из переменных окружения — в браузер не попадают.
 * Если не заданы — уведомления просто отключены (бронь всё равно в БД).
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const BRAND = process.env.BRAND_NAME || 'Уютный Квадрат';

const API = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`;

// Соответствие коротких кодов кнопок и статусов (callback_data ограничен 64 байтами).
const CODE_TO_STATUS = { c: 'confirmed', i: 'checked_in', x: 'cancelled' };
const STATUS_LABEL = { new: 'Новая', confirmed: 'Подтверждена', checked_in: 'Заселён', cancelled: 'Отменена' };

const escHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

const money = (n) => (n || 0).toLocaleString('ru-RU') + ' ₽';

function buildText(b, footer) {
  const lines = [
    `<b>🏠 Бронь — ${escHtml(BRAND)}</b>`,
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
    '',
    footer || `<b>Статус:</b> 🆕 ${STATUS_LABEL[b.status] || b.status}`,
  ];
  return lines.join('\n');
}

// Кнопки управления бронью прямо из чата.
function buildKeyboard(id) {
  return {
    inline_keyboard: [[
      { text: '✅ Подтвердить', callback_data: `s:${id}:c` },
      { text: '🔑 Заселить', callback_data: `s:${id}:i` },
      { text: '❌ Отменить', callback_data: `s:${id}:x` },
    ]],
  };
}

async function tg(method, payload) {
  try {
    const r = await fetch(API(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error(`[notify] Telegram ${method} ответил`, r.status);
    return r.ok;
  } catch (e) {
    console.error(`[notify] Ошибка ${method}:`, e.message);
    return false;
  }
}

async function notifyNewBooking(b) {
  if (!TOKEN || !CHAT_ID) return false;
  return tg('sendMessage', {
    chat_id: CHAT_ID,
    text: buildText(b),
    parse_mode: 'HTML',
    reply_markup: buildKeyboard(b.id),
  });
}

// Ответ на нажатие кнопки (всплывашка у менеджера).
async function answerCallback(callbackId, text) {
  if (!TOKEN) return false;
  return tg('answerCallbackQuery', { callback_query_id: callbackId, text: text || '' });
}

// Обновить текст сообщения после смены статуса (кнопки убираем).
async function updateBookingMessage(chatId, messageId, booking) {
  if (!TOKEN) return false;
  const footer = `<b>Статус:</b> ✅ ${STATUS_LABEL[booking.status] || booking.status} — обновлено из Telegram`;
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: buildText(booking, footer),
    parse_mode: 'HTML',
  });
}

module.exports = {
  notifyNewBooking,
  answerCallback,
  updateBookingMessage,
  CODE_TO_STATUS,
  STATUS_LABEL,
  enabled: Boolean(TOKEN && CHAT_ID),
};
