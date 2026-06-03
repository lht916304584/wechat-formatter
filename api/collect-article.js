const { collectArticle } = require('../lib/article-collector');

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TikHub-Key, X-TikHub-Base');
  res.end(JSON.stringify(body));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: '只支持 GET/POST 请求' });
    return;
  }

  try {
    const body = getBody(req);
    const result = await collectArticle({
      url: body.url || req.query.url,
      apiKey: body.apiKey || req.headers['x-tikhub-key'] || process.env.TIKHUB_API_KEY || process.env.TIKHUB_TOKEN,
      baseUrl: body.baseUrl || req.headers['x-tikhub-base'] || process.env.TIKHUB_BASE_URL,
      fetchImpl: fetch,
    });
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: err.message || '采集失败' });
  }
};
