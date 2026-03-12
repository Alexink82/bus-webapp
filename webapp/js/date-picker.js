/**
 * Пикер даты рождения: три вертикальных колеса (день, месяц, год).
 * Тап по полю открывает оверлей с прокруткой; выбор без ошибок ввода.
 */
(function() {
  var ROW_HEIGHT = 44;
  var VISIBLE_ROWS = 5;
  var PADDING_ROWS = 2;
  var WHEEL_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

  var MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function parseIso(iso) {
    if (!iso || iso.length !== 10) return null;
    var parts = iso.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { year: y, month: m, day: Math.min(d, getDaysInMonth(y, m)) };
  }

  function toIso(day, month, year) {
    var d = String(day).padStart(2, '0');
    var m = String(month).padStart(2, '0');
    return year + '-' + m + '-' + d;
  }

  function ensureRoot() {
    var root = document.getElementById('date-picker-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'date-picker-root';
      root.className = 'date-picker-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function buildWheelItems(values, labelFn) {
    return values.map(function(v, i) {
      return { value: v, label: labelFn ? labelFn(v, i) : v };
    });
  }

  function createWheelColumn(items, currentValue, onScroll, itemsRef) {
    var wrap = document.createElement('div');
    wrap.className = 'date-picker-wheel-wrap';
    var col = document.createElement('div');
    col.className = 'date-picker-wheel';
    col.setAttribute('role', 'listbox');
    var inner = document.createElement('div');
    inner.className = 'date-picker-wheel-inner';
    var padding = ROW_HEIGHT * PADDING_ROWS;
    inner.style.paddingTop = padding + 'px';
    inner.style.paddingBottom = padding + 'px';
    var currentItems = items;
    if (itemsRef) itemsRef.items = items;
    items.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'date-picker-wheel-item';
      div.setAttribute('data-value', item.value);
      div.style.height = ROW_HEIGHT + 'px';
      div.textContent = item.label;
      inner.appendChild(div);
    });
    col.appendChild(inner);
    wrap.appendChild(col);

    function scrollToValue(val) {
      var list = itemsRef ? itemsRef.items : currentItems;
      var idx = list.findIndex(function(it) { return String(it.value) === String(val); });
      if (idx < 0) idx = 0;
      col.scrollTop = idx * ROW_HEIGHT;
    }

    function getSelectedValue() {
      var list = itemsRef ? itemsRef.items : currentItems;
      var scrollTop = col.scrollTop;
      var idx = Math.round((scrollTop + ROW_HEIGHT / 2 - padding) / ROW_HEIGHT);
      idx = Math.max(0, Math.min(idx, list.length - 1));
      return list[idx].value;
    }

    col.addEventListener('scroll', function() {
      if (onScroll) onScroll(getSelectedValue());
    });

    col.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
    col.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });
    col.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: true });
    col.addEventListener('wheel', function(e) {
      e.stopPropagation();
    }, { passive: false });

    scrollToValue(currentValue);
    return { el: wrap, getValue: getSelectedValue, scrollToValue: scrollToValue };
  }

  window.showDatePicker = function(options) {
    var initialIso = options.initialIso || null;
    var onSelect = options.onSelect || function() {};
    var title = options.title || 'Дата рождения';

    var parsed = parseIso(initialIso);
    var today = new Date();
    var currentYear = today.getFullYear();
    var yearMin = 1940;
    var yearMax = currentYear;
    if (!parsed) {
      parsed = { day: 15, month: 6, year: 1989 };
    }
    parsed.day = Math.min(parsed.day, getDaysInMonth(parsed.year, parsed.month));

    var root = ensureRoot();
    var overlay = document.createElement('div');
    overlay.className = 'date-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    var dayItems = [];
    var monthItems = buildWheelItems([1,2,3,4,5,6,7,8,9,10,11,12], function(m) { return (m < 10 ? '0' : '') + m + ' ' + MONTH_NAMES[m - 1]; });
    var yearItems = buildWheelItems((function() {
      var arr = [];
      for (var y = yearMax; y >= yearMin; y--) arr.push(y);
      return arr;
    })());

    var dayWheelRef, monthWheelRef, yearWheelRef;
    var dayItemsRef = {};
    var currentDay = parsed.day;
    var currentMonth = parsed.month;
    var currentYearVal = parsed.year;

    function rebuildDayColumn() {
      var days = getDaysInMonth(currentYearVal, currentMonth);
      dayItems = buildWheelItems(Array.from({ length: days }, function(_, i) { return i + 1; }), function(d) { return (d < 10 ? '0' : '') + d; });
      currentDay = Math.min(currentDay, days);
      dayItemsRef.items = dayItems;
      if (dayWheelRef && dayWheelRef.el.parentNode) {
        var dayWrap = dayWheelRef.el;
        var newInner = document.createElement('div');
        newInner.className = 'date-picker-wheel-inner';
        newInner.style.paddingTop = (ROW_HEIGHT * PADDING_ROWS) + 'px';
        newInner.style.paddingBottom = (ROW_HEIGHT * PADDING_ROWS) + 'px';
        dayItems.forEach(function(item) {
          var div = document.createElement('div');
          div.className = 'date-picker-wheel-item';
          div.setAttribute('data-value', item.value);
          div.style.height = ROW_HEIGHT + 'px';
          div.textContent = item.label;
          newInner.appendChild(div);
        });
        var oldCol = dayWrap.querySelector('.date-picker-wheel');
        if (oldCol) {
          oldCol.innerHTML = '';
          oldCol.appendChild(newInner);
          dayWheelRef.scrollToValue(currentDay);
        }
      }
    }

    overlay.innerHTML =
      '<div class="date-picker-backdrop" aria-hidden="true"></div>' +
      '<div class="date-picker-modal">' +
        '<div class="date-picker-header">' +
          '<h3 class="date-picker-title">' + (title.replace(/</g, '&lt;')) + '</h3>' +
          '<button type="button" class="date-picker-close" aria-label="Закрыть">&times;</button>' +
        '</div>' +
        '<div class="date-picker-wheels">' +
          '<div class="date-picker-wheel-col"><span class="date-picker-col-label">День</span><div id="date-picker-day-wheel"></div></div>' +
          '<div class="date-picker-wheel-col"><span class="date-picker-col-label">Месяц</span><div id="date-picker-month-wheel"></div></div>' +
          '<div class="date-picker-wheel-col"><span class="date-picker-col-label">Год</span><div id="date-picker-year-wheel"></div></div>' +
        '</div>' +
        '<div class="date-picker-actions">' +
          '<button type="button" class="btn btn-primary date-picker-done">Готово</button>' +
        '</div>' +
      '</div>';

    var dayContainer = overlay.querySelector('#date-picker-day-wheel');
    var monthContainer = overlay.querySelector('#date-picker-month-wheel');
    var yearContainer = overlay.querySelector('#date-picker-year-wheel');

    dayItems = buildWheelItems(Array.from({ length: getDaysInMonth(currentYearVal, currentMonth) }, function(_, i) { return i + 1; }), function(d) { return (d < 10 ? '0' : '') + d; });
    dayItemsRef.items = dayItems;

    dayWheelRef = createWheelColumn(dayItems, currentDay, function(v) { currentDay = parseInt(v, 10); }, dayItemsRef);
    monthWheelRef = createWheelColumn(monthItems, currentMonth, function(v) {
      currentMonth = parseInt(v, 10);
      rebuildDayColumn();
    });
    yearWheelRef = createWheelColumn(yearItems, currentYearVal, function(v) {
      currentYearVal = parseInt(v, 10);
      rebuildDayColumn();
    });

    dayContainer.appendChild(dayWheelRef.el);
    monthContainer.appendChild(monthWheelRef.el);
    yearContainer.appendChild(yearWheelRef.el);

    function getSelectedIso() {
      var d = parseInt(dayWheelRef.getValue(), 10);
      var m = parseInt(monthWheelRef.getValue(), 10);
      var y = parseInt(yearWheelRef.getValue(), 10);
      var daysInMonth = getDaysInMonth(y, m);
      d = Math.min(d, daysInMonth);
      return toIso(d, m, y);
    }

    function close() {
      overlay.classList.remove('date-picker-visible');
      document.body.classList.remove('date-picker-open');
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 220);
    }

    overlay.querySelector('.date-picker-backdrop').addEventListener('click', close);
    overlay.querySelector('.date-picker-close').addEventListener('click', close);
    overlay.querySelector('.date-picker-done').addEventListener('click', function() {
      var iso = getSelectedIso();
      close();
      onSelect(iso);
    });

    root.appendChild(overlay);
    document.body.classList.add('date-picker-open');
    requestAnimationFrame(function() { overlay.classList.add('date-picker-visible'); });
  };

  window.datePickerIsoToDisplay = function(iso) {
    if (!iso || iso.length < 10) return '';
    var p = parseIso(iso);
    if (!p) return '';
    return (p.day < 10 ? '0' : '') + p.day + '.' + (p.month < 10 ? '0' : '') + p.month + '.' + p.year;
  };
})();
