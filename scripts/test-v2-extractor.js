// Quick verification harness for extractV2ArticleHtml path.
// Stubs the network and feeds a sample V2-shaped payload through collectArticle.

const { collectArticle } = require('../lib/article-collector.js');

function makeFetch(responsePayload) {
  return async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    if (options.method === 'POST') {
      harness.lastBody = options.body;
    }
    const body = typeof responsePayload === 'string'
      ? responsePayload
      : JSON.stringify(responsePayload);
    return {
      ok: true,
      status: 200,
      async text() { return body; },
    };
  };
}

const harness = { calls: [], lastBody: null };

const sampleV2Payload = {
  code: 200,
  message: 'OK',
  data: {
    title: '示例文章标题',
    nick_name: '示例公众号',
    author: '李四',
    desc: '这是一篇示例文章的摘要描述。',
    create_time: '2025-06-01 10:00:00',
    content: {
      content_text: '第一段落内容，介绍文章主题。\n\n第二段落，包含一些细节。\n\n第三段落作为总结。',
      content_html: '<p><strong>第一段落</strong>详细内容，介绍文章主题与背景。</p><p>第二段落，包含一些细节和列表。</p><img src="https://example.com/a.png" alt="demo"><p>第三段落作为总结。</p>',
    },
  },
};

(async () => {
  // Test 1: V2 returns rich HTML successfully.
  const result = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/abc123',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: makeFetch(sampleV2Payload),
  });

  console.log('Test 1 — via:', result.via);
  console.log('  HTML (first 300 chars):', result.html.slice(0, 300));

  if (result.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result.via);
    process.exit(1);
  }
  if (!result.html.includes('示例文章标题')) {
    console.error('FAIL: title missing');
    process.exit(1);
  }
  if (!result.html.includes('<strong>第一段落</strong>')) {
    console.error('FAIL: rich HTML not preserved');
    process.exit(1);
  }
  if (harness.calls[0].options.method !== 'POST') {
    console.error('FAIL: V2 should use POST');
    process.exit(1);
  }
  const parsedBody = JSON.parse(harness.lastBody);
  if (parsedBody.raw !== true) {
    console.error('FAIL: V2 body should set raw=true');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2: V2 fails → fallback to old HTML endpoint succeeds.
  harness.calls = [];
  harness.lastBody = null;
  const fallbackHtml = '<html><body><article><h1>旧接口标题</h1><div id="js_content"><p>旧接口正文段落。</p></div></article></body></html>';
  const fallbackFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    if (endpoint.includes('/v2/fetch_article_detail')) {
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify({ code: 200, data: { title: 'x', content: {} } }); },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ code: 200, data: { html: fallbackHtml } }); },
    };
  };

  const result2 = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/abc123',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: fallbackFetch,
  });

  console.log('Test 2 — via:', result2.via);
  console.log('  endpoints called:', harness.calls.map(c => c.endpoint.replace('https://api.tikhub.io', '')));
  if (result2.via !== 'tikhub-html') {
    console.error('FAIL: expected via=tikhub-html after V2 empty, got', result2.via);
    process.exit(1);
  }
  if (!result2.html.includes('旧接口正文段落')) {
    console.error('FAIL: fallback body missing');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 3: All endpoints fail → aggregated error.
  harness.calls = [];
  const failFetch = async () => ({
    ok: false,
    status: 502,
    async text() { return JSON.stringify({ message: 'Bad Gateway' }); },
  });

  let caught = null;
  try {
    await collectArticle({
      url: 'https://mp.weixin.qq.com/s/abc123',
      apiKey: 'TEST_KEY',
      baseUrl: 'https://api.tikhub.io',
      fetchImpl: failFetch,
    });
  } catch (err) {
    caught = err;
  }
  console.log('Test 3 — error message:', caught && caught.message.slice(0, 120));
  if (!caught) {
    console.error('FAIL: expected error when all endpoints fail');
    process.exit(1);
  }
  console.log('  PASS\n');

  console.log('ALL TESTS PASSED');
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
