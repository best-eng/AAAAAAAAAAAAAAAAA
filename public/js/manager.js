/* ============================================================
   Панель менеджера — Уютный Квадрат (клиент серверного API)
   Данные о бронях берутся из общей базы через /api/bookings.
   ============================================================ */
(function () {
  'use strict';

  var APTS = [];

  var qs = function (s, c) { return (c || document).querySelector(s); };
  var qsa = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var money = function (n) { return (n || 0).toLocaleString('ru-RU') + ' ₽'; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  };

  var STATUS = { new: 'Новая', confirmed: 'Подтверждена', checked_in: 'Заселён', cancelled: 'Отменена' };

  var state = { filter: 'all', query: '', bookings: [] };

  /* ---------- API ---------- */
  function api(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401) { showLogin(); throw new Error('unauthorized'); }
        if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      });
    });
  }

  /* ---------- Авторизация ---------- */
  function initLogin() {
    qs('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var body = JSON.stringify({ username: qs('#login-user').value, password: qs('#login-pass').value });
      fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok) { showPanel(); }
          else { qs('#login-err').textContent = res.d.error || 'Ошибка входа'; qs('#login-pass').value = ''; }
        })
        .catch(function () { qs('#login-err').textContent = 'Ошибка сети'; });
    });
  }
  function showLogin() {
    qs('#mgr').hidden = true;
    qs('#login').style.display = 'grid';
  }
  function showPanel() {
    qs('#login').style.display = 'none';
    qs('#mgr').hidden = false;
    refresh();
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

  /* ---------- Данные ---------- */
  function refresh() {
    api('/api/bookings')
      .then(function (data) { state.bookings = data.bookings || []; render(); })
      .catch(function () { /* 401 уже обработан, прочее игнорируем */ });
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
    var src = b.source && b.source !== 'site' ? ' · ' + esc(b.source) : '';
    return (
      '<tr data-id="' + esc(b.id) + '">' +
        '<td class="cell-id">' + esc(b.id) + '<small>' + fmtDateTime(b.createdAt) + src + '</small></td>' +
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
    var list = state.bookings;
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
      api('/api/bookings/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status: sel.value }) })
        .then(function () {
          var b = state.bookings.find(function (x) { return x.id === id; });
          if (b) b.status = sel.value;
          render(); toast('Статус обновлён');
        })
        .catch(function (err) { if (err.message !== 'unauthorized') toast('Не удалось обновить'); });
    });
    qs('#mgr-tbody').addEventListener('click', function (e) {
      var del = e.target.closest('[data-action="del"]');
      if (!del) return;
      var id = e.target.closest('tr').dataset.id;
      if (!confirm('Удалить бронь ' + id + '?')) return;
      api('/api/bookings/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function () {
          state.bookings = state.bookings.filter(function (x) { return x.id !== id; });
          render(); toast('Бронь удалена');
        })
        .catch(function (err) { if (err.message !== 'unauthorized') toast('Не удалось удалить'); });
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
    qs('#search').addEventListener('input', function () { state.query = this.value.trim(); render(); });
    qs('#btn-logout').addEventListener('click', function () {
      fetch('/api/logout', { method: 'POST' }).then(function () { location.reload(); });
    });
    qs('#notice-x').addEventListener('click', function () { qs('#mgr-notice').style.display = 'none'; });
    qs('#btn-demo').addEventListener('click', function () {
      api('/api/bookings/seed-demo', { method: 'POST' })
        .then(function () { refresh(); toast('Демо-данные загружены'); })
        .catch(function (err) { if (err.message !== 'unauthorized') toast('Не удалось загрузить демо'); });
    });
    qs('#btn-clear').addEventListener('click', function () {
      if (!confirm('Удалить ВСЕ брони без возможности восстановления?')) return;
      api('/api/bookings', { method: 'DELETE' })
        .then(function () { refresh(); toast('Список очищен'); })
        .catch(function (err) { if (err.message !== 'unauthorized') toast('Не удалось очистить'); });
    });
    qs('#btn-export').addEventListener('click', exportCSV);
  }

  /* ---------- Модалка добавления брони ---------- */
  function initAddModal() {
    var modal = qs('#booking-modal');
    var sel = qs('#bm-apartment');

    function openModal() {
      sel.innerHTML = APTS.map(function (a) {
        return '<option value="' + a.id + '">' + esc(a.title) + ' — ' + money(a.price) + '</option>';
      }).join('');
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
      var payload = {
        apartmentId: sel.value,
        checkin: qs('#bm-checkin').value,
        checkout: qs('#bm-checkout').value,
        guests: qs('#bm-guests').value,
        name: qs('#bm-name').value.trim(),
        phone: qs('#bm-phone').value.trim(),
        email: qs('#bm-email').value.trim(),
        comment: qs('#bm-comment').value.trim(),
        status: qs('#bm-status').value
      };
      api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) })
        .then(function () { closeModal(); refresh(); toast('Бронь добавлена'); })
        .catch(function (err) { if (err.message !== 'unauthorized') toast(err.message || 'Ошибка'); });
    });
  }

  /* ---------- Экспорт CSV ---------- */
  function exportCSV() {
    var list = state.bookings;
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

    // подгружаем каталог для формы добавления
    fetch('apartments.json').then(function (r) { return r.json(); }).then(function (l) { APTS = l; }).catch(function () {});

    // проверяем, есть ли уже активная сессия
    fetch('/api/me').then(function (r) { if (r.ok) showPanel(); });
  });
})();
