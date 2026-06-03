const { collectArticle } = require('../lib/article-collector');

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: '只支持 GET 请求' });
    return;
  }

  try {
    const result = await collectArticle({
      url: req.query.url,
      apiKey: process.env.TIKHUB_API_KEY || process.env.TIKHUB_TOKEN,
      baseUrl: process.env.TIKHUB_BASE_URL,
      fetchImpl: fetch,
    });
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: err.message || '采集失败' });
  }
};
