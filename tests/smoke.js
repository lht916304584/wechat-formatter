const { chromium } = require('playwright');
const path = require('path');

const appUrl = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.editor && typeof window.editor.setValue === 'function', null, { timeout: 60000 });

  await page.evaluate(() => {
    window.editor.setValue('# Smoke Title\n\n正文段落，用于验证样式。');
    document.getElementById('inputFormat').value = 'markdown';
  });
  await page.waitForTimeout(800);

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

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(300);
  const mobileInitial = await page.evaluate(() => ({
    barVisible: getComputedStyle(document.getElementById('activityBar')).display !== 'none',
    sideOpen: document.getElementById('sidePanel').classList.contains('open'),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  assert(mobileInitial.barVisible, 'mobile activity bar should be visible');
  assert(!mobileInitial.overflowX, 'mobile layout has horizontal overflow');
  await page.click('.activity-btn[data-tab="templates"]');
  await page.waitForTimeout(250);
  const mobileDrawer = await page.evaluate(() => ({
    sideOpen: document.getElementById('sidePanel').classList.contains('open'),
    bottom: Math.round(document.getElementById('sidePanel').getBoundingClientRect().bottom),
    viewport: window.innerHeight,
  }));
  assert(mobileDrawer.sideOpen, 'mobile side drawer did not open');
  assert(mobileDrawer.bottom <= mobileDrawer.viewport - 50, 'mobile side drawer overlaps the bottom toolbar');

  assert(errors.length === 0, 'console errors: ' + errors.join('\n'));
  await browser.close();
  console.log('Smoke tests passed');
})().catch(async error => {
  console.error(error);
  process.exit(1);
});
