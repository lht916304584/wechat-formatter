const DEFAULT_TIKHUB_BASE = 'https://api.tikhub.io';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-TikHub-Key, X-TikHub-Base',
      'Cache-Control': 'no-store',
    },
  });
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

function looksLikeWrongArticle(html) {
  const plain = String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return /defconvert_bg_div_to_table|wechat-draft-publisher|publisher\.py|fix-wechat-style|match\.group\(|\{content\}/i.test(plain);
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
  const contentKeys = ['content', 'content_html', 'article_content', 'rich_media_content', 'html', 'body', 'text'];
  const articleMetaRe = /appmsg|article|mp|wechat|biz|msg|content|rich_media/i;
  const badPathRe = /docs|schema|example|sample|parameter|response|requestCollection|codeSample|error|support|cache/i;

  function addCandidate(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    let rawContent = '';
    let contentKey = '';
    for (const key of contentKeys) {
      if (typeof obj[key] === 'string' && obj[key].trim().length > 80) {
        rawContent = obj[key].trim();
        contentKey = key;
        break;
      }
    }
    if (!rawContent) return;

    const content = normalizeArticleContent(rawContent);
    const plain = cleanText(content.replace(/<[^>]+>/g, ''));
    if (plain.length < 80) return;

    const title = cleanText(firstString(obj, titleKeys));
    const author = cleanText(firstString(obj, authorKeys));
    const publishTime = cleanText(firstString(obj, timeKeys));
    const digest = cleanText(firstString(obj, digestKeys)).slice(0, 180);
    let score = Math.min(plain.length, 8000) / 10;
    if (title) score += 600;
    if (author) score += 120;
    if (publishTime) score += 80;
    if (digest) score += 80;
    if (/<(p|section|h1|h2|img|blockquote)\b/i.test(rawContent)) score += 240;
    if (/id=["']js_content["']|rich_media_content/i.test(rawContent)) score += 1000;
    if (articleMetaRe.test(path) || articleMetaRe.test(contentKey)) score += 220;
    if ('cover' in obj || 'cover_url' in obj || 'cdn_url' in obj || 'content_url' in obj || 'source_url' in obj) score += 160;
    if (badPathRe.test(path)) score -= 1200;
    if (looksLikeWrongArticle(rawContent)) score -= 1400;

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
  if (!response.ok) throw new Error(`${message || `TikHub HTTP ${response.status}`}${details ? ` (${details})` : ''}`);
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    throw new Error(`${message || `TikHub code ${payload.code}`}${details ? ` (${details})` : ''}`);
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

async function readBody(request) {
  if (request.method !== 'POST') return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function collect(request, env) {
  const requestUrl = new URL(request.url);
  const body = await readBody(request);
  const rawUrl = body.url || requestUrl.searchParams.get('url') || '';
  const target = new URL(rawUrl);
  if (!/^https?:$/.test(target.protocol)) throw new Error('Only http/https article URLs are supported');

  const apiKey = env.TIKHUB_API_KEY || env.TIKHUB_TOKEN || body.apiKey || request.headers.get('X-TikHub-Key');
  if (!apiKey) throw new Error('Missing TIKHUB_API_KEY');

  const base = String(env.TIKHUB_BASE_URL || body.baseUrl || request.headers.get('X-TikHub-Base') || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
  const encoded = encodeURIComponent(target.href);
  const endpoints = [
    { url: `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_html?url=${encoded}`, mode: 'html' },
    { url: `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`, mode: 'json' },
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHub(endpoint.url, apiKey, endpoint.mode);
      return { ok: true, html, via: 'tikhub' };
    } catch (error) {
      errors.push(error && error.message ? error.message : String(error));
    }
  }
  throw new Error(errors.join('; ') || 'TikHub collection failed');
}

async function handleRequest(context) {
  const request = context.request;
  const env = context.env || {};
  if (request.method === 'OPTIONS') return json({}, 204);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    return json(await collect(request, env));
  } catch (error) {
    return json({
      ok: false,
      error: error && error.message ? error.message : 'Collection failed',
    }, 502);
  }
}

export async function onRequestOptions(context) {
  return handleRequest(context);
}

export async function onRequestGet(context) {
  return handleRequest(context);
}

export async function onRequestPost(context) {
  return handleRequest(context);
}
