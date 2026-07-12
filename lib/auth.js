'use strict';
/*
 * Простая авторизация менеджера: логин/пароль из переменных окружения,
 * сессия — подписанный HMAC-токен в httpOnly-cookie. Без внешних зависимостей.
 */
const crypto = require('crypto');

const COOKIE = 'uk_session';
const MAX_AGE = 1000 * 60 * 60 * 12; // 12 часов

const USER = process.env.ADMIN_USERNAME || 'manager';
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[auth] ADMIN_PASSWORD не задан — используется небезопасный пароль по умолчанию "admin123". Задайте его в переменных окружения!');
}
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET не задан — сгенерирован случайный (сессии сбросятся при рестарте). Задайте SESSION_SECRET в переменных окружения.');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function checkCredentials(username, password) {
  // Сравнение в постоянное время, чтобы не утекала длина/совпадение.
  const okUser = safeEqual(String(username || ''), USER);
  const okPass = safeEqual(String(password || ''), PASS);
  return okUser && okPass;
}

function sign(username) {
  const payload = b64url(JSON.stringify({ u: username, exp: Date.now() + MAX_AGE }));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return payload + '.' + sig;
}

function verify(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setSession(res, username) {
  const token = sign(username);
  const attrs = [
    `${COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(MAX_AGE / 1000)}`,
  ];
  if (COOKIE_SECURE) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  return verify(token);
}

// middleware: пускает только авторизованного менеджера
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  req.user = user;
  next();
}

module.exports = { checkCredentials, setSession, clearSession, currentUser, requireAuth, USER };
