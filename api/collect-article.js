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
    if (/function\s*\(|def\s+\w+\(|match\.group|Traceback|import\s+\w+/i.test(plain)) value -= 1200;
    if (/wechat-draft-publisher|fix-wechat-style\.py|publisher\.py|defconvert_bg_div_to_table|SKILL\.md/i.test(plain)) value -= 4000;
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
  return candidates[0] && candidates[0].score > 0 ? candidates[0].html : '';
}

function extractTikHubHtml(payload) {
  if (typeof payload === 'string') return extractHtmlFromPayload({ html: payload }) || '';
  if (!payload || typeof payload !== 'object') return '';
  const data = payload.data && typeof payload.data === 'object' && 'data' in payload.data ? payload.data.data : payload.data;
  if (typeof data === 'string') return extractHtmlFromPayload({ html: data }) || '';
  if (data && typeof data === 'object') {
    const scored = extractHtmlFromPayload(data);
    if (scored) return scored;
    const directKeys = ['html', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'content'];
    for (const key of directKeys) {
      if (typeof data[key] === 'string' && data[key].trim()) {
        const direct = extractHtmlFromPayload({ [key]: data[key] });
        if (direct) return direct;
      }
    }
    return extractHtmlFromPayload(data) || extractArticleHtmlFromJson({ data });
  }
  return '';
}

function extractV2ArticleHtml(payload) {
  if (!payload || typeof payload !== 'object') return '';
  let data = payload.data;
  if (!data || typeof data !== 'object') return '';
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) data = data.data;

  const content = data.content && typeof data.content === 'object' ? data.content : {};

  let html = '';
  const htmlKeys = ['content_html', 'raw_content', 'html', 'rich_media_content', 'article_html', 'raw_html'];
  for (const key of htmlKeys) {
    const candidate = typeof content[key] === 'string' ? content[key] : (typeof data[key] === 'string' ? data[key] : '');
    if (candidate.length > 80 && /<\/?[a-z][\s\S]*>/i.test(candidate)) {
      html = candidate.trim();
      break;
    }
  }
  if (!html) {
    const scored = extractHtmlFromPayload({ data: content }) || extractHtmlFromPayload({ data });
    if (scored) html = scored;
  }

  if (!html) {
    const rawText = cleanText(content.content_text || data.content_text || '');
    if (rawText) {
      html = rawText
        .split(/\n{2,}|\r\n\r\n/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
        .join('');
    }
  }

  if (!html || !cleanText(html.replace(/<[^>]+>/g, ''))) return '';
  if (looksLikeKnownWrongCollection(html)) return '';

  return buildArticleHtml({
    title: cleanText(data.title || content.title),
    author: cleanText(data.nick_name || data.author),
    publishTime: cleanText(data.create_time || data.datetime),
    digest: cleanText(data.desc || data.description || content.summary).slice(0, 180),
    content: html,
  });
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

function looksLikeKnownWrongCollection(value) {
  const plain = String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return /wechat-draft-publisher|fix-wechat-style\.py|publisher\.py|defconvert_bg_div_to_table|SKILL\.md/i.test(plain);
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
      .map(item => normalizeArticleContent(item))
      .filter(Boolean)
      .join('');
  }
  if (content && typeof content === 'object') {
    const numbered = Object.keys(content)
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))
      .map(key => normalizeArticleContent(content[key]))
      .filter(Boolean)
      .join('');
    if (numbered) return numbered;
    for (const key of ['raw_content', 'html', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'content', 'text', 'full_text', 'sections']) {
      const part = normalizeArticleContent(content[key]);
      if (part) return part;
    }
    const skipKeys = new Set(['author', 'biz', 'cover_image', 'datetime', 'description', 'ip_location', 'ip_location_country', 'metadata', 'original', 'publish_info', 'source', 'user_id']);
    return Object.entries(content)
      .filter(([key]) => !skipKeys.has(key))
      .map(([, value]) => normalizeArticleContent(value))
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

function collectContentLeaves(value, depth = 0) {
  if (value == null || depth > 8) return [];
  if (typeof value === 'string' || typeof value === 'number') {
    const text = cleanText(value);
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => collectContentLeaves(item, depth + 1));
  }
  if (typeof value === 'object') {
    const skipKeys = new Set(['author', 'biz', 'cover_image', 'datetime', 'description', 'ip_location', 'ip_location_country', 'metadata', 'original', 'publish_info', 'source', 'user_id']);
    return Object.entries(value)
      .filter(([key]) => !skipKeys.has(key))
      .flatMap(([, item]) => collectContentLeaves(item, depth + 1));
  }
  return [];
}

