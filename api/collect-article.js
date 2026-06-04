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
          return firstString(item, ['content', 'text', 'raw_content', 'full_text', 'summary', 'title']);
        }
        return '';
      })
      .map(part => normalizeArticleContent(part))
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
  const root = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const queue = [{ item: root, path: '' }];
  const seen = new Set();
  const candidates = [];
  const titleKeys = ['title', 'msg_title', 'article_title', 'name'];
  const authorKeys = ['author', 'author_name', 'nickname', 'nick_name', 'account_name', 'source_name', 'user_name'];
  const timeKeys = ['publish_time', 'publishTime', 'create_time', 'createTime', 'update_time', 'date'];
  const digestKeys = ['digest', 'summary', 'desc', 'description'];
  const contentKeys = ['raw_content', 'full_text', 'content', 'content_html', 'article_content', 'rich_media_content', 'html', 'body', 'text', 'sections'];
  const articleMetaRe = /appmsg|article|mp|wechat|biz|msg|content|rich_media/i;
  const badPathRe = /docs|schema|example|sample|parameter|response|requestCollection|codeSample|error|support|cache/i;
  const fallbackTitle = cleanText(firstString(root || {}, titleKeys));
  const fallbackAuthor = cleanText(firstString(root || {}, authorKeys));
  const fallbackTime = cleanText(firstString(root || {}, timeKeys));
  const fallbackDigest = cleanText(firstString(root || {}, digestKeys)).slice(0, 180);

  function addCandidate(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    let rawContent = null;
    let contentKey = '';
    for (const key of contentKeys) {
      const value = obj[key];
      if ((typeof value === 'string' && value.trim().length > 80) || (Array.isArray(value) && value.length)) {
        rawContent = value;
        contentKey = key;
        break;
      }
    }
    if (!rawContent) return;

    const content = normalizeArticleContent(rawContent);
    const plain = cleanText(content.replace(/<[^>]+>/g, ''));
    if (plain.length < 80) return;

    const title = cleanText(firstString(obj, titleKeys)) || fallbackTitle;
    const author = cleanText(firstString(obj, authorKeys)) || fallbackAuthor;
    const publishTime = cleanText(firstString(obj, timeKeys)) || fallbackTime;
    const digest = cleanText(firstString(obj, digestKeys)).slice(0, 180) || fallbackDigest;
    let score = Math.min(plain.length, 8000) / 10;
    if (title) score += 600;
    if (author) score += 120;
    if (publishTime) score += 80;
    if (digest) score += 80;
    if (/<(p|section|h1|h2|img|blockquote)\b/i.test(String(rawContent))) score += 240;
    if (/id=["']js_content["']|rich_media_content/i.test(String(rawContent))) score += 1000;
    if (contentKey === 'raw_content') score += 700;
    if (contentKey === 'full_text') score += 420;
    if (contentKey === 'sections') score += 320;
    if (articleMetaRe.test(path) || articleMetaRe.test(contentKey)) score += 220;
    if ('cover' in obj || 'cover_url' in obj || 'cdn_url' in obj || 'content_url' in obj || 'source_url' in obj || fallbackTitle) score += 160;
    if (badPathRe.test(path)) score -= 1200;
    if (looksLikeWrongArticle(String(rawContent))) score -= 1400;

    candidates.push({
      html: buildArticleHtml({ title, author, publishTime, digest, content }),
      score,
    });
  }

  while (queue.length) {
    const { item, path } = queue.shift();
    if (!item) continue;
    if (typeof item === 'string') continue;
    if (typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    addCandidate(item, path);
    for (const [key, value] of Object.entries(item)) {
      if (value && typeof value === 'object') {
        queue.push({ item: value, path: path ? `${path}.${key}` : key });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score > 0 ? candidates[0].html : '';
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

function looksLikeWrongArticle(html) {
  const plain = String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return /defconvert_bg_div_to_table|wechat-draft-publisher|publisher\.py|fix-wechat-style|match\.group\(|\{content\}/i.test(plain);
}

async function requestTikHub(endpoint, apiKey, mode = 'html') {
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
  const html = mode === 'json' ? extractArticleHtmlFromJson(payload) : extractTikHubHtml(payload);
  if (!html) {
    const shape = mode === 'json' ? payloadShape(payload) : '';
    throw new Error(`${mode === 'json' ? 'TikHub JSON response did not contain target article content' : 'TikHub response did not contain article HTML'}${shape ? `; shape=${shape}` : ''}`);
  }
  if (looksLikeWrongArticle(html)) {
    const shape = mode === 'json' ? payloadShape(payload) : '';
    throw new Error(`${mode === 'json' ? 'TikHub JSON response matched non-article content' : 'TikHub returned content that does not look like the target WeChat article'}${shape ? `; shape=${shape}` : ''}`);
  }
  return html;
}

async function requestTikHubWithRetry(endpoint, apiKey, mode, attempts) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestTikHub(endpoint, apiKey, mode);
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
  const endpoints = [
    { url: `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_html?url=${encoded}`, mode: 'html', attempts: 3 },
    { url: `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`, mode: 'json', attempts: 4 },
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHubWithRetry(endpoint.url, apiKey, endpoint.mode, endpoint.attempts);
      return { ok: true, html, via: 'tikhub' };
    } catch (error) {
      errors.push(error && error.message ? error.message : String(error));
    }
  }
  throw new Error(errors.join('; ') || 'TikHub collection failed');
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
