// Base API URL - same origin when served from FastAPI static
const BASE_URL = window.location.origin;

async function api(path, options = {}) {
  const url = path.startsWith('http') ? path : BASE_URL + path;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const telegramId = getTelegramUserId();
  if (telegramId) headers['X-Telegram-User-Id'] = String(telegramId);
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail?.code || data.detail || res.statusText);
  return data;
}

function getTelegramUserId() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user)
    return Telegram.WebApp.initDataUnsafe.user.id;
  return localStorage.getItem('telegram_user_id') || null;
}

function setTelegramUserId(id) {
  if (id) localStorage.setItem('telegram_user_id', String(id));
  else localStorage.removeItem('telegram_user_id');
}

window.BASE_URL = BASE_URL;
window.api = api;
window.getTelegramUserId = getTelegramUserId;
window.setTelegramUserId = setTelegramUserId;
