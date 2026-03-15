/**
 * Локализация: RU, EN, BE.
 * Язык: из Telegram (user.language_code), иначе из системы (navigator), иначе ru.
 * Смена языка — в настройках профиля; сохраняется в localStorage.
 */
(function() {
  var STORAGE_KEY = 'lang';
  var SUPPORTED = { ru: 'ru', en: 'en', be: 'be' };

  var messages = {
    ru: {
      appTitle: 'Бронирование билетов',
      from: 'Откуда',
      to: 'Куда',
      date: 'Дата',
      presetToday: 'Сегодня',
      presetTomorrow: 'Завтра',
      presetWeekend: 'Выходные',
      repeatLastSearch: 'Повторить последний поиск',
      findTrips: 'Найти рейсы',
      findTripsHint: 'Время отправления и цена появятся после нажатия «Найти рейсы».',
      noTripsForDate: 'Для выбранного направления в этот день рейсов нет или время отправления уже прошло. Выберите другую дату или направление.',
      routeNotFound: 'Маршрут не найден. Выберите другое направление (Откуда / Куда).',
      myBookings: 'Мои заявки',
      profile: 'Профиль',
      faq: 'FAQ',
      book: 'Бронь',
      settings: 'Настройки',
      select: 'Выбрать',
      fromPrice: 'от',
      actualInfo: 'Актуальная информация',
      passenger: 'Пассажир',
      continue: 'Продолжить',
      bookButton: 'Забронировать',
      success: 'Заявка создана',
      bookingId: 'Номер заявки',
      status: 'Статус',
      pending: 'Ожидает подтверждения диспетчером',
      cancelBooking: 'Отменить заявку',
      backOrClose: 'Назад',
      newSearch: 'Новый поиск',
      backToMain: 'Главная',
      details: 'Подробнее',
      rescheduleDate: 'Перенести дату',
      cancel: 'Отмена',
      save: 'Сохранить',
      add: 'Добавить',
      delete: 'Удалить',
      close: 'Закрыть',
      error: 'Ошибка',
      loading: 'Загрузка...',
      noBookings: 'Нет заявок.',
      savedPassengers: 'Сохранённые пассажиры',
      addPassenger: 'Добавить пассажира',
      lastName: 'Фамилия',
      firstName: 'Имя',
      middleName: 'Отчество',
      birthDate: 'Дата рождения',
      passport: 'Паспорт (серия и номер)',
      contactPhone: 'Контактный телефон',
      savePhoneToProfile: 'Сохранить номер в профиль',
      savePassengerToProfile: 'Сохранить данные пассажира в профиль для быстрого ввода',
      fillFromProfile: 'Подставить из профиля',
      addFromSaved: 'Добавить из сохранённых',
      language: 'Язык',
      reduceAnimations: 'Уменьшить анимации',
      theme: 'Тема',
      reduceAnimationsHint: 'Рекомендуется при чувствительности к движению на экране.',
      maintenance: 'Технические работы',
      maintenanceUntil: 'Примерное время возобновления',
      schedule: 'Расписание',
      loginViaTelegram: 'Войдите через Telegram, чтобы видеть заявки.',
      loginViaTelegramShort: 'Войдите через Telegram.',
      tabBook: 'Бронь',
      tabProfile: 'Профиль',
      tabFaq: 'FAQ',
      tabDispatcher: 'Диспетчер',
      tabAdmin: 'Админ',
      bookingTitle: 'Бронирование',
      bookingCreated: 'Заявка создана',
      bookingCancelled: 'Заявка отменена.',
      cancelConfirm: 'Вы уверены, что хотите отменить заявку?',
      cancelConfirmTitle: 'Отмена заявки',
      faqTitle: 'Частые вопросы',
      faqSearchPlaceholder: 'Поиск по вопросам...',
      faqSupportTitle: 'Не нашли ответ?',
      faqSupportLink: '📨 Написать в поддержку (Telegram)',
      faqLoadError: 'Не удалось загрузить FAQ.',
    },
    en: {
      appTitle: 'Ticket booking',
      from: 'From',
      to: 'To',
      date: 'Date',
      presetToday: 'Today',
      presetTomorrow: 'Tomorrow',
      presetWeekend: 'Weekend',
      repeatLastSearch: 'Repeat last search',
      findTrips: 'Find trips',
      findTripsHint: 'Departure time and price will appear after clicking «Find trips».',
      noTripsForDate: 'No trips for this direction on the selected date, or departure time has passed. Choose another date or direction.',
      routeNotFound: 'Route not found. Choose another direction (From / To).',
      myBookings: 'My bookings',
      profile: 'Profile',
      faq: 'FAQ',
      book: 'Book',
      settings: 'Settings',
      select: 'Select',
      fromPrice: 'from',
      actualInfo: 'Actual info',
      passenger: 'Passenger',
      continue: 'Continue',
      bookButton: 'Book',
      success: 'Booking created',
      bookingId: 'Booking ID',
      status: 'Status',
      pending: 'Pending dispatcher confirmation',
      cancelBooking: 'Cancel booking',
      backOrClose: 'Back',
      backToMain: 'Main',
      newSearch: 'New search',
      details: 'Details',
      rescheduleDate: 'Reschedule date',
      cancel: 'Cancel',
      save: 'Save',
      add: 'Add',
      delete: 'Delete',
      close: 'Close',
      error: 'Error',
      loading: 'Loading...',
      noBookings: 'No bookings.',
      savedPassengers: 'Saved passengers',
      addPassenger: 'Add passenger',
      lastName: 'Last name',
      firstName: 'First name',
      middleName: 'Middle name',
      birthDate: 'Date of birth',
      passport: 'Passport (series and number)',
      contactPhone: 'Contact phone',
      savePhoneToProfile: 'Save phone to profile',
      savePassengerToProfile: 'Save passenger data to profile for quick fill',
      fillFromProfile: 'Fill from profile',
      addFromSaved: 'Add from saved',
      language: 'Language',
      reduceAnimations: 'Reduce animations',
      theme: 'Theme',
      reduceAnimationsHint: 'Recommended if you are sensitive to on-screen motion.',
      maintenance: 'Maintenance',
      maintenanceUntil: 'Estimated resumption time',
      schedule: 'Schedule',
      loginViaTelegram: 'Sign in via Telegram to see your bookings.',
      loginViaTelegramShort: 'Sign in via Telegram.',
      tabBook: 'Book',
      tabProfile: 'Profile',
      tabFaq: 'FAQ',
      tabDispatcher: 'Dispatcher',
      tabAdmin: 'Admin',
      bookingTitle: 'Booking',
      bookingCreated: 'Booking created',
      bookingCancelled: 'Booking cancelled.',
      cancelConfirm: 'Are you sure you want to cancel this booking?',
      cancelConfirmTitle: 'Cancel booking',
      faqTitle: 'FAQ',
      faqSearchPlaceholder: 'Search questions...',
      faqSupportTitle: "Didn't find an answer?",
      faqSupportLink: '📨 Contact support (Telegram)',
      faqLoadError: 'Failed to load FAQ.',
    },
    be: {
      appTitle: 'Браніраванне білетаў',
      from: 'Адкуль',
      to: 'Куды',
      date: 'Дата',
      presetToday: 'Сёння',
      presetTomorrow: 'Заўтра',
      presetWeekend: 'Выходныя',
      repeatLastSearch: 'Паўтарыць апошні пошук',
      findTrips: 'Знайсці рэйсы',
      findTripsHint: 'Час адпраўлення і кошт з\'являцца пасля націскання «Знайсці рэйсы».',
      noTripsForDate: 'Для абранага напрамку ў гэты дзень рэйсаў няма або час адпраўлення ўжо мінуў. Выберыце іншую дату або напрамак.',
      routeNotFound: 'Маршрут не знойдзены. Выберыце іншы напрамак (Адкуль / Куды).',
      myBookings: 'Мае заяўкі',
      profile: 'Профіль',
      faq: 'Пытанні і адказы',
      book: 'Бронь',
      settings: 'Налады',
      select: 'Выбраць',
      fromPrice: 'ад',
      actualInfo: 'Актуальная інфармацыя',
      passenger: 'Пасажир',
      continue: 'Далей',
      bookButton: 'Забраніраваць',
      success: 'Заяўка створана',
      bookingId: 'Нумар заяўкі',
      status: 'Статус',
      pending: 'Чакае пацверджання дыспетчара',
      cancelBooking: 'Адмяніць заяўку',
      backOrClose: 'Назад',
      backToMain: 'Галоўная',
      newSearch: 'Новы пошук',
      details: 'Падрабязней',
      rescheduleDate: 'Перанесці дату',
      cancel: 'Адмена',
      save: 'Захаваць',
      add: 'Дадаць',
      delete: 'Выдаліць',
      close: 'Закрыць',
      error: 'Памылка',
      loading: 'Загрузка...',
      noBookings: 'Няма заявак.',
      savedPassengers: 'Захаваныя пасажиры',
      addPassenger: 'Дадаць пасажира',
      lastName: 'Прозвішча',
      firstName: 'Імя',
      middleName: 'Імя па бацьку',
      birthDate: 'Дата нараджэння',
      passport: 'Пашпарт (серыя і нумар)',
      contactPhone: 'Кантактны тэлефон',
      savePhoneToProfile: 'Захаваць нумар у профіль',
      savePassengerToProfile: 'Захаваць даныя пасажира ў профіль для хуткага ўводу',
      fillFromProfile: 'Падставіць з профілю',
      addFromSaved: 'Дадаць з захаваных',
      language: 'Мова',
      reduceAnimations: 'Паменшыць анімацыі',
      theme: 'Тема',
      reduceAnimationsHint: 'Рэкамендуецца пры адчувальнасці да руху на экране.',
      maintenance: 'Тэхнічныя работы',
      maintenanceUntil: 'Прыблізны час аднаўлення',
      schedule: 'Расклад',
      loginViaTelegram: 'Увайдзіце праз Telegram, каб бачыць заяўкі.',
      loginViaTelegramShort: 'Увайдзіце праз Telegram.',
      tabBook: 'Бронь',
      tabProfile: 'Профіль',
      tabFaq: 'Пытанні і адказы',
      tabDispatcher: 'Дыспетчар',
      tabAdmin: 'Адмін',
      bookingTitle: 'Браніраванне',
      bookingCreated: 'Заяўка створана',
      bookingCancelled: 'Заяўка адменена.',
      cancelConfirm: 'Вы ўпэўнены, што хочаце адмяніць заяўку?',
      cancelConfirmTitle: 'Адмена заяўкі',
      faqTitle: 'Частыя пытанні',
      faqSearchPlaceholder: 'Пошук па пытаннях...',
      faqSupportTitle: 'Не знайшлі адказ?',
      faqSupportLink: '📨 Напісаць у падтрымку (Telegram)',
      faqLoadError: 'Не ўдалося загрузіць FAQ.',
    }
  };

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setStored(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function getTelegramLang() {
    if (typeof window.Telegram !== 'undefined' && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) {
      var code = (window.Telegram.WebApp.initDataUnsafe.user.language_code || '').toLowerCase();
      if (code.indexOf('be') === 0) return 'be';
      if (code.indexOf('ru') === 0) return 'ru';
      if (code.indexOf('en') === 0) return 'en';
      return code.slice(0, 2) || null;
    }
    return null;
  }

  function getSystemLang() {
    var n = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (n.indexOf('be') === 0) return 'be';
    if (n.indexOf('ru') === 0) return 'ru';
    if (n.indexOf('en') === 0) return 'en';
    return n.slice(0, 2) || 'ru';
  }

  function getLang() {
    var stored = getStored();
    if (stored && SUPPORTED[stored]) return stored;
    var tg = getTelegramLang();
    if (tg && SUPPORTED[tg]) return tg;
    var sys = getSystemLang();
    return SUPPORTED[sys] || 'ru';
  }

  function setLang(lang) {
    if (!SUPPORTED[lang]) lang = 'ru';
    setStored(lang);
    applyLang(lang);
    return lang;
  }

  function applyLang(lang) {
    document.documentElement.setAttribute('lang', lang === 'be' ? 'be' : lang === 'en' ? 'en' : 'ru');
    if (typeof window.onLangChange === 'function') window.onLangChange(lang);
  }

  function t(key) {
    var lang = getLang();
    var m = messages[lang] || messages.ru;
    return (m[key] != null ? m[key] : (messages.ru[key])) || key;
  }

  /** Обновить на странице все элементы с data-i18n="key" (textContent = t(key)). */
  function applyI18nToPage() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
  }

  function init() {
    var lang = getLang();
    if (!getStored() && (getTelegramLang() || getSystemLang())) setStored(lang);
    applyLang(lang);
    if (document.querySelectorAll('[data-i18n]').length) applyI18nToPage();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.i18nMessages = messages;
  window.getLang = getLang;
  window.setLang = setLang;
  window.t = t;
  window.applyI18nToPage = applyI18nToPage;
  window.getTelegramLang = getTelegramLang;
  window.getSystemLang = getSystemLang;
})();
