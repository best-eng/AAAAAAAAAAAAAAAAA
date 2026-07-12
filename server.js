'use strict';
/*
 * Уютный Квадрат — сервер (Express + SQLite).
 * Раздаёт статический сайт из public/ и предоставляет API для броней.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');

const db = require('./lib/db');
const auth = require('./lib/auth');
const notify = require('./lib/notify');

const app = express();
app.set('trust proxy', 1); // за прокси Railway — доверяем заголовкам X-Forwarded-*
app.use(express.json({ limit: '64kb' }));

const PUBLIC_DIR = path.join(__dirname, 'public');

// --- Каталог квартир: единый источник данных (public/apartments.json) ---
const APARTMENTS = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'apartments.json'), 'utf8'));
const APT_BY_ID = Object.fromEntries(APARTMENTS.map((a) => [a.id, a]));

// ---------- helpers ----------
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
const nightsBetween = (ci, co) => Math.round((new Date(co) - new Date(ci)) / 86400000);
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const genId = () =>
  'BK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

function validateBooking(body) {
  const apt = APT_BY_ID[body.apartmentId];
  if (!apt) return { error: 'Выберите квартиру из списка' };
  if (!isDate(body.checkin) || !isDate(body.checkout)) return { error: 'Укажите корректные даты' };
  const nights = nightsBetween(body.checkin, body.checkout);
  if (nights <= 0) return { error: 'Дата выезда должна быть позже даты заезда' };
  const name = str(body.name, 120);
  const phone = str(body.phone, 40);
  if (name.length < 2) return { error: 'Укажите имя' };
  if (phone.replace(/[^\d]/g, '').length < 10) return { error: 'Укажите корректный телефон' };
  let guests = parseInt(body.guests, 10);
  if (!Number.isFinite(guests) || guests < 1) guests = 1;
  if (guests > 20) guests = 20;
  return {
    booking: {
      apartment: apt,
      nights,
      guests,
      name,
      phone,
      email: str(body.email, 120),
      comment: str(body.comment, 1000),
      checkin: body.checkin,
      checkout: body.checkout,
    },
  };
}

// ================= API =================

// --- Публичное создание брони / ручное добавление менеджером ---
app.post('/api/bookings', (req, res) => {
  const v = validateBooking(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  const b = v.booking;

  const manager = Boolean(auth.currentUser(req));
  let status = 'new';
  if (manager && db.STATUSES.includes(req.body.status)) status = req.body.status;

  const record = {
    id: genId(),
    created_at: new Date().toISOString(),
    apartment_id: b.apartment.id,
    apartment_title: b.apartment.title,
    checkin: b.checkin,
    checkout: b.checkout,
    nights: b.nights,
    guests: b.guests,
    name: b.name,
    phone: b.phone,
    email: b.email,
    comment: b.comment,
    total: b.apartment.price * b.nights,
    status,
    source: manager ? 'manual' : 'site',
  };

  const saved = db.createBooking(record);

  // Уведомление в Telegram — только для заявок с сайта, не блокируем ответ.
  if (!manager) notify.notifyNewBooking(saved).catch(() => {});

  res.status(201).json({ ok: true, booking: saved });
});

// --- Авторизация менеджера ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!auth.checkCredentials(username, password)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  auth.setSession(res, auth.USER);
  res.json({ ok: true, user: { username: auth.USER } });
});

app.post('/api/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = auth.currentUser(req);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: { username: user.u }, telegram: notify.enabled });
});

// --- Защищённые операции с бронями ---
app.get('/api/bookings', auth.requireAuth, (req, res) => {
  res.json({ bookings: db.listBookings() });
});

app.patch('/api/bookings/:id', auth.requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!db.STATUSES.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
  if (!db.setStatus(req.params.id, status)) return res.status(404).json({ error: 'Бронь не найдена' });
  res.json({ ok: true, booking: db.getBooking(req.params.id) });
});

app.delete('/api/bookings/:id', auth.requireAuth, (req, res) => {
  if (!db.deleteBooking(req.params.id)) return res.status(404).json({ error: 'Бронь не найдена' });
  res.json({ ok: true });
});

app.delete('/api/bookings', auth.requireAuth, (req, res) => {
  const removed = db.clearAll();
  res.json({ ok: true, removed });
});

// --- Демо-данные для наполнения таблицы ---
app.post('/api/bookings/seed-demo', auth.requireAuth, (req, res) => {
  const samples = [
    { i: 0, name: 'Анна Смирнова', phone: '+7 917 123-45-67', email: 'anna@mail.ru', guests: 2, ci: 0, nights: 3, status: 'new', comment: 'Ранний заезд, если можно' },
    { i: 2, name: 'Дмитрий Орлов', phone: '+7 927 555-10-20', email: '', guests: 4, ci: 2, nights: 2, status: 'confirmed', comment: 'С детьми, нужна кроватка' },
    { i: 3, name: 'Мария Ковалёва', phone: '+7 905 777-88-99', email: 'maria.k@gmail.com', guests: 2, ci: 5, nights: 2, status: 'checked_in', comment: '' },
    { i: 5, name: 'Игорь Белов', phone: '+7 900 321-00-11', email: '', guests: 3, ci: 7, nights: 4, status: 'new', comment: 'Годовщина, хочется красиво' },
    { i: 1, name: 'Елена Ткач', phone: '+7 912 444-33-22', email: 'elena@yandex.ru', guests: 2, ci: -1, nights: 1, status: 'cancelled', comment: 'Отменил гость' },
  ];
  const now = Date.now();
  let added = 0;
  samples.forEach((s, idx) => {
    const apt = APARTMENTS[s.i] || APARTMENTS[0];
    const ci = new Date(now + s.ci * 86400000);
    const co = new Date(ci.getTime() + s.nights * 86400000);
    db.createBooking({
      id: genId() + idx,
      created_at: new Date(now - (samples.length - idx) * 3600000).toISOString(),
      apartment_id: apt.id,
      apartment_title: apt.title,
      checkin: ci.toISOString().slice(0, 10),
      checkout: co.toISOString().slice(0, 10),
      nights: s.nights,
      guests: s.guests,
      name: s.name,
      phone: s.phone,
      email: s.email,
      comment: s.comment,
      total: apt.price * s.nights,
      status: s.status,
      source: 'demo',
    });
    added++;
  });
  res.json({ ok: true, added });
});

// --- Telegram webhook: обработка нажатий на кнопки под уведомлением ---
const TG_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
app.post('/api/telegram/webhook', (req, res) => {
  // Проверяем секрет, который Telegram шлёт в заголовке (задаётся при setWebhook).
  if (!TG_WEBHOOK_SECRET || req.get('X-Telegram-Bot-Api-Secret-Token') !== TG_WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  res.sendStatus(200); // Telegram ждёт быстрый ответ; действия — асинхронно.

  const cq = req.body && req.body.callback_query;
  if (!cq || !cq.data) return;

  const m = /^s:(.+):([cix])$/.exec(cq.data);
  if (!m) { notify.answerCallback(cq.id, 'Неизвестная команда'); return; }

  const id = m[1];
  const status = notify.CODE_TO_STATUS[m[2]];
  const booking = db.getBooking(id);
  if (!booking) { notify.answerCallback(cq.id, 'Бронь не найдена'); return; }

  db.setStatus(id, status);
  const updated = db.getBooking(id);
  notify.answerCallback(cq.id, 'Статус: ' + (notify.STATUS_LABEL[status] || status));
  if (cq.message) notify.updateBookingMessage(cq.message.chat.id, cq.message.message_id, updated);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ================= Static =================
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Уютный Квадрат запущен на порту ${PORT}`);
  console.log(`[server] Telegram-уведомления: ${notify.enabled ? 'включены' : 'выключены (задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID)'}`);
});
