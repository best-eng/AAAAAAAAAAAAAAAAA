'use strict';
/*
 * Слой базы данных (SQLite). Хранит брони. Файл БД задаётся переменной
 * окружения DATABASE_PATH (по умолчанию ./data/bookings.db).
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'bookings.db');

// Создаём папку под файл БД, если её нет (важно для Railway Volume).
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    apartment_id    TEXT,
    apartment_title TEXT,
    checkin         TEXT,
    checkout        TEXT,
    nights          INTEGER,
    guests          INTEGER,
    name            TEXT,
    phone           TEXT,
    email           TEXT,
    comment         TEXT,
    total           INTEGER,
    status          TEXT NOT NULL DEFAULT 'new',
    source          TEXT NOT NULL DEFAULT 'site'
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
  CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
`);

const STATUSES = ['new', 'confirmed', 'checked_in', 'cancelled'];

const stmts = {
  insert: db.prepare(`
    INSERT INTO bookings
      (id, created_at, apartment_id, apartment_title, checkin, checkout, nights,
       guests, name, phone, email, comment, total, status, source)
    VALUES
      (@id, @created_at, @apartment_id, @apartment_title, @checkin, @checkout, @nights,
       @guests, @name, @phone, @email, @comment, @total, @status, @source)
  `),
  all: db.prepare('SELECT * FROM bookings ORDER BY created_at DESC'),
  byId: db.prepare('SELECT * FROM bookings WHERE id = ?'),
  updateStatus: db.prepare('UPDATE bookings SET status = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM bookings WHERE id = ?'),
  clear: db.prepare('DELETE FROM bookings'),
};

function camel(r) {
  if (!r) return null;
  return {
    id: r.id,
    createdAt: r.created_at,
    apartmentId: r.apartment_id,
    apartmentTitle: r.apartment_title,
    checkin: r.checkin,
    checkout: r.checkout,
    nights: r.nights,
    guests: r.guests,
    name: r.name,
    phone: r.phone,
    email: r.email,
    comment: r.comment,
    total: r.total,
    status: r.status,
    source: r.source,
  };
}

module.exports = {
  STATUSES,
  createBooking(b) {
    stmts.insert.run(b);
    return camel(stmts.byId.get(b.id));
  },
  listBookings() {
    return stmts.all.all().map(camel);
  },
  getBooking(id) {
    return camel(stmts.byId.get(id));
  },
  setStatus(id, status) {
    const res = stmts.updateStatus.run(status, id);
    return res.changes > 0;
  },
  deleteBooking(id) {
    return stmts.remove.run(id).changes > 0;
  },
  clearAll() {
    return stmts.clear.run().changes;
  },
};
