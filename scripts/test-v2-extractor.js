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

  // Test 2: Primary base V2 fails → fallback base V2 succeeds.
  harness.calls = [];
  harness.lastBody = null;
  const altBaseFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    if (endpoint.includes('//api.tikhub.io/')) {
      return {
        ok: false,
        status: 502,
        async text() { return JSON.stringify({ message: 'Bad Gateway on primary' }); },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '备用通道标题',
            nick_name: '备用公众号',
            content: { content_html: '<p><strong>备用通道</strong>返回的正文段落，足够长以通过长度阈值检查。这是一段示例内容，用来验证多 base 兜底机制能正常工作。</p><p>第二段落内容补充。</p>' },
          },
        });
      },
    };
  };

  const result2 = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/abc123',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: altBaseFetch,
  });

  console.log('Test 2 — via:', result2.via);
  console.log('  endpoints called:', harness.calls.map(c => c.endpoint));
  if (result2.via !== 'tikhub-v2-alt') {
    console.error('FAIL: expected via=tikhub-v2-alt, got', result2.via);
    process.exit(1);
  }
  if (!result2.html.includes('返回的正文段落')) {
    console.error('FAIL: alt-base body missing');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2b: V2 returns plain content_text (the documented raw=true behavior).
  harness.calls = [];
  const textOnlyFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '纯文本正文',
            nick_name: 'V2 官方字段',
            author: '作者',
            create_time: '2025-07-01 09:00:00',
            desc: '这是 content_text 路径的摘要。',
            content: {
              content_text: '这是第一段正文，足够长以通过长度阈值检查，验证 content_text 字段能被正确解析为段落。\n\n这是第二段正文，用来确认 \\n\\n 分段逻辑工作正常。\n\n第三段作为结尾总结。',
            },
          },
        });
      },
    };
  };

  const result2b = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/text-only',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: textOnlyFetch,
  });

  console.log('Test 2b — via:', result2b.via);
  console.log('  HTML (first 300 chars):', result2b.html.slice(0, 300));
  if (result2b.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2b.via);
    process.exit(1);
  }
  if (!result2b.html.includes('<p>这是第一段正文')) {
    console.error('FAIL: content_text not parsed into paragraphs');
    process.exit(1);
  }
  if (!result2b.html.includes('第二段正文')) {
    console.error('FAIL: second paragraph missing');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2c: V2 returns body in unknown field name — scan-all-strings fallback.
  harness.calls = [];
  const unknownFieldFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '字段名漂移',
            nick_name: 'TikHub V2',
            user_name: 'wx_nickname',
            datetime: '2025-07-01',
            content: {
              user_name: 'wx_nickname',
              desc: '摘要',
              body_text: '正文主体段落一，长度超过 50 字符阈值，用来验证未知字段名扫描兜底机制能从 content 子对象里挑出最长的纯文本字段作为正文使用。\n\n正文主体段落二，承接上文的论述并展开细节，确保多段结构正常处理。\n\n正文主体段落三，给出结论与展望。',
            },
          },
        });
      },
    };
  };

  const result2c = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/unknown-field',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: unknownFieldFetch,
  });

  console.log('Test 2c — via:', result2c.via);
  console.log('  HTML (first 300 chars):', result2c.html.slice(0, 300));
  if (result2c.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2c.via);
    process.exit(1);
  }
  if (!result2c.html.includes('<p>正文主体段落一')) {
    console.error('FAIL: scan-all-strings fallback did not pick up body_text');
    process.exit(1);
  }
  if (!result2c.html.includes('正文主体段落二')) {
    console.error('FAIL: second paragraph missing from scan fallback');
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
