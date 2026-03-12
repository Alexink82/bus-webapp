/**
 * Страны выдачи паспорта для международных перевозок (ЕС ↔ СНГ).
 * Динамическая маска и валидация для топ-стран; для остальных — свободный ввод.
 * Номер сохраняется в нормализованном виде: без пробелов, буквы в верхнем регистре.
 */
(function() {
  var PASSPORT_CYRILLIC_TO_LATIN = {
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Z','З':'Z','И':'I','Й':'J',
    'К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F',
    'Х':'H','Ц':'C','Ч':'CH','Ш':'SH','Щ':'SCH','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'U','Я':'YA'
  };
  function cyrToLat(s) {
    if (!s) return '';
    var u = s.toUpperCase();
    for (var cyr in PASSPORT_CYRILLIC_TO_LATIN) { u = u.split(cyr).join(PASSPORT_CYRILLIC_TO_LATIN[cyr]); }
    return u;
  }

  var TOP_COUNTRIES = [
    { code: 'RU', name: 'Россия', example: '4511 123456', pattern: 'digits4_6', minLen: 10, maxLen: 10 },
    { code: 'BY', name: 'Беларусь', example: 'MP 1234567', pattern: 'letters2_digits7', minLen: 9, maxLen: 9 },
    { code: 'UA', name: 'Украина', example: 'EA 123456', pattern: 'letters2_digits6to8', minLen: 8, maxLen: 10 },
    { code: 'PL', name: 'Польша', example: 'AB 1234567', pattern: 'letters2_digits7', minLen: 9, maxLen: 9 },
    { code: 'DE', name: 'Германия', example: 'C12R3X4K5', pattern: 'alphanum9', minLen: 9, maxLen: 9 },
    { code: 'US', name: 'США', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'KZ', name: 'Казахстан', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'LT', name: 'Литва', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'LV', name: 'Латвия', example: 'AB 1234567', pattern: 'letters2_digits7', minLen: 9, maxLen: 9 },
    { code: 'EE', name: 'Эстония', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'MD', name: 'Молдова', example: 'AB 1234567', pattern: 'letters2_digits7', minLen: 9, maxLen: 9 },
    { code: 'RO', name: 'Румыния', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'TR', name: 'Турция', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'GE', name: 'Грузия', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'AM', name: 'Армения', example: 'AB 1234567', pattern: 'letters2_digits7', minLen: 9, maxLen: 9 },
    { code: 'CZ', name: 'Чехия', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'SK', name: 'Словакия', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'HU', name: 'Венгрия', example: 'AB 1234567', pattern: 'letters2_digits7', minLen: 9, maxLen: 9 },
    { code: 'BG', name: 'Болгария', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 },
    { code: 'RS', name: 'Сербия', example: '123456789', pattern: 'digits9', minLen: 9, maxLen: 9 }
  ];

  function getCountry(code) {
    for (var i = 0; i < TOP_COUNTRIES.length; i++) {
      if (TOP_COUNTRIES[i].code === code) return TOP_COUNTRIES[i];
    }
    return null;
  }

  function cleanForApi(value, countryCode) {
    if (!value || typeof value !== 'string') return '';
    var s = value.trim().toUpperCase().replace(/[\s\-–—]/g, '');
    var c = getCountry(countryCode);
    if (!c || countryCode === 'OTHER') {
      return s.replace(/[^A-Z0-9]/g, '');
    }
    if (c.pattern === 'digits4_6' || c.pattern === 'digits9') {
      return s.replace(/\D/g, '').slice(0, c.maxLen);
    }
    s = cyrToLat(s);
    return s.replace(/[^A-Z0-9]/g, '').slice(0, c.maxLen);
  }

  function formatDisplay(value, countryCode) {
    var c = getCountry(countryCode);
    if (!c || countryCode === 'OTHER') return (value || '').trim();
    var cleaned = cleanForApi(value, countryCode);
    if (c.pattern === 'digits4_6' && cleaned.length > 4) {
      return cleaned.slice(0, 4) + ' ' + cleaned.slice(4, 10);
    }
    if ((c.pattern === 'letters2_digits7' || c.pattern === 'letters2_digits6to8') && cleaned.length > 2) {
      return cleaned.slice(0, 2) + ' ' + cleaned.slice(2);
    }
    return cleaned;
  }

  function formatInput(value, countryCode) {
    var c = getCountry(countryCode);
    if (!c || countryCode === 'OTHER') return (value || '').trim().slice(0, 20);
    var raw = (value || '').trim().toUpperCase();
    if (c.pattern === 'digits4_6') {
      var d = raw.replace(/\D/g, '').slice(0, 10);
      return d.length <= 4 ? d : d.slice(0, 4) + ' ' + d.slice(4);
    }
    if (c.pattern === 'digits9') {
      return raw.replace(/\D/g, '').slice(0, 9);
    }
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      var letter = /[A-Za-z]/.test(ch) ? ch.toUpperCase() : (PASSPORT_CYRILLIC_TO_LATIN[ch] || PASSPORT_CYRILLIC_TO_LATIN[ch.toUpperCase()] || '');
      if (letter && out.replace(/[^A-Z]/g, '').length < 2) out += letter;
      else if (/\d/.test(ch) && out.replace(/\D/g, '').length < (c.pattern === 'letters2_digits6to8' ? 8 : 7)) {
        if (out.length === 2 && out[2] !== ' ') out += ' ';
        out += ch;
      }
    }
    if (out.length > 2 && out[2] !== ' ') out = out.slice(0, 2) + ' ' + out.slice(2).replace(/\D/g, '');
    return out.slice(0, c.pattern === 'letters2_digits6to8' ? 11 : 10);
  }

  function validate(countryCode, value) {
    var cleaned = cleanForApi(value, countryCode);
    if (!countryCode) return { valid: false, message: 'Выберите страну выдачи паспорта' };
    if (countryCode === 'OTHER') {
      if (cleaned.length < 6) return { valid: false, message: 'Введите номер паспорта (не менее 6 символов)' };
      return { valid: true };
    }
    var c = getCountry(countryCode);
    if (!c) return { valid: false, message: 'Неверная страна' };
    if (cleaned.length < c.minLen) {
      return { valid: false, message: 'Ожидается формат: ' + c.example };
    }
    if (cleaned.length > c.maxLen) {
      return { valid: false, message: 'Лишние символы. Пример: ' + c.example };
    }
    if (c.pattern === 'digits4_6') {
      var series = cleaned.slice(0, 4);
      if (series === '0000' || series.slice(0, 2) === '00') return { valid: false, message: 'Некорректная серия паспорта' };
      if (cleaned.slice(4) === '000000') return { valid: false, message: 'Некорректный номер паспорта' };
    }
    if (c.pattern === 'letters2_digits7' || c.pattern === 'letters2_digits6to8') {
      if (!/^[A-Z]{2}\d{6,8}$/.test(cleaned)) return { valid: false, message: 'Ожидается 2 буквы и 6–8 цифр. Пример: ' + c.example };
    }
    if (c.pattern === 'digits9' && !/^\d{9}$/.test(cleaned)) {
      return { valid: false, message: 'Ожидается 9 цифр. Пример: ' + c.example };
    }
    if (c.pattern === 'alphanum9' && !/^[A-Z0-9]{9}$/.test(cleaned)) {
      return { valid: false, message: 'Ожидается 9 символов (буквы и цифры). Пример: ' + c.example };
    }
    return { valid: true };
  }

  /**
   * Парсинг MRZ (машинно-читаемая зона) — вторая строка TD3, позиции 0–8 = номер документа.
   */
  function parseMrzDocumentNumber(line1, line2) {
    if (!line2 || line2.length < 9) return null;
    var num = line2.slice(0, 9).replace(/</g, '').trim();
    return num.length >= 5 ? num : null;
  }

  window.PASSPORT_TOP_COUNTRIES = TOP_COUNTRIES;
  window.PASSPORT_OTHER_CODE = 'OTHER';
  window.getPassportCountry = getCountry;
  window.passportCleanForApi = cleanForApi;
  window.passportFormatDisplay = formatDisplay;
  window.passportFormatInput = formatInput;
  window.passportValidate = validate;
  window.parseMrzDocumentNumber = parseMrzDocumentNumber;
})();
