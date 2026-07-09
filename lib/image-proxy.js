/**
 * Server-side proxy for image bytes — used by the "image localization" feature
 * to bypass CORS when downloading external images (mmbiz, etc.) for base64
 * embedding before pasting into WeChat editor.
 *
 * Anti-SSRF: protocol restricted to http/https, hostnames resolved and
 * rejected if they point at private/loopback/link-local ranges.
 */

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'image/*,*/*;q=0.8',
};

function isPrivateHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;
  // IPv4 literal
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1).map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  return false;
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
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, status: 403, error: `拒绝访问私有/本地地址：${parsed.hostname}` };
  }
  return { ok: true, url: parsed.href };
}

async function fetchImageBytes(rawUrl, fetchImpl = fetch) {
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
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return {
      ok: true,
      status: 200,
      buffer: new Uint8Array(arrayBuffer),
      contentType,
    };
  } catch (err) {
    return { ok: false, status: 502, error: (err && err.message) || '上游请求失败' };
  }
}

module.exports = { fetchImageBytes, parseTargetUrl, isPrivateHost };
