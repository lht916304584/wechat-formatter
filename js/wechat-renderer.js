/**
 * 微信排版渲染器
 * 将 Markdown 映射到技术笔记元件库
 * marked v12 使用位置参数
 */

function extractTags(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = regex.exec(html)) !== null) results.push(m[1]);
  return results;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

function createWechatRenderer() {
  const renderer = new marked.Renderer();
  let isFirstHeading = true;
  let lastHeadingLevel = 0;

  // ===== 标题 =====
  // h1 → 封面 (B01)，h2 → 二级标题 (B03)，h3 → 三级标题 (B04)
  renderer.heading = function (text, depth) {
    lastHeadingLevel = depth;
    if (depth === 1 && isFirstHeading) {
      isFirstHeading = false;
      return Components.cover(text, '', '', '');
    }
    if (depth === 1) {
      return Components.h2(text);
    }
    if (depth === 2) {
      return Components.h2(text);
    }
    return Components.h3(text);
  };

  // ===== 段落 ===== → B02
  renderer.paragraph = function (text) {
    if (/^<img\s/.test(text) && /<\/img>|\/>$/.test(text)) {
      return text;
    }
    return Components.paragraph(text);
  };

  // ===== 强调 =====
  renderer.strong = function (text) {
    return Components.strong(text);
  };

  renderer.em = function (text) {
    return Components.em(text);
  };

  renderer.del = function (text) {
    return Components.del(text);
  };

  // ===== 链接 =====
  renderer.link = function (href, title, text) {
    return Components.link(text);
  };

  // ===== 图片 =====
  renderer.image = function (href, title, text) {
    return Components.image(href, text || title);
  };

  // ===== 代码块 ===== → T02
  renderer.code = function (text, lang) {
    return Components.codeBlockHighlighted(text, lang);
  };

  // ===== 行内代码 =====
  renderer.codespan = function (text) {
    return Components.codespan(text);
  };

  // ===== 引用 ===== → B05/B06/B07/B10/T01/N02/E02
  renderer.blockquote = function (body) {
    const plainText = body.replace(/<[^>]+>/g, '').trim();

    // 检测目标清单（📌 你将学到）
    if (/📌|你将学到|你将学会|本文你将/.test(plainText)) {
      const items = extractTags(body, 'li');
      if (items.length >= 2) {
        return Components.goalList(items);
      }
      // 无列表项时，提取段落文字作为单条
      const lines = plainText.replace(/📌\s*/, '').split(/\n/).filter(l => l.trim());
      if (lines.length >= 2) {
        return Components.goalList(lines);
      }
      return Components.calloutInfo(body);
    }

    // 检测格言卡（「」或 —— 归属）
    const mottoMatch = plainText.match(/^(.+?)\s*[—\-]{2,}\s*(.+)$/);
    if (mottoMatch && plainText.length < 120) {
      return Components.mottoCard(mottoMatch[1].trim(), mottoMatch[2].trim());
    }

    // 检测 callout 类型：包含 NOTE/注意/TIP/提示 等关键词
    if (/\bNOTE\b|💡/.test(plainText)) {
      return Components.calloutInfo(body);
    }
    if (/\bTIP\b|✅|技巧|提示/.test(plainText)) {
      return Components.calloutTip(body);
    }
    if (/⚠️|注意|警告|WARNING/.test(plainText)) {
      return Components.calloutWarning(body);
    }

    // 短引用 → quote 卡片，长引用 → callout
    if (plainText.length < 60) {
      return Components.quote(body, '');
    }
    return Components.calloutInfo(body);
  };

  // ===== 列表 =====
  renderer.list = function (body, ordered) {
    const items = extractTags(body, 'li');

    // 如果是有序列表且有 2-8 项，使用步骤卡 (W01)
    if (ordered && items.length >= 2 && items.length <= 8) {
      const steps = items.map(item => ({ desc: item }));
      return Components.stepCards(steps);
    }

    return Components.list(items, ordered);
  };

  renderer.listitem = function (body) {
    return `<li>${body}</li>`;
  };

  // ===== 分隔线 ===== → B09
  renderer.hr = function () {
    return Components.divider('');
  };

  // ===== 表格 ===== → 通用表格 / 前后对比 / 参数表
  renderer.table = function (header, body) {
    // 提取表头单元格
    const headerCells = extractTags(header, 'th').map(stripHtml);

    // 提取表体行（逐行解析 td）
    const bodyRows = [];
    const rowTexts = extractTags(`<table>${body}</table>`, 'tr');
    for (const rowHtml of rowTexts) {
      const cells = extractTags(rowHtml, 'td');
      if (cells.length > 0) bodyRows.push(cells);
    }

    if (headerCells.length === 0 || bodyRows.length === 0) {
      // 回退
      const p = TECH_PALETTE;
      return `<div style="margin:20px 0;border:1px solid ${p.border};border-radius:8px;overflow:hidden;">${header}${body}</div>`;
    }

    // 检测前后对比表格（表头含"之前/之后"或"Before/After"）
    const h0 = headerCells[0].toLowerCase();
    const h1 = headerCells[1] ? headerCells[1].toLowerCase() : '';
    if (bodyRows.length === 1 && headerCells.length === 2 &&
        (h0.includes('之前') || h0.includes('before')) &&
        (h1.includes('之后') || h1.includes('after'))) {
      const row = bodyRows[0];
      return Components.beforeAfter(row[0], '', row[1], '');
    }

    // 检测参数表（2列表，左列短、右列长）
    if (headerCells.length === 2 && bodyRows.length >= 2) {
      const avgKeyLen = bodyRows.reduce((s, r) => s + (r[0] ? stripHtml(r[0]).length : 0), 0) / bodyRows.length;
      const avgValLen = bodyRows.reduce((s, r) => s + (r[1] ? stripHtml(r[1]).length : 0), 0) / bodyRows.length;
      if (avgKeyLen <= 10 && avgValLen > avgKeyLen) {
        const specRows = bodyRows.map(r => ({ key: r[0] || '', value: r[1] || '' }));
        return Components.specTable(headerCells[0] + ' / ' + headerCells[1], specRows);
      }
    }

    return Components.table(headerCells, bodyRows);
  };

  renderer.tablerow = function (text) {
    return `<tr>${text}</tr>`;
  };

  renderer.tablecell = function (text, token) {
    const tag = (token && token.header) ? 'th' : 'td';
    return `<${tag}>${text}</${tag}>`;
  };

  return { renderer, reset() { isFirstHeading = true; lastHeadingLevel = 0; } };
}

