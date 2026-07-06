import { fetchChannelsVideoBytes } from '../../lib/channels-video-proxy.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

async function handleRequest(context) {
  const request = context.request;
  if (request.method === 'OPTIONS') return json({}, 204);
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }
  const requestUrl = new URL(request.url);
  const targetUrl = requestUrl.searchParams.get('url') || '';
  const result = await fetchChannelsVideoBytes(targetUrl);
  if (!result.ok) {
    return json({ ok: false, error: result.error }, result.status);
  }
  return new Response(result.buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestOptions(context) {
  return handleRequest(context);
}

export async function onRequestGet(context) {
  return handleRequest(context);
}
