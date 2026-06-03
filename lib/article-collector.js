const DEFAULT_TIKHUB_BASE = 'https://user.tikhub.io';

function normalizeBase(value) {
  return String(value || DEFAULT_TIKHUB_BASE).trim().replace(/\/+$/, '');
}

function assertArticleUrl(value) {
  const url = new URL(String(value || '').trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error('只支持 http/https 文章链接');
  return url.href;
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

async function requestTikHub(endpoint, apiKey, fetchImpl) {
  const res = await fetchImpl(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
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

async function collectArticle({ url, apiKey, baseUrl, fetchImpl = fetch }) {
  const articleUrl = assertArticleUrl(url);
  if (!apiKey) throw new Error('服务端未配置 TIKHUB_API_KEY');

  const base = normalizeBase(baseUrl);
  const encoded = encodeURIComponent(articleUrl);
  const endpoints = [
    `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_html?url=${encoded}`,
    `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`,
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHub(endpoint, apiKey, fetchImpl);
      return { ok: true, html, via: 'tikhub' };
    } catch (err) {
      errors.push(err.message);
    }
  }

  throw new Error(errors.join('，') || 'TikHub 采集失败');
}

module.exports = {
  DEFAULT_TIKHUB_BASE,
  collectArticle,
};
