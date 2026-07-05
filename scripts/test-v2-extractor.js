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

  // Test 2d: Body nested under unknown object key — recursive scan finds it.
  harness.calls = [];
  const nestedBodyFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '嵌套正文',
            nick_name: 'V2 嵌套字段',
            datetime: '2025-07-01',
            content: {
              user_name: 'wx_id',
              nick_name: '显示名',
              title: '嵌套正文',
              desc: '摘要',
              create_time: '2025-07-01',
              cdn_url: 'https://example.com/cdn',
              link: 'https://example.com/link',
              source_url: 'https://example.com/source',
              can_share: true,
              advertisement_info: {},
              body: {
                format: 'plain',
                text: '这是嵌套在 data.content.body.text 下的正文主体，长度足够通过阈值检查，用来验证递归扫描兜底机制能在多层嵌套中找到真正的文章正文内容。\n\n第二段嵌套正文，承接上文的论述并展开细节描述。\n\n第三段给出结论。',
              },
            },
          },
        });
      },
    };
  };

  const result2d = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/nested-body',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: nestedBodyFetch,
  });

  console.log('Test 2d — via:', result2d.via);
  console.log('  HTML (first 300 chars):', result2d.html.slice(0, 300));
  if (result2d.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2d.via);
    process.exit(1);
  }
  if (!result2d.html.includes('<p>这是嵌套在 data.content.body.text')) {
    console.error('FAIL: recursive scan did not find nested body');
    process.exit(1);
  }
  if (!result2d.html.includes('第二段嵌套正文')) {
    console.error('FAIL: second paragraph missing from nested body');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2e: V2 returns article body in `content_noencode` (the actual production field).
  // Replicates the real response shape — content has 100+ metadata keys plus content_noencode.
  harness.calls = [];
  const productionLikeFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    if (endpoint.includes('//api.tikhub.dev/')) {
      // Alt base returns no body — should not be reached because primary succeeds.
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            code: 200,
            data: {
              itemIdx: 1,
              content: {
                user_name: 'wx_id',
                nick_name: '公众号名',
                title: '生产响应',
                desc: '摘要',
                create_time: '2025-07-01',
                cdn_url: 'https://example.com/cdn',
                link: 'https://example.com/link',
                source_url: 'https://example.com/source',
                can_share: true,
                advertisement_info: {},
              },
            },
          });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            noNeedUpdate: false,
            itemIdx: 1,
            clientCacheTime: 1234567890,
            tmplVersions: { 0: { version: '1' } },
            pbRequestMsgInfo: {},
            itemPictureUrls: {},
            bizUin: 'biz',
            url: 'https://mp.weixin.qq.com/s/abc',
            forceUrl: '',
            content: {
              user_name: 'wx_id',
              nick_name: '公众号名',
              round_head_img: 'https://example.com/avatar.png',
              title: '生产响应标题',
              desc: '这是来自 TikHub V2 生产接口的摘要。',
              content_noencode: '<p style="text-align:center;"><strong>第一段正文</strong>，包含足够的文字长度以满足 80 字符阈值检查，验证 content_noencode 字段能被正确识别为正文 HTML。</p><p>第二段落，包含一些细节和列表项。</p><p>第三段落作为总结，整体超过阈值。</p>',
              create_time: '2025-07-01 10:00:00',
              cdn_url: 'https://example.com/cdn',
              link: 'https://example.com/link',
              source_url: 'https://example.com/source',
              can_share: true,
              alias: 'alias',
              type: 'type',
              author: '作者',
              advertisement_info: {},
              ori_create_time: 1234567890,
              copyright_info: {},
            },
          },
        });
      },
    };
  };

  const result2e = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/production',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: productionLikeFetch,
  });

  console.log('Test 2e — via:', result2e.via);
  console.log('  HTML (first 300 chars):', result2e.html.slice(0, 300));
  if (result2e.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2 (primary should succeed), got', result2e.via);
    process.exit(1);
  }
  if (!result2e.html.includes('<strong>第一段正文</strong>')) {
    console.error('FAIL: content_noencode body not preserved');
    process.exit(1);
  }
  if (!result2e.html.includes('第二段落')) {
    console.error('FAIL: second paragraph missing');
    process.exit(1);
  }
  // Verify alt base was NOT called (primary should have succeeded).
  if (harness.calls.length !== 1) {
    console.error('FAIL: alt base should not be tried when primary succeeds, calls=', harness.calls.length);
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2f: content_noencode is HTML-entity-encoded (no raw tags). Verify decoding path.
  harness.calls = [];
  const entityEncodedFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        const encoded = '&lt;p&gt;&lt;strong&gt;实体编码段落&lt;/strong&gt;：这是被 HTML 实体编码过的正文内容，长度足够通过阈值检查，用来验证解码逻辑能正确还原。&lt;/p&gt;&lt;p&gt;第二段落继续展开论述。&lt;/p&gt;';
        return JSON.stringify({
          code: 200,
          data: {
            title: '实体编码',
            nick_name: 'TikHub V2',
            content: { content_noencode: encoded, desc: '摘要', user_name: 'wx_id' },
          },
        });
      },
    };
  };

  const result2f = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/entity-encoded',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: entityEncodedFetch,
  });

  console.log('Test 2f — via:', result2f.via);
  console.log('  HTML (first 300 chars):', result2f.html.slice(0, 300));
  if (result2f.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2f.via);
    process.exit(1);
  }
  if (!result2f.html.includes('<strong>实体编码段落</strong>')) {
    console.error('FAIL: entity-encoded content_noencode not decoded');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2g: content_noencode is plain text (no HTML tags at all). Verify plain-text wrapping.
  harness.calls = [];
  const plainTextCneFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '纯文本 content_noencode',
            nick_name: 'TikHub V2',
            content: {
              content_noencode: '这是 content_noencode 字段返回的纯文本正文，没有 HTML 标签但长度足够通过阈值检查，验证能被正确包成段落。\n\n第二段纯文本内容继续展开。',
              desc: '摘要',
              user_name: 'wx_id',
            },
          },
        });
      },
    };
  };

  const result2g = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/plain-cne',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: plainTextCneFetch,
  });

  console.log('Test 2g — via:', result2g.via);
  console.log('  HTML (first 300 chars):', result2g.html.slice(0, 300));
  if (result2g.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2g.via);
    process.exit(1);
  }
  if (!result2g.html.includes('<p>这是 content_noencode 字段返回的纯文本正文')) {
    console.error('FAIL: plain-text content_noencode not wrapped in <p>');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2h: Article body legitimately mentions "wechat-draft-publisher" / "SKILL.md" (e.g.,
  // an article about WeChat publishing workflows). must NOT be rejected by looksLikeKnownWrongCollection.
  harness.calls = [];
  const workflowArticleFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '微信公众号排版工作流',
            nick_name: '排版研究',
            content: {
              user_name: 'wx_id',
              content_noencode: '<section data-tool="markdown编辑器" data-website="https://markdown.com.cn/editor"><p>这篇文章介绍我使用的排版工作流，其中会提到 <code>wechat-draft-publisher</code> 这个工具，以及 <code>fix-wechat-style.py</code> 脚本，还有 <code>SKILL.md</code> 配置文件的写法。</p><p>第二段落展开讲 <code>publisher.py</code> 的命令行参数，以及 <code>defconvert_bg_div_to_table</code> 这个内部函数的作用。</p><p>第三段总结整篇文章，强调工作流的整体设计思路。</p></section>',
              desc: '介绍微信排版工作流',
              create_time: '2025-07-01',
            },
          },
        });
      },
    };
  };

  const result2h = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/workflow-article',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: workflowArticleFetch,
  });

  console.log('Test 2h — via:', result2h.via);
  console.log('  HTML (first 300 chars):', result2h.html.slice(0, 300));
  if (result2h.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2h.via);
    process.exit(1);
  }
  if (!result2h.html.includes('wechat-draft-publisher')) {
    console.error('FAIL: article body rejected because it mentions wechat-draft-publisher');
    process.exit(1);
  }
  if (!result2h.html.includes('SKILL.md')) {
    console.error('FAIL: article body rejected because it mentions SKILL.md');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2i: Article HTML uses WeChat-style lazy-loaded images (data-src + placeholder src).
  // Verify fixLazyLoadedImages swaps data-src into src so the article renders.
  harness.calls = [];
  const lazyImageFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '带图文章',
            nick_name: '图文测试',
            content: {
              content_noencode: '<p>段落文字。</p><p><img class="rich_pages wxw-img" data-src="https://mmbiz.qpic.cn/mmbiz_jpg/abc/640?wx_fmt=jpeg" data-w="1080" src="" alt="图片"></p><p>另一段文字。</p><p><img data-src="https://mmbiz.qpic.cn/mmbiz_png/def/640?wx_fmt=png" src="data:image/gif;base64,placeholder"></p>',
              desc: '图片懒加载',
              create_time: '2025-07-01',
            },
          },
        });
      },
    };
  };

  const result2i = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/lazy-img',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: lazyImageFetch,
  });

  console.log('Test 2i — via:', result2i.via);
  console.log('  HTML:', result2i.html);
  if (result2i.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2i.via);
    process.exit(1);
  }
  // Use negative lookbehind so we only match a real src=, not data-src=.
  if (!/(?<!data-)src="https:\/\/mmbiz\.qpic\.cn\/mmbiz_jpg\/abc\/640\?wx_fmt=jpeg"/.test(result2i.html)) {
    console.error('FAIL: data-src not swapped into src for first image');
    process.exit(1);
  }
  if (!/(?<!data-)src="https:\/\/mmbiz\.qpic\.cn\/mmbiz_png\/def\/640\?wx_fmt=png"/.test(result2i.html)) {
    console.error('FAIL: data-src not swapped into src for second image (placeholder replaced)');
    process.exit(1);
  }
  // data-src attribute should still be preserved (we only add src, don't strip data-src)
  if (!result2i.html.includes('data-src="https://mmbiz.qpic.cn/mmbiz_jpg/abc/640')) {
    console.error('FAIL: data-src attribute should be preserved');
    process.exit(1);
  }
  // The placeholder src must be gone after swap
  if (result2i.html.includes('src="data:image/gif;base64,placeholder"')) {
    console.error('FAIL: placeholder src should have been replaced');
    process.exit(1);
  }
  // The empty src="" must be gone after swap
  if (result2i.html.includes('src="" alt="图片"')) {
    console.error('FAIL: empty src="" should have been replaced');
    process.exit(1);
  }
  console.log('  PASS\n');

  // Test 2j: Image uses alternate lazy-load attribute names (data-imgsrc, data-lazy-src,
  // data-original-src) and various placeholder src forms. Verify all variants get swapped.
  // Also verify imageStats is returned.
  harness.calls = [];
  const altAttrFetch = async (endpoint, options = {}) => {
    harness.calls.push({ endpoint, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {
            title: '多变种懒加载',
            nick_name: '测试号',
            content: {
              content_noencode: '<p>第一段正文，包含足够文字以通过长度检查阈值，用来承载图片变种的测试。</p><p><img class="i1" data-imgsrc="https://mmbiz.qpic.cn/mmbiz_jpg/aaa/640?wx_fmt=jpeg" src="data:image/png;base64,iVBORw0KGgoAAAANS"></p><p>第二段正文作为间隔。</p><p><img class="i2" data-lazy-src="https://mmbiz.qpic.cn/mmbiz_png/bbb/640?wx_fmt=png"></p><p>第三段正文。</p><p><img class="i3" data-original-src="https://mmbiz.qpic.cn/mmbiz_gif/ccc/640?wx_fmt=gif" src="about:blank"></p><p>第四段作为结尾总结整篇文章结构。</p>',
              desc: '多变种',
              create_time: '2025-07-01',
            },
          },
        });
      },
    };
  };

  const result2j = await collectArticle({
    url: 'https://mp.weixin.qq.com/s/alt-attr',
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.tikhub.io',
    fetchImpl: altAttrFetch,
  });

  console.log('Test 2j — via:', result2j.via);
  console.log('  imageStats:', JSON.stringify(result2j.imageStats));
  console.log('  HTML:', result2j.html);
  if (result2j.via !== 'tikhub-v2') {
    console.error('FAIL: expected via=tikhub-v2, got', result2j.via);
    process.exit(1);
  }
  if (!/(?<!data-)src="https:\/\/mmbiz\.qpic\.cn\/mmbiz_jpg\/aaa\/640\?wx_fmt=jpeg"/.test(result2j.html)) {
    console.error('FAIL: data-imgsrc not swapped into src');
    process.exit(1);
  }
  if (!/(?<!data-)src="https:\/\/mmbiz\.qpic\.cn\/mmbiz_png\/bbb\/640\?wx_fmt=png"/.test(result2j.html)) {
    console.error('FAIL: data-lazy-src not swapped into src');
    process.exit(1);
  }
  if (!/(?<!data-)src="https:\/\/mmbiz\.qpic\.cn\/mmbiz_gif\/ccc\/640\?wx_fmt=gif"/.test(result2j.html)) {
    console.error('FAIL: data-original-src not swapped into src');
    process.exit(1);
  }
  if (result2j.html.includes('src="data:image/png;base64')) {
    console.error('FAIL: PNG placeholder src should have been replaced');
    process.exit(1);
  }
  if (!result2j.imageStats || result2j.imageStats.imgCount !== 3 || result2j.imageStats.withRealSrc !== 3) {
    console.error('FAIL: imageStats incorrect:', result2j.imageStats);
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
