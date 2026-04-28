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
    if (/🎉|成功|SUCCESS|DONE|完成/.test(plainText)) {
      return Components.calloutSuccess(body);
    }
    if (/❌|错误|失败|ERROR|FAIL|BUG/.test(plainText)) {
      return Components.calloutError(body);
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

    // 检测任务列表：所有项以 [ ] 或 [x] 开头
    const taskRegex = /^\[( |x)\]\s*/i;
    const isTaskList = items.length > 0 && items.every(item => taskRegex.test(item));
    if (isTaskList) {
      const taskItems = items.map(item => {
        const checked = /^\[x\]/i.test(item);
        const text = item.replace(/^\[( |x)\]\s*/i, '');
        return { checked, text };
      });
      return Components.taskList(taskItems);
    }

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
 * 纯文本 → Markdown 智能转换
 * 统一的规则集，renderPlainText 和 app.js 共用
 */
function smartConvertTextToMarkdown(text) {
  const lines = text.split('\n');
  const out = [];
  let isFirstContent = true;
  let afterDivider = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    // 已有 Markdown 语法保留原样
    if (/^#{1,6}\s/.test(trimmed) || /^```/.test(trimmed) || /^\s*>\s/.test(trimmed) ||
        /^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      out.push(line);
      isFirstContent = false;
      continue;
    }

    // 分隔线
    if (/^[-=_*~#]{3,}$/.test(trimmed)) {
      out.push('---');
      afterDivider = true;
      isFirstContent = false;
      continue;
    }

    // 第一行内容 → 封面（h1 触发 cover）
    if (isFirstContent) {
      out.push(`# ${trimmed}`);
      isFirstContent = false;
      continue;
    }

    // 步骤标记：第一步：xxx
    const stepMatch = trimmed.match(/^第[一二三四五六七八九十\d]+步[：:]\s*(.*)/);
    if (stepMatch) {
      out.push(`1. **${stepMatch[1]}**`);
      continue;
    }

    // Callout 检测
    if (/\bNOTE\b|💡/.test(trimmed)) {
      out.push(`> 💡 NOTE：${trimmed.replace(/💡\s*/, '').replace(/\bNOTE\b[：:]?\s*/, '')}`);
      continue;
    }
    if (/\bTIP\b|✅|小贴士/.test(trimmed)) {
      out.push(`> ✅ TIP：${trimmed.replace(/✅\s*/, '').replace(/\bTIP\b[：:]?\s*/, '')}`);
      continue;
    }
    if (/⚠️|警告|WARNING/.test(trimmed)) {
      out.push(`> ⚠️ 注意：${trimmed.replace(/⚠️\s*/, '')}`);
      continue;
    }

    // 引用：引号包裹的长句
    if (/^[""""「].*[""""」]$/.test(trimmed) && trimmed.length > 10 && trimmed.length < 200) {
      out.push(`> ${trimmed.replace(/^[""「]/, '').replace(/[""」]$/, '')}`);
      continue;
    }

    // 格言：含 —— 归属
    const mottoMatch = trimmed.match(/^(.+?)\s*[—\-]{2,}\s*(.+)$/);
    if (mottoMatch && trimmed.length < 120) {
      out.push(`> ${mottoMatch[1].trim()} —— ${mottoMatch[2].trim()}`);
      continue;
    }

    // 无序列表：- • · 开头
    if (/^[-•·]\s/.test(trimmed)) {
      out.push('- ' + trimmed.replace(/^[-•·]\s+/, ''));
      continue;
    }

    // 任务列表：☐ ☑ 开头
    if (/^[☐☑]\s/.test(trimmed)) {
      const checked = trimmed.startsWith('☑');
      out.push((checked ? '- [x] ' : '- [ ] ') + trimmed.replace(/^[☐☑]\s+/, ''));
      continue;
    }

    // 有序列表：数字开头
    if (/^\d+[\.、)\)]\s/.test(trimmed)) {
      out.push(trimmed.replace(/^(\d+)[\.、)\)]\s+/, '$1. '));
      continue;
    }

    // 中文编号标题
    if (/^[一二三四五六七八九十百]+[、．.]/.test(trimmed) || /^第[一二三四五六七八九十百\d]+[章节篇部]/.test(trimmed)) {
      out.push(`## ${trimmed}`);
      continue;
    }

    // 分隔线后的短行 → h2
    if (afterDivider) {
      out.push(`## ${trimmed}`);
      afterDivider = false;
      continue;
    }

    // 标题启发式：短行、无结尾标点
    const sentEnd = /[。；…]/.test(trimmed.slice(-1));
    if (!sentEnd && trimmed.length <= 25) {
      out.push(`## ${trimmed}`);
      continue;
    }
    if (!sentEnd && trimmed.length <= 50 && (trimmed.match(/[，,]/g) || []).length <= 1) {
      out.push(`### ${trimmed}`);
      continue;
    }

    // 独立 URL
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      out.push(`[${trimmed}](${trimmed})`);
      continue;
    }

    out.push(line);
    isFirstContent = false;
  }
  return out.join('\n');
}

/**
 * 渲染纯文本：转为 Markdown 再用 renderMarkdown 渲染
 */
function renderPlainText(content) {
  if (!content || !content.trim()) return '';
  return renderMarkdown(smartConvertTextToMarkdown(content));
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/**
 * 渲染 HTML 输入（清洗）
 */
function renderHtmlContent(content) {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/href="javascript:[^"]*"/gi, '')
    .replace(/class="[^"]*"/gi, '')
    .replace(/id="[^"]*"/gi, '');
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
