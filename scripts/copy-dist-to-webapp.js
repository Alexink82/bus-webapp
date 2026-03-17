/**
 * Копирует содержимое dist/ в webapp/ после сборки Vite.
 * Бэкенд продолжает отдавать статику из webapp/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const webappDir = path.join(__dirname, '..', 'webapp');

if (!fs.existsSync(distDir)) {
  console.error('dist/ не найден. Сначала выполните: npm run build');
  process.exit(1);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Копируем только собранные файлы в webapp (перезаписываем)
for (const name of fs.readdirSync(distDir)) {
  const srcPath = path.join(distDir, name);
  const destPath = path.join(webappDir, name);
  if (fs.existsSync(destPath)) {
    const destStat = fs.statSync(destPath);
    if (destStat.isDirectory()) {
      for (const child of fs.readdirSync(destPath)) {
        const childDest = path.join(destPath, child);
        if (fs.statSync(childDest).isFile()) fs.unlinkSync(childDest);
      }
    }
  }
  copyRecursive(srcPath, destPath);
}

console.log('dist/ скопирован в webapp/');
