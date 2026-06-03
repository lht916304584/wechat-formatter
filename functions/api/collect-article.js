const DEFAULT_TIKHUB_BASE = 'https://user.tikhub.io';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-TikHub-Key, X-TikHub-Base',
    },
  });
}

function extractHtmlFromPayload(payload) {
  const root = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const queue = [{ item: root, path: '' }];
  const seen = new Set();
  const htmlKeys = ['html', 'content', 'content_html', 'article_html', 'article_content', 'rich_media_content', 'body'];
  const candidates = [];

  function scoreCandidate(text, keyPath) {
    const withoutCode = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const plain = withoutCode.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    let score = 0;
    if (/id=["']js_content["']/i.test(text)) score += 1200;
    if (/class=["'][^"']*rich_media_content/i.test(text)) score += 1000;
    if (/rich_media_content|js_content|article_content|content_html/i.test(keyPath)) score += 700;
    if (/<article[\s>]/i.test(text)) score += 500;
    score += Math.min(plain.length, 5000) / 10;
    score += (text.match(/<(p|section|h1|h2|img|blockquote)\b/gi) || []).length * 12;
    if (/function\s*\(|def\s+\w+\(|match\.group|Traceback|import\s+\w+/i.test(plain)) score -= 350;
    return score;
  }

  function addCandidate(value, keyPath) {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (text.length <= 80 || !/<\/?[a-z][\s\S]*>/i.test(text)) return;
    candidates.push({ html: text, score: scoreCandidate(text, keyPath) });
  }

  while (queue.length) {
    const { item, path } = queue.shift();
    if (!item) continue;
    if (typeof item === 'string') {
      addCandidate(item, path);
      continue;
    }
    if (typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    for (const key of htmlKeys) {
      addCandidate(item[key], path ? `${path}.${key}` : key);
    }
    Object.entries(item).forEach(([key, value]) => {
      if (value && (typeof value === 'object' || typeof value === 'string')) {
        queue.push({ item: value, path: path ? `${path}.${key}` : key });
      }
    });
  }
  return candidates.sort((a, b) => b.score - a.score)[0]?.html || '';
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

    const apiKey = request.headers.get('X-TikHub-Key') || env.TIKHUB_API_KEY || env.TIKHUB_TOKEN;
    if (!apiKey) throw new Error('服务端未配置 TIKHUB_API_KEY');

    const base = String(request.headers.get('X-TikHub-Base') || env.TIKHUB_BASE_URL || DEFAULT_TIKHUB_BASE).replace(/\/+$/, '');
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
