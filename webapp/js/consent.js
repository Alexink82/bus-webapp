/**
 * Окно согласия на обработку персональных данных при первом запуске.
 * Ключ localStorage: dataConsentAccepted = '1' после принятия.
 */
(function() {
  var STORAGE_KEY = 'dataConsentAccepted';

  function isAccepted() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function setAccepted() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  function getConsentText() {
    var lang = (typeof getLang === 'function' ? getLang() : (localStorage.getItem('lang') || 'ru'));
    var texts = {
      ru: {
        title: 'Согласие на обработку данных',
        message: 'Используя приложение, вы соглашаетесь на обработку персональных данных (ФИО, дата рождения, паспорт, контактный телефон) в целях бронирования и оказания транспортных услуг. Данные хранятся и обрабатываются в соответствии с законодательством Республики Беларусь.',
        accept: 'Принимаю',
      },
      en: {
        title: 'Data processing consent',
        message: 'By using this app, you consent to the processing of personal data (name, date of birth, passport, contact phone) for booking and transport services. Data is stored and processed in accordance with the legislation of the Republic of Belarus.',
        accept: 'I accept',
      },
      be: {
        title: 'Згода на апрацоўку даных',
        message: 'Карыстаючыся дадаткамі, вы згаджаецеся на апрацоўку персанальных даных (ПІБ, дата нараджэння, пашпарт, кантактны тэлефон) у мэтах браніравання і аказання транспартных паслуг. Даныя захоўваюцца і апрацоўваюцца ў адпаведнасці з заканадаўствам Рэспублікі Беларусь.',
        accept: 'Прымаю',
      },
    };
    return texts[lang] || texts.ru;
  }

  function showConsentModal() {
    if (isAccepted()) return;
    var root = document.getElementById('app-modal-root') || (function() {
      var r = document.createElement('div'); r.id = 'app-modal-root'; r.className = 'app-modal-root'; document.body.appendChild(r); return r;
    })();
    var t = getConsentText();
    var overlay = document.createElement('div');
    overlay.className = 'app-modal-overlay consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'consent-title');
    var content = document.createElement('div');
    content.className = 'app-modal-content';
    content.innerHTML =
      '<div class="app-modal-header">' +
        '<h2 id="consent-title" class="app-modal-title">' + (t.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')) + '</h2>' +
      '</div>' +
      '<div class="app-modal-body">' +
        '<p class="app-modal-message consent-message">' + (t.message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')) + '</p>' +
      '</div>' +
      '<div class="app-modal-footer">' +
        '<button type="button" class="btn btn-primary" id="consentAccept">' + (t.accept.replace(/&/g,'&amp;')) + '</button>' +
      '</div>';
    overlay.appendChild(content);
    content.querySelector('#consentAccept').addEventListener('click', function() {
      setAccepted();
      overlay.classList.remove('app-modal-visible');
      setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    });
    root.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('app-modal-visible'); });
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(showConsentModal, 300);
      });
    } else {
      setTimeout(showConsentModal, 300);
    }
  }

  init();
  window.showDataConsentIfNeeded = showConsentModal;
  window.isDataConsentAccepted = isAccepted;
})();
