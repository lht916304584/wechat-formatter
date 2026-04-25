/**
 * 微信公众号排版工具 - 主逻辑
 */
(function () {
  // ===== DOM 元素 =====
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const previewWrapper = document.getElementById('previewWrapper');
  const templateSelect = document.getElementById('templateSelect');
  const inputFormat = document.getElementById('inputFormat');
  const btnCopy = document.getElementById('btnCopy');
  const btnExportHtml = document.getElementById('btnExportHtml');
  const btnImportFile = document.getElementById('btnImportFile');
  const btnClear = document.getElementById('btnClear');
  const btnMobilePreview = document.getElementById('btnMobilePreview');
  const btnDesktopPreview = document.getElementById('btnDesktopPreview');
  const editorStatus = document.getElementById('editorStatus');
  const fileInput = document.getElementById('fileInput');
  const htmlModal = document.getElementById('htmlModal');
  const htmlOutput = document.getElementById('htmlOutput');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCopyHtml = document.getElementById('btnCopyHtml');
  const btnDownloadHtml = document.getElementById('btnDownloadHtml');
  const toast = document.getElementById('toast');
  const compatStatus = document.getElementById('compatStatus');
  const btnViewHtml = document.getElementById('btnViewHtml');
  const wordTarget = document.getElementById('wordTarget');
  const targetProgress = document.getElementById('targetProgress');
  const saveIndicator = document.getElementById('saveIndicator');
  const statusText = document.getElementById('statusText');
  const dragOverlay = document.getElementById('dragOverlay');

  // ===== 初始化 CodeMirror（带加载失败回退） =====
  let cm;
  if (typeof CodeMirror !== 'undefined') {
    cm = CodeMirror.fromTextArea(editor, {
      mode: 'markdown',
      lineNumbers: true,
      lineWrapping: true,
      theme: 'default',
      tabSize: 2,
      placeholder: '在此粘贴或输入文章内容...\n\n支持 Markdown 语法，实时预览排版效果。',
    });
    cm.setSize(null, '100%');
    editor.style.display = 'none';
  } else {
    // CDN 加载失败回退到 textarea
    editor.style.display = 'block';
    editor.style.flex = '1';
    editor.style.width = '100%';
    editor.style.height = 'auto';
    editor.style.padding = '20px 24px';
    editor.style.border = 'none';
    editor.style.resize = 'none';
    editor.style.outline = 'none';
    editor.style.background = 'var(--surface)';
    editor.style.color = 'var(--text)';
    editor.style.fontFamily = '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace';
    editor.style.fontSize = '14px';
    editor.style.lineHeight = '1.75';
    cm = {
      getValue() { return editor.value; },
      setValue(v) { editor.value = v; },
      replaceSelection(v) {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.slice(0, start) + v + editor.value.slice(end);
        editor.selectionStart = editor.selectionEnd = start + v.length;
      },
      focus() { editor.focus(); },
      on(event, handler) {
        if (event === 'change') {
          editor.addEventListener('input', handler);
        }
      },
    };
  }

  // ===== 状态 =====
  let currentHtml = '';
  const STORAGE_KEY = 'wechat-formatter-content';
  const STORAGE_FORMAT_KEY = 'wechat-formatter-format';

  // ===== 自动保存 / 恢复 =====
  const STORAGE_TARGET_KEY = 'wechat-formatter-target';

  function saveContent() {
    try {
      localStorage.setItem(STORAGE_KEY, cm.getValue());
      localStorage.setItem(STORAGE_FORMAT_KEY, inputFormat.value);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        showToast('存储空间已满，建议导出备份后清空历史版本');
      }
    }
    autoSaveVersion();
    showSaveIndicator();
  }

  function showSaveIndicator() {
    if (!saveIndicator) return;
    saveIndicator.textContent = '已保存';
    saveIndicator.classList.add('show');
    setTimeout(() => saveIndicator.classList.remove('show'), 1500);
  }

  function loadContent() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedFormat = localStorage.getItem(STORAGE_FORMAT_KEY);
      if (saved !== null && saved.trim()) {
        cm.setValue(saved);
        if (savedFormat) inputFormat.value = savedFormat;
        showToast('已恢复上次编辑的草稿');
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_FORMAT_KEY);
    } catch (e) { /* ignore */ }
  }

  // ===== 历史版本管理 =====
  const VERSIONS_KEY = 'wechat-formatter-versions';
  const MAX_VERSIONS = 20;
  const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5分钟
  let lastVersionTime = 0;

  function getVersions() {
    try {
      const raw = localStorage.getItem(VERSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function setVersions(list) {
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(list.slice(-MAX_VERSIONS)));
    } catch (e) { /* ignore quota errors */ }
  }

  function saveVersion(manual = false) {
    const content = cm.getValue();
    if (!content.trim()) {
      if (manual) showToast('内容为空，无法保存');
      return;
    }
    const now = Date.now();
    if (!manual && now - lastVersionTime < AUTO_SAVE_INTERVAL) return;

    const versions = getVersions();
    // 如果最后一个版本的内容和当前一样，跳过
    if (versions.length > 0) {
      const last = versions[versions.length - 1];
      if (last.content === content) {
        if (manual) showToast('内容未变化');
        return;
      }
    }

    const title = content.trim().split('\n')[0].slice(0, 40) || '无标题';
    versions.push({
      id: now,
      timestamp: now,
      content,
      format: inputFormat.value,
      title,
    });
    setVersions(versions);
    lastVersionTime = now;
    if (manual) showToast('已保存版本');
  }

  function autoSaveVersion() {
    saveVersion(false);
  }

  function restoreVersion(id) {
    const versions = getVersions();
    const v = versions.find(x => x.id === id);
    if (!v) return;
    if (!confirm('恢复此版本将覆盖当前内容，确定吗？')) return;
    cm.setValue(v.content);
    if (v.format) inputFormat.value = v.format;
    updatePreview();
    updateStats();
    saveContent();
    showToast('已恢复版本');
  }

  function deleteVersion(id) {
    let versions = getVersions();
    versions = versions.filter(x => x.id !== id);
    setVersions(versions);
    renderHistoryList();
  }

  function clearAllVersions() {
    if (!confirm('确定清空所有历史版本吗？')) return;
    try { localStorage.removeItem(VERSIONS_KEY); } catch (e) {}
    renderHistoryList();
    showToast('已清空历史版本');
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${MM}-${DD} ${hh}:${mm}`;
  }

  function renderHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;
    const versions = getVersions().slice().reverse();
    if (versions.length === 0) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:13px;">暂无历史版本</div>';
      return;
    }
    container.innerHTML = versions.map(v => `
      <div class="history-item">
        <div class="history-item-info">
          <div class="history-item-time">${formatTime(v.timestamp)}</div>
          <div class="history-item-title">${escapeHtml(v.title)}</div>
        </div>
        <div class="history-item-actions">
          <button data-restore="${v.id}">恢复</button>
          <button data-delete="${v.id}">删除</button>
        </div>
      </div>
    `).join('');
  }

  // ===== 工具函数 =====
  function showToast(message, duration = 2000) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    el.style.position = 'fixed';
    el.style.top = '68px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.padding = '10px 28px';
    el.style.background = 'var(--surface-dark)';
    el.style.color = '#fff';
    el.style.borderRadius = '24px';
    el.style.fontSize = '13px';
    el.style.fontWeight = '500';
    el.style.zIndex = '2000';
    el.style.boxShadow = 'var(--shadow-lg)';
    el.style.animation = 'toastIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(() => el.remove(), 200);
    }, duration);
  }

  function updateStats() {
    if (!statusText) return;
    const text = cm.getValue();
    const chars = text.length;
    const cnChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.ceil(cnChars / 300 + words / 200));
    statusText.textContent = `${chars} 字符 · ${cnChars} 汉字 · 约 ${readTime} 分钟阅读`;

    if (targetProgress && wordTarget) {
      const target = parseInt(wordTarget.value, 10);
      if (target > 0) {
        const pct = Math.min(100, Math.round((chars / target) * 100));
        targetProgress.textContent = chars >= target ? '✓ 完成' : `${pct}%`;
      } else {
        targetProgress.textContent = '';
      }
    }
  }

  function getFormat() { return inputFormat.value; }

  // 给预览区代码块添加复制按钮
  function addCodeCopyButtons() {
    if (!preview) return;
    preview.querySelectorAll('pre code').forEach((codeEl) => {
      const pre = codeEl.closest('pre');
      if (!pre) return;
      const box = pre.parentElement;
      if (!box || box.querySelector('.code-copy-btn')) return;
      const header = box.querySelector('div');
      if (!header) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.textContent = '复制';
      btn.type = 'button';
      btn.onclick = () => {
        const text = codeEl.textContent || '';
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '已复制';
            setTimeout(() => btn.textContent = '复制', 1500);
          }).catch(() => {
            btn.textContent = '失败';
            setTimeout(() => btn.textContent = '复制', 1500);
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            btn.textContent = '已复制';
          } catch (e) {
            btn.textContent = '失败';
          }
          document.body.removeChild(ta);
          setTimeout(() => btn.textContent = '复制', 1500);
        }
      };
      header.appendChild(btn);
    });
  }

  // ===== 纯文本 → Markdown 智能转换 =====
  // 对齐 renderPlainText 的识别规则，生成能被 renderMarkdown 充分利用的 Markdown
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

      // 第一行内容 → 封面（用 h1 触发 cover）
      if (isFirstContent) {
        out.push(`# ${trimmed}`);
        isFirstContent = false;
        continue;
      }

      // 步骤标记：第一步：xxx → 有序列表 + 粗体步骤名
      const stepMatch = trimmed.match(/^第[一二三四五六七八九十\d]+步[：:]\s*(.*)/);
      if (stepMatch) {
        out.push(`1. **${stepMatch[1]}**`);
        isFirstContent = false;
        continue;
      }

      // Callout 检测（整行）
      if (/\bNOTE\b|💡/.test(trimmed)) {
        out.push(`> 💡 NOTE：${trimmed.replace(/💡\s*/, '').replace(/\bNOTE\b[：:]?\s*/, '')}`);
        isFirstContent = false;
        continue;
      }
      if (/\bTIP\b|✅|小贴士/.test(trimmed)) {
        out.push(`> ✅ TIP：${trimmed.replace(/✅\s*/, '').replace(/\bTIP\b[：:]?\s*/, '')}`);
        isFirstContent = false;
        continue;
      }
      if (/⚠️|警告|WARNING/.test(trimmed)) {
        out.push(`> ⚠️ 注意：${trimmed.replace(/⚠️\s*/, '')}`);
        isFirstContent = false;
        continue;
      }

      // 引用：引号包裹的长句
      if (/^[""""「].*[""""」]$/.test(trimmed) && trimmed.length > 10 && trimmed.length < 200) {
        out.push(`> ${trimmed.replace(/^[""「」]/, '').replace(/[""「」]$/, '')}`);
        isFirstContent = false;
        continue;
      }

      // 格言：含 —— 归属
      const mottoMatch = trimmed.match(/^(.+?)\s*[—\-]{2,}\s*(.+)$/);
      if (mottoMatch && trimmed.length < 120) {
        out.push(`> ${mottoMatch[1].trim()} —— ${mottoMatch[2].trim()}`);
        isFirstContent = false;
        continue;
      }

      // 无序列表：- • · 开头
      if (/^[-•·]\s/.test(trimmed)) {
        out.push('- ' + trimmed.replace(/^[-•·]\s+/, ''));
        isFirstContent = false;
        continue;
      }

      // 有序列表：数字开头
      if (/^\d+[\.、)\)]\s/.test(trimmed)) {
        out.push(trimmed.replace(/^(\d+)[\.、)\)]\s+/, '$1. '));
        isFirstContent = false;
        continue;
      }

      // 中文编号标题
      if (/^[一二三四五六七八九十百]+[、．.]/.test(trimmed) || /^第[一二三四五六七八九十百\d]+[章节篇部]/.test(trimmed)) {
        out.push(`## ${trimmed}`);
        isFirstContent = false;
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
        isFirstContent = false;
        continue;
      }
      if (!sentEnd && trimmed.length <= 50 && (trimmed.match(/[，,]/g) || []).length <= 1) {
        out.push(`### ${trimmed}`);
        isFirstContent = false;
        continue;
      }

      // 独立 URL
      if (/^https?:\/\/\S+$/.test(trimmed)) {
        out.push(`[${trimmed}](${trimmed})`);
        isFirstContent = false;
        continue;
      }

      out.push(line);
      isFirstContent = false;
    }
    return out.join('\n');
  }

  // ===== 自动检测内容格式 =====
  function detectFormat(content) {
    if (!content || !content.trim()) return 'text';
    const hasMarkdown = /^#{1,6}\s/m.test(content)           // # 标题
      || /\*\*[^*]+\*\*/.test(content)                       // **加粗**
      || /\*[^*]+\*/.test(content)                           // *斜体*
      || /^```/m.test(content)                               // ```代码块
      || /^>\s/m.test(content)                               // > 引用
      || /^\|.+(\|)/m.test(content)                          // | 表格
      || /^[-*+]\s/m.test(content)                           // - 列表
      || /^\d+\.\s/m.test(content);                          // 1. 有序列表
    const hasHtml = /<[a-z][\s\S]*?>/i.test(content);
    if (hasMarkdown) return 'markdown';
    if (hasHtml) return 'html';
    return 'text';
  }

  // ===== 核心渲染 =====
  function updatePreview() {
    let content = cm.getValue();
    if (!content.trim()) {
      preview.innerHTML = '<div class="preview-placeholder"><p>在左侧输入内容，这里将实时显示排版预览效果</p></div>';
      currentHtml = '';
      return;
    }

    try {
      const fmt = getFormat();
      // 若当前格式选的是 markdown，但内容被识别为纯文本，自动做一次智能转换
      if (fmt === 'markdown' && detectFormat(content) === 'text') {
        content = smartConvertTextToMarkdown(content);
      }
      currentHtml = renderContent(content, fmt);
      preview.innerHTML = currentHtml;
      checkWechatCompatibility();
      updateOutline();
      highlightOutline();
      addCodeCopyButtons();
    } catch (e) {
      console.error('渲染错误:', e);
      preview.innerHTML = `<div class="preview-placeholder"><p style="color:red">渲染出错：${e.message}</p></div>`;
      currentHtml = '';
      if (compatStatus) compatStatus.textContent = '';
    }
  }

  // ===== 微信兼容性检查 =====
  function checkWechatCompatibility() {
    if (!compatStatus) return;
    if (!currentHtml) {
      compatStatus.textContent = '';
      compatStatus.className = 'compat-status';
      return;
    }
    const issues = [];

    // 检查 DataURL 图片（微信编辑器不支持 base64 粘贴）
    if (/src="data:image\/[^;]+;base64,/.test(currentHtml)) {
      issues.push('包含 Base64 图片，粘贴到微信后可能无法显示');
    }

    // 检查是否有外部链接的图片（这是正常的，不算问题）
    // 但如果是本地文件路径则有问题
    if (/src="file:\/\//.test(currentHtml) || /src="[C-Z]:\\/.test(currentHtml)) {
      issues.push('包含本地图片路径，微信无法访问');
    }

    // 检查 backdrop-filter（微信不支持）
    if (/backdrop-filter/.test(currentHtml)) {
      issues.push('使用了 backdrop-filter，微信可能不支持');
    }

    // 检查 position: fixed（微信通常过滤）
    if (/position:\s*fixed/.test(currentHtml)) {
      issues.push('使用了 position: fixed，微信编辑器可能过滤');
    }

    // 检查动画/过渡（微信不支持）
    if (/animation\s*:|@keyframes|transition\s*:/.test(currentHtml)) {
      issues.push('包含 CSS 动画/过渡，微信不支持');
    }

    if (issues.length === 0) {
      compatStatus.innerHTML = '✅ 微信兼容';
      compatStatus.className = 'compat-status ok';
      compatStatus.title = '未发现明显的微信兼容性问题';
    } else {
      compatStatus.innerHTML = `⚠️ ${issues.length} 项警告`;
      compatStatus.className = 'compat-status warn';
      compatStatus.title = issues.join('\n');
    }
  }

  // ===== 大纲生成与高亮 =====
  const outlinePanel = document.getElementById('outlinePanel');
  const outlineList = document.getElementById('outlineList');
  const btnToggleOutline = document.getElementById('btnToggleOutline');
  let outlineItems = [];

  function updateOutline() {
    if (!outlineList) return;
    const content = cm.getValue();
    const lines = content.split('\n');
    outlineItems = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].replace(/[*`_]/g, '').trim();
        outlineItems.push({ line: i, text, level });
      }
    }
    if (outlineItems.length === 0) {
      outlineList.innerHTML = '<div class="outline-item" style="color:var(--text-tertiary);cursor:default;">暂无标题</div>';
      return;
    }
    outlineList.innerHTML = outlineItems.map((item, idx) =>
      `<div class="outline-item level-${item.level}" data-idx="${idx}" data-line="${item.line}">${escapeHtml(item.text)}</div>`
    ).join('');
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function highlightOutline() {
    if (!outlineList || outlineItems.length === 0) return;
    const headings = preview.querySelectorAll('h1, h2, h3, h4');
    if (!headings.length) return;
    let activeIdx = -1;
    const wrapperTop = previewWrapper.scrollTop;
    for (let i = 0; i < headings.length; i++) {
      const el = headings[i];
      if (el.offsetTop <= wrapperTop + 40) {
        activeIdx = i;
      } else {
        break;
      }
    }
    outlineList.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
    if (activeIdx >= 0) {
      const item = outlineList.querySelector(`[data-line="${outlineItems[activeIdx]?.line}"]`);
      if (item) item.classList.add('active');
    }
  }

  if (outlineList) {
    outlineList.addEventListener('click', (e) => {
      const item = e.target.closest('.outline-item[data-line]');
      if (!item) return;
      const line = parseInt(item.dataset.line, 10);
      const headings = preview.querySelectorAll('h1, h2, h3, h4');
      const target = headings[line] || Array.from(headings).find((_, i) => i === parseInt(item.dataset.idx, 10));
      if (target) {
        previewWrapper.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
      }
      // 同时滚动编辑器到对应行
      if (typeof cm.scrollIntoView === 'function') {
        cm.scrollIntoView({ line, ch: 0 });
        cm.setCursor({ line, ch: 0 });
      }
    });
  }

  if (btnToggleOutline) {
    btnToggleOutline.addEventListener('click', () => {
      outlinePanel.classList.toggle('open');
      btnToggleOutline.classList.toggle('active');
    });
  }

  previewWrapper.addEventListener('scroll', () => {
    requestAnimationFrame(highlightOutline);
  });

  // ===== 复制到微信 =====
  async function copyForWechat() {
    if (!currentHtml) {
      showToast('请先输入内容');
      return;
    }
    const wrapped = wrapForWechat(currentHtml);
    try {
      // 使用 Clipboard API 复制富文本
      const blob = new Blob([wrapped], { type: 'text/html' });
      const plainBlob = new Blob([wrapped], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blob,
          'text/plain': plainBlob,
        }),
      ]);
      showToast('已复制，可直接粘贴到微信编辑器');
    } catch (e) {
      // 回退方案：选中内容并复制
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = wrapped;
        tempDiv.style.position = 'fixed';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);
        const range = document.createRange();
        range.selectNodeContents(tempDiv);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        document.body.removeChild(tempDiv);
        sel.removeAllRanges();
        showToast('已复制，可直接粘贴到微信编辑器');
      } catch (e2) {
        showToast('复制失败，请使用导出 HTML 功能');
      }
    }
  }

  // ===== 导出 HTML =====
  function exportHtml() {
    if (!currentHtml) {
      showToast('请先输入内容');
      return;
    }
    const wrapped = wrapForWechat(currentHtml);
    htmlOutput.value = wrapped;
    htmlModal.style.display = 'flex';
  }

  function downloadHtml() {
    if (!currentHtml) return;
    const wrapped = wrapForWechat(currentHtml);
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="max-width:677px;margin:0 auto;padding:20px;">${wrapped}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const title = (cm.getValue().trim().split('\n')[0] || 'article').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 30) || 'article';
    a.download = `${title}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('HTML 文件已下载');
  }

  async function copyHtmlCode() {
    try {
      await navigator.clipboard.writeText(htmlOutput.value);
      showToast('HTML 代码已复制到剪贴板');
    } catch (e) {
      htmlOutput.select();
      document.execCommand('copy');
      showToast('HTML 代码已复制到剪贴板');
    }
  }

  // ===== 图片处理 =====
  function insertImageMarkdown(dataUrl) {
    const alt = 'image';
    const markdown = `\n![${alt}](${dataUrl})\n`;
    cm.replaceSelection(markdown);
    cm.focus();
    updatePreview();
    saveContent();
    showToast('图片已插入');
  }

  // ===== 图床配置 =====
  const IMGBED_KEY = 'wechat-formatter-imgbed';
  function getImgBedConfig() {
    try {
      const raw = localStorage.getItem(IMGBED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setImgBedConfig(cfg) {
    try { localStorage.setItem(IMGBED_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function getValueByPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }

  async function uploadImageToBed(file) {
    const cfg = getImgBedConfig();
    if (!cfg || !cfg.url) return null;
    const form = new FormData();
    form.append(cfg.field || 'file', file);
    const headers = {};
    if (cfg.auth) headers['Authorization'] = cfg.auth;
    const res = await fetch(cfg.url, { method: 'POST', headers, body: form });
    const data = await res.json().catch(() => ({}));
    const url = getValueByPath(data, cfg.path || 'data.url');
    return url || null;
  }

  function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('仅支持图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片超过 5MB，建议先压缩');
      return;
    }
    const cfg = getImgBedConfig();
    if (cfg && cfg.url) {
      showToast('正在上传图片...');
      uploadImageToBed(file).then(url => {
        if (url) {
          insertImageMarkdown(url);
          showToast('图片已上传');
        } else {
          showToast('图床上传失败，已转为 base64');
          const reader = new FileReader();
          reader.onload = (e) => insertImageMarkdown(e.target.result);
          reader.readAsDataURL(file);
        }
      }).catch(() => {
        showToast('图床上传失败，已转为 base64');
        const reader = new FileReader();
        reader.onload = (e) => insertImageMarkdown(e.target.result);
        reader.readAsDataURL(file);
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => insertImageMarkdown(e.target.result);
    reader.readAsDataURL(file);
  }

  // ===== 文件导入 =====
  function importFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const formatMap = {
      'md': 'markdown', 'markdown': 'markdown',
      'txt': 'markdown',
      'html': 'html', 'htm': 'html',
    };
    const format = formatMap[ext];
    if (!format) {
      showToast('不支持的文件格式');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      cm.setValue(e.target.result);
      inputFormat.value = format;
      saveContent();
      updatePreview();
      updateStats();
      showToast(`已导入 ${file.name}`);
    };
    reader.readAsText(file);
  }

  // ===== 预览模式切换 =====
  function setPreviewMode(mode) {
    if (mode === 'desktop') {
      preview.classList.add('desktop-mode');
      btnDesktopPreview.classList.add('active');
      btnMobilePreview.classList.remove('active');
      // 桌面模式恢复大纲
      if (outlinePanel && !outlinePanel.classList.contains('open')) {
        outlinePanel.classList.add('open');
        if (btnToggleOutline) btnToggleOutline.classList.add('active');
      }
    } else {
      preview.classList.remove('desktop-mode');
      btnMobilePreview.classList.add('active');
      btnDesktopPreview.classList.remove('active');
      // 手机模式自动收起大纲，避免拥挤
      if (outlinePanel && outlinePanel.classList.contains('open')) {
        outlinePanel.classList.remove('open');
        if (btnToggleOutline) btnToggleOutline.classList.remove('active');
      }
    }
  }

  // ===== 同步滚动 =====
  const cmScroller = (typeof cm.getWrapperElement === 'function')
    ? cm.getWrapperElement().querySelector('.CodeMirror-scroll')
    : editor;
  let isEditorScrolling = false;
  let isPreviewScrolling = false;

  function syncScrollTo(source, target) {
    const max = source.scrollHeight - source.clientHeight;
    const ratio = max <= 0 ? 0 : source.scrollTop / max;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (targetMax > 0) {
      target.scrollTop = ratio * targetMax;
    }
  }

  if (cmScroller && previewWrapper) {
    cmScroller.addEventListener('scroll', () => {
      if (isPreviewScrolling) return;
      isEditorScrolling = true;
      syncScrollTo(cmScroller, previewWrapper);
      setTimeout(() => { isEditorScrolling = false; }, 60);
    });
    previewWrapper.addEventListener('scroll', () => {
      if (isEditorScrolling) return;
      isPreviewScrolling = true;
      syncScrollTo(previewWrapper, cmScroller);
      setTimeout(() => { isPreviewScrolling = false; }, 60);
    });
  }

  // ===== 事件绑定 =====
  let debounceTimer;
  let saveTimer;
  let lastContent = '';
  cm.on('change', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastContent = cm.getValue();
      updatePreview();
    }, 300);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveContent, 600);
    updateStats();
  });

  templateSelect.addEventListener('change', () => {
    setActivePalette(templateSelect.value);
    updatePreview();
  });
  inputFormat.addEventListener('change', () => {
    updatePreview();
  });

  btnCopy.addEventListener('click', copyForWechat);
  btnExportHtml.addEventListener('click', downloadHtml);
  if (btnViewHtml) {
    btnViewHtml.addEventListener('click', () => {
      if (!currentHtml) { showToast('请先输入内容'); return; }
      htmlOutput.value = wrapForWechat(currentHtml);
      htmlModal.style.display = 'flex';
    });
  }
  btnImportFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) importFile(e.target.files[0]);
    fileInput.value = '';
  });
  btnClear.addEventListener('click', () => {
    if (cm.getValue() && !confirm('确定清空所有内容吗？')) return;
    cm.setValue('');
    clearStorage();
    updatePreview();
    updateStats();
    cm.focus();
  });

  btnMobilePreview.addEventListener('click', () => setPreviewMode('mobile'));
  btnDesktopPreview.addEventListener('click', () => setPreviewMode('desktop'));

  // 字数目标
  function loadTarget() {
    try {
      const t = localStorage.getItem(STORAGE_TARGET_KEY);
      if (t && wordTarget) wordTarget.value = t;
    } catch (e) {}
  }
  if (wordTarget) {
    wordTarget.addEventListener('input', () => {
      try { localStorage.setItem(STORAGE_TARGET_KEY, wordTarget.value); } catch (e) {}
      updateStats();
    });
    loadTarget();
  }

  // 30 秒周期性自动保存
  setInterval(() => {
    const val = cm.getValue();
    if (val !== lastContent) {
      lastContent = val;
      saveContent();
    }
  }, 30000);

  // Markdown 快捷工具栏
  function insertMarkdown(before, after = '', defaultText = '') {
    const text = cm.getValue();
    // 优先使用 CodeMirror 的文档操作
    if (typeof cm.replaceSelection === 'function' && typeof cm.getSelection === 'function') {
      const selected = cm.getSelection();
      if (selected) {
        cm.replaceSelection(before + selected + after);
      } else {
        cm.replaceSelection(before + defaultText + after);
        // 选中新插入的默认文本以便替换
        const cursor = cm.getCursor();
        const from = { line: cursor.line, ch: cursor.ch - (after.length + defaultText.length) };
        const to = { line: cursor.line, ch: cursor.ch - after.length };
        if (typeof cm.setSelection === 'function') {
          cm.setSelection(from, to);
        }
      }
    } else {
      // textarea 回退
      const el = editor;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.slice(start, end);
      const insertion = before + (selected || defaultText) + after;
      el.value = el.value.slice(0, start) + insertion + el.value.slice(end);
      el.selectionStart = start + before.length;
      el.selectionEnd = el.selectionStart + (selected ? selected.length : defaultText.length);
      el.focus();
    }
  }

  // ===== 一键智能排版 =====
  function doSmartFormat() {
    const content = cm.getValue();
    if (!content.trim()) {
      showToast('内容为空');
      return;
    }
    if (getFormat() !== 'markdown') {
      showToast('请将格式切换为 Markdown');
      return;
    }
    if (detectFormat(content) !== 'text') {
      showToast('内容已包含 Markdown 语法，无需转换');
      return;
    }
    const converted = smartConvertTextToMarkdown(content);
    cm.setValue(converted);
    updatePreview();
    updateStats();
    saveContent();
    showToast('已智能排版');
  }

  // ===== 查找替换 =====
  const findBar = document.getElementById('findBar');
  const findInput = document.getElementById('findInput');
  const replaceInput = document.getElementById('replaceInput');
  let lastFindIndex = -1;

  function openFindBar() {
    if (!findBar) return;
    findBar.style.display = 'flex';
    if (findInput) {
      findInput.focus();
      findInput.select();
    }
  }
  function closeFindBar() {
    if (!findBar) return;
    findBar.style.display = 'none';
    lastFindIndex = -1;
  }

  function setEditorSelection(start, end) {
    if (typeof cm.posFromIndex === 'function') {
      cm.setSelection(cm.posFromIndex(start), cm.posFromIndex(end));
      cm.scrollIntoView(cm.posFromIndex(start));
    } else {
      editor.selectionStart = start;
      editor.selectionEnd = end;
      editor.focus();
    }
  }

  function findNext() {
    const query = findInput ? findInput.value : '';
    const text = cm.getValue();
    if (!query || !text) return;
    const start = text.indexOf(query, lastFindIndex + 1);
    if (start !== -1) {
      lastFindIndex = start;
      setEditorSelection(start, start + query.length);
    } else {
      const wrapStart = text.indexOf(query, 0);
      if (wrapStart !== -1 && wrapStart !== lastFindIndex) {
        lastFindIndex = wrapStart;
        setEditorSelection(wrapStart, wrapStart + query.length);
      }
    }
  }
  function findPrev() {
    const query = findInput ? findInput.value : '';
    const text = cm.getValue();
    if (!query || !text) return;
    const searchEnd = lastFindIndex <= 0 ? text.length : lastFindIndex;
    const start = text.lastIndexOf(query, searchEnd - 1);
    if (start !== -1) {
      lastFindIndex = start;
      setEditorSelection(start, start + query.length);
    } else {
      const wrapStart = text.lastIndexOf(query);
      if (wrapStart !== -1 && wrapStart !== lastFindIndex) {
        lastFindIndex = wrapStart;
        setEditorSelection(wrapStart, wrapStart + query.length);
      }
    }
  }
  function replaceCurrent() {
    const query = findInput ? findInput.value : '';
    const replacement = replaceInput ? replaceInput.value : '';
    const text = cm.getValue();
    if (!query || !text || lastFindIndex === -1) return;
    const selected = (typeof cm.getSelection === 'function') ? cm.getSelection() : text.slice(editor.selectionStart, editor.selectionEnd);
    if (selected !== query) {
      findNext();
      return;
    }
    cm.replaceSelection(replacement);
    lastFindIndex = lastFindIndex + replacement.length;
    updatePreview();
    updateStats();
    saveContent();
  }
  function replaceAll() {
    const query = findInput ? findInput.value : '';
    const replacement = replaceInput ? replaceInput.value : '';
    const text = cm.getValue();
    if (!query || !text) return;
    const newText = text.split(query).join(replacement);
    if (newText === text) return;
    cm.setValue(newText);
    lastFindIndex = -1;
    updatePreview();
    updateStats();
    saveContent();
    showToast('已全部替换');
  }

  if (findBar) {
    document.getElementById('btnFindNext')?.addEventListener('click', findNext);
    document.getElementById('btnFindPrev')?.addEventListener('click', findPrev);
    document.getElementById('btnReplace')?.addEventListener('click', replaceCurrent);
    document.getElementById('btnReplaceAll')?.addEventListener('click', replaceAll);
    document.getElementById('btnCloseFind')?.addEventListener('click', closeFindBar);
    findInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); findNext(); }
      if (e.key === 'Escape') { closeFindBar(); }
    });
    replaceInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
      if (e.key === 'Escape') { closeFindBar(); }
    });
  }

  // 历史版本弹窗
  const historyModal = document.getElementById('historyModal');
  const historyList = document.getElementById('historyList');
  if (historyModal) {
    document.getElementById('btnHistory')?.addEventListener('click', () => {
      renderHistoryList();
      historyModal.style.display = 'flex';
    });
    document.getElementById('btnCloseHistory')?.addEventListener('click', () => {
      historyModal.style.display = 'none';
    });
    document.getElementById('btnSaveVersion')?.addEventListener('click', () => {
      saveVersion(true);
      renderHistoryList();
    });
    document.getElementById('btnClearHistory')?.addEventListener('click', clearAllVersions);
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) historyModal.style.display = 'none';
    });
    if (historyList) {
      historyList.addEventListener('click', (e) => {
        const restoreBtn = e.target.closest('[data-restore]');
        const deleteBtn = e.target.closest('[data-delete]');
        if (restoreBtn) {
          restoreVersion(Number(restoreBtn.dataset.restore));
          historyModal.style.display = 'none';
        }
        if (deleteBtn) {
          deleteVersion(Number(deleteBtn.dataset.delete));
        }
      });
    }
  }

  // 图床设置弹窗
  const imageBedModal = document.getElementById('imageBedModal');
  const imgBedUrl = document.getElementById('imgBedUrl');
  const imgBedField = document.getElementById('imgBedField');
  const imgBedPath = document.getElementById('imgBedPath');
  const imgBedAuth = document.getElementById('imgBedAuth');
  if (imageBedModal) {
    document.getElementById('btnImageBed')?.addEventListener('click', () => {
      const cfg = getImgBedConfig();
      if (cfg) {
        imgBedUrl.value = cfg.url || '';
        imgBedField.value = cfg.field || '';
        imgBedPath.value = cfg.path || '';
        imgBedAuth.value = cfg.auth || '';
      }
      imageBedModal.style.display = 'flex';
    });
    document.getElementById('btnCloseImageBed')?.addEventListener('click', () => {
      imageBedModal.style.display = 'none';
    });
    imageBedModal.addEventListener('click', (e) => {
      if (e.target === imageBedModal) imageBedModal.style.display = 'none';
    });
    document.getElementById('btnSaveImageBed')?.addEventListener('click', () => {
      setImgBedConfig({
        url: imgBedUrl.value.trim(),
        field: imgBedField.value.trim() || 'file',
        path: imgBedPath.value.trim() || 'data.url',
        auth: imgBedAuth.value.trim(),
      });
      showToast('图床配置已保存');
      imageBedModal.style.display = 'none';
    });
    document.getElementById('btnTestUpload')?.addEventListener('click', async () => {
      const cfg = {
        url: imgBedUrl.value.trim(),
        field: imgBedField.value.trim() || 'file',
        path: imgBedPath.value.trim() || 'data.url',
        auth: imgBedAuth.value.trim(),
      };
      if (!cfg.url) { showToast('请先填写上传接口 URL'); return; }
      setImgBedConfig(cfg);
      const blob = new Blob(['GIF89a\x01\x00\x01\x00\x00\x00\x00!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'], { type: 'image/gif' });
      const testFile = new File([blob], 'test.gif', { type: 'image/gif' });
      showToast('正在测试上传...');
      try {
        const url = await uploadImageToBed(testFile);
        if (url) {
          showToast('测试上传成功');
          console.log('图床测试 URL:', url);
        } else {
          showToast('测试上传失败，请检查配置');
        }
      } catch (err) {
        showToast('测试上传失败：' + err.message);
      }
    });
  }

  const mdToolbar = document.getElementById('mdToolbar');
  if (mdToolbar) {
    mdToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (!btn) return;
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      switch (cmd) {
        case 'bold': insertMarkdown('**', '**', '加粗文本'); break;
        case 'italic': insertMarkdown('*', '*', '斜体文本'); break;
        case 'heading': insertMarkdown('## ', '', '标题'); break;
        case 'quote': insertMarkdown('> ', '', '引用文本'); break;
        case 'code': insertMarkdown('```\n', '\n```', '代码'); break;
        case 'ul': insertMarkdown('- ', '', '列表项'); break;
        case 'ol': insertMarkdown('1. ', '', '列表项'); break;
        case 'link': insertMarkdown('[', '](https://)', '链接文本'); break;
        case 'hr': insertMarkdown('\n---\n', '', ''); break;
        case 'format': doSmartFormat(); break;
        case 'find': openFindBar(); break;
      }
      // 触发更新
      updatePreview();
      updateStats();
      saveContent();
    });
  }

  // Tab 键缩进（textarea 回退模式）
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const spaces = '  ';
      editor.value = editor.value.slice(0, start) + spaces + editor.value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + spaces.length;
      // 同步到 cm mock
      if (cm && !cm.getSelection) {
        cm.setValue(editor.value);
      }
      updatePreview();
      updateStats();
    }
  });

  // 粘贴图片
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
  });

  // 拖拽上传 / 导入
  const editorPanel = document.querySelector('.editor-panel');
  if (editorPanel) {
    ['dragenter', 'dragover'].forEach(ev => {
      editorPanel.addEventListener(ev, (e) => {
        e.preventDefault();
        if (dragOverlay) dragOverlay.style.display = 'flex';
      });
    });
    document.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null && dragOverlay) dragOverlay.style.display = 'none';
    });
    editorPanel.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragOverlay) dragOverlay.style.display = 'none';
      const files = e.dataTransfer?.files;
      if (!files) return;
      // 优先处理 Markdown/文本文件
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
          importFile(file);
          return;
        }
      }
      // 然后处理图片
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          handleImageFile(file);
          return;
        }
      }
    });
  }

  // 弹窗
  btnCloseModal.addEventListener('click', () => { htmlModal.style.display = 'none'; });
  btnCopyHtml.addEventListener('click', copyHtmlCode);
  btnDownloadHtml.addEventListener('click', downloadHtml);
  htmlModal.addEventListener('click', (e) => { if (e.target === htmlModal) htmlModal.style.display = 'none'; });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') { e.preventDefault(); }
      // 查找替换
      if (e.key === 'f') {
        e.preventDefault();
        if (findBar && findBar.style.display !== 'none') {
          closeFindBar();
        } else {
          openFindBar();
        }
        return;
      }
      // 加粗 / 斜体（仅在编辑器内）
      const activeEl = document.activeElement;
      const inEditor = activeEl === editor || activeEl?.closest?.('.CodeMirror') || activeEl?.closest?.('#findInput') || activeEl?.closest?.('#replaceInput');
      if (inEditor) {
        if (e.key === 'b') {
          e.preventDefault();
          insertMarkdown('**', '**', '加粗文本');
          updatePreview(); updateStats(); saveContent();
          return;
        }
        if (e.key === 'i') {
          e.preventDefault();
          insertMarkdown('*', '*', '斜体文本');
          updatePreview(); updateStats(); saveContent();
          return;
        }
      }
    }
    if (e.key === 'Escape' && htmlModal.style.display !== 'none') {
      htmlModal.style.display = 'none';
    }
    if (e.key === 'Escape' && findBar && findBar.style.display !== 'none') {
      closeFindBar();
    }
  });

  // ===== 初始加载 =====
  if (!loadContent()) {
    const sampleMarkdown = [
      '# 让AI帮你做数据整理',
      '',
      'OpenClaw 实用教程 · 不学编程也能搞定乱七八糟的数据',
      '',
      '> 📌 你将学到',
      '> - 如何用AI快速整理杂乱数据',
      '> - 三步完成数据格式化',
      '> - 实际案例演示',
      '',
      '你有没有过这样的经历，周一早上，老板发来一份表格，里面有一百多个客户的名字、联系方式、公司名称，还有各种乱七八糟的格式。',
      '',
      '你深吸一口气，打开Excel，开始一个一个改。两个小时后，你眼睛花了，脖子也酸了，结果还是漏掉了几个格式错误。',
      '',
      '这种事，以后不用再做了。',
      '',
      '## 这个AI是怎么工作的？',
      '',
      '我们来打个比方。假设你有一个特别认真、特别细心的助理。你把一堆积压的文件扔给他，说"帮我把这些整理一下"。',
      '',
      '这个助理不会抱怨，不会累，眼睛也不会花。你只需要三步。',
      '',
      '1. 复制原始数据，把原始数据复制给AI',
      '2. 用大白话描述需求，说清楚你想要什么格式',
      '3. 检查并使用，等它整理好了直接用',
      '',
      '## 具体能做什么？',
      '',
      '你可能觉得"整理数据"听起来很局限，其实它能做很多事情。',
      '',
      '### 格式清洗',
      '',
      '把乱七八糟的文本变成整整齐齐的格式。',
      '',
      '### 数据分类',
      '',
      '比如你有一堆客户反馈文本，AI可以帮你按照"投诉"、"建议"、"咨询"分类好。',
      '',
      '## 举个例子',
      '',
      '| 姓名 | 电话 | 城市 |',
      '|------|------|------|',
      '| 张三 | 138-1234-5678 | 北京 |',
      '| 李四 | 139-8765-4321 | 上海 |',
      '| 王五 | 137-1234-9876 | 广州 |',
      '',
      '> 💡 NOTE：整个过程不到10秒，而你手动整理至少需要5分钟。数据量越大，AI的优势越明显。',
      '',
      '## 前后对比',
      '',
      '| 之前 | 之后 |',
      '|------|------|',
      '| 手动整理100条数据，耗时2小时，错误率5% | AI整理100条数据，耗时10秒，错误率0% |',
      '',
      '## 不学编程，也能用',
      '',
      '完全不用。整个过程就是说话。你不需要懂任何技术，只需要会打字、会描述你想要什么就行。',
      '',
      '> ✅ TIP：OpenClaw的优势在于，它能记住你的偏好。学会之后，下次整理就会自动按你的方式来。',
      '',
      '> 好的工具不是让人变懒，而是让人把精力放在更有价值的事情上 —— 某位智者',
      '',
      '## 省下来的时间，用来做什么？',
      '',
      '你可以用这个时间：',
      '',
      '- 喝杯咖啡，休息一下',
      '- 处理那些真正需要你动脑子的事',
      '- 早点下班回家',
      '',
      '技术不是目的，让生活变轻松才是。',
    ].join('\n');
    cm.setValue(sampleMarkdown);
  }

  updatePreview();
  updateStats();
})();
