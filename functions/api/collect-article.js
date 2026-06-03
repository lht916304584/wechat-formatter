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
  if (!response.ok) throw new Error(message || `TikHub HTTP ${response.status}`);
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    throw new Error(message || `TikHub code ${payload.code}`);
  }

  const html = extractTikHubHtml(payload);
  if (!html) throw new Error('TikHub response did not contain article HTML');
  if (looksLikeWrongArticle(html)) throw new Error('TikHub returned content that does not look like the target WeChat article');
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

  const apiKey = body.apiKey || request.headers.get('X-TikHub-Key') || env.TIKHUB_API_KEY || env.TIKHUB_TOKEN;
  if (!apiKey) throw new Error('Missing TIKHUB_API_KEY');

  const base = String(body.baseUrl || request.headers.get('X-TikHub-Base') || env.TIKHUB_BASE_URL || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
  const encoded = encodeURIComponent(target.href);
  const endpoints = [
    `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_html?url=${encoded}`,
    `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`,
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHub(endpoint, apiKey);
      return { ok: true, html, via: 'tikhub' };
    } catch (error) {
      errors.push(error && error.message ? error.message : String(error));
    }
  }
  throw new Error(errors.join('; ') || 'TikHub collection failed');
}

export async function onRequest(context) {
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
