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
  cancel_only_via_dispatcher: 'Отмена менее чем за 2 часа (международный рейс) или 15 минут (междугородний) до отправления возможна только через диспетчера. Обратитесь в поддержку в Telegram или по телефону.',
  reason_required: 'Укажите причину отмены.',
  not_authorized_to_cancel: 'Нет прав на отмену этой заявки.',
  not_authorized_to_reschedule: 'Нет прав на перенос этой заявки.',
  cannot_reschedule_cancelled: 'Нельзя перенести отменённую или завершённую заявку.',
  reschedule_date_must_be_future: 'Новая дата должна быть в будущем.',
  passenger_not_found: 'Пассажир не найден.',
  invalid_birth_date: 'Неверная дата рождения.',
  init_data_required: 'Требуется вход через Telegram.',
  invalid_init_data: 'Сессия истекла. Перезапустите приложение.',
  backoffice_auth_required: 'Требуется вход в backoffice. Откройте панель из Telegram или войдите через browser-session.',
  invalid_browser_login_ticket: 'Ссылка входа устарела. Запросите новую ссылку из Telegram.',
  invalid_browser_auth_target: 'Неверная цель входа в backoffice.',
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
  passport_invalid_format: 'Неверный формат паспорта. РФ: 4 цифры серии + 6 цифр номера. РБ: 2 буквы + 7 цифр.',
  passport_series_invalid: 'Некорректная серия паспорта (серия не должна начинаться с 00).',
  passport_number_invalid: 'Некорректный номер паспорта.',
  empty: 'Заполните данные пассажира.',
  birth_date_invalid: 'Неверный формат даты рождения.'
};

function userFriendlyMessage(detail) {
  if (detail == null) return '';
  if (typeof detail === 'string') return ERROR_MESSAGES[detail] || detail;
  if (typeof detail === 'object' && detail !== null) {
    if (detail.code) return ERROR_MESSAGES[detail.code] || detail.code;
    if (Array.isArray(detail) && detail.length > 0) {
      var first = detail[0];
      if (first && typeof first.msg === 'string') return first.msg;
      return 'Ошибка валидации.';
    }
    return 'Ошибка.';
  }
  return String(detail);
}

var API_CACHE_TTL_MS = 60000;
var apiCache = new Map();

function apiCacheKey(path) {
  if (path.startsWith('http')) {
    try { return new URL(path).pathname + new URL(path).search; } catch (e) { return path; }
  }
  return path;
}

function apiInvalidateUserCache() {
  var prefix = '/api/user/';
  apiCache.forEach(function(_, key) {
    if (key.indexOf(prefix) === 0) apiCache.delete(key);
  });
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = path.startsWith('http') ? path : BASE_URL + path;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const telegramId = getTelegramUserId();
  if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);
  const initData = getTelegramInitData();
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  const startParam = typeof getTelegramStartParam === 'function' ? getTelegramStartParam() : '';
  if (startParam) headers['X-Telegram-Start-Param'] = startParam;

  var isGet = method === 'GET';
  var skipCache = options.skipCache === true;
  var cacheKey = isGet && !skipCache ? apiCacheKey(path) : null;
  if (cacheKey) {
    var entry = apiCache.get(cacheKey);
    if (entry && entry.expires > Date.now()) return entry.data;
  }

  const res = await fetch(url, { ...options, headers, method: method });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = userFriendlyMessage(data.detail) || (data.detail && typeof data.detail === 'object' && data.detail.code ? data.detail.code : null) || (typeof data.detail === 'string' ? data.detail : null) || res.statusText;
    let msgStr = typeof msg === 'string' ? msg : res.statusText;
    if (res.status >= 500) msgStr = 'Временная ошибка сервера. Попробуйте позже.';
    const err = new Error(msgStr);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  if (cacheKey) {
    apiCache.set(cacheKey, { data: data, expires: Date.now() + API_CACHE_TTL_MS });
  }

  if (method !== 'GET') {
    var pathNorm = path.startsWith('http') ? (function() { try { return new URL(path).pathname; } catch (e) { return path; } })() : path;
    if (pathNorm.indexOf('/api/user/passengers') === 0 || pathNorm === '/api/user/profile' ||
        pathNorm.indexOf('/api/bookings') === 0 && (pathNorm === '/api/bookings' || pathNorm.indexOf('/cancel') !== -1)) {
      apiInvalidateUserCache();
    }
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

function apiInvalidateCache(prefix) {
  if (!prefix) { apiCache.clear(); return; }
  apiCache.forEach(function(_, key) {
    if (key.indexOf(prefix) === 0) apiCache.delete(key);
  });
}

window.BASE_URL = BASE_URL;
window.api = api;
window.apiInvalidateCache = apiInvalidateCache;
window.getTelegramUserId = getTelegramUserId;
window.getTelegramInitData = getTelegramInitData;
window.getTelegramStartParam = getTelegramStartParam;
window.setTelegramUserId = setTelegramUserId;
window.userFriendlyMessage = userFriendlyMessage;
window.escapeHtml = escapeHtml;
window.ERROR_MESSAGES = ERROR_MESSAGES;

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function(reg) {
      if (reg && typeof reg.update === 'function') reg.update();
    }).catch(function() {});
  });
}
