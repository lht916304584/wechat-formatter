const DEFAULT_TIKHUB_BASE = 'https://api.tikhub.io';
const TIKHUB_RETRY_BASE_MS = 550;

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
    if (/function\s*\(|def\s+\w+\(|match\.group|Traceback|import\s+\w+/i.test(plain)) score -= 1200;
    if (/wechat-draft-publisher|fix-wechat-style\.py|publisher\.py|defconvert_bg_div_to_table|SKILL\.md/i.test(plain)) score -= 4000;
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

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best && best.score > 0 ? best.html : '';
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
  while (queue.length && parts.length < 25) {
    const { item, path } = queue.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    const keys = Object.keys(item);
    parts.push(`${path}:{${keys.join(',')}}`);
    for (const [key, value] of Object.entries(item)) {
      if (value && typeof value === 'object') queue.push({ item: value, path: `${path}.${key}` });
    }
  }
  return parts.join(' | ').slice(0, 2000);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableTikHubError(status, message, details) {
  return [400, 408, 429, 500, 502, 503, 504].includes(Number(status))
    || /request failed|please retry|timeout|timed out|gateway time-out|gateway timeout|请求失败|重试|超时/i.test(`${message || ''} ${details || ''}`);
}

function collectTikHubBases(primaryBase) {
  const primary = normalizeBase(primaryBase);
  const fallback = /\/\/api\.tikhub\.io$/i.test(primary)
    ? 'https://api.tikhub.dev'
    : (/\/\/api\.tikhub\.dev$/i.test(primary) ? DEFAULT_TIKHUB_BASE : '');
  return [primary, fallback].filter(Boolean).filter((base, index, arr) => arr.indexOf(base) === index);
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

function fixLazyLoadedImages(html) {
  if (typeof html !== 'string' || !/<img\b/i.test(html)) return html;
  // WeChat articles ship <img data-src="real-url" src="placeholder"> and rely on
  // runtime JS to swap. Server-side, swap data-src (and variants) into src so the
  // article renders correctly without executing JS. Note: use (^|\s) not \b for
  // src detection — \b would also match inside data-src.
  return html.replace(/<img\b([^>]+)>/gi, (match, attrs) => {
    const dataSrcMatch = attrs.match(/\bdata-(?:src|original|imgsrc|lazy-src|original-src|src-original)="([^"]+)"/i);
    if (!dataSrcMatch) return match;
    const dataSrc = dataSrcMatch[1];
    const srcMatch = attrs.match(/(^|\s)src="([^"]*)"/i);
    if (srcMatch) {
      const src = srcMatch[2];
      // Keep existing src only if it's a real URL: longer than a placeholder
      // AND not a data: URL (WeChat uses tiny gif/png/svg placeholders).
      if (src.length > 60 && !/^data:/i.test(src)) return match;
    }
    const newAttrs = srcMatch
      ? attrs.replace(/(^|\s)src="[^"]*"/i, `$1src="${dataSrc}"`)
      : ` src="${dataSrc}"${attrs}`;
    return `<img${newAttrs}>`;
  });
}

function computeImageStats(html) {
  if (typeof html !== 'string' || !html) return null;
  const imgCount = (html.match(/<img\b/gi) || []).length;
  if (imgCount === 0) return { imgCount: 0, withRealSrc: 0, withDataSrcOnly: 0, bgImageCount: 0, sampleSrc: '' };
  const realSrcRe = /(^|\s)src="(https?:[^"]+)"/gi;
  let withRealSrc = 0;
  let sampleSrc = '';
  let m;
  while ((m = realSrcRe.exec(html)) !== null) {
    withRealSrc += 1;
    if (!sampleSrc) sampleSrc = m[2].slice(0, 120);
  }
  const dataSrcOnlyRe = /<img\b(?![^>]*\ssrc="https?:)[^>]*\bdata-(?:src|original|imgsrc|lazy-src|original-src|src-original)="https?:[^"]+"/i;
  const withDataSrcOnly = dataSrcOnlyRe.test(html) ? 1 : 0;
  const bgImageCount = (html.match(/background-image\s*:\s*url\(/gi) || []).length;
  return { imgCount, withRealSrc, withDataSrcOnly, bgImageCount, sampleSrc };
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
  parts.push(fixLazyLoadedImages(candidate.content));
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

const V2_METADATA_KEYS = new Set([
  'user_name', 'nick_name', 'author', 'title',
  'desc', 'description', 'digest', 'summary',
  'datetime', 'create_time', 'ori_create_time', 'last_modify_time', 'lastModifyTime',
  'cdn_url', 'url', 'cover', 'cover_url', 'cover_image',
  'comment_id', 'msg_id', 'msgId', 'biz_uin', 'bizUin',
  'item_id', 'itemId', 'itemIdx', 'album_id',
  'round_head_img', 'can_share', 'link', 'source_url',
  'advertisement_info', 'tmplVersions', 'tmplVersion',
  'pbRequestMsgInfo', 'itemPictureUrls', 'noNeedUpdate',
  'clientCacheTime', 'forceUrl', 'nativePageNeedFullScreenForceUrl',
]);

function plainTextToParagraphHtml(text) {
  return text
    .split(/\n{2,}|\r\n\r\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return '';
  if (!/&lt;|&gt;|&quot;|&#39;|&nbsp;|&amp;/.test(text)) return text;
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Tolerant extractor for the content_noencode field — observed V2 body field.
// Handles raw HTML, entity-encoded HTML, and plain text.
function extractContentNoencode(value) {
  if (typeof value !== 'string') return '';
  let text = value.trim();
  if (text.length <= 50) return '';

  // If it looks entity-encoded (has &lt; etc.) but no raw tags, decode first
  if (!/<\/?[a-z][\s\S]*>/i.test(text) && /&lt;[a-z]/i.test(text)) {
    text = decodeHtmlEntities(text).trim();
  }

  // HTML path: must have real tags and produce non-empty plain text after stripping.
  // Don't apply looksLikeKnownWrongCollection here — content_noencode is by definition
  // the V2 article body, and the article may legitimately mention tools like
  // wechat-draft-publisher or SKILL.md (e.g., articles about WeChat publishing workflows).
  if (/<\/?[a-z][\s\S]*>/i.test(text)) {
    const plain = cleanText(text.replace(/<[^>]+>/g, ''));
    if (plain) return text;
  }

  // Plain text path: wrap paragraphs in <p>
  const plain = cleanText(text.replace(/<[^>]+>/g, ''));
  if (plain) return plainTextToParagraphHtml(text);
  return '';
}

function pickLongestPlainText(root, depth = 0) {
  if (root == null || depth > 8) return '';
  if (typeof root === 'string') {
    const trimmed = root.trim();
    if (trimmed.length < 50) return '';
    if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) return '';
    return trimmed;
  }
  if (typeof root !== 'object') return '';
  let best = '';
  for (const [key, value] of Object.entries(root)) {
    if (V2_METADATA_KEYS.has(key)) continue;
    const candidate = pickLongestPlainText(value, depth + 1);
    if (candidate.length > best.length) best = candidate;
  }
  return best;
}

function extractV2ArticleHtml(payload) {
  if (!payload || typeof payload !== 'object') return '';
  let data = payload.data;
  if (!data || typeof data !== 'object') return '';
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) data = data.data;

  const content = data.content && typeof data.content === 'object' ? data.content : {};

  let html = '';

  const acceptHtml = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return false;
    const trimmed = candidate.trim();
    if (trimmed.length <= 80) return false;
    if (!/<\/?[a-z][\s\S]*>/i.test(trimmed)) return false;
    if (!cleanText(trimmed.replace(/<[^>]+>/g, ''))) return false;
    html = trimmed;
    return true;
  };

  // Step 0: content_noencode — observed production V2 body field. Tolerates raw HTML,
  // entity-encoded HTML, and plain text. Tried before everything else because the field
  // name is unambiguous.
  const cne = extractContentNoencode(content.content_noencode);
  if (cne) html = cne;

  // Step 1: known HTML field names.
  if (!html) {
    const htmlKeys = ['content_html', 'raw_content', 'html', 'rich_media_content', 'article_html', 'raw_html'];
    for (const key of htmlKeys) {
      if (acceptHtml(content[key]) || acceptHtml(data[key])) break;
    }
  }

  // Step 2: score-based HTML extraction across all nested strings.
  if (!html) {
    const scored = extractHtmlFromPayload({ data: content }) || extractHtmlFromPayload({ data });
    if (scored) acceptHtml(scored);
  }

  // Step 3: documented plain-text field.
  if (!html) {
    const rawText = cleanText(content.content_text || data.content_text || '');
    if (rawText) html = plainTextToParagraphHtml(rawText);
  }

  // Step 4: recursive scan for longest plain text under unknown field names.
  if (!html) {
    let rawText = pickLongestPlainText(content);
    if (!rawText) {
      const dataWithoutContent = {};
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'content') dataWithoutContent[key] = value;
      }
      rawText = pickLongestPlainText(dataWithoutContent);
    }
    if (rawText) html = plainTextToParagraphHtml(rawText);
  }

  if (!html || !cleanText(html.replace(/<[^>]+>/g, ''))) return '';

  return buildArticleHtml({
    title: cleanText(data.title || content.title),
    author: cleanText(data.nick_name || data.author || content.user_name || content.nick_name),
    publishTime: cleanText(data.create_time || data.datetime || content.create_time || content.datetime),
    digest: cleanText(data.desc || data.description || content.desc || content.description || content.summary).slice(0, 180),
    content: html,
  });
}

async function requestTikHub(endpoint, apiKey, fetchImpl, mode = 'html', articleUrl = '') {
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
  const res = await fetchImpl(endpoint, options);
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

  if (!res.ok) {
    const error = new Error(`${apiMessage || `TikHub HTTP ${res.status}`}${details ? ` (${details})` : ''}`);
    error.retryable = isRetryableTikHubError(res.status, apiMessage, details);
    throw error;
  }
  if (payload && typeof payload === 'object' && payload.code && payload.code !== 200) {
    const error = new Error(`${apiMessage || `TikHub code ${payload.code}`}${details ? ` (${details})` : ''}`);
    error.retryable = isRetryableTikHubError(payload.code, apiMessage, details);
    throw error;
  }

  const html = mode === 'v2'
    ? extractV2ArticleHtml(payload)
    : (mode === 'json' ? extractArticleHtmlFromJson(payload) : extractTikHubHtml(payload));
  if (!html) {
    const shape = mode === 'v2' || mode === 'json' ? payloadShape(payload) : '';
    let cneDebug = '';
    if (mode === 'v2') {
      const cneRoot = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
        && payload.data.content && typeof payload.data.content === 'object' ? payload.data.content : null;
      const cne = cneRoot ? cneRoot.content_noencode : undefined;
      if (cne === undefined) {
        cneDebug = '; content_noencode=absent';
      } else if (typeof cne === 'string') {
        const sample = cne.slice(0, 80).replace(/\s+/g, ' ');
        cneDebug = `; content_noencode=len=${cne.length},hasTags=${/<\/?[a-z][\s\S]*>/i.test(cne)},sample="${sample}"`;
      } else {
        cneDebug = `; content_noencode=type=${typeof cne}`;
      }
    }
    const label = mode === 'v2' ? 'TikHub V2 未返回目标公众号正文'
      : (mode === 'json' ? 'TikHub JSON 未返回目标公众号正文' : 'TikHub 未返回可解析的文章 HTML');
    throw new Error(`${label}${shape ? `; shape=${shape}` : ''}${cneDebug}`);
  }
  return html;
}

async function requestTikHubWithRetry(endpoint, apiKey, fetchImpl, mode, attempts, articleUrl = '') {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestTikHub(endpoint, apiKey, fetchImpl, mode, articleUrl);
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

async function collectArticle({ url, apiKey, baseUrl, fetchImpl = fetch }) {
  const articleUrl = assertArticleUrl(url);
  if (!apiKey) throw new Error('服务端未配置 TIKHUB_API_KEY');

  const encoded = encodeURIComponent(articleUrl);
  const bases = collectTikHubBases(baseUrl);
  const endpoints = [];
  bases.forEach((base, index) => {
    endpoints.push({
      url: `${base}/api/v1/wechat_mp/v2/fetch_article_detail`,
      mode: 'v2',
      via: index === 0 ? 'tikhub-v2' : 'tikhub-v2-alt',
      attempts: 1,
    });
  });

  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const html = await requestTikHubWithRetry(endpoint.url, apiKey, fetchImpl, endpoint.mode, endpoint.attempts, articleUrl);
      return { ok: true, html, via: endpoint.via, imageStats: computeImageStats(html) };
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
