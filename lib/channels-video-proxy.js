/**
 * Server-side proxy for WeChat Channels (视频号) video bytes.
 *
 * The page runs on HTTPS, but TikHub returns `http://` CDN URLs for Channels
 * videos. Browsers block the mixed-content request, so the bytes must be
 * fetched server-side and forwarded to the client with ACAO headers.
 *
 * Anti-SSRF: only known Tencent Channels CDN hosts are allowed.
 */

const ALLOWED_HOST_PATTERNS = [
  /^wxapp\.tc\.qq\.com$/i,
  /^[a-z0-9-]+\.qpic\.cn$/i,
  /^mpvideo\.qpic\.cn$/i,
  /^channels-alixin-short-mp\.lehuo\.com$/i,
  /^channels-weixin\.lehuo\.com$/i,
  /^finder-alixin-short-mp\.lehuo\.com$/i,
  /^finder-video\.qpic\.cn$/i,
  /^[a-z0-9-]+\.lehuo\.com$/i,
];

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: '*/*',
};

function isAllowedHost(hostname) {
  return ALLOWED_HOST_PATTERNS.some(re => re.test(hostname));
}

function parseTargetUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return { ok: false, status: 400, error: '缺少 url 参数' };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, error: '无效的 URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: 400, error: '只允许 http/https 协议' };
  }
  if (!isAllowedHost(parsed.hostname)) {
    return { ok: false, status: 403, error: `域名不在白名单：${parsed.hostname}` };
  }
  return { ok: true, url: parsed.href };
}

/**
 * Fetch the upstream video bytes.
 *
 * Returns `{ ok: true, status, buffer }` on success or
 * `{ ok: false, status, error }` on failure. The buffer is a Node Buffer
 * when running on Node, or a Uint8Array on edge runtimes — both are
 * acceptable response bodies for their respective adapters.
 */
async function fetchChannelsVideoBytes(rawUrl, fetchImpl = fetch) {
  const parsed = parseTargetUrl(rawUrl);
  if (!parsed.ok) return parsed;

  try {
    const response = await fetchImpl(parsed.url, {
      method: 'GET',
      headers: UPSTREAM_HEADERS,
      redirect: 'follow',
    });
    if (!response.ok) {
      return { ok: false, status: 502, error: `上游返回 HTTP ${response.status}` };
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      ok: true,
      status: 200,
      buffer: new Uint8Array(arrayBuffer),
      contentType: 'application/octet-stream',
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: (err && err.message) || '上游请求失败',
    };
  }
}

module.exports = {
  fetchChannelsVideoBytes,
  parseTargetUrl,
  isAllowedHost,
};
