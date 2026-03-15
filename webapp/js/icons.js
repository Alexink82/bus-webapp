/**
 * Inline SVG иконки для единообразного отображения (Фаза 2).
 * Использование: iconCheck, iconCross, iconPassenger, iconBus — строки для вставки в innerHTML.
 */
(function(global) {
  var size = 20;
  var sizeS = 16;
  var sizeL = 48;

  function svg(content, w, h, extraClass) {
    w = w || size;
    h = h || size;
    extraClass = extraClass ? ' ' + extraClass : '';
    return '<svg class="icon' + extraClass + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + content + '</svg>';
  }

  var iconCheck = svg('<path d="M4 12l5 5 11-11"/>', size, size);
  var iconCheckL = svg('<path d="M6 24l10 10 26-26"/>', sizeL, sizeL, 'icon--l success-checkmark');
  var iconCross = svg('<path d="M6 6l12 12M18 6L6 18"/>', size, size);
  var iconCrossS = svg('<path d="M4 4l8 8M12 4l-8 8"/>', sizeS, sizeS);
  var iconPassenger = svg('<circle cx="10" cy="6" r="3"/><path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>', size, size);
  var iconBus = svg('<rect x="2" y="6" width="16" height="10" rx="1"/><path d="M6 16v2M14 16v2"/><path d="M2 10h16"/>', size, size);

  global.APP_ICONS = {
    check: iconCheck,
    checkL: iconCheckL,
    cross: iconCross,
    crossS: iconCrossS,
    passenger: iconPassenger,
    bus: iconBus
  };

  /** Маппинг статуса API → класс badge и подпись */
  global.getStatusBadge = function(status) {
    var map = {
      new: { class: 'badge badge--new', label: 'Новая' },
      active: { class: 'badge badge--pending', label: 'В работе' },
      payment_link_sent: { class: 'badge badge--pending', label: 'Ссылка на оплату' },
      pending_payment: { class: 'badge badge--pending', label: 'Ожидание оплаты' },
      paid: { class: 'badge badge--success', label: 'Оплачено' },
      ticket_sent: { class: 'badge badge--success', label: 'Билет отправлен' },
      done: { class: 'badge badge--success', label: 'Завершено' },
      cancelled: { class: 'badge badge--error', label: 'Отменено' }
    };
    var o = map[status] || { class: 'badge badge--neutral', label: status || '—' };
    return o;
  };
})(typeof window !== 'undefined' ? window : this);