/**
 * 渲染 Markdown 为微信兼容 HTML（技术笔记风格）
 */
function renderMarkdown(content) {
  const { renderer, reset } = createWechatRenderer();
  reset();

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true,
  });

  let html = marked.parse(content);

  // 追加签名档
  html += Components.signature();

  return html;
}

/**
 * 渲染纯文本为微信兼容 HTML
 * 逐行扫描，智能识别标题/步骤/列表/引用等结构
 */
function renderPlainText(content) {
  if (!content || !content.trim()) return '';

  const lines = content.split('\n');
  let html = '';
  let isFirstContent = true;
  let afterDivider = false;

  // 缓冲区
  let paragraphLines = [];
  let steps = [];
  let listItems = [];
  let listOrdered = false;

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      html += Components.paragraph(paragraphLines.map(l => escapeHtml(l)).join('<br/>'));
      paragraphLines = [];
    }
  }
  function flushSteps() {
    if (steps.length > 0) {
      html += Components.stepCards(steps);
      steps = [];
    }
  }
  function flushList() {
    if (listItems.length > 0) {
      if (listOrdered && listItems.length >= 2 && listItems.length <= 8) {
        html += Components.stepCards(listItems.map(desc => ({ desc })));
      } else {
        html += Components.list(listItems, listOrdered);
      }
      listItems = [];
    }
  }
  function flushAll() { flushParagraph(); flushSteps(); flushList(); }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 空行：刷新段落和列表，但步骤跨空行累积
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    // 分隔线
    if (/^[-=_*~#]{3,}$/.test(line)) {
      flushAll();
      html += Components.divider('');
      afterDivider = true;
      continue;
    }

    // 列表项：- • · 开头
    if (/^[-•·]\s/.test(line)) {
      flushParagraph();
      flushSteps();
      listItems.push(escapeHtml(line.replace(/^[-•·]\s+/, '')));
      listOrdered = false;
      afterDivider = false;
      continue;
    }

    // 列表项：数字开头 1. 1) 1、
    if (/^\d+[\.、)\)]\s/.test(line)) {
      flushParagraph();
      flushSteps();
      listItems.push(escapeHtml(line.replace(/^\d+[\.、)\)]\s+/, '')));
      listOrdered = true;
      afterDivider = false;
      continue;
    }

    // 步骤标记：第一步： 第二步：
    const stepMatch = line.match(/^第[一二三四五六七八九十\d]+步[：:]\s*(.*)/);
    if (stepMatch) {
      flushParagraph();
      flushList();
      steps.push({ title: stepMatch[1], desc: '' });
      afterDivider = false;
      continue;
    }

    // 步骤上下文中，内容追加到当前步骤
    if (steps.length > 0) {
      const last = steps[steps.length - 1];
      last.desc = last.desc ? last.desc + '<br/>' + escapeHtml(line) : escapeHtml(line);
      continue;
    }

    // 非列表行触刷列表
    if (listItems.length > 0) flushList();

    // 第一行内容 → 封面
    if (isFirstContent) {
      isFirstContent = false;
      html += Components.cover(line, '', '', '');
      continue;
    }

    // 分隔线后的行 → 一定作为 h2 标题
    if (afterDivider) {
      html += Components.h2(line);
      afterDivider = false;
      continue;
    }

    // Callout 检测
    if (/\bNOTE\b|💡/.test(line)) {
      flushParagraph();
      html += Components.calloutInfo(escapeHtml(line));
      continue;
    }
    if (/\bTIP\b|✅|小贴士/.test(line)) {
      flushParagraph();
      html += Components.calloutTip(escapeHtml(line));
      continue;
    }
    if (/⚠️|警告|WARNING/.test(line)) {
      flushParagraph();
      html += Components.calloutWarning(escapeHtml(line));
      continue;
    }

    // 引用：引号包裹的长句
    if (/^[""「].*[""」]$/.test(line) && line.length > 10 && line.length < 200) {
      flushParagraph();
      html += Components.quote(escapeHtml(line), '');
      continue;
    }

    // 格言：含 —— 归属
    const mottoMatch = line.match(/^(.+?)\s*[—\-]{2,}\s*(.+)$/);
    if (mottoMatch && line.length < 120) {
      flushParagraph();
      html += Components.mottoCard(mottoMatch[1].trim(), mottoMatch[2].trim());
      continue;
    }

    // 标题检测：中文编号
    if (/^[一二三四五六七八九十百]+[、．.]/.test(line) || /^第[一二三四五六七八九十百\d]+[章节篇部]/.test(line)) {
      flushParagraph();
      html += Components.h2(line);
      continue;
    }

    // 标题检测：短行无句末标点
    const sentEnd = /[。；…]/.test(line.slice(-1));
    if (!sentEnd && line.length <= 25) {
      flushParagraph();
      html += Components.h2(line);
      continue;
    }
    if (!sentEnd && line.length <= 50 && (line.match(/[，,]/g) || []).length <= 1) {
      flushParagraph();
      html += Components.h3(line);
      continue;
    }

    // 普通段落行
    paragraphLines.push(line);
  }

  flushAll();
  html += Components.signature();
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 渲染 HTML 输入（清洗）
 */
function renderHtmlContent(content) {
  let cleaned = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/class="[^"]*"/gi, '')
    .replace(/id="[^"]*"/gi, '');
  return cleaned;
}

/**
 * 统一渲染入口
 */
function renderContent(content, format) {
  if (!content || !content.trim()) return '';
  try {
    switch (format) {
      case 'markdown':
        return renderMarkdown(content);
      case 'text':
        return renderPlainText(content);
      case 'html':
        return renderHtmlContent(content);
      default:
        return renderMarkdown(content);
    }
  } catch (e) {
    console.error('渲染错误:', e);
    return `<div style="padding:20px;background:#FFF5F5;color:#9B2C2C;border-radius:8px;margin:20px 0;">
  <p style="font-weight:600;margin-bottom:8px;">渲染出错</p>
  <p style="font-size:13px;">${escapeHtml(e.message)}</p>
</div>`;
  }
}

/**
 * 为复制到微信包装
 */
function wrapForWechat(html) {
  return `<div style="max-width:677px;margin:0 auto;font-family:${TECH_PALETTE.fontStack};">${html}</div>`;
}
