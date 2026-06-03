const DEFAULT_TIKHUB_BASE = 'https://api.tikhub.io';

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
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';
  const data = payload.data && typeof payload.data === 'object' && 'data' in payload.data ? payload.data.data : payload.data;
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object') return '';
  const keys = ['html', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'content'];
  for (const key of keys) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }
  return '';
}

function looksLikeWrongArticle(html) {
  const plain = String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return /defconvert_bg_div_to_table|wechat-draft-publisher|publisher\.py|fix-wechat-style|match\.group\(|\{content\}/i.test(plain);
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
  const html = extractHtmlFromPayload(payload);
  if (!html) throw new Error('TikHub response did not contain article HTML');
  if (looksLikeWrongArticle(html)) throw new Error('TikHub returned content that does not look like the target WeChat article');
  return html;
}

async function collectArticle({ url, apiKey, baseUrl }) {
  const target = new URL(String(url || '').trim());
  if (!/^https?:$/.test(target.protocol)) throw new Error('Only http/https article URLs are supported');
  if (!apiKey) throw new Error('Missing TIKHUB_API_KEY');

  const base = String(baseUrl || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
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
      apiKey: body.apiKey || req.headers['x-tikhub-key'] || process.env.TIKHUB_API_KEY || process.env.TIKHUB_TOKEN,
      baseUrl: body.baseUrl || req.headers['x-tikhub-base'] || process.env.TIKHUB_BASE_URL || DEFAULT_TIKHUB_BASE,
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: error && error.message ? error.message : 'Collection failed',
    });
  }
};
