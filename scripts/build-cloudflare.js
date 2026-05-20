const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const entries = [
  'index.html',
  'landing.html',
  'article.md',
  'manifest.webmanifest',
  'sw.js',
  'assets',
  'css',
  'js',
];

function copyEntry(name) {
  const source = path.join(root, name);
  const target = path.join(dist, name);
  if (!fs.existsSync(source)) return;

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, target, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
entries.forEach(copyEntry);

console.log(`Built Cloudflare Pages output at ${dist}`);