function buildParagraphHtmlFromLeaves(value) {
  return collectContentLeaves(value)
    .map(text => text.trim())
    .filter(text => text.length >= 2)
    .filter((text, index, arr) => arr.indexOf(text) === index)
    .join('\n\n')
    .split(/\n{2,}/)
    .map(part => cleanText(part))
    .filter(Boolean)
    .map(part => /<\/?[a-z][\s\S]*>/i.test(part) ? part : `<p>${escapeHtml(part)}</p>`)
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
  const content = normalizeArticleContent(data.content)
    || normalizeArticleContent(contentData.raw_content)
    || normalizeArticleContent(article.full_text)
    || normalizeArticleContent(article.sections)
    || buildParagraphHtmlFromLeaves(contentData.raw_content)
    || buildParagraphHtmlFromLeaves(article.full_text)
    || buildParagraphHtmlFromLeaves(article.sections)
    || buildParagraphHtmlFromLeaves(data.content);
  if (!cleanText(content.replace(/<[^>]+>/g, ''))) return '';
  if (looksLikeKnownWrongCollection(content)) return '';

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

function isRetryableTikHubError(status, message, details) {
  return [400, 408, 429, 500, 502, 503, 504].includes(Number(status))
    || /request failed|please retry|timeout|timed out|gateway time-out|gateway timeout|请求失败|重试|超时/i.test(`${message || ''} ${details || ''}`);
}

function collectTikHubBases(primaryBase) {
  const primary = String(primaryBase || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
  const fallback = /\/\/api\.tikhub\.io$/i.test(primary)
    ? 'https://api.tikhub.dev'
    : (/\/\/api\.tikhub\.dev$/i.test(primary) ? DEFAULT_TIKHUB_BASE : '');
  return [primary, fallback].filter(Boolean).filter((base, index, arr) => arr.indexOf(base) === index);
}

async function requestTikHub(endpoint, apiKey, mode = 'html', articleUrl = '') {
  const options = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  };
  if (mode === 'v2') {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ url: articleUrl, raw: true });
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      options.signal = AbortSignal.timeout(30000);
    }
  }
  const response = await fetch(endpoint, options);
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
    error.retryable = isRetryableTikHubError(response.status, message, details);
    throw error;
  }
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    const error = new Error(`${message || `TikHub code ${payload.code}`}${details ? ` (${details})` : ''}`);
    error.retryable = isRetryableTikHubError(payload.code, message, details);
    throw error;
  }
  const html = mode === 'v2'
    ? extractV2ArticleHtml(payload)
    : (mode === 'json' ? extractArticleHtmlFromJson(payload) : extractTikHubHtml(payload));
  if (!html) {
    const shape = payloadShape(payload);
    const label = mode === 'v2' ? 'TikHub V2 response did not contain target article content'
      : (mode === 'json' ? 'TikHub JSON response did not contain target article content' : 'TikHub HTML response did not contain target article content');
    throw new Error(`${label}${shape ? `; shape=${shape}` : ''}`);
  }
  return html;
}

async function requestTikHubWithRetry(endpoint, apiKey, attempts, mode = 'html', articleUrl = '') {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestTikHub(endpoint, apiKey, mode, articleUrl);
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

  const encoded = encodeURIComponent(target.href);
  const bases = collectTikHubBases(baseUrl);
  const endpoints = [];
  bases.forEach((base, index) => {
    endpoints.push({
      url: `${base}/api/v1/wechat_mp/v2/fetch_article_detail`,
      via: index === 0 ? 'tikhub-v2' : 'tikhub-v2-alt',
      mode: 'v2',
      attempts: 1,
    });
  });
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHubWithRetry(endpoint.url, apiKey, endpoint.attempts, endpoint.mode, target.href);
      return { ok: true, html, via: endpoint.via };
    } catch (error) {
      errors.push(`${endpoint.via}: ${error.message}`);
    }
  }
  throw new Error(errors.join('；') || 'TikHub request failed');
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
