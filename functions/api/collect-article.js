const DEFAULT_TIKHUB_BASE = 'https://api.tikhub.dev';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function extractHtmlFromPayload(payload) {
  const root = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const queue = [root];
  const seen = new Set();
  const htmlKeys = ['html', 'content', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'body'];

  while (queue.length) {
    const item = queue.shift();
    if (!item) continue;
    if (typeof item === 'string') {
      const text = item.trim();
      if (text.length > 80 && /<\/?[a-z][\s\S]*>/i.test(text)) return text;
      continue;
    }
    if (typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    for (const key of htmlKeys) {
      const value = item[key];
      if (typeof value === 'string') {
        const text = value.trim();
        if (text.length > 80 && /<\/?[a-z][\s\S]*>/i.test(text)) return text;
      }
    }
    Object.values(item).forEach(value => {
      if (value && (typeof value === 'object' || typeof value === 'string')) queue.push(value);
    });
  }
  return '';
}

async function requestTikHub(endpoint, apiKey) {
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = text; }
  const apiMessage = payload && typeof payload === 'object'
    ? (payload.message_zh || payload.message || payload.error)
    : '';

  if (!res.ok) throw new Error(apiMessage || `TikHub HTTP ${res.status}`);
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    throw new Error(apiMessage || `TikHub code ${payload.code}`);
  }

  const html = extractHtmlFromPayload(payload);
  if (!html) throw new Error('TikHub 未返回可解析的文章 HTML');
  return html;
}

export async function onRequestOptions() {
  return json({}, 204);
}

export async function onRequestGet({ request, env }) {
  try {
    const requestUrl = new URL(request.url);
    const target = new URL(requestUrl.searchParams.get('url') || '');
    if (!/^https?:$/.test(target.protocol)) throw new Error('只支持 http/https 文章链接');

    const apiKey = env.TIKHUB_API_KEY || env.TIKHUB_TOKEN;
    if (!apiKey) throw new Error('服务端未配置 TIKHUB_API_KEY');

    const base = String(env.TIKHUB_BASE_URL || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
    const encoded = encodeURIComponent(target.href);
    const endpoints = [
      `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_html?url=${encoded}`,
      `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`,
    ];

    const errors = [];
    for (const endpoint of endpoints) {
      try {
        const html = await requestTikHub(endpoint, apiKey);
        return json({ ok: true, html, via: 'tikhub' });
      } catch (err) {
        errors.push(err.message);
      }
    }

    throw new Error(errors.join('，') || 'TikHub 采集失败');
  } catch (err) {
    return json({ ok: false, error: err.message || '采集失败' }, 502);
  }
}
