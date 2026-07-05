import {
  DEFAULT_TIKHUB_BASE,
  collectArticle,
  collectArticleWithVideos,
} from '../../lib/article-collector.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-TikHub-Key, X-TikHub-Base',
      'Cache-Control': 'no-store',
    },
  });
}

async function readBody(request) {
  if (request.method !== 'POST') return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleRequest(context) {
  const request = context.request;
  const env = context.env || {};
  if (request.method === 'OPTIONS') return json({}, 204);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  try {
    const requestUrl = new URL(request.url);
    const body = await readBody(request);
    const apiKey = env.TIKHUB_API_KEY || env.TIKHUB_TOKEN || body.apiKey || request.headers.get('X-TikHub-Key');
    const baseUrl = env.TIKHUB_BASE_URL || body.baseUrl || request.headers.get('X-TikHub-Base') || DEFAULT_TIKHUB_BASE;
    const articleUrl = body.url || requestUrl.searchParams.get('url') || '';
    const wantVideos = body.wantVideos === true || requestUrl.searchParams.get('wantVideos') === '1';

    const result = wantVideos
      ? await collectArticleWithVideos({ url: articleUrl, apiKey, baseUrl, fetchImpl: fetch, wantVideos: true })
      : await collectArticle({ url: articleUrl, apiKey, baseUrl, fetchImpl: fetch });

    return json(result);
  } catch (error) {
    return json({
      ok: false,
      error: error && error.message ? error.message : 'Collection failed',
    }, 502);
  }
}

export async function onRequestOptions(context) {
  return handleRequest(context);
}

export async function onRequestGet(context) {
  return handleRequest(context);
}

export async function onRequestPost(context) {
  return handleRequest(context);
}
