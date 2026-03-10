const i18n = {
  ru: {
    from: 'Откуда',
    to: 'Куда',
    date: 'Дата',
    find: 'Найти рейсы',
    myBookings: 'Мои заявки',
    profile: 'Профиль',
    faq: 'FAQ',
    book: 'Бронь',
    select: 'Выбрать',
    fromPrice: 'от',
    actualInfo: 'Актуальная информация',
    passenger: 'Пассажир',
    continue: 'Продолжить',
    bookButton: 'Забронировать',
    success: 'Заявка создана',
    bookingId: 'Номер заявки',
    status: 'Статус',
    pending: 'Ожидает подтверждения',
  },
  en: {
    from: 'From',
    to: 'To',
    date: 'Date',
    find: 'Find trips',
    myBookings: 'My bookings',
    profile: 'Profile',
    faq: 'FAQ',
    book: 'Book',
    select: 'Select',
    fromPrice: 'from',
    actualInfo: 'Actual info',
    passenger: 'Passenger',
    continue: 'Continue',
    bookButton: 'Book',
    success: 'Booking created',
    bookingId: 'Booking ID',
    status: 'Status',
    pending: 'Pending confirmation',
  },
};

function getLang() {
  return localStorage.getItem('lang') || 'ru';
}

function t(key) {
  const lang = getLang();
  return (i18n[lang] && i18n[lang][key]) || i18n.ru[key] || key;
}

window.i18n = i18n;
window.getLang = getLang;
window.t = t;
