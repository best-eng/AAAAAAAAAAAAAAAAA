/* ============================================================
   Уютный Квадрат — логика публичного сайта
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.UK_CONFIG || {};
  var APTS = window.APARTMENTS || [];
  var STORAGE_KEY = 'uk_bookings';

  var money = function (n) { return n.toLocaleString('ru-RU') + ' ₽'; };
  var digits = function (s) { return (s || '').replace(/[^\d+]/g, ''); };
  var qs = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var qsa = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Подстановка контактов из конфига ---------- */
  function applyConfig() {
    var tel = digits(CFG.phone);
    qsa('[data-config="phone-link"]').forEach(function (el) {
      el.textContent = CFG.phone; el.setAttribute('href', 'tel:' + tel);
    });
    qsa('[data-config="email-link"]').forEach(function (el) {
      el.textContent = CFG.email; el.setAttribute('href', 'mailto:' + CFG.email);
    });
    qsa('[data-config="address"]').forEach(function (el) { el.textContent = CFG.address; });
    qsa('[data-config="workHours"]').forEach(function (el) { el.textContent = CFG.workHours; });
    qsa('[data-config="telegram"]').forEach(function (el) { el.setAttribute('href', CFG.telegram || '#'); });
    qsa('[data-config="whatsapp"]').forEach(function (el) { el.setAttribute('href', CFG.whatsapp || '#'); });
    var yr = qs('#year'); if (yr) yr.textContent = new Date().getFullYear();
  }

  /* ---------- Мобильное меню ---------- */
  function initBurger() {
    var burger = qs('#burger'), nav = qs('#nav');
    if (!burger || !nav) return;
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    qsa('a', nav).forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---------- Каталог квартир ---------- */
  function aptCard(apt) {
    var tags = apt.tags.map(function (t) { return '<span class="apt-tag">' + t + '</span>'; }).join('');
    return (
      '<article class="apt-card" data-id="' + apt.id + '" data-rooms="' + apt.rooms + '" data-price="' + apt.price + '">' +
        '<div class="apt-media" data-open="' + apt.id + '">' +
          '<img src="' + apt.image + '" alt="' + apt.title + '" loading="lazy" />' +
          '<span class="apt-price-badge">' + money(apt.price) + '</span>' +
        '</div>' +
        '<div class="apt-body">' +
          '<h3 class="apt-title">' + apt.title + '</h3>' +
          '<p class="apt-sub">' + apt.subtitle + '</p>' +
          '<div class="apt-specs">' +
            '<span>🛏 ' + apt.rooms + ' комн.</span>' +
            '<span>📐 ' + apt.area + ' м²</span>' +
            '<span>👥 до ' + apt.guests + '</span>' +
            '<span>🏢 ' + apt.floor + '</span>' +
          '</div>' +
          '<div class="apt-tags">' + tags + '</div>' +
          '<div class="apt-actions">' +
            '<button class="btn btn-primary btn-sm" data-book="' + apt.id + '">Забронировать</button>' +
            '<button class="link-more" data-open="' + apt.id + '">Подробнее</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderApartments(filter) {
    var grid = qs('#apartments-grid');
    if (!grid) return;
    var list = APTS.filter(function (a) {
      if (filter === 'all' || !filter) return true;
      if (filter === '1') return a.rooms === 1;
      if (filter === '2') return a.rooms === 2;
      if (filter === 'budget') return a.price <= 3500;
      if (filter === 'premium') return a.price >= 4500;
      return true;
    });
    grid.innerHTML = list.length
      ? list.map(aptCard).join('')
      : '<p class="empty-note">По этому фильтру пока нет вариантов. Попробуйте другой.</p>';
  }

  function initFilters() {
    var box = qs('#filters');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip');
      if (!btn) return;
      qsa('.chip', box).forEach(function (c) { c.classList.remove('is-active'); });
      btn.classList.add('is-active');
      renderApartments(btn.dataset.filter);
    });
  }

  /* ---------- Модальное окно квартиры ---------- */
  function openModal(id) {
    var apt = APTS.find(function (a) { return a.id === id; });
    if (!apt) return;
    var m = qs('#apt-modal');
    qs('#modal-img').src = apt.image;
    qs('#modal-img').alt = apt.title;
    qs('#modal-title').textContent = apt.title;
    qs('#modal-sub').textContent = apt.subtitle;
    qs('#modal-specs').innerHTML =
      '<span>🛏 ' + apt.rooms + ' комн.</span><span>📐 ' + apt.area + ' м²</span>' +
      '<span>👥 до ' + apt.guests + ' гостей</span><span>🏢 этаж ' + apt.floor + '</span>';
    qs('#modal-desc').textContent = apt.description;
    qs('#modal-features').innerHTML = apt.features.map(function (f) { return '<li>' + f + '</li>'; }).join('');
    qs('#modal-price').textContent = money(apt.price);
    qs('#modal-book').onclick = function () { closeModal(); selectAndScroll(apt.id); };
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    qs('#apt-modal').hidden = true;
    document.body.style.overflow = '';
  }
  function initModal() {
    document.addEventListener('click', function (e) {
      var openBtn = e.target.closest('[data-open]');
      if (openBtn) { openModal(openBtn.dataset.open); return; }
      if (e.target.closest('[data-close]')) closeModal();
      var bookBtn = e.target.closest('[data-book]');
      if (bookBtn) selectAndScroll(bookBtn.dataset.book);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !qs('#apt-modal').hidden) closeModal();
    });
  }

  /* ---------- Форма бронирования ---------- */
  function fillApartmentSelect() {
    var sel = qs('#bf-apartment');
    if (!sel) return;
    sel.innerHTML = APTS.map(function (a) {
      return '<option value="' + a.id + '">' + a.title + ' — ' + money(a.price) + '/сут.</option>';
    }).join('');
  }

  function toISO(d) { return d.toISOString().slice(0, 10); }

  function initDates() {
    var ci = qs('#bf-checkin'), co = qs('#bf-checkout');
    if (!ci || !co) return;
    var today = new Date();
    var tomorrow = new Date(today.getTime() + 86400000);
    ci.min = toISO(today);
    ci.value = toISO(today);
    co.min = toISO(tomorrow);
    co.value = toISO(tomorrow);
    ci.addEventListener('change', function () {
      var next = new Date(new Date(ci.value).getTime() + 86400000);
      co.min = toISO(next);
      if (co.value <= ci.value) co.value = toISO(next);
      updateSummary();
    });
    co.addEventListener('change', updateSummary);
    qs('#bf-apartment').addEventListener('change', updateSummary);
  }

  function nightsBetween(ci, co) {
    var ms = new Date(co) - new Date(ci);
    return Math.max(0, Math.round(ms / 86400000));
  }

  function updateSummary() {
    var box = qs('#booking-summary');
    var apt = APTS.find(function (a) { return a.id === qs('#bf-apartment').value; });
    var n = nightsBetween(qs('#bf-checkin').value, qs('#bf-checkout').value);
    if (!apt || n <= 0) { box.hidden = true; return; }
    var nightWord = (n % 10 === 1 && n % 100 !== 11) ? 'ночь' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'ночи' : 'ночей';
    qs('#booking-nights').textContent = n + ' ' + nightWord + ' × ' + money(apt.price);
    qs('#booking-total').textContent = money(apt.price * n);
    box.hidden = false;
  }

  function selectAndScroll(aptId) {
    var sel = qs('#bf-apartment');
    if (sel && aptId) { sel.value = aptId; updateSummary(); }
    qs('#booking').scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () { qs('#bf-name').focus({ preventScroll: true }); }, 500);
  }

  function validateForm(form) {
    var ok = true;
    qsa('input, select, textarea', form).forEach(function (el) { el.classList.remove('invalid'); });
    ['bf-apartment', 'bf-checkin', 'bf-checkout', 'bf-name', 'bf-phone'].forEach(function (id) {
      var el = qs('#' + id);
      if (!el.value.trim()) { el.classList.add('invalid'); ok = false; }
    });
    var phone = qs('#bf-phone');
    if (phone.value && digits(phone.value).replace('+', '').length < 10) { phone.classList.add('invalid'); ok = false; }
    if (nightsBetween(qs('#bf-checkin').value, qs('#bf-checkout').value) <= 0) {
      qs('#bf-checkout').classList.add('invalid'); ok = false;
    }
    if (!qs('#bf-consent').checked) ok = false;
    return ok;
  }

  function collectBooking() {
    var apt = APTS.find(function (a) { return a.id === qs('#bf-apartment').value; }) || {};
    var n = nightsBetween(qs('#bf-checkin').value, qs('#bf-checkout').value);
    return {
      id: 'BK-' + Date.now().toString(36).toUpperCase(),
      createdAt: new Date().toISOString(),
      apartmentId: apt.id || '',
      apartmentTitle: apt.title || '',
      checkin: qs('#bf-checkin').value,
      checkout: qs('#bf-checkout').value,
      nights: n,
      guests: qs('#bf-guests').value,
      name: qs('#bf-name').value.trim(),
      phone: qs('#bf-phone').value.trim(),
      email: qs('#bf-email').value.trim(),
      comment: qs('#bf-comment').value.trim(),
      total: (apt.price || 0) * n,
      status: 'new'
    };
  }

  function saveLocal(b) {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      list.unshift(b);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) { /* localStorage может быть недоступен */ }
  }

  function bookingText(b) {
    return [
      'Новая заявка на бронирование — ' + (CFG.brand || 'Уютный Квадрат'),
      '№ ' + b.id,
      'Квартира: ' + b.apartmentTitle,
      'Заезд: ' + b.checkin + '   Выезд: ' + b.checkout + '   (' + b.nights + ' ноч.)',
      'Гостей: ' + b.guests,
      'Имя: ' + b.name,
      'Телефон: ' + b.phone,
      'E-mail: ' + (b.email || '—'),
      'Комментарий: ' + (b.comment || '—'),
      'Итого: ' + money(b.total)
    ].join('\n');
  }

  var escHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m];
    });
  };

  // Канал: Telegram (Bot API напрямую из браузера)
  function sendTelegram(b) {
    var text =
      '<b>🏠 Новая бронь — ' + escHtml(CFG.brand || 'Уютный Квадрат') + '</b>\n' +
      '№ ' + escHtml(b.id) + '\n\n' +
      '<b>Квартира:</b> ' + escHtml(b.apartmentTitle) + '\n' +
      '<b>Заезд:</b> ' + b.checkin + '  <b>Выезд:</b> ' + b.checkout + '  (' + b.nights + ' ноч.)\n' +
      '<b>Гостей:</b> ' + escHtml(b.guests) + '\n' +
      '<b>Имя:</b> ' + escHtml(b.name) + '\n' +
      '<b>Телефон:</b> ' + escHtml(b.phone) + '\n' +
      '<b>E-mail:</b> ' + escHtml(b.email || '—') + '\n' +
      '<b>Комментарий:</b> ' + escHtml(b.comment || '—') + '\n' +
      '<b>Итого:</b> ' + money(b.total);
    return fetch('https://api.telegram.org/bot' + CFG.telegramBotToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CFG.telegramChatId, text: text, parse_mode: 'HTML' })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  // Канал: e-mail через Web3Forms
  function sendWeb3Forms(b) {
    return fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: CFG.web3formsKey,
        subject: 'Бронь ' + b.id + ' — ' + b.apartmentTitle,
        from_name: b.name,
        replyto: b.email || undefined,
        message: bookingText(b)
      })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  // Запасной канал: открыть почтовый клиент гостя
  function mailtoFallback(b) {
    var url = 'mailto:' + CFG.email +
      '?subject=' + encodeURIComponent('Бронь ' + b.id + ' — ' + b.apartmentTitle) +
      '&body=' + encodeURIComponent(bookingText(b));
    window.location.href = url;
    return Promise.resolve(true);
  }

  // Отправка заявки во все настроенные каналы (Telegram + email); иначе mailto.
  function deliverBooking(b) {
    var tasks = [];
    if (CFG.telegramBotToken && CFG.telegramChatId) tasks.push(sendTelegram(b));
    if (CFG.web3formsKey) tasks.push(sendWeb3Forms(b));
    if (!tasks.length) return mailtoFallback(b);
    return Promise.all(tasks).then(function (res) {
      return res.some(function (ok) { return ok; });
    });
  }

  function initBookingForm() {
    var form = qs('#booking-form');
    if (!form) return;
    fillApartmentSelect();
    initDates();
    updateSummary();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = qs('#form-note');
      note.className = 'form-note';
      if (!validateForm(form)) {
        note.textContent = 'Пожалуйста, заполните обязательные поля и согласие.';
        note.classList.add('err');
        return;
      }
      var booking = collectBooking();
      saveLocal(booking);

      var btn = qs('button[type="submit"]', form);
      btn.disabled = true; btn.textContent = 'Отправляем…';

      deliverBooking(booking).then(function (ok) {
        btn.disabled = false; btn.textContent = 'Отправить заявку';
        if (ok) {
          note.textContent = 'Заявка №' + booking.id + ' отправлена! Менеджер свяжется с вами.';
          note.classList.add('ok');
          toast('Заявка отправлена ✓');
          form.reset();
          initDates(); updateSummary();
        } else {
          note.textContent = 'Не удалось отправить автоматически. Позвоните нам: ' + CFG.phone;
          note.classList.add('err');
        }
      });
    });
  }

  /* ---------- Тост ---------- */
  var toastTimer;
  function toast(msg) {
    var t = qs('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    applyConfig();
    initBurger();
    renderApartments('all');
    initFilters();
    initModal();
    initBookingForm();
  });
})();
