const DEFAULT_TIKHUB_BASE = 'https://api.tikhub.io';
const TIKHUB_RETRY_BASE_MS = 550;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TikHub-Key, X-TikHub-Base');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function extractHtmlFromPayload(payload) {
  const root = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const queue = [{ item: root, path: '' }];
  const seen = new Set();
  const keys = ['html', 'content', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'body'];
  const candidates = [];

  function score(text, keyPath) {
    const clean = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const plain = clean.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    let value = 0;
    if (/id=["']js_content["']/i.test(text)) value += 1200;
    if (/class=["'][^"']*rich_media_content/i.test(text)) value += 1000;
    if (/rich_media_content|js_content|article_content|content_html/i.test(keyPath)) value += 700;
    if (/<article[\s>]/i.test(text)) value += 500;
    value += Math.min(plain.length, 5000) / 10;
    value += (text.match(/<(p|section|h1|h2|img|blockquote)\b/gi) || []).length * 12;
    if (/function\s*\(|def\s+\w+\(|match\.group|Traceback|import\s+\w+/i.test(plain)) value -= 350;
    return value;
  }

  function add(value, keyPath) {
    if (typeof value !== 'string') return;
    const html = value.trim();
    if (html.length <= 80 || !/<\/?[a-z][\s\S]*>/i.test(html)) return;
    candidates.push({ html, score: score(html, keyPath) });
  }

  while (queue.length) {
    const current = queue.shift();
    const item = current.item;
    const path = current.path;
    if (!item) continue;
    if (typeof item === 'string') {
      add(item, path);
      continue;
    }
    if (typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);

    for (const key of keys) add(item[key], path ? `${path}.${key}` : key);
    for (const [key, value] of Object.entries(item)) {
      if (value && (typeof value === 'object' || typeof value === 'string')) {
        queue.push({ item: value, path: path ? `${path}.${key}` : key });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ? candidates[0].html : '';
}

function extractTikHubHtml(payload) {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';
  const data = payload.data && typeof payload.data === 'object' && 'data' in payload.data ? payload.data.data : payload.data;
  if (typeof data === 'string') return data.trim();
  if (data && typeof data === 'object') {
    const directKeys = ['html', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'content'];
    for (const key of directKeys) {
      if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
    }
    return extractHtmlFromPayload(data);
  }
  return '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function firstString(obj, keys) {
  for (const key of keys) {
    if (typeof obj[key] === 'string' && obj[key].trim()) return obj[key].trim();
    if (typeof obj[key] === 'number') return String(obj[key]);
  }
  return '';
}

function normalizeArticleContent(content) {
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return firstString(item, ['html', 'content', 'text', 'paragraph', 'value', 'summary', 'title']);
        }
        return '';
      })
      .map(part => normalizeArticleContent(part))
      .filter(Boolean)
      .join('');
  }
  if (content && typeof content === 'object') {
    return Object.keys(content)
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map(key => normalizeArticleContent(content[key]))
      .filter(Boolean)
      .join('');
  }
  const text = String(content || '').trim();
  if (!text) return '';
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map(part => cleanText(part))
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part)}</p>`)
    .join('');
}

function buildArticleHtml(candidate) {
  const parts = [];
  if (candidate.title) {
    parts.push(`<h1 style="font-size:24px;line-height:1.4;margin:0 0 18px;font-weight:700;">${escapeHtml(candidate.title)}</h1>`);
  }
  const meta = [candidate.author, candidate.publishTime].filter(Boolean).join(' · ');
  if (meta) {
    parts.push(`<p style="color:#8a8f98;font-size:14px;margin:0 0 22px;">${escapeHtml(meta)}</p>`);
  }
  if (candidate.digest) {
    parts.push(`<blockquote style="border-left:4px solid #5b5ff7;margin:0 0 22px;padding:8px 14px;background:#f6f7fb;color:#30344a;">${escapeHtml(candidate.digest)}</blockquote>`);
  }
  parts.push(candidate.content);
  return parts.join('');
}

function extractArticleHtmlFromJson(payload) {
  let data = payload && typeof payload === 'object' ? payload.data : null;
  if (data && typeof data === 'object' && data.data && typeof data.data === 'object') data = data.data;
  if (!data || typeof data !== 'object') return '';

  const contentData = data.content && typeof data.content === 'object' ? data.content : {};
  const article = contentData.article && typeof contentData.article === 'object' ? contentData.article : {};
  const content = normalizeArticleContent(contentData.raw_content)
    || normalizeArticleContent(article.full_text)
    || normalizeArticleContent(article.sections);
  if (!cleanText(content.replace(/<[^>]+>/g, ''))) return '';

  return buildArticleHtml({
    title: cleanText(data.title || article.title),
    author: cleanText(data.author),
    publishTime: cleanText(data.datetime),
    digest: cleanText(article.summary).slice(0, 180),
    content,
  });
}

function payloadSnippet(payload, rawText) {
  const source = typeof payload === 'string' ? payload : JSON.stringify(payload || rawText || '');
  return String(source || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function payloadShape(payload) {
  const root = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const queue = [{ item: root, path: 'data' }];
  const seen = new Set();
  const parts = [];
  while (queue.length && parts.length < 6) {
    const { item, path } = queue.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    const keys = Object.keys(item).slice(0, 10);
    parts.push(`${path}:{${keys.join(',')}}`);
    for (const [key, value] of Object.entries(item)) {
      if (value && typeof value === 'object') queue.push({ item: value, path: `${path}.${key}` });
    }
  }
  return parts.join(' | ').slice(0, 220);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestTikHub(endpoint, apiKey) {
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  let payload = text;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  const message = payload && typeof payload === 'object'
    ? (payload.message_zh || payload.message || payload.error)
    : '';
  const details = payloadSnippet(payload, text);
  if (!response.ok) {
    const error = new Error(`${message || `TikHub HTTP ${response.status}`}${details ? ` (${details})` : ''}`);
    error.retryable = response.status === 400 && /request failed|please retry|请求失败|重试/i.test(`${message} ${details}`);
    throw error;
  }
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    const error = new Error(`${message || `TikHub code ${payload.code}`}${details ? ` (${details})` : ''}`);
    error.retryable = Number(payload.code) === 400 && /request failed|please retry|请求失败|重试/i.test(`${message} ${details}`);
    throw error;
  }
  const html = extractArticleHtmlFromJson(payload);
  if (!html) {
    const shape = payloadShape(payload);
    throw new Error(`TikHub JSON response did not contain target article content${shape ? `; shape=${shape}` : ''}`);
  }
  return html;
}

async function requestTikHubWithRetry(endpoint, apiKey, attempts) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestTikHub(endpoint, apiKey);
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt >= attempts) break;
      await wait(TIKHUB_RETRY_BASE_MS * attempt);
    }
  }
  if (lastError && lastError.retryable && attempts > 1) {
    lastError.message = `${lastError.message}; retried ${attempts} times`;
  }
  throw lastError || new Error('TikHub request failed');
}

async function collectArticle({ url, apiKey, baseUrl }) {
  const target = new URL(String(url || '').trim());
  if (!/^https?:$/.test(target.protocol)) throw new Error('Only http/https article URLs are supported');
  if (!apiKey) throw new Error('Missing TIKHUB_API_KEY');

  const base = String(baseUrl || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
  const encoded = encodeURIComponent(target.href);
  const endpoint = `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`;
  const html = await requestTikHubWithRetry(endpoint, apiKey, 4);
  return { ok: true, html, via: 'tikhub' };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = getBody(req);
    const result = await collectArticle({
      url: body.url || req.query.url,
      apiKey: process.env.TIKHUB_API_KEY || process.env.TIKHUB_TOKEN || body.apiKey || req.headers['x-tikhub-key'],
      baseUrl: process.env.TIKHUB_BASE_URL || body.baseUrl || req.headers['x-tikhub-base'] || DEFAULT_TIKHUB_BASE,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: error && error.message ? error.message : 'Collection failed',
    });
  }
};
