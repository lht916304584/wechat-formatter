/**
 * Standalone mock server for manual Channels video flow testing.
 * Serves the app and mocks /api/collect-article with a fixture article
 * containing one videosnap and a synthetic decryptable video.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 4174;
const videoBytesUrl = `http://127.0.0.1:${port}/api/test-video-bytes`;

const fixtureHtml = fs.readFileSync(path.join(root, 'tests/fixtures/test-article-with-videosnap.html'), 'utf8');
const encryptedBytes = fs.readFileSync(path.join(root, 'tests/fixtures/test-encrypted.bin'));

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
}

function serveStatic(req, res) {
  const decoded = decodeURIComponent(req.url.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const requested = normalized === '/' || normalized === '\\' ? '/index.html' : normalized;
  const fullPath = path.join(root, requested);
  if (!fullPath.startsWith(root)) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
    return;
  }
  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
      return;
    }
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.wasm': 'application/wasm',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    const ext = path.extname(fullPath).toLowerCase();
    send(res, 200, fs.readFileSync(fullPath), { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/collect-article')) {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let body = {};
      if (chunks.length) {
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
      }
      if (!body.wantVideos) {
        sendJson(res, 400, { ok: false, error: 'wantVideos must be true' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        html: fixtureHtml,
        via: 'tikhub-json',
        videos: [
          {
            id: 'test-video-1',
            desc: '测试视频标题',
            fullUrl: videoBytesUrl,
            decodeKey: '1234567890',
            poster: 'https://example.com/poster.jpg',
            username: 'testuser',
          },
        ],
        unmatched: [],
        videoEnumerateErrors: [],
      });
    });
    return;
  }

  if (req.url.startsWith('/api/test-video-bytes')) {
    send(res, 200, encryptedBytes, {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    return;
  }

  if (req.url.startsWith('/api/channels-video-bytes')) {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const targetUrl = requestUrl.searchParams.get('url') || '';
    (async () => {
      try {
        const upstream = await fetch(targetUrl);
        const buf = Buffer.from(await upstream.arrayBuffer());
        send(res, 200, buf, {
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
      } catch (err) {
        sendJson(res, 502, { ok: false, error: err.message });
      }
    })();
    return;
  }

  serveStatic(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock collect server listening on http://127.0.0.1:${port}`);
  console.log(`Open the app and collect https://mp.weixin.qq.com/s/test-video-article with video checkbox enabled.`);
});
