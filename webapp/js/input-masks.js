/**
 * Маска даты рождения: ввод вручную DD.MM.YYYY, автоподстановка точки.
 * Возвращает значение в формате YYYY-MM-DD для API или пустую строку.
 */
function formatDobInput(value) {
  var digits = (value || '').replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + '.' + digits.slice(2);
  return digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4, 8);
}

function dobToIso(displayValue) {
  var digits = (displayValue || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  var d = digits.slice(0, 2), m = digits.slice(2, 4), y = digits.slice(4, 8);
  var day = parseInt(d, 10), month = parseInt(m, 10), year = parseInt(y, 10);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return '';
  return y + '-' + m + '-' + d;
}

function isoToDob(iso) {
  if (!iso || iso.length < 10) return '';
  return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
}

/**
 * Паспорт РБ: маска "ХХ 1234567" — 2 буквы (кириллица или латиница), пробел, 7 цифр.
 */
var passportCyrillicToLatin = {
  'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Z','З':'Z','И':'I','Й':'J','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'CH','Ш':'SH','Щ':'SCH','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'U','Я':'YA'
};
function _passportCharToLatin(ch) {
  if (!ch) return '';
  var u = ch.toUpperCase();
  if (/[A-Za-z]/.test(ch)) return u;
  if (passportCyrillicToLatin[u]) return passportCyrillicToLatin[u].charAt(0).toUpperCase();
  if (passportCyrillicToLatin[ch]) return passportCyrillicToLatin[ch].charAt(0).toUpperCase();
  return '';
}

/** Паспорт РФ: только цифры, формат 1234 567890 (4 + 6). */
function formatPassportRuInput(value) {
  var digits = (value || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 4) return digits;
  return digits.slice(0, 4) + ' ' + digits.slice(4);
}
function passportRuToApi(value) {
  return (value || '').replace(/\D/g, '').slice(0, 10);
}

function formatPassportByInput(value) {
  var s = value || '';
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    var letter = _passportCharToLatin(c);
    if (letter && out.replace(/[^A-Z]/g, '').length < 2) out += letter;
    else if (/\d/.test(c) && out.replace(/\D/g, '').length < 7) {
      if (out.length === 2 && out.indexOf(' ') === -1) out += ' ';
      out += c;
    }
  }
  if (out.length > 2 && out[2] !== ' ') out = out.slice(0, 2) + ' ' + out.slice(2).replace(/\D/g, '');
  return out.slice(0, 10);
}
function passportByToApi(value) {
  var s = (value || '').replace(/\s/g, '').toUpperCase();
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = _passportCharToLatin(s[i]);
    if (c) out += c;
    else if (/\d/.test(s[i])) out += s[i];
  }
  return out;
}

/** Универсальная маска по гражданству. */
function formatPassportInput(value, citizenship) {
  if (citizenship === 'RU') return formatPassportRuInput(value);
  return formatPassportByInput(value);
}
/** Нормализованное значение для API по гражданству. */
function passportToApi(value, citizenship) {
  if (citizenship === 'RU') return passportRuToApi(value);
  return passportByToApi(value);
}

/**
 * Валидация паспорта по гражданству.
 * @returns {{ valid: boolean, message: string }}
 */
function validatePassport(citizenship, value) {
  var cleaned = (value || '').trim().replace(/[\s\-–—]/g, '');
  if (!citizenship || citizenship === 'BY') {
    var byNorm = passportByToApi(value);
    if (byNorm.length !== 9) return { valid: false, message: 'Ожидается формат XX1234567 (две буквы + 7 цифр)' };
    return { valid: true };
  }
  if (citizenship === 'RU') {
    var digits = (value || '').replace(/\D/g, '');
    if (digits.length !== 10) return { valid: false, message: 'Ожидается 10 цифр (серия 4 + номер 6)' };
    var series = digits.slice(0, 4);
    if (series === '0000' || series.slice(0, 2) === '00') return { valid: false, message: 'Некорректная серия паспорта' };
    if (digits.slice(4) === '000000') return { valid: false, message: 'Некорректный номер паспорта' };
    return { valid: true };
  }
  return { valid: false, message: 'Выберите гражданство' };
}

window.formatDobInput = formatDobInput;
window.dobToIso = dobToIso;
window.isoToDob = isoToDob;
window.formatPassportInput = formatPassportInput;
window.formatPassportRuInput = formatPassportRuInput;
window.formatPassportByInput = formatPassportByInput;
window.passportToApi = passportToApi;
window.passportRuToApi = passportRuToApi;
window.passportByToApi = passportByToApi;
window.validatePassport = validatePassport;
