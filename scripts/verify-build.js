/**
 * Проверяет, что сборка Vite создала ожидаемые артефакты и взаимосвязи.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const errors = [];

if (!fs.existsSync(distDir)) {
  console.error('FAIL: dist/ не найден');
  process.exit(1);
}

const expectedPages = ['index', 'booking', 'profile', 'success', 'faq', 'admin', 'dispatcher'];
for (const name of expectedPages) {
  const htmlPath = path.join(distDir, name + '.html');
  if (!fs.existsSync(htmlPath)) {
    errors.push('Отсутствует ' + name + '.html');
    continue;
  }
  const content = fs.readFileSync(htmlPath, 'utf8');
  if (!content.includes('<script') || !content.includes('src=')) {
    errors.push(name + '.html: нет тега script с src');
  }
  if (name !== 'dispatcher' && !content.includes('type="module"')) {
    // Пока только dispatcher переведён на module; остальные могут быть без type="module"
  }
}

const assetsDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  if (jsFiles.length === 0) errors.push('В dist/assets/ нет .js файлов');
  // Диспетчер должен подключать бандл из assets
  const dispatcherHtml = path.join(distDir, 'dispatcher.html');
  if (fs.existsSync(dispatcherHtml)) {
    const dContent = fs.readFileSync(dispatcherHtml, 'utf8');
    const hasAssetScript = /src="\/assets\/[^"]+\.js"/.test(dContent) || /src="\.\/assets\/[^"]+\.js"/.test(dContent);
    if (!hasAssetScript) errors.push('dispatcher.html в dist не ссылается на бандл в assets/');
  }
} else {
  errors.push('Нет папки dist/assets/');
}

if (errors.length > 0) {
  console.error('Проверка сборки не пройдена:');
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
}

console.log('OK: сборка проверена (страницы и assets на месте)');
