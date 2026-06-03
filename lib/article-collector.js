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

function payloadSnippet(payload, rawText) {
  const source = typeof payload === 'string' ? payload : JSON.stringify(payload || rawText || '');
  return String(source || '').replace(/\s+/g, ' ').trim().slice(0, 300);
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

async function requestTikHub(endpoint, apiKey, fetchImpl, mode = 'html') {
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
  const details = payloadSnippet(payload, text);

  if (!res.ok) throw new Error(`${apiMessage || `TikHub HTTP ${res.status}`}${details ? ` (${details})` : ''}`);
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    throw new Error(`${apiMessage || `TikHub code ${payload.code}`}${details ? ` (${details})` : ''}`);
  }

  const html = mode === 'json'
    ? (extractArticleHtmlFromJson(payload) || extractTikHubHtml(payload))
    : extractTikHubHtml(payload);
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
    { url: `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_html?url=${encoded}`, mode: 'html' },
    { url: `${base}/api/v1/wechat_mp/web/fetch_mp_article_detail_json?url=${encoded}`, mode: 'json' },
  ];

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHub(endpoint.url, apiKey, fetchImpl, endpoint.mode);
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
