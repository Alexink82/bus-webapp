/**
 * Entry для страницы бронирования. Порядок импортов важен.
 */
import './api.js';
import './auth.js';
import './input-masks.js';
import './passport-config.js';
import './phone-config.js';
import './date-picker.js';
import './app-modal.js';
import './i18n.js';
import './settings.js';
import './theme.js';
import './consent.js';
import './icons.js';
import './booking.js';

if (typeof window.applyI18nToPage === 'function') window.applyI18nToPage();
