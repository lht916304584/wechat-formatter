/**
 * End-to-end test for WeChat Channels video collection flow.
 *
 * Starts a local server with a mock /api/collect-article endpoint returning a
 * fixture article with one <video data-videosnap-id> placeholder and a
 * synthetic videos[] entry. The synthetic bytes are XOR-encrypted with a known
 * numeric decode_key; the frontend WASM decryptor should recover the original
 * plaintext and create a blob URL.
 */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 4174;
const videoBytesUrl = `http://127.0.0.1:${port}/api/test-video-bytes`;

const fixtureHtml = fs.readFileSync(path.join(root, 'tests/fixtures/test-article-with-videosnap.html'), 'utf8');
const encryptedBytes = fs.readFileSync(path.join(root, 'tests/fixtures/test-encrypted.bin'));

const decodeKey = '1234567890';
const expectedPlaintext = 'ZgEdit video test plaintext content.';

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
            decodeKey,
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

  serveStatic(req, res);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  console.log(`Test server listening on http://127.0.0.1:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  const appUrl = `http://127.0.0.1:${port}/index.html`;
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.editor && typeof window.editor.setValue === 'function', null, { timeout: 60000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  let requestBody = null;
  page.on('requestfinished', async req => {
    if (req.url().includes('/api/collect-article') && req.method() === 'POST') {
      try { requestBody = await req.postDataJSON(); } catch {}
    }
  });

  // Open collect modal and start collection via JS to avoid toolbar dropdown timing issues
  await page.evaluate(() => {
    const modal = document.getElementById('collectArticleModal');
    if (modal) modal.style.display = 'flex';
    const cb = document.getElementById('collectIncludeVideos');
    if (cb) cb.checked = true;
    const urlInput = document.getElementById('collectArticleUrl');
    if (urlInput) {
      urlInput.value = 'https://mp.weixin.qq.com/s/test-video-article';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const btn = document.getElementById('btnFetchArticle');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);

  // Verify request included wantVideos
  assert(requestBody && requestBody.wantVideos === true, 'collect request must send wantVideos=true');

  // Debug state before waiting for blob
  const debugState = await page.evaluate(() => ({
    status: document.getElementById('collectArticleStatus')?.textContent,
    markdownValue: document.getElementById('collectArticleMarkdown')?.value?.slice(0, 500) || '',
  }));
  console.log('debug state:', debugState);

  // Verify markdown preview contains the video placeholder with blob URL
  await page.waitForFunction(() => {
    const textarea = document.getElementById('collectArticleMarkdown');
    return textarea && textarea.value && /src="blob:[^"]+"/.test(textarea.value);
  }, null, { timeout: 30000 });

  // Verify decrypted blob content matches expected plaintext
  const decryptedText = await page.evaluate(async () => {
    const textarea = document.getElementById('collectArticleMarkdown');
    const srcMatch = textarea.value.match(/src="(blob:[^"]+)"/);
    const res = await fetch(srcMatch[1]);
    const buf = await res.arrayBuffer();
    return new TextDecoder().decode(buf);
  });
  assert(decryptedText === expectedPlaintext, `decrypted content mismatch: ${decryptedText}`);

  // Verify download button exists in markdown preview
  const hasPreviewDownload = await page.evaluate(() => /class="btn-video-download"/.test(document.getElementById('collectArticleMarkdown')?.value || ''));
  assert(hasPreviewDownload, 'download button should render in collect preview');

  // Import into editor
  page.on('dialog', dialog => dialog.accept());
  await page.click('#btnApplyCollectedArticle');
  await page.waitForSelector('#collectArticleModal', { state: 'hidden', timeout: 5000 });

  // Verify main preview contains the injected video with blob URL
  await page.waitForFunction(() => {
    const video = document.querySelector('.preview-content video[data-videosnap-id]');
    return video && video.src && video.src.startsWith('blob:');
  }, null, { timeout: 30000 });

  const mainVideoState = await page.evaluate(() => {
    const video = document.querySelector('.preview-content video[data-videosnap-id]');
    return {
      hasVideo: !!video,
      src: video?.src || '',
      poster: video?.getAttribute('poster') || '',
    };
  });
  assert(mainVideoState.hasVideo, 'main preview should contain the injected video');
  assert(mainVideoState.src.startsWith('blob:'), 'main video src should be a blob URL');
  assert(mainVideoState.poster === 'https://example.com/poster.jpg', 'video poster should be preserved');

  // Verify download button is visible in main preview
  const hasMainDownload = await page.evaluate(() => !!document.querySelector('.preview-content .btn-video-download'));
  assert(hasMainDownload, 'download button should render in main preview');

  // Verify localStorage stored video metadata for TTL restore
  const stored = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('wechat-formatter:videosnaps:'));
    if (!keys.length) return null;
    return JSON.parse(localStorage.getItem(keys[0]));
  });
  assert(stored && stored['test-video-1'], 'video metadata should be stored in localStorage');
  assert(stored['test-video-1'].decodeKey === decodeKey, 'stored decodeKey should match');
  assert(stored['test-video-1'].fullUrl === videoBytesUrl, 'stored fullUrl should match');

  // Verify expired TTL replace video with placeholder
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('wechat-formatter:videosnaps:'));
    if (!key) return;
    const data = JSON.parse(localStorage.getItem(key));
    if (data['test-video-1']) {
      data['test-video-1'].fetchedAt = Date.now() - 51 * 60 * 1000;
      localStorage.setItem(key, JSON.stringify(data));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.editor && typeof window.editor.setValue === 'function', null, { timeout: 60000 });
  const expiredText = await page.evaluate(() => document.querySelector('.preview-content')?.textContent || '');
  assert(expiredText.includes('[视频已过期]'), 'expired video should show placeholder');

  await browser.close();
  server.close();
  console.log('Channels video e2e test passed');
})().catch(async err => {
  console.error(err);
  try { server.close(); } catch {}
  process.exit(1);
});
