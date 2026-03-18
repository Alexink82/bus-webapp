/**
 * Совместимость со старой командой.
 * Больше ничего не копируем: production теперь отдаёт dist/ напрямую.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error('dist/ не найден. Сначала выполните: npm run build');
  process.exit(1);
}

console.log('copy-dist отключён: исходники в webapp/ больше не перезаписываются, backend теперь обслуживает dist/ напрямую.');
