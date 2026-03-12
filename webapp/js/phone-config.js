/**
 * Телефон по странам: маски и нормализация в E.164-подобный формат (+XXXXXXXXXXX).
 * Для международных автобусных перевозок (ЕС ↔ СНГ).
 */
(function() {
  var PHONE_COUNTRIES = [
    { code: 'RU', name: 'Россия', prefix: '7', maskLen: 10, placeholder: '+7 (___) ___-__-__' },
    { code: 'BY', name: 'Беларусь', prefix: '375', maskLen: 9, placeholder: '+375 (__) ___-__-__' },
    { code: 'UA', name: 'Украина', prefix: '380', maskLen: 9, placeholder: '+380 (__) ___-__-__' },
    { code: 'PL', name: 'Польша', prefix: '48', maskLen: 9, placeholder: '+48 ___ ___ ___' },
    { code: 'LT', name: 'Литва', prefix: '370', maskLen: 8, placeholder: '+370 (___) _____' },
    { code: 'LV', name: 'Латвия', prefix: '371', maskLen: 8, placeholder: '+371 __ ___ ___' },
    { code: 'GE', name: 'Грузия', prefix: '995', maskLen: 9, placeholder: '+995 (___) __ __ __' },
    { code: 'AM', name: 'Армения', prefix: '374', maskLen: 8, placeholder: '+374 __ ___ ___' },
    { code: 'OTHER', name: 'Другая страна', prefix: '', maskLen: 15, placeholder: '+___ __ ___ __ __' }
  ];

  function getPhoneCountry(code) {
    for (var i = 0; i < PHONE_COUNTRIES.length; i++) {
      if (PHONE_COUNTRIES[i].code === code) return PHONE_COUNTRIES[i];
    }
    return PHONE_COUNTRIES[0];
  }

  /**
   * Нормализованный номер для API: +375291234567 (только цифры после +).
   * Если пользователь ввёл без кода страны — подставляем prefix.
   */
  function getCleanPhone(value, countryCode) {
    var digits = (value || '').replace(/\D/g, '');
    var c = getPhoneCountry(countryCode);
    if (c.code === 'OTHER') {
      if (digits.length < 10) return '';
      return '+' + digits.slice(0, 15);
    }
    var prefix = c.prefix;
    var needLen = prefix.length + c.maskLen;
    if (c.code === 'RU' && digits.length === 10 && digits.charAt(0) === '8')
      digits = '7' + digits.slice(1);
    if (digits.length === c.maskLen && (c.code !== 'RU' || digits.charAt(0) !== '8'))
      digits = prefix + digits;
    else if (digits.length >= prefix.length && digits.indexOf(prefix) === 0)
      digits = digits.slice(0, needLen);
    else if (digits.length > c.maskLen && digits.length <= needLen && digits.indexOf(prefix) !== 0)
      digits = prefix + digits.slice(-c.maskLen);
    else if (digits.length < prefix.length)
      digits = prefix + digits;
    digits = digits.slice(0, 15);
    if (digits.length < 10) return '';
    return '+' + digits;
  }

  /**
   * Форматирование при вводе: +375 (29) 123-45-67 в зависимости от страны.
   */
  function formatPhoneInput(value, countryCode) {
    var digits = (value || '').replace(/\D/g, '');
    var c = getPhoneCountry(countryCode);
    if (c.code === 'OTHER') {
      if (digits.length === 0) return '';
      return '+' + digits.slice(0, 15).replace(/(\d{1,3})(\d{0,3})?(\d{0,3})?(\d{0,4})?/, function(_, a, b, d, e) {
        var s = '+' + a;
        if (b) s += ' ' + b;
        if (d) s += ' ' + d;
        if (e) s += ' ' + e;
        return s.trim();
      });
    }
    var prefix = c.prefix;
    if (digits.length <= prefix.length) return digits ? '+' + digits : '';
    if (digits.indexOf(prefix) !== 0) {
      if (digits.length <= c.maskLen) digits = prefix + digits;
      else digits = prefix + digits.slice(-c.maskLen);
    }
    digits = digits.slice(0, prefix.length + c.maskLen);
    var local = digits.slice(prefix.length);
    if (c.code === 'RU') return '+7 (' + local.slice(0, 3) + ') ' + local.slice(3, 6) + '-' + local.slice(6, 8) + '-' + local.slice(8);
    if (c.code === 'BY') return '+375 (' + local.slice(0, 2) + ') ' + local.slice(2, 5) + '-' + local.slice(5, 7) + '-' + local.slice(7);
    if (c.code === 'UA') return '+380 (' + local.slice(0, 2) + ') ' + local.slice(2, 5) + '-' + local.slice(5, 7) + '-' + local.slice(7);
    if (c.code === 'PL') return '+48 ' + local.slice(0, 3) + ' ' + local.slice(3, 6) + ' ' + local.slice(6);
    if (c.code === 'LT') return '+370 (' + local.slice(0, 3) + ') ' + local.slice(3);
    if (c.code === 'LV') return '+371 ' + local.slice(0, 2) + ' ' + local.slice(2, 5) + ' ' + local.slice(5);
    if (c.code === 'GE') return '+995 (' + local.slice(0, 3) + ') ' + local.slice(3, 5) + ' ' + local.slice(5, 7) + ' ' + local.slice(7);
    if (c.code === 'AM') return '+374 ' + local.slice(0, 2) + ' ' + local.slice(2, 5) + ' ' + local.slice(5);
    return '+' + digits;
  }

  /**
   * Только локальная часть для отображения в поле рядом с селектом страны (без дублирования +375).
   * Возвращает, например, "(29) 973-44-67" для BY.
   */
  function formatPhoneInputLocal(value, countryCode) {
    var digits = (value || '').replace(/\D/g, '');
    var c = getPhoneCountry(countryCode);
    if (c.code === 'OTHER') {
      if (digits.length === 0) return '';
      return digits.slice(0, 15).replace(/(\d{1,3})(\d{0,3})?(\d{0,3})?(\d{0,4})?/, function(_, a, b, d, e) {
        var s = a;
        if (b) s += ' ' + b;
        if (d) s += ' ' + d;
        if (e) s += ' ' + e;
        return s.trim();
      });
    }
    var prefix = c.prefix;
    if (digits.length <= prefix.length) return digits ? digits : '';
    if (digits.indexOf(prefix) === 0) digits = digits.slice(prefix.length);
    else if (digits.length > c.maskLen) digits = digits.slice(-c.maskLen);
    digits = digits.slice(0, c.maskLen);
    if (c.code === 'RU') return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6, 8) + '-' + digits.slice(8);
    if (c.code === 'BY') return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 5) + '-' + digits.slice(5, 7) + '-' + digits.slice(7);
    if (c.code === 'UA') return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 5) + '-' + digits.slice(5, 7) + '-' + digits.slice(7);
    if (c.code === 'PL') return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
    if (c.code === 'LT') return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    if (c.code === 'LV') return digits.slice(0, 2) + ' ' + digits.slice(2, 5) + ' ' + digits.slice(5);
    if (c.code === 'GE') return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 5) + ' ' + digits.slice(5, 7) + ' ' + digits.slice(7);
    if (c.code === 'AM') return digits.slice(0, 2) + ' ' + digits.slice(2, 5) + ' ' + digits.slice(5);
    return digits;
  }

  /** Для getCleanPhone: если в value только локальные цифры (без кода страны), подставляем prefix. */
  function normalizePhoneValueForClean(value, countryCode) {
    var digits = (value || '').replace(/\D/g, '');
    var c = getPhoneCountry(countryCode);
    if (c.code === 'OTHER') return value;
    if (digits.length <= c.maskLen && digits.length > 0 && c.prefix && digits.indexOf(c.prefix) !== 0)
      digits = c.prefix + digits;
    return digits ? '+' + digits : '';
  }

  function validatePhone(value, countryCode) {
    var clean = getCleanPhone(value, countryCode);
    if (!clean) return { valid: false, message: 'Введите номер телефона' };
    var digits = clean.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return { valid: false, message: 'Некорректная длина номера (10–15 цифр)' };
    if (clean.charAt(0) !== '+') return { valid: false, message: 'Номер должен начинаться с + и кода страны' };
    return { valid: true };
  }

  window.PHONE_COUNTRIES = PHONE_COUNTRIES;
  window.getPhoneCountry = getPhoneCountry;
  window.getCleanPhone = getCleanPhone;
  window.formatPhoneInput = formatPhoneInput;
  window.formatPhoneInputLocal = formatPhoneInputLocal;
  window.validatePhone = validatePhone;
  /** Плейсхолдер только локальная часть (для поля рядом с селектом страны). */
  window.getPhonePlaceholderLocal = function(code) {
    var c = getPhoneCountry(code);
    if (c.code === 'OTHER') return c.placeholder;
    if (c.code === 'BY') return '(29) 123-45-67';
    if (c.code === 'RU') return '(999) 123-45-67';
    if (c.code === 'UA') return '(67) 123-45-67';
    if (c.code === 'PL') return '123 456 789';
    if (c.code === 'LT') return '(612) 34567';
    if (c.code === 'LV') return '12 345 678';
    if (c.code === 'GE') return '(555) 12 34 56';
    if (c.code === 'AM') return '12 345 678';
    return c.placeholder ? c.placeholder.replace(/^\+\d+\s*/, '') : '';
  };
})();
