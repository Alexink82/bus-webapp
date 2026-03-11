// Base API URL - same origin when served from FastAPI static
const BASE_URL = window.location.origin;

var ERROR_MESSAGES = {
  blocked: 'Номер телефона или аккаунт заблокированы.',
  invalid_phone: 'Укажите корректный номер телефона.',
  invalid_date_format: 'Неверный формат даты.',
  passengers_required: 'Укажите данных хотя бы одного пассажира.',
  route_not_found: 'Маршрут не найден.',
  booking_not_found: 'Заявка не найдена.',
  cannot_cancel: 'Эту заявку нельзя отменить.',
  not_authorized_to_cancel: 'Нет прав на отмену этой заявки.',
  passenger_not_found: 'Пассажир не найден.',
  invalid_birth_date: 'Неверная дата рождения.',
  init_data_required: 'Требуется вход через Telegram.',
  invalid_init_data: 'Сессия истекла. Перезапустите приложение.',
  telegram_id_required: 'Требуется идентификация пользователя.',
  invalid_telegram_id: 'Неверный идентификатор пользователя.',
  not_dispatcher: 'Нет доступа (вы не диспетчер).',
  not_admin: 'Нет доступа (не админ).',
  too_many_requests: 'Слишком много запросов. Подождите минуту.',
  already_taken: 'Заявку уже взял другой диспетчер.',
  not_your_booking: 'Это не ваша заявка.',
  invalid_status: 'Недопустимый статус.',
  dispatcher_exists: 'Диспетчер с таким ID уже добавлен.',
  dispatcher_not_found: 'Диспетчер не найден.',
  name_required: 'Укажите фамилию и имя пассажира.',
  birth_date_future: 'Дата рождения не может быть в будущем.',
  passport_required: 'Укажите паспорт для международного рейса.',
  empty: 'Заполните данные пассажира.',
  birth_date_invalid: 'Неверный формат даты рождения.'
};

function userFriendlyMessage(detail) {
  if (typeof detail === 'string') return ERROR_MESSAGES[detail] || detail;
  if (detail && detail.code) return ERROR_MESSAGES[detail.code] || detail.code;
  return detail ? String(detail) : '';
}

async function api(path, options = {}) {
  const url = path.startsWith('http') ? path : BASE_URL + path;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const telegramId = getTelegramUserId();
  if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);
  const initData = getTelegramInitData();
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  const startParam = typeof getTelegramStartParam === 'function' ? getTelegramStartParam() : '';
  if (startParam) headers['X-Telegram-Start-Param'] = startParam;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = userFriendlyMessage(data.detail) || data.detail?.code || data.detail || res.statusText;
    if (res.status >= 500) msg = 'Временная ошибка сервера. Попробуйте позже.';
    throw new Error(typeof msg === 'string' ? msg : res.statusText);
  }
  return data;
}

function getTelegramInitData() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData)
    return Telegram.WebApp.initData;
  return '';
}

function getTelegramUserId() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user)
    return Telegram.WebApp.initDataUnsafe.user.id;
  return localStorage.getItem('telegram_user_id') || null;
}

/** Параметр запуска из ссылки t.me/bot?start=XXX (реферал, метка). Пустая строка если нет. */
function getTelegramStartParam() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    var p = Telegram.WebApp.initDataUnsafe.start_param;
    return (p != null && typeof p === 'string') ? p : '';
  }
  return '';
}

function setTelegramUserId(id) {
  if (id) localStorage.setItem('telegram_user_id', String(id));
  else localStorage.removeItem('telegram_user_id');
}

function escapeHtml(str) {
  if (str == null) return '';
  var s = String(str);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.BASE_URL = BASE_URL;
window.api = api;
window.getTelegramUserId = getTelegramUserId;
window.getTelegramInitData = getTelegramInitData;
window.getTelegramStartParam = getTelegramStartParam;
window.setTelegramUserId = setTelegramUserId;
window.userFriendlyMessage = userFriendlyMessage;
window.escapeHtml = escapeHtml;
