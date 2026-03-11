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
 * Паспорт: маска "МР 1234567" или "MR 1234567", пробел после серии, только заглавные.
 * Кириллица МР и латиница MR принимаются; при сохранении нормализуем в латиницу для API.
 */
var passportCyrillicToLatin = { 'М': 'M', 'Р': 'R', 'м': 'M', 'р': 'R' };

function formatPassportInput(value) {
  var s = (value || '').toUpperCase();
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (passportCyrillicToLatin[c] !== undefined) c = passportCyrillicToLatin[c];
    if (/[A-Z]/.test(c) && out.length < 2) out += c;
    else if (/\d/.test(c) && out.replace(/\D/g, '').length < 7) {
      if (out.length === 2 && out.indexOf(' ') === -1) out += ' ';
      out += c;
    }
  }
  if (out.length > 2 && out[2] !== ' ') out = out.slice(0, 2) + ' ' + out.slice(2).replace(/\D/g, '');
  return out.slice(0, 10);
}

function passportToApi(value) {
  var s = (value || '').replace(/\s/g, '');
  for (var k in passportCyrillicToLatin) { s = s.split(k).join(passportCyrillicToLatin[k]); s = s.split(k.toLowerCase()).join(passportCyrillicToLatin[k]); }
  return s.toUpperCase().replace(/\s/g, '');
}

window.formatDobInput = formatDobInput;
window.dobToIso = dobToIso;
window.isoToDob = isoToDob;
window.formatPassportInput = formatPassportInput;
window.passportToApi = passportToApi;
