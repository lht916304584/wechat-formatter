const DEFAULT_TIKHUB_BASE = 'https://api.tikhub.io';

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

  const html = extractTikHubHtml(payload);
  if (!html) throw new Error('TikHub 未返回可解析的文章 HTML');
  if (looksLikeWrongArticle(html)) throw new Error('TikHub 返回内容疑似不是目标公众号正文');
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
