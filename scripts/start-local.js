const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const preferredPort = Number(process.env.PORT || 4173);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const requested = normalized === '/' || normalized === '\\' ? '/index.html' : normalized;
  const fullPath = path.join(root, requested);
  if (!fullPath.startsWith(root)) return null;
  return fullPath;
}

function createServer() {
  return http.createServer((req, res) => {
    const filePath = safePath(req.url || '/');
    if (!filePath) {
      send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function listen(port, attemptsLeft = 20) {
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error('[WeEdit] 启动失败:', err.message);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const url = `http://${host}:${port}/index.html`;
    console.log('');
    console.log('[WeEdit] 本地服务已启动');
    console.log(`[WeEdit] 访问地址: ${url}`);
    console.log('[WeEdit] 关闭此窗口即可停止服务');
    console.log('');
    openBrowser(url);
  });
}

listen(preferredPort);
