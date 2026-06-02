const { chromium } = require('playwright');
const path = require('path');

const appUrl = process.env.APP_URL || 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.editor && typeof window.editor.setValue === 'function', null, { timeout: 60000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('weedit-local-store');
      request.onsuccess = resolve;
      request.onerror = resolve;
      request.onblocked = resolve;
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.editor && typeof window.editor.setValue === 'function', null, { timeout: 60000 });

  const pwaState = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
    icon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || '',
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '',
    appleTitle: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') || '',
    fileProtocol: location.protocol === 'file:',
  }));
  assert(pwaState.manifest === 'manifest.webmanifest', 'PWA manifest link missing');
  assert(pwaState.icon.includes('zgedit-icon.svg'), 'PWA icon link missing');
  assert(pwaState.themeColor === '#0b0d12', 'PWA theme color missing');
  assert(pwaState.appleTitle === 'ZgEdit', 'PWA Apple title missing');
  assert(pwaState.fileProtocol, 'smoke test should still run from file protocol');

  const contactButtonState = await page.evaluate(() => {
    const contact = document.getElementById('btnContactService');
    const settings = document.querySelector('.activity-btn[data-tab="settings"]');
    return {
      hasButton: !!contact,
      beforeSettings: !!contact && !!settings && contact.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
      title: contact?.getAttribute('title') || '',
    };
  });
  assert(contactButtonState.hasButton, 'contact service button should exist');
  assert(contactButtonState.beforeSettings, 'contact service button should be before settings button');
  assert(contactButtonState.title === '联系客服', 'contact service button title mismatch');
  await page.click('#btnContactService');
  await page.waitForTimeout(150);
  const contactModalState = await page.evaluate(() => {
    const modal = document.getElementById('contactServiceModal');
    const image = modal.querySelector('img');
    return {
      visible: getComputedStyle(modal).display !== 'none',
      imageSrc: image?.getAttribute('src') || '',
      text: modal.textContent,
    };
  });
  assert(contactModalState.visible, 'contact service modal should open');
  assert(contactModalState.imageSrc.includes('wechat-service-qr.png'), 'contact service modal should show QR image');
  assert(contactModalState.text.includes('微信扫码联系客服'), 'contact service modal copy missing');
  await page.click('#btnCloseContactService');

  await page.click('#btnAiWriterToolbar');
  await page.click('.ai-tab[data-aitab="settings"]');
  await page.selectOption('#aiProvider', 'openrouter');
  const openRouterState = await page.evaluate(() => ({
    providerText: document.querySelector('#aiProvider option[value="openrouter"]')?.textContent || '',
    apiUrl: document.getElementById('aiApiUrl')?.value || '',
    modelValues: [...document.querySelectorAll('#aiModelSelect option')].map(option => option.value),
    hint: document.getElementById('aiProviderHint')?.textContent || '',
  }));
  assert(openRouterState.providerText.includes('OpenRouter'), 'OpenRouter provider option missing');
  assert(openRouterState.apiUrl === 'https://openrouter.ai/api/v1/chat/completions', 'OpenRouter API URL should auto-fill');
  assert(openRouterState.modelValues.includes('openrouter/free'), 'OpenRouter free router model missing');
  assert(openRouterState.modelValues.some(model => model.endsWith(':free')), 'OpenRouter free model options missing');
  assert(openRouterState.hint.includes('openrouter/free'), 'OpenRouter provider hint should mention the free router');
  let aiTestRequest = null;
  await page.route('https://ai-connect.test/chat/completions', async route => {
    aiTestRequest = {
      headers: route.request().headers(),
      body: JSON.parse(route.request().postData() || '{}'),
    };
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ choices: [{ message: { content: '连接成功' } }] }),
    });
  });
  await page.fill('#aiApiUrl', 'https://ai-connect.test/chat/completions');
  await page.fill('#aiApiKey', 'sk-or-v1-test');
  await page.click('#btnTestAiConfig');
  await page.waitForFunction(() => document.getElementById('aiConfigStatus').textContent.includes('连通成功'), null, { timeout: 10000 });
  const aiTestState = await page.evaluate(() => ({
    status: document.getElementById('aiConfigStatus').textContent,
    className: document.getElementById('aiConfigStatus').className,
  }));
  assert(aiTestState.status.includes('openrouter/free'), 'AI connectivity test should report the tested model');
  assert(aiTestState.className.includes('ok'), 'AI connectivity status should be marked ok after success');
  assert(aiTestRequest.body.max_tokens === 16, 'AI connectivity test should use a small max token limit');
  assert(aiTestRequest.body.stream === false, 'AI connectivity test should not use streaming');
  assert(aiTestRequest.headers.authorization === 'Bearer sk-or-v1-test', 'AI connectivity test should use the form API key');
  await page.click('#btnCloseAiWriter');

  await page.route('https://ai.test/chat/completions', route => route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ choices: [{ message: { content: '## AI 插入测试\n\n这段内容应该进入编辑器。' } }] }),
  }));
  await page.evaluate(() => {
    localStorage.setItem('ai-writer-config', JSON.stringify({
      enabled: true,
      apiUrl: 'https://ai.test/chat/completions',
      apiKey: 'sk-test',
      model: 'test-model',
    }));
  });
  await page.click('#btnAiWriterToolbar');
  await page.evaluate(() => { document.getElementById('aiStreamToggle').checked = false; });
  await page.fill('#aiChatInput', '生成一段测试内容');
  await page.click('#btnAiSend');
  await page.waitForFunction(() => !document.getElementById('btnAiInsert').disabled, null, { timeout: 10000 });
  await page.click('#btnAiInsert');
  await page.waitForTimeout(250);
  const aiInsertState = await page.evaluate(() => ({
    editorValue: window.editor.getValue(),
    modalHidden: getComputedStyle(document.getElementById('aiWriterModal')).display === 'none',
  }));
  assert(aiInsertState.editorValue.includes('AI 插入测试'), 'AI insert button should push generated content into editor');
  assert(aiInsertState.modalHidden, 'AI modal should close after inserting generated content');

  await page.route('https://ai-polish.test/chat/completions', route => route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ choices: [{ message: { content: '## 润色后的标题\n\n这是润色后的正文，表达更自然。' } }] }),
  }));
  await page.evaluate(() => {
    window.editor.setValue('# 粗糙标题\n\n这个句子有点不顺，需要润色。');
    localStorage.setItem('ai-writer-config', JSON.stringify({
      enabled: true,
      apiUrl: 'https://ai-polish.test/chat/completions',
      apiKey: 'sk-test',
      model: 'test-model',
    }));
  });
  await page.click('#btnAiWriterToolbar');
  await page.click('.ai-func-card[data-func="polish"]');
  await page.evaluate(() => { document.getElementById('aiStreamToggle').checked = false; });
  const polishReadyState = await page.evaluate(() => ({
    input: document.getElementById('aiChatInput').value,
    sendText: document.getElementById('btnAiSend').textContent,
    insertText: document.getElementById('btnAiInsert').textContent,
    helper: document.getElementById('aiChatMessages').textContent,
  }));
  assert(polishReadyState.input.includes('粗糙标题'), 'polish mode should preload current editor content');
  assert(polishReadyState.sendText.includes('开始润色'), 'polish mode should rename send button');
  assert(polishReadyState.insertText.includes('替换为润色稿'), 'polish mode should rename insert button');
  assert(polishReadyState.helper.includes('已读取当前编辑器内容'), 'polish mode should explain the replacement flow');
  await page.click('#btnAiSend');
  await page.waitForFunction(() => !document.getElementById('btnAiInsert').disabled, null, { timeout: 10000 });
  await page.click('#btnAiInsert');
  await page.waitForTimeout(250);
  const polishInsertState = await page.evaluate(() => ({
    editorValue: window.editor.getValue(),
    modalHidden: getComputedStyle(document.getElementById('aiWriterModal')).display === 'none',
  }));
  assert(polishInsertState.editorValue.includes('润色后的标题'), 'polish mode should replace editor content with polished text');
  assert(!polishInsertState.editorValue.includes('粗糙标题'), 'polish mode should not keep the old draft after replacement');
  assert(polishInsertState.modalHidden, 'AI modal should close after applying polished text');

  await page.route('https://ai-css.test/chat/completions', route => route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ choices: [{ message: { content: '```css\n.preview-content p { color: #224466; }\n.preview-content h2 { border-left: 4px solid #224466; }\n```' } }] }),
  }));
  await page.evaluate(() => {
    window.editor.setValue('# 原文标题\n\n这是一段原文，不能被 CSS 覆盖。');
    localStorage.setItem('ai-writer-config', JSON.stringify({
      enabled: true,
      apiUrl: 'https://ai-css.test/chat/completions',
      apiKey: 'sk-test',
      model: 'test-model',
    }));
  });
  await page.click('#btnAiWriterToolbar');
  await page.click('.ai-func-card[data-func="css"]');
  await page.evaluate(() => { document.getElementById('aiStreamToggle').checked = false; });
  await page.fill('#aiChatInput', '生成一段公众号正文样式');
  await page.click('#btnAiSend');
  await page.waitForFunction(() => !document.getElementById('btnAiInsert').disabled, null, { timeout: 10000 });
  const cssButtonText = await page.textContent('#btnAiInsert');
  assert(cssButtonText.includes('应用到样式'), 'CSS AI mode should change insert button to apply styles');
  await page.click('#btnAiInsert');
  await page.waitForTimeout(300);
  const aiCssState = await page.evaluate(() => {
    const customStyle = window._weeditTest.getCustomStyleConfig();
    return {
      editorValue: window.editor.getValue(),
      customCss: customStyle.css || '',
      enabled: customStyle.enabled !== false,
      modalHidden: getComputedStyle(document.getElementById('aiWriterModal')).display === 'none',
      sidePanelTitle: document.getElementById('sidePanelTitle')?.textContent || '',
      customCssVisible: document.getElementById('customStyleCss')?.value || '',
    };
  });
  assert(aiCssState.editorValue.includes('原文标题'), 'CSS AI apply should not overwrite editor content');
  assert(!aiCssState.editorValue.includes('preview-content p'), 'CSS AI apply should not insert CSS into editor');
  assert(aiCssState.customCss.includes('.preview-content p'), 'CSS AI apply should save extracted CSS to custom style');
  assert(aiCssState.enabled, 'CSS AI apply should enable custom styles');
  assert(aiCssState.modalHidden, 'AI modal should close after applying CSS');
  assert(aiCssState.sidePanelTitle.includes('样式'), 'CSS AI apply should open the styles panel');
  assert(aiCssState.customCssVisible.includes('.preview-content p'), 'CSS AI apply should show CSS in the custom style editor');

  await page.route('https://collect.test/article', route => route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
    body: `<!doctype html><html><head><title>网页采集测试 - Site</title><meta property="og:title" content="网页采集测试"></head><body>
      <article>
        <h1>网页采集测试</h1>
        <p>这是从网页中采集到的第一段正文。</p>
        <h2>小标题</h2>
        <p>这里包含一个 <a href="/detail">链接</a> 和一张图片。</p>
        <img src="/cover.png" alt="封面图">
      </article>
    </body></html>`,
  }));
  await page.route('https://collect.test/cover.png', route => route.fulfill({
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
    },
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.evaluate(() => window.editor.setValue(''));
  await page.click('#btnMore');
  await page.click('.toolbar-dropdown-item[data-action="collect-article"]');
  await page.fill('#collectArticleUrl', 'https://collect.test/article');
  await page.click('#btnFetchArticle');
  await page.waitForFunction(() => !document.getElementById('btnApplyCollectedArticle').disabled, null, { timeout: 10000 });
  const collectPreviewState = await page.evaluate(() => ({
    title: document.getElementById('collectArticleTitle').textContent,
    status: document.getElementById('collectArticleStatus').textContent,
    markdown: document.getElementById('collectArticleMarkdown').value,
  }));
  assert(collectPreviewState.title.includes('网页采集测试'), 'article collector should extract title');
  assert(collectPreviewState.status.includes('采集成功'), 'article collector should report success');
  assert(collectPreviewState.markdown.includes('这是从网页中采集到的第一段正文'), 'article collector should extract body text');
  assert(collectPreviewState.markdown.includes('![封面图](https://collect.test/cover.png)'), 'article collector should absolutize image URLs');
  await page.click('#btnApplyCollectedArticle');
  await page.waitForTimeout(250);
  const collectedEditorState = await page.evaluate(() => ({
    editorValue: window.editor.getValue(),
    modalHidden: getComputedStyle(document.getElementById('collectArticleModal')).display === 'none',
  }));
  assert(collectedEditorState.editorValue.includes('# 网页采集测试'), 'collected article should be imported into editor');
  assert(collectedEditorState.modalHidden, 'collector modal should close after import');

  await page.evaluate(() => {
    window.editor.setValue('# Smoke Title\n\n正文段落，用于验证样式。');
    document.getElementById('inputFormat').value = 'markdown';
  });
  await page.waitForTimeout(800);
  const defaultSkillHtml = await page.evaluate(() => window._weeditTest.getWechatReadyHtml());
  assert(defaultSkillHtml.includes('TECH NOTES'), 'default style should render the skill cover label');
  assert(defaultSkillHtml.includes('<section'), 'wechat-ready HTML should use section blocks for WeChat paste compatibility');
  assert(defaultSkillHtml.includes('style='), 'default skill style should use inline styles');
  assert(defaultSkillHtml.includes('愿这篇技术笔记'), 'default style should append the skill outro');
  assert(!/linear-gradient/i.test(defaultSkillHtml), 'wechat-ready HTML should avoid gradient backgrounds');
  assert(!/class=|\bid=|gap:|<style/i.test(defaultSkillHtml), 'default skill HTML should avoid class/id/style-tag/gap output');

  await page.click('.activity-btn[data-tab="templates"]');
  const templateState = await page.evaluate(() => {
    const cats = [...document.querySelectorAll('.tpl-category-tab')];
    const panel = document.getElementById('sidePanelContent');
    return {
      categoryCount: cats.length,
      categoryRows: new Set(cats.map(item => Math.round(item.getBoundingClientRect().top))).size,
      overflowX: panel.scrollWidth > panel.clientWidth,
      hasIllustration: !!document.querySelector('.tpl-illustration'),
      createBtn: !!document.querySelector('.tpl-create-btn'),
    };
  });
  assert(templateState.categoryCount >= 7, 'template categories did not render');
  assert(templateState.categoryRows >= 2, 'template categories should wrap instead of hidden scrolling');
  assert(!templateState.overflowX, 'template panel has horizontal overflow');
  assert(templateState.hasIllustration, 'template cards should render generated illustrations');
  assert(templateState.createBtn, 'template create button missing');

  await page.evaluate(() => { window._styleTab = 'templates'; });
  await page.click('.activity-btn[data-tab="styles"]');
  const styleState = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.style-tab')].map(item => item.dataset.styleTab),
    presetCount: document.querySelectorAll('.style-preset-card').length,
    selectOptions: document.querySelectorAll('#templateSelect option').length,
    hasRaphael: document.body.textContent.includes('Raphael 30'),
  }));
  assert(styleState.tabs.join(',') === 'templates,elements,css', 'style tabs are incomplete');
  assert(styleState.presetCount >= 39, 'Raphael styles were not loaded into the style panel');
  assert(styleState.selectOptions >= 39, 'Raphael styles were not loaded into the top theme selector');
  assert(styleState.hasRaphael, 'Raphael group label missing');

  await page.click('button.style-preset-card:has-text("GitHub")');
  await page.waitForTimeout(300);
  const paletteValue = await page.locator('#templateSelect').inputValue();
  assert(paletteValue === 'raphael-github', 'GitHub Raphael style was not applied');

  await page.click('.style-tab[data-style-tab="css"]');
  await page.fill('#customStyleCss', '.preview-content p { color: #123456 !important; }');
  await page.click('.style-css-card .style-actions .sp-btn');
  await page.waitForTimeout(400);
  const exported = await page.evaluate(() => window._weeditTest.getWechatReadyHtml());
  assert(exported.includes('color: rgb(18, 52, 86)') || exported.includes('color: #123456'), 'custom CSS was not inlined for exported HTML');
  assert(!exported.includes('data-weedit-custom-style'), 'custom style tag should be removed from exported HTML');

  await page.evaluate(() => {
    window.editor.setValue('# Smoke Title\n\n正文段落，用于验证文章包。');
    document.getElementById('inputFormat').value = 'markdown';
  });
  await page.waitForTimeout(500);
  const packageState = await page.evaluate(() => {
    const data = window._weeditTest.createArticlePackage();
    return {
      type: data.type,
      app: data.app,
      title: data.article.title,
      hasContent: data.article.content.includes('Smoke Title'),
      hasHtml: data.article.html.includes('style='),
      theme: data.article.theme,
      hasCustomStyle: !!data.article.customStyle.css,
      htmlSize: data.stats.htmlSize,
    };
  });
  assert(packageState.type === 'article-package', 'article package type is wrong');
  assert(packageState.app === 'ZgEdit', 'article package app marker is wrong');
  assert(packageState.hasContent, 'article package should include markdown content');
  assert(packageState.hasHtml, 'article package should include wechat-ready html');
  assert(packageState.theme === 'raphael-github', 'article package should preserve the selected style');
  assert(packageState.hasCustomStyle, 'article package should include custom CSS config');
  assert(packageState.htmlSize > 0, 'article package should record html size');

  await page.evaluate(() => {
    const data = window._weeditTest.createArticlePackage();
    data.article.title = 'Imported Package';
    data.article.content = '# Imported Package\n\n导入文章包正文';
    data.article.theme = 'raphael-github';
    window._weeditTest.importArticlePackageData(data);
  });
  await page.waitForTimeout(500);
  await page.click('.activity-btn[data-tab="articles"]');
  await page.waitForTimeout(150);
  const importedPackageState = await page.evaluate(() => ({
    content: window.editor.getValue(),
    theme: document.getElementById('templateSelect').value,
    articleCount: document.querySelectorAll('.sp-article-item').length,
  }));
  assert(importedPackageState.content.includes('Imported Package'), 'imported article package did not replace editor content');
  assert(importedPackageState.theme === 'raphael-github', 'imported article package did not restore theme');
  assert(importedPackageState.articleCount >= 2, 'imported article package should create a new article');

  await page.evaluate(() => {
    window.editor.setValue([
      '# Image Audit',
      '',
      '![外链图](https://example.com/a.png)',
      '',
      '![内嵌图](data:image/png;base64,iVBORw0KGgo=)',
      '',
      '![本地图](assets/zgedit-workbench.png)',
    ].join('\n'));
    document.getElementById('inputFormat').value = 'markdown';
  });
  await page.click('.activity-btn[data-tab="images"]');
  await page.waitForTimeout(300);
  const imagePanelState = await page.evaluate(() => {
    const refs = window._weeditTest.parseArticleImages(window.editor.getValue());
    return {
      refKinds: refs.map(item => item.kind).join(','),
      cardCount: document.querySelectorAll('.sp-image-card').length,
      hasRiskCopy: document.getElementById('sidePanelContent').textContent.includes('需处理'),
      hasBase64: document.getElementById('sidePanelContent').textContent.includes('Base64'),
      hasLocal: document.getElementById('sidePanelContent').textContent.includes('本地路径'),
      hasAutoCompress: document.getElementById('sidePanelContent').textContent.includes('自动压缩'),
    };
  });
  assert(imagePanelState.refKinds === 'network,base64,local', 'image parser should classify network/base64/local images');
  assert(imagePanelState.cardCount === 3, 'image panel should render current article images');
  assert(imagePanelState.hasRiskCopy, 'image panel should show publish risk count');
  assert(imagePanelState.hasBase64, 'image panel should flag base64 images');
  assert(imagePanelState.hasLocal, 'image panel should flag local images');
  assert(imagePanelState.hasAutoCompress, 'image upload card should mention automatic compression');

  await page.evaluate(() => {
    localStorage.setItem('ai-writer-config', JSON.stringify({ apiUrl: 'https://example.com', apiKey: 'sk-test', model: 'test-model' }));
    localStorage.setItem('wechat-formatter-imgbed', JSON.stringify({ url: 'https://img.example.com', field: 'file', path: 'data.url', auth: 'Bearer image-token' }));
    localStorage.setItem('wechat-formatter-sync', JSON.stringify({ provider: 'webdav', gistToken: 'ghp_test', webdavPass: 'dav-pass', webdavUrl: 'https://dav.example.com' }));
  });
  await page.click('.activity-btn[data-tab="settings"]');
  await page.waitForTimeout(250);
  const securityState = await page.evaluate(() => {
    const inventory = window._weeditTest.getSecretInventory();
    return {
      total: inventory.reduce((sum, item) => sum + item.count, 0),
      rowCount: document.querySelectorAll('.sp-security-row').length,
      actionCount: document.querySelectorAll('.sp-security-actions .sp-btn').length,
      text: document.querySelector('.sp-security-card')?.textContent || '',
    };
  });
  assert(securityState.total === 4, 'security inventory should count all stored secrets');
  assert(securityState.rowCount === 3, 'security panel should render secret groups');
  assert(securityState.actionCount === 4, 'security panel should render cleanup actions');
  assert(securityState.text.includes('检测到 4 项'), 'security panel should show total secret count');
  page.once('dialog', dialog => dialog.accept());
  await page.click('.sp-security-actions .sp-storage-danger');
  await page.waitForTimeout(250);
  const clearedSecurityState = await page.evaluate(() => ({
    total: window._weeditTest.getSecretInventory().reduce((sum, item) => sum + item.count, 0),
    ai: JSON.parse(localStorage.getItem('ai-writer-config') || '{}'),
    img: JSON.parse(localStorage.getItem('wechat-formatter-imgbed') || '{}'),
    sync: JSON.parse(localStorage.getItem('wechat-formatter-sync') || '{}'),
    text: document.querySelector('.sp-security-card')?.textContent || '',
  }));
  assert(clearedSecurityState.total === 0, 'security cleanup should clear all counted secrets');
  assert(!clearedSecurityState.ai.apiKey, 'security cleanup should remove AI API key');
  assert(!clearedSecurityState.img.auth, 'security cleanup should remove image auth');
  assert(!clearedSecurityState.sync.gistToken && !clearedSecurityState.sync.webdavPass, 'security cleanup should remove sync credentials');
  assert(clearedSecurityState.text.includes('未检测到本地敏感凭据'), 'security panel should refresh after cleanup');

  await page.evaluate(() => {
    window.editor.setValue('# Smoke Title\n\n作者：Codex\n\n正文段落，用于验证发布检查。这里会被提取为发布摘要，方便复制到公众号后台。');
    document.getElementById('inputFormat').value = 'markdown';
    document.getElementById('templateSelect').value = 'raphael-github';
  });
  await page.waitForTimeout(500);

  await page.click('#btnPublish');
  const publishMetaState = await page.evaluate(() => {
    const meta = window._weeditTest.getPublishMetadata();
    const text = document.getElementById('publishMeta').textContent;
    return {
      title: meta.title,
      author: meta.author,
      summary: meta.summary,
      cardCount: document.querySelectorAll('#publishMeta .publish-meta-card').length,
      hasCopyButtons: document.querySelectorAll('#publishMeta [data-publish-copy]').length,
      hasTitle: text.includes('Smoke Title'),
      hasAuthor: text.includes('Codex'),
      hasSummary: text.includes('发布摘要'),
      hasReadTime: text.includes('分钟阅读'),
    };
  });
  assert(publishMetaState.title === 'Smoke Title', 'publish metadata should extract title');
  assert(publishMetaState.author === 'Codex', 'publish metadata should extract author');
  assert(publishMetaState.summary.includes('发布摘要'), 'publish metadata should generate summary');
  assert(publishMetaState.cardCount === 4, 'publish metadata should render four cards');
  assert(publishMetaState.hasCopyButtons === 4, 'publish metadata should render copy buttons');
  assert(publishMetaState.hasTitle && publishMetaState.hasAuthor && publishMetaState.hasSummary, 'publish metadata panel should show extracted fields');
  assert(publishMetaState.hasReadTime, 'publish metadata panel should show reading stats');
  const publishQualityState = await page.evaluate(() => {
    const report = window._weeditTest.getPublishQualityReport();
    const text = document.getElementById('publishQuality').textContent;
    return {
      score: report.score,
      itemCount: document.querySelectorAll('#publishQuality .publish-quality-item').length,
      hasBoard: !!document.querySelector('#publishQuality .publish-quality-board'),
      hasReadabilityText: text.includes('阅读'),
      hasTitleCheck: text.includes('标题'),
      hasParagraphMetric: text.includes('段落'),
    };
  });
  assert(publishQualityState.score > 0 && publishQualityState.score <= 100, 'publish quality should produce a bounded score');
  assert(publishQualityState.itemCount >= 4, 'publish quality should render multiple checks');
  assert(publishQualityState.hasBoard, 'publish quality score board missing');
  assert(publishQualityState.hasReadabilityText, 'publish quality should show readability summary');
  assert(publishQualityState.hasTitleCheck, 'publish quality should check title');
  assert(publishQualityState.hasParagraphMetric, 'publish quality should show paragraph metric');
  await page.click('.publish-tab[data-pubtab="export"]');
  await page.waitForTimeout(150);
  const publishExportState = await page.evaluate(() => {
    const markdownExport = window._weeditTest.createMarkdownExport();
    const text = document.getElementById('publishPaneExport').textContent;
    return {
      cardCount: document.querySelectorAll('#publishPaneExport .publish-export-card').length,
      hasExportCenter: text.includes('导出中心'),
      hasMarkdown: text.includes('导出 Markdown'),
      hasPackage: text.includes('导出文章包'),
      hasBackup: text.includes('完整备份'),
      markdownTitle: markdownExport.title,
      markdownContent: markdownExport.content,
      markdownFormat: markdownExport.format,
    };
  });
  assert(publishExportState.cardCount >= 5, 'publish export center should render all export cards');
  assert(publishExportState.hasExportCenter, 'publish export center note missing');
  assert(publishExportState.hasMarkdown, 'publish export center should include Markdown export');
  assert(publishExportState.hasPackage, 'publish export center should include article package export');
  assert(publishExportState.hasBackup, 'publish export center should include full backup export');
  assert(publishExportState.markdownTitle === 'Smoke Title', 'Markdown export should preserve detected title');
  assert(publishExportState.markdownContent.includes('发布摘要'), 'Markdown export should preserve source content');
  assert(publishExportState.markdownFormat === 'markdown', 'Markdown export should preserve source format');
  await page.click('.publish-tab[data-pubtab="wechat"]');
  const preflightState = await page.evaluate(() => ({
    summary: document.querySelector('#publishPreflight .publish-preflight-summary')?.textContent || '',
    itemCount: document.querySelectorAll('#publishPreflight .publish-preflight-item').length,
    blockCount: document.querySelectorAll('#publishPreflight .publish-preflight-item.block').length,
    hasTitleCheck: document.getElementById('publishPreflight').textContent.includes('标题'),
    hasSaveCheck: document.getElementById('publishPreflight').textContent.includes('保存'),
  }));
  assert(preflightState.itemCount >= 5, 'publish preflight should render multiple checks');
  assert(preflightState.blockCount === 0, 'valid content should not have blocking preflight items');
  assert(preflightState.hasTitleCheck, 'publish preflight should check title');
  assert(preflightState.hasSaveCheck, 'publish preflight should check save state');
  const diagnosticsState = await page.evaluate(() => ({
    summary: document.querySelector('#publishDiagnostics .publish-diagnostics-summary')?.textContent || '',
    cardCount: document.querySelectorAll('#publishDiagnostics .publish-diagnostic-card').length,
    blockCount: document.querySelectorAll('#publishDiagnostics .publish-diagnostic-card.block').length,
    hasClipboardCheck: document.getElementById('publishDiagnostics').textContent.includes('富文本剪贴板能力'),
    hasInlineStyleCheck: document.getElementById('publishDiagnostics').textContent.includes('内联样式'),
    hasCopyPending: document.getElementById('publishDiagnostics').textContent.includes('待复制'),
  }));
  assert(diagnosticsState.cardCount >= 8, 'copy diagnostics should render multiple checks');
  assert(diagnosticsState.blockCount === 0, 'valid content should not have blocking copy diagnostics');
  assert(diagnosticsState.hasClipboardCheck, 'copy diagnostics should check clipboard capabilities');
  assert(diagnosticsState.hasInlineStyleCheck, 'copy diagnostics should check inline styles');
  assert(diagnosticsState.hasCopyPending, 'copy diagnostics should show pending copy status before copy');
  await page.click('#btnPublishCopy');
  await page.waitForTimeout(250);
  const diagnosticsAfterCopy = await page.evaluate(() => ({
    text: document.getElementById('publishDiagnostics').textContent,
  }));
  assert(diagnosticsAfterCopy.text.includes('上次复制成功'), 'copy diagnostics should refresh after successful copy');
  const clipboardState = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const first = items[0];
    if (!first) return { types: [], html: '' };
    const html = first.types.includes('text/html')
      ? await (await first.getType('text/html')).text()
      : '';
    return { types: first.types, html };
  });
  assert(clipboardState.types.includes('text/html'), 'wechat copy should write text/html to clipboard');
  assert(clipboardState.html.includes('style='), 'wechat copy HTML should preserve inline styles');
  await page.click('#btnClosePublish');

  await page.click('.activity-btn[data-tab="history"]');
  await page.evaluate(() => {
    window.editor.setValue('# 历史旧稿\n\n第一版正文。\n\n## 小标题\n\n旧内容。');
    document.getElementById('inputFormat').value = 'markdown';
    window._spSaveVersion();
    window.editor.setValue('# 当前新稿\n\n第二版正文，准备对比恢复。');
  });
  await page.waitForTimeout(400);
  await page.click('.sp-history-card');
  await page.waitForTimeout(250);
  const historyCompareState = await page.evaluate(() => {
    const modal = document.getElementById('historyCompareModal');
    const text = document.getElementById('historyCompareBody').textContent;
    const diff = window._weeditTest.getVersionDiffSummary('# 历史旧稿\n\n第一版正文。', '# 当前新稿\n\n第二版正文，准备对比恢复。');
    return {
      visible: getComputedStyle(modal).display !== 'none',
      hasOldTitle: text.includes('历史旧稿'),
      hasCurrentTitle: text.includes('当前新稿'),
      hasDelta: text.includes('字符差异'),
      restoreDisabled: document.getElementById('btnHistoryCompareRestore').disabled,
      sameContent: diff.sameContent,
    };
  });
  assert(historyCompareState.visible, 'history compare modal should open before restore');
  assert(historyCompareState.hasOldTitle && historyCompareState.hasCurrentTitle, 'history compare should show old and current summaries');
  assert(historyCompareState.hasDelta, 'history compare should show diff metrics');
  assert(!historyCompareState.restoreDisabled, 'history compare restore should be enabled for different content');
  assert(!historyCompareState.sameContent, 'history diff helper should detect changed content');
  await page.click('#btnHistoryCompareRestore');
  await page.waitForTimeout(350);
  const restoredHistoryContent = await page.evaluate(() => window.editor.getValue());
  assert(restoredHistoryContent.includes('历史旧稿'), 'history compare restore should restore selected version');

  await page.evaluate(() => {
    window.editor.setValue('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>');
    document.getElementById('inputFormat').value = 'html';
    document.getElementById('inputFormat').dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);
  await page.click('#btnPublish');
  const riskyPreflight = await page.evaluate(() => ({
    blockCount: document.querySelectorAll('#publishPreflight .publish-preflight-item.block').length,
    text: document.getElementById('publishPreflight').textContent,
  }));
  assert(riskyPreflight.blockCount >= 1, 'risky HTML should produce a blocking preflight item');
  assert(riskyPreflight.text.includes('高风险 HTML'), 'risky HTML preflight message missing');
  const riskyDiagnostics = await page.evaluate(() => ({
    text: document.getElementById('publishDiagnostics').textContent,
    cardCount: document.querySelectorAll('#publishDiagnostics .publish-diagnostic-card').length,
  }));
  assert(riskyDiagnostics.cardCount >= 8, 'risky diagnostics should still render all copy checks');
  assert(riskyDiagnostics.text.includes('富文本剪贴板能力'), 'risky diagnostics clipboard check missing');
  await page.click('#btnClosePublish');

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(300);
  const mobileInitial = await page.evaluate(() => ({
    barVisible: getComputedStyle(document.getElementById('activityBar')).display !== 'none',
    sideOpen: document.getElementById('sidePanel').classList.contains('open'),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    toolbarBottom: Math.round(document.querySelector('.toolbar').getBoundingClientRect().bottom),
    editorTop: Math.round(document.querySelector('.editor-panel').getBoundingClientRect().top),
    editorHeight: Math.round(document.querySelector('.editor-panel').getBoundingClientRect().height),
    previewHeight: Math.round(document.querySelector('.preview-panel').getBoundingClientRect().height),
    activityBottom: Math.round(document.getElementById('activityBar').getBoundingClientRect().bottom),
    viewportHeight: window.innerHeight,
    compatHeight: Math.round(document.getElementById('compatStatus').getBoundingClientRect().height),
    hasVisibleMinimap: (() => {
      const minimap = document.querySelector('#monaco-editor .minimap');
      if (!minimap) return false;
      const rect = minimap.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && getComputedStyle(minimap).display !== 'none';
    })(),
  }));
  assert(mobileInitial.barVisible, 'mobile activity bar should be visible');
  assert(!mobileInitial.sideOpen, 'mobile layout should start with the side drawer closed');
  assert(!mobileInitial.overflowX, 'mobile layout has horizontal overflow');
  assert(mobileInitial.toolbarBottom <= mobileInitial.editorTop, 'mobile toolbar overlaps editor');
  assert(mobileInitial.editorHeight >= 220, 'mobile editor area is too short');
  assert(mobileInitial.previewHeight >= 260, 'mobile preview area is too short');
  assert(mobileInitial.activityBottom <= mobileInitial.viewportHeight, 'mobile activity bar leaves the viewport');
  assert(mobileInitial.compatHeight <= 30, 'mobile compatibility status should stay on one line');
  assert(!mobileInitial.hasVisibleMinimap, 'mobile editor should hide the Monaco minimap');
  await page.click('.activity-btn[data-tab="templates"]');
  await page.waitForTimeout(250);
  const mobileDrawer = await page.evaluate(() => ({
    sideOpen: document.getElementById('sidePanel').classList.contains('open'),
    top: Math.round(document.getElementById('sidePanel').getBoundingClientRect().top),
    bottom: Math.round(document.getElementById('sidePanel').getBoundingClientRect().bottom),
    toolbarBottom: Math.round(document.querySelector('.toolbar').getBoundingClientRect().bottom),
    viewport: window.innerHeight,
  }));
  assert(mobileDrawer.sideOpen, 'mobile side drawer did not open');
  assert(mobileDrawer.bottom <= mobileDrawer.viewport - 50, 'mobile side drawer overlaps the bottom toolbar');
  assert(mobileDrawer.top >= mobileDrawer.toolbarBottom, 'mobile side drawer overlaps the top toolbar');

  await page.click('#btnPublish');
  await page.waitForTimeout(250);
  const mobilePublish = await page.evaluate(() => {
    const modal = document.querySelector('#publishModal .modal-content').getBoundingClientRect();
    const preview = document.getElementById('publishPreview').getBoundingClientRect();
    const copy = document.getElementById('btnPublishCopy').getBoundingClientRect();
    return {
      modalLeft: Math.round(modal.left),
      modalRight: Math.round(modal.right),
      modalBottom: Math.round(modal.bottom),
      previewHeight: Math.round(preview.height),
      copyBottom: Math.round(copy.bottom),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  assert(mobilePublish.modalLeft >= 0 && mobilePublish.modalRight <= mobilePublish.viewportWidth, 'mobile publish modal overflows horizontally');
  assert(mobilePublish.modalBottom <= mobilePublish.viewportHeight, 'mobile publish modal overflows vertically');
  assert(mobilePublish.previewHeight <= Math.round(mobilePublish.viewportHeight * 0.45), 'mobile publish preview is too tall');
  assert(mobilePublish.copyBottom <= mobilePublish.modalBottom, 'mobile publish copy button is outside the modal');
  await page.click('#btnClosePublish');

  await page.click('#btnAiWriterToolbar');
  await page.waitForTimeout(250);
  const mobileAi = await page.evaluate(() => {
    const modal = document.querySelector('#aiWriterModal .modal-content').getBoundingClientRect();
    const pane = document.getElementById('aiPaneAssistant');
    return {
      modalLeft: Math.round(modal.left),
      modalRight: Math.round(modal.right),
      modalBottom: Math.round(modal.bottom),
      paneScrollable: ['auto', 'scroll'].includes(getComputedStyle(pane).overflowY),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  assert(mobileAi.modalLeft >= 0 && mobileAi.modalRight <= mobileAi.viewportWidth, 'mobile AI modal overflows horizontally');
  assert(mobileAi.modalBottom <= mobileAi.viewportHeight, 'mobile AI modal overflows vertically');
  assert(mobileAi.paneScrollable, 'mobile AI assistant pane should scroll inside the modal');
  await page.click('#btnCloseAiWriter');

  assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
  await browser.close();
  console.log('Smoke tests passed');
})().catch(async error => {
  console.error(error);
  process.exit(1);
});
