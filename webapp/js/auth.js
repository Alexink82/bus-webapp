// Auth: persist Telegram user from WebApp initData
(function() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) {
    const user = Telegram.WebApp.initDataUnsafe.user;
    localStorage.setItem('telegram_user_id', String(user.id));
    if (user.language_code) localStorage.setItem('lang', user.language_code.slice(0, 2));
  }
})();
