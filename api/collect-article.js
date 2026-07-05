const {
  DEFAULT_TIKHUB_BASE,
  collectArticle,
  collectArticleWithVideos,
} = require('../lib/article-collector.js');

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TikHub-Key, X-TikHub-Base');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = getBody(req);
    const apiKey = process.env.TIKHUB_API_KEY || process.env.TIKHUB_TOKEN || body.apiKey || req.headers['x-tikhub-key'];
    const baseUrl = process.env.TIKHUB_BASE_URL || body.baseUrl || req.headers['x-tikhub-base'] || DEFAULT_TIKHUB_BASE;
    const articleUrl = body.url || req.query.url;
    const wantVideos = body.wantVideos === true || req.query.wantVideos === '1';

    const result = wantVideos
      ? await collectArticleWithVideos({ url: articleUrl, apiKey, baseUrl, fetchImpl: fetch, wantVideos: true })
      : await collectArticle({ url: articleUrl, apiKey, baseUrl, fetchImpl: fetch });

    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: error && error.message ? error.message : 'Collection failed',
    });
  }
};
