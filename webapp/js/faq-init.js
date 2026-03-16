/**
 * Инициализация FAQ: i18n, закрытие, загрузка FAQ, поиск.
 */
(function() {
  if (typeof window.applyI18nToPage === 'function') window.applyI18nToPage();
  var closeBtn = document.getElementById('tgCloseBtn');
  if (closeBtn) {
    var inTelegram = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData;
    if (inTelegram) closeBtn.style.display = 'none';
    else {
      closeBtn.style.display = '';
      closeBtn.addEventListener('click', function() { if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close(); });
    }
  }
  var lang = typeof window.getLang === 'function' ? window.getLang() : (localStorage.getItem('lang') || 'ru');
  var qKey = lang === 'en' ? 'question_en' : (lang === 'be' ? 'question_be' : 'question_ru');
  var aKey = lang === 'en' ? 'answer_en' : (lang === 'be' ? 'answer_be' : 'answer_ru');
  var baseUrl = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
  fetch(baseUrl + '/api/faq?lang=' + lang).then(function(r) { return r.json(); }).then(function(data) {
    var items = data.items || [];
    var list = document.getElementById('faqList');
    var esc = function(s) { return (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')); };
    list.innerHTML = items.map(function(item) {
      var q = item[qKey] || item.question_ru || item.question_en || item.question;
      var a = item[aKey] || item.answer_ru || item.answer_en || item.answer;
      return '<div class="faq-item faq-item-dynamic"><div class="faq-item__question">' + esc(q) + '</div><div class="faq-item__answer">' + esc(a) + '</div></div>';
    }).join('');
  }).catch(function() {
    var msg = typeof window.t === 'function' ? window.t('faqLoadError') : 'Не удалось загрузить FAQ.';
    document.getElementById('faqList').innerHTML = '<p class="text-secondary p-4">' + msg + '</p>';
  });
  document.getElementById('faqSearch').addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    document.querySelectorAll('.faq-item-dynamic').forEach(function(el) {
      el.style.display = (q === '' || el.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
    });
  });
  if (window.Telegram && Telegram.WebApp) Telegram.WebApp.ready();
})();
