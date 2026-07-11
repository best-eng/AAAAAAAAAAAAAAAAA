/* ============================================================
   Панель менеджера — Уютный Квадрат
   Данные о бронях хранятся в localStorage (ключ uk_bookings).
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.UK_CONFIG || {};
  var APTS = window.APARTMENTS || [];
  var STORAGE_KEY = 'uk_bookings';
  var SESSION_KEY = 'uk_mgr_auth';

  var qs = function (s, c) { return (c || document).querySelector(s); };
  var qsa = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var money = function (n) { return (n || 0).toLocaleString('ru-RU') + ' ₽'; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  };

  var STATUS = {
    new: 'Новая',
    confirmed: 'Подтверждена',
    checked_in: 'Заселён',
    cancelled: 'Отменена'
  };

  var state = { filter: 'all', query: '', editingId: null };

  /* ---------- Хранилище ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function save(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  /* ---------- Авторизация ---------- */
  function initLogin() {
    if (sessionStorage.getItem(SESSION_KEY) === '1') return showPanel();
    var form = qs('#login-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = qs('#login-pin').value.trim();
      if (pin === String(CFG.managerPin)) {
        sessionStorage.setItem(SESSION_KEY, '1');
        showPanel();
      } else {
        qs('#login-err').textContent = 'Неверный PIN. Попробуйте ещё раз.';
        qs('#login-pin').value = '';
      }
    });
  }
  function showPanel() {
    qs('#login').style.display = 'none';
    qs('#mgr').hidden = false;
    render();
  }

  /* ---------- Форматирование дат ---------- */
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' +
           d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------- Сводка ---------- */
  function renderStats(list) {
    var active = list.filter(function (b) { return b.status !== 'cancelled'; });
    var revenue = active.reduce(function (s, b) { return s + (b.total || 0); }, 0);
    var stats = [
      { label: 'Всего броней', value: list.length, cls: '' },
      { label: 'Новые', value: list.filter(function (b) { return b.status === 'new'; }).length, cls: 'accent' },
      { label: 'Подтверждено', value: list.filter(function (b) { return b.status === 'confirmed'; }).length, cls: 'green' },
      { label: 'Оборот (активн.)', value: money(revenue), cls: 'amber' }
    ];
    qs('#stat-row').innerHTML = stats.map(function (s) {
      return '<div class="stat ' + s.cls + '"><div class="stat-label">' + s.label +
        '</div><div class="stat-value">' + s.value + '</div></div>';
    }).join('');
  }

  /* ---------- Таблица ---------- */
  function matches(b) {
    if (state.filter !== 'all' && b.status !== state.filter) return false;
    if (state.query) {
      var hay = (b.name + ' ' + b.phone + ' ' + b.id + ' ' + b.email + ' ' + b.apartmentTitle).toLowerCase();
      if (hay.indexOf(state.query.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function row(b) {
    var statusOpts = Object.keys(STATUS).map(function (k) {
      return '<option value="' + k + '"' + (b.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>';
    }).join('');
    return (
      '<tr data-id="' + b.id + '">' +
        '<td class="cell-id">' + esc(b.id) + '<small>' + fmtDateTime(b.createdAt) + '</small></td>' +
        '<td class="cell-apt">' + esc(b.apartmentTitle || '—') + '</td>' +
        '<td class="cell-dates">' + fmtDate(b.checkin) + ' → ' + fmtDate(b.checkout) +
          '<small>' + (b.nights || 0) + ' ноч. · ' + esc(b.guests || '—') + ' гост.</small></td>' +
        '<td class="cell-name">' + esc(b.name || '—') +
          (b.comment ? '<div class="cell-comment">' + esc(b.comment) + '</div>' : '') + '</td>' +
        '<td class="cell-contacts"><a href="tel:' + esc(b.phone) + '">' + esc(b.phone || '—') + '</a>' +
          (b.email ? '<a href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a>' : '') + '</td>' +
        '<td class="cell-total">' + money(b.total) + '</td>' +
        '<td><select class="status-select" data-status="' + b.status + '" data-action="status">' + statusOpts + '</select></td>' +
        '<td><button class="row-del" data-action="del" title="Удалить">🗑</button></td>' +
      '</tr>'
    );
  }

  function render() {
    var list = load();
    renderStats(list);
    var filtered = list.filter(matches);
    var tbody = qs('#mgr-tbody');
    var empty = qs('#mgr-empty');
    if (!filtered.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      empty.querySelector('p').textContent = list.length ? 'Ничего не найдено' : 'Броней пока нет';
    } else {
      empty.hidden = true;
      tbody.innerHTML = filtered.map(row).join('');
    }
  }

  /* ---------- Действия в таблице ---------- */
  function initTableActions() {
    qs('#mgr-tbody').addEventListener('change', function (e) {
      var sel = e.target.closest('[data-action="status"]');
      if (!sel) return;
      var id = e.target.closest('tr').dataset.id;
      var list = load();
      var b = list.find(function (x) { return x.id === id; });
      if (b) { b.status = sel.value; save(list); render(); toast('Статус обновлён'); }
    });
    qs('#mgr-tbody').addEventListener('click', function (e) {
      var del = e.target.closest('[data-action="del"]');
      if (!del) return;
      var id = e.target.closest('tr').dataset.id;
      if (!confirm('Удалить бронь ' + id + '?')) return;
      save(load().filter(function (x) { return x.id !== id; }));
      render();
      toast('Бронь удалена');
    });
  }

  /* ---------- Фильтры и поиск ---------- */
  function initToolbar() {
    qs('#status-filters').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      qsa('.chip', this).forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      state.filter = chip.dataset.status;
      render();
    });
    qs('#search').addEventListener('input', function () {
      state.query = this.value.trim();
      render();
    });
    qs('#btn-logout').addEventListener('click', function () {
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    });
    qs('#notice-x').addEventListener('click', function () { qs('#mgr-notice').style.display = 'none'; });
    qs('#btn-demo').addEventListener('click', loadDemo);
    qs('#btn-clear').addEventListener('click', function () {
      if (confirm('Удалить ВСЕ брони без возможности восстановления?')) {
        save([]); render(); toast('Список очищен');
      }
    });
    qs('#btn-export').addEventListener('click', exportCSV);
  }

  /* ---------- Модалка добавления брони ---------- */
  function initAddModal() {
    var modal = qs('#booking-modal');
    var sel = qs('#bm-apartment');
    sel.innerHTML = APTS.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.title) + ' — ' + money(a.price) + '</option>';
    }).join('');

    function openModal() {
      state.editingId = null;
      qs('#bm-title').textContent = 'Новая бронь';
      qs('#bm-form').reset();
      var today = new Date(), tmr = new Date(Date.now() + 86400000);
      qs('#bm-checkin').value = today.toISOString().slice(0, 10);
      qs('#bm-checkout').value = tmr.toISOString().slice(0, 10);
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeModal() { modal.hidden = true; document.body.style.overflow = ''; }

    qs('#btn-add').addEventListener('click', openModal);
    modal.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

    qs('#bm-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var apt = APTS.find(function (a) { return a.id === sel.value; }) || {};
      var ci = qs('#bm-checkin').value, co = qs('#bm-checkout').value;
      var nights = Math.max(1, Math.round((new Date(co) - new Date(ci)) / 86400000));
      var b = {
        id: 'BK-' + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(),
        apartmentId: apt.id || '',
        apartmentTitle: apt.title || '',
        checkin: ci, checkout: co, nights: nights,
        guests: qs('#bm-guests').value,
        name: qs('#bm-name').value.trim(),
        phone: qs('#bm-phone').value.trim(),
        email: qs('#bm-email').value.trim(),
        comment: qs('#bm-comment').value.trim(),
        total: (apt.price || 0) * nights,
        status: qs('#bm-status').value
      };
      var list = load(); list.unshift(b); save(list);
      closeModal(); render(); toast('Бронь добавлена');
    });
  }

  /* ---------- Экспорт CSV ---------- */
  function exportCSV() {
    var list = load();
    if (!list.length) { toast('Нет данных для экспорта'); return; }
    var cols = ['id', 'createdAt', 'apartmentTitle', 'checkin', 'checkout', 'nights', 'guests', 'name', 'phone', 'email', 'total', 'status', 'comment'];
    var head = ['Номер', 'Создана', 'Квартира', 'Заезд', 'Выезд', 'Ночей', 'Гостей', 'Имя', 'Телефон', 'Email', 'Сумма', 'Статус', 'Комментарий'];
    var rows = list.map(function (b) {
      return cols.map(function (c) {
        var v = c === 'status' ? (STATUS[b[c]] || b[c]) : b[c];
        return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      }).join(';');
    });
    var csv = '﻿' + head.join(';') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'broni-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('CSV выгружен');
  }

  /* ---------- Демо-данные ---------- */
  function loadDemo() {
    var samples = [
      { aptIdx: 0, name: 'Анна Смирнова', phone: '+7 917 123-45-67', email: 'anna@mail.ru', guests: 2, ci: 0, nights: 3, status: 'new', comment: 'Ранний заезд, если можно' },
      { aptIdx: 2, name: 'Дмитрий Орлов', phone: '+7 927 555-10-20', email: '', guests: 4, ci: 2, nights: 2, status: 'confirmed', comment: 'С детьми, нужна кроватка' },
      { aptIdx: 3, name: 'Мария Ковалёва', phone: '+7 905 777-88-99', email: 'maria.k@gmail.com', guests: 2, ci: 5, nights: 2, status: 'checked_in', comment: '' },
      { aptIdx: 5, name: 'Игорь Белов', phone: '+7 900 321-00-11', email: '', guests: 3, ci: 7, nights: 4, status: 'new', comment: 'Годовщина, хочется красиво' },
      { aptIdx: 1, name: 'Елена Ткач', phone: '+7 912 444-33-22', email: 'elena@yandex.ru', guests: 2, ci: -1, nights: 1, status: 'cancelled', comment: 'Отменил гость' }
    ];
    var now = Date.now();
    var demo = samples.map(function (s, i) {
      var apt = APTS[s.aptIdx] || APTS[0];
      var ci = new Date(now + s.ci * 86400000);
      var co = new Date(ci.getTime() + s.nights * 86400000);
      return {
        id: 'BK-DEMO' + (i + 1),
        createdAt: new Date(now - (samples.length - i) * 3600000).toISOString(),
        apartmentId: apt.id, apartmentTitle: apt.title,
        checkin: ci.toISOString().slice(0, 10),
        checkout: co.toISOString().slice(0, 10),
        nights: s.nights, guests: s.guests,
        name: s.name, phone: s.phone, email: s.email,
        comment: s.comment, total: apt.price * s.nights, status: s.status
      };
    });
    var list = load();
    // не дублируем демо, если уже загружено
    var existing = {};
    list.forEach(function (b) { existing[b.id] = true; });
    demo.forEach(function (b) { if (!existing[b.id]) list.unshift(b); });
    save(list);
    render();
    toast('Демо-данные загружены');
  }

  /* ---------- Тост ---------- */
  var toastTimer;
  function toast(msg) {
    var t = qs('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initLogin();
    initToolbar();
    initTableActions();
    initAddModal();
  });
})();
