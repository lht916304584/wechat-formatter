/**
 * 微信公众号排版工具 - 主逻辑
 */
(function () {
  // ===== DOM 元素 =====
  const preview = document.getElementById('preview');
  const previewWrapper = document.getElementById('previewWrapper');
  const templateSelect = document.getElementById('templateSelect');
  const inputFormat = document.getElementById('inputFormat');
  const btnCopy = document.getElementById('btnCopy');
  const btnExportHtml = document.getElementById('btnExportHtml');
  const btnImportFile = document.getElementById('btnImportFile');
  const btnClear = document.getElementById('btnClear');
  const deviceSelect = document.getElementById('deviceSelect');
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
  const editorPanel = document.querySelector('.editor-panel');
  const previewPanel = document.querySelector('.preview-panel');
  const editorContainer = document.querySelector('.editor-container');
  const btnTogglePreviewVisibility = document.getElementById('btnTogglePreviewVisibility');
  const btnTogglePreviewPosition = document.getElementById('btnTogglePreviewPosition');

  // New toolbar elements
  const btnSave = document.getElementById('btnSave');
  const btnAiWriterToolbar = document.getElementById('btnAiWriterToolbar');
  const btnPublish = document.getElementById('btnPublish');
  const btnMore = document.getElementById('btnMore');
  const toolbarDropdown = document.getElementById('toolbarDropdown');
  const themeMenuLabel = document.getElementById('themeMenuLabel');
  const publishModal = document.getElementById('publishModal');
  const btnClosePublish = document.getElementById('btnClosePublish');
  const publishPreview = document.getElementById('publishPreview');
  const btnPublishCopy = document.getElementById('btnPublishCopy');
  const btnPublishExportHtml = document.getElementById('btnPublishExportHtml');
  const btnPublishExportPdf = document.getElementById('btnPublishExportPdf');
  let pendingTemplatePreview = null;

  // ===== Monaco Editor (initialized in index.html) =====
  let editor = window.editor || null;
  let _monacoDisposable = [];
  const pendingEditorChangeHandlers = [];

  function editorGetValue() { return editor ? editor.getValue() : ''; }
  function editorSetValue(v) { if (editor) editor.setValue(v); }
  function editorFocus() { if (editor) editor.focus(); }
  function bindEditorChange(handler) {
    const d = editor.onDidChangeModelContent(handler);
    _monacoDisposable.push(d);
    return d;
  }
  function editorOnChange(handler) {
    if (editor && editor.onDidChangeModelContent) {
      return bindEditorChange(handler);
    }
    pendingEditorChangeHandlers.push(handler);
    return { dispose: function() {} };
  }
  function editorOnScroll(handler) {
    if (editor && editor.onDidScrollChange) {
      const d = editor.onDidScrollChange(handler);
      _monacoDisposable.push(d);
      return d;
    }
    return { dispose: function() {} };
  }

  // ===== 状态 =====
  let currentHtml = '';
  const STORAGE_KEY = 'wechat-formatter-content';
  const STORAGE_FORMAT_KEY = 'wechat-formatter-format';
  const VERSIONS_KEY = 'wechat-formatter-versions';
  const ARTICLES_KEY = 'wechat-articles';
  const CUSTOM_TEMPLATES_KEY = 'wechat-custom-templates';
  const FAVORITES_KEY = 'wechat-template-favorites';
  const CUSTOM_STYLE_KEY = 'wechat-custom-style-config';
  const IDB_NAME = 'weedit-local-store';
  const IDB_VERSION = 1;
  const IDB_STORE = 'kv';
  const PERSISTENT_KEYS = [
    STORAGE_KEY,
    STORAGE_FORMAT_KEY,
    VERSIONS_KEY,
    ARTICLES_KEY,
    CUSTOM_TEMPLATES_KEY,
    FAVORITES_KEY,
    CUSTOM_STYLE_KEY,
  ];
  const PERSISTENT_LABELS = {
    [STORAGE_KEY]: '草稿',
    [STORAGE_FORMAT_KEY]: '格式',
    [VERSIONS_KEY]: '历史版本',
    [ARTICLES_KEY]: '文章库',
    [CUSTOM_TEMPLATES_KEY]: '自定义模板',
    [FAVORITES_KEY]: '模板收藏',
    [CUSTOM_STYLE_KEY]: '自定义样式',
  };
  const persistentCache = Object.create(null);
  let persistentDb = null;
  let persistentReady = false;

  function persistLocalStorage(key, value, label) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      const isQuota = e && e.name === 'QuotaExceededError';
      const prefix = label ? label + '保存失败' : '保存失败';
      showToast(isQuota ? `${prefix}：浏览器存储空间已满，请先导出或清理历史版本` : `${prefix}：${e.message || '浏览器拒绝写入'}`, 3600);
      return false;
    }
  }

  function getLocalStorageItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function removeLocalStorageItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* ignore */
    }
  }

  function openPersistentDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    });
  }

  function idbRequest(method, key, value) {
    return new Promise((resolve, reject) => {
      if (!persistentDb) {
        resolve(method === 'get' ? null : true);
        return;
      }
      const tx = persistentDb.transaction(IDB_STORE, method === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      let request;
      if (method === 'get') request = store.get(key);
      if (method === 'set') request = store.put(value, key);
      if (method === 'delete') request = store.delete(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    });
  }

  async function initPersistentStore() {
    try {
      persistentDb = await openPersistentDb();
    } catch (e) {
      persistentDb = null;
      console.warn('IndexedDB unavailable, falling back to localStorage:', e);
    }

    for (const key of PERSISTENT_KEYS) {
      const localValue = getLocalStorageItem(key);
      let dbValue = null;
      if (persistentDb) {
        try {
          dbValue = await idbRequest('get', key);
        } catch (e) {
          console.warn('Failed to read IndexedDB key:', key, e);
        }
      }

      if (dbValue !== null && dbValue !== undefined) {
        persistentCache[key] = dbValue;
      } else if (localValue !== null) {
        persistentCache[key] = localValue;
        if (persistentDb) {
          try {
            await idbRequest('set', key, localValue);
            removeLocalStorageItem(key);
          } catch (e) {
            console.warn('Failed to migrate key:', key, e);
          }
        }
      }
    }
    persistentReady = true;
  }

  function getPersistentItem(key) {
    if (Object.prototype.hasOwnProperty.call(persistentCache, key)) return persistentCache[key];
    return getLocalStorageItem(key);
  }

  function persistLargeItem(key, value, label) {
    persistentCache[key] = value;
    if (!persistentReady || !persistentDb) {
      return persistLocalStorage(key, value, label);
    }
    idbRequest('set', key, value).then(() => {
      removeLocalStorageItem(key);
    }).catch(e => {
      const prefix = label ? `${label}保存失败` : '保存失败';
      showToast(`${prefix}：IndexedDB 写入失败，请先导出备份后刷新重试`, 3600);
      console.warn('Failed to persist IndexedDB key:', key, e);
    });
    return true;
  }

  function removePersistentItem(key) {
    delete persistentCache[key];
    removeLocalStorageItem(key);
    if (persistentReady && persistentDb) {
      idbRequest('delete', key).catch(e => console.warn('Failed to delete IndexedDB key:', key, e));
      return;
    }
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  function getPersistentPayloadSize() {
    return PERSISTENT_KEYS.reduce((total, key) => {
      const value = getPersistentItem(key);
      return total + (value ? new Blob([String(value)]).size : 0);
    }, 0);
  }

  async function getStorageSummary() {
    const knownUsage = getPersistentPayloadSize();
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || knownUsage,
          quota: estimate.quota || 0,
          knownUsage,
        };
      } catch (e) {
        /* fall through */
      }
    }
    return { usage: knownUsage, quota: 0, knownUsage };
  }

  function refreshArticleStateAfterStorageChange() {
    ArticleManager._data = null;
    if (getPersistentItem(STORAGE_KEY) !== null) loadContent();
    initArticleManager();
    updatePreview();
    updateStats();
    if (activeTab) renderSidePanelContent(activeTab);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportLocalData() {
    saveContent();
    const items = {};
    PERSISTENT_KEYS.forEach(key => {
      const value = getPersistentItem(key);
      if (value !== null && value !== undefined) items[key] = value;
    });
    const backup = {
      app: 'WeEdit',
      type: 'local-content-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
    };
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`weedit-backup-${date}.json`, backup);
    showToast('本地文章数据已导出');
  }

  function importLocalDataFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        const items = backup && backup.items;
        if (!items || typeof items !== 'object') throw new Error('invalid backup');
        if (!confirm('导入备份会覆盖当前草稿、文章库、历史版本和自定义模板，确定继续吗？')) return;

        PERSISTENT_KEYS.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(items, key)) {
            persistLargeItem(key, String(items[key]), PERSISTENT_LABELS[key]);
          } else {
            removePersistentItem(key);
          }
        });
        refreshArticleStateAfterStorageChange();
        showToast('本地文章数据已恢复');
      } catch (e) {
        showToast('备份文件无效，导入失败');
      }
    };
    reader.onerror = () => showToast('备份文件读取失败');
    reader.readAsText(file);
  }

  function importLocalData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) importLocalDataFromFile(input.files[0]);
    }, { once: true });
    input.click();
  }

  function clearLocalData() {
    if (!confirm('确定清空本地草稿、文章库、历史版本和自定义模板吗？此操作不可撤销。')) return;
    PERSISTENT_KEYS.forEach(removePersistentItem);
    ArticleManager._data = { current: null, articles: {} };
    editorSetValue('');
    inputFormat.value = 'markdown';
    updatePreview();
    updateStats();
    if (activeTab) renderSidePanelContent(activeTab);
    showToast('本地文章数据已清空');
  }

  // ===== 自动保存 / 恢复 =====
  const STORAGE_TARGET_KEY = 'wechat-formatter-target';

  function saveContent() {
    const okContent = persistLargeItem(STORAGE_KEY, editor.getValue(), '草稿');
    const okFormat = persistLargeItem(STORAGE_FORMAT_KEY, inputFormat.value, '格式');
    autoSaveVersion();
    if (okContent && okFormat) showSaveIndicator();
  }

  function showSaveIndicator() {
    if (!saveIndicator) return;
    saveIndicator.textContent = '已保存';
    saveIndicator.classList.add('show');
    setTimeout(() => saveIndicator.classList.remove('show'), 1500);
  }

  // Monaco helpers
  function indexToMonacoPos(idx) {
    if (!editor || !editor.getModel) return { lineNumber: 1, column: 1 };
    const model = editor.getModel();
    if (!model) return { lineNumber: 1, column: 1 };
    const lines = model.getLinesContent();
    let remaining = idx;
    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length + 1;
      if (remaining < lineLen) {
        return { lineNumber: i + 1, column: remaining + 1 };
      }
      remaining -= lineLen;
    }
    const last = lines.length;
    return { lineNumber: last || 1, column: (lines[last - 1] || '').length + 1 };
  }
  function monacoPosToIndex(pos) {
    if (!editor || !editor.getModel) return 0;
    const model = editor.getModel();
    if (!model) return 0;
    const lines = model.getLinesContent();
    let idx = 0;
    for (let i = 0; i < pos.lineNumber - 1 && i < lines.length; i++) {
      idx += lines[i].length + 1;
    }
    idx += pos.column - 1;
    return idx;
  }
  function getEditorScrollable() {
    if (!editor || !editor.getDomNode) return null;
    return editor.getDomNode().querySelector('.monaco-scrollable-element') || editor.getDomNode();
  }

  function loadContent() {
    try {
      const saved = getPersistentItem(STORAGE_KEY);
      const savedFormat = getPersistentItem(STORAGE_FORMAT_KEY);
      if (saved !== null && saved.trim()) {
        editorSetValue(saved);
        if (savedFormat) inputFormat.value = savedFormat;
        showToast('已恢复上次编辑的草稿');
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function clearStorage() {
    removePersistentItem(STORAGE_KEY);
    removePersistentItem(STORAGE_FORMAT_KEY);
  }

  // ===== 历史版本管理 =====
  const MAX_VERSIONS = 20;
  const AUTO_SAVE_INTERVAL = 5 * 60 * 1000; // 5分钟
  let lastVersionTime = 0;

  function getVersions() {
    try {
      const raw = getPersistentItem(VERSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function setVersions(list) {
    persistLargeItem(VERSIONS_KEY, JSON.stringify(list.slice(-MAX_VERSIONS)), '历史版本');
  }

  function saveVersion(manual = false) {
    const content = editor.getValue();
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
    editor.setValue(v.content);
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
    removePersistentItem(VERSIONS_KEY);
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
    const text = editor.getValue();
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

  // smartConvertTextToMarkdown 已移至 wechat-renderer.js（全局函数）

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

  function getCustomStyleConfig() {
    try {
      return JSON.parse(getPersistentItem(CUSTOM_STYLE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveCustomStyleConfig(config) {
    persistLargeItem(CUSTOM_STYLE_KEY, JSON.stringify(config || {}), '自定义样式');
  }

  function sanitizeCustomCss(css) {
    return String(css || '')
      .replace(/<\/style/gi, '<\\/style')
      .replace(/@import[^;]+;/gi, '')
      .replace(/url\s*\(\s*javascript:[^)]+\)/gi, '');
  }

  function applyCustomCssToHtml(html) {
    const config = getCustomStyleConfig();
    if (!config.enabled || !config.css || !String(config.css).trim()) return html;
    return `<style data-weedit-custom-style>${sanitizeCustomCss(config.css)}</style>${html}`;
  }

  // ===== 核心渲染 =====
  function updatePreview() {
    let content = editor.getValue();
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
      currentHtml = applyCustomCssToHtml(renderContent(content, fmt));
      preview.innerHTML = currentHtml;
      checkWechatCompatibility();
      updateOutline();
      annotatePreviewHeadings();
      highlightOutline();
      addCodeCopyButtons();
      // Render Mermaid diagrams asynchronously
      if (typeof renderMermaidDiagrams === 'function') renderMermaidDiagrams();
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
    const content = editor.getValue();
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

  function normalizeOutlineText(str) {
    return String(str || '').replace(/\s+/g, '').replace(/[#*_`]/g, '').trim();
  }

  function annotatePreviewHeadings() {
    if (!preview || outlineItems.length === 0) return;
    const candidates = Array.from(preview.querySelectorAll('div, span'))
      .filter(el => el.children.length === 0 && normalizeOutlineText(el.textContent));
    let start = 0;
    outlineItems.forEach((item, idx) => {
      const targetText = normalizeOutlineText(item.text);
      for (let i = start; i < candidates.length; i++) {
        if (normalizeOutlineText(candidates[i].textContent) === targetText) {
          candidates[i].dataset.previewHeadingIdx = String(idx);
          start = i + 1;
          break;
        }
      }
    });
  }

  function highlightOutline() {
    if (!outlineList || outlineItems.length === 0) return;
    const headings = preview.querySelectorAll('[data-preview-heading-idx]');
    if (!headings.length) return;
    let activeIdx = -1;
    const wrapperTop = previewWrapper.scrollTop;
    for (let i = 0; i < headings.length; i++) {
      const el = headings[i];
      if (el.offsetTop <= wrapperTop + 40) {
        activeIdx = Number(el.dataset.previewHeadingIdx);
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
      const idx = parseInt(item.dataset.idx, 10);
      const target = preview.querySelector(`[data-preview-heading-idx="${idx}"]`);
      if (target) {
        previewWrapper.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
      }
      // 同时滚动编辑器到对应行
      if (editor && editor.revealLineInCenter) {
        editor.revealLineInCenter(line + 1);
        editor.setPosition({ lineNumber: line + 1, column: 1 });
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
  async function copyRichHtml(html, successMessage) {
    try {
      if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([stripHtmlToText(html)], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ]);
      } else {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.style.position = 'fixed';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);
        const range = document.createRange();
        range.selectNodeContents(tempDiv);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
        document.body.removeChild(tempDiv);
      }
      showToast(successMessage || '已复制，可直接粘贴到微信公众号编辑器');
      return true;
    } catch (e) {
      showToast('复制失败，请使用导出 HTML 功能');
      return false;
    }
  }

  function stripHtmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  async function copyForWechat() {
    if (!currentHtml) {
      showToast('请先输入内容');
      return;
    }
    const wrapped = wrapForWechat(currentHtml);
    await copyRichHtml(wrapped, '已复制，可直接粘贴到微信公众号编辑器');
  }

  // ===== 导出 HTML =====
  function exportHtml() {
    if (!currentHtml) {
      showToast('请先输入内容');
      return;
    }
    const wrapped = wrapForWechat(currentHtml);
    htmlOutput.value = wrapped;
    openModal(htmlModal);
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
    const title = (editor.getValue().trim().split('\n')[0] || 'article').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, 30) || 'article';
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
    if (editor && editor.executeEdits) {
      editor.executeEdits('image', [{ range: editor.getSelection(), text: markdown }]);
      editor.focus();
    }
    updatePreview();
    saveContent();
    showToast('图片已插入');
  }

  function insertImageAsDataUrl(file, hideLoading) {
    if (file.size > 1024 * 1024) {
      showToast('图片将以 base64 写入，可能占用较多浏览器存储，建议配置图床', 3200);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (hideLoading) hideLoading();
      insertImageMarkdown(e.target.result);
    };
    reader.onerror = () => {
      if (hideLoading) hideLoading();
      showToast('图片读取失败');
    };
    reader.readAsDataURL(file);
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
    // 显示上传状态
    let overlay = document.getElementById('uploadLoading');
    if (!overlay && editorPanel) {
      overlay = document.createElement('div');
      overlay.id = 'uploadLoading';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      editorPanel.appendChild(overlay);
    }
    if (overlay) overlay.style.display = 'flex';
    const hideLoading = () => { if (overlay) overlay.style.display = 'none'; };

    const cfg = getImgBedConfig();
    if (cfg && cfg.url) {
      showToast('正在上传图片...');
      uploadImageToBed(file).then(url => {
        hideLoading();
        if (url) {
          insertImageMarkdown(url);
          showToast('图片已上传');
        } else {
          showToast('图床上传失败，已转为 base64');
          insertImageAsDataUrl(file);
        }
      }).catch(() => {
        hideLoading();
        showToast('图床上传失败，已转为 base64');
        insertImageAsDataUrl(file);
      });
      return;
    }
    insertImageAsDataUrl(file, hideLoading);
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
      editor.setValue(e.target.result);
      inputFormat.value = format;
      saveContent();
      updatePreview();
      updateStats();
      showToast(`已导入 ${file.name}`);
    };
    reader.readAsText(file);
  }

  // ===== 预览设备切换 =====
  function normalizePreviewDevice(value) {
    if (value === 'desktop') return 'desktop';
    if (value === 'tablet' || value === '744') return 'tablet';
    return 'phone';
  }

  function setPreviewDevice(value) {
    const device = normalizePreviewDevice(value);
    const widthMap = { phone: '390px', tablet: '744px', desktop: '100%' };
    const width = widthMap[device];
    preview.style.setProperty('--device-width', width);
    if (device === 'desktop') {
      preview.classList.add('desktop-mode');
      preview.classList.remove('device-mobile', 'device-tablet');
      // 桌面模式恢复大纲
      if (outlinePanel && !outlinePanel.classList.contains('open')) {
        outlinePanel.classList.add('open');
        if (btnToggleOutline) btnToggleOutline.classList.add('active');
      }
    } else {
      preview.classList.remove('desktop-mode');
      if (device === 'tablet') {
        preview.classList.add('device-tablet');
        preview.classList.remove('device-mobile');
      } else {
        preview.classList.add('device-mobile');
        preview.classList.remove('device-tablet');
      }
      // 手机/平板模式自动收起大纲，避免拥挤
      if (outlinePanel && outlinePanel.classList.contains('open')) {
        outlinePanel.classList.remove('open');
        if (btnToggleOutline) btnToggleOutline.classList.remove('active');
      }
    }
    if (deviceSelect) deviceSelect.value = device;
    localStorage.setItem('previewDevice', device);
  }

  // ===== 同步滚动 =====
  let isEditorScrolling = false;
  let isPreviewScrolling = false;
  let scrollRaf = null;

  function syncScrollRatio(sourceScrollTop, sourceScrollHeight, sourceClientHeight, target) {
    const max = sourceScrollHeight - sourceClientHeight;
    const ratio = max <= 0 ? 0 : sourceScrollTop / max;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (targetMax > 0) {
      target.scrollTop = ratio * targetMax;
    }
  }

  if (editor && editor.onDidScrollChange && previewWrapper) {
    editor.onDidScrollChange((e) => {
      if (isPreviewScrolling) return;
      isEditorScrolling = true;
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        syncScrollRatio(e.scrollTop, e.scrollHeight, editor.getLayoutInfo().height, previewWrapper);
        scrollRaf = null;
      });
      setTimeout(() => { isEditorScrolling = false; }, 80);
    });
    previewWrapper.addEventListener('scroll', () => {
      if (isEditorScrolling) return;
      isPreviewScrolling = true;
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        const max = previewWrapper.scrollHeight - previewWrapper.clientHeight;
        const ratio = max <= 0 ? 0 : previewWrapper.scrollTop / max;
        const editorHeight = editor.getLayoutInfo().height;
        const editorScrollHeight = editor.getScrollHeight();
        const editorMax = editorScrollHeight - editorHeight;
        if (editorMax > 0) {
          editor.setScrollTop(ratio * editorMax);
        }
        scrollRaf = null;
      });
      setTimeout(() => { isPreviewScrolling = false; }, 80);
    });
  }

  // ===== 事件绑定 =====
  let debounceTimer;
  let saveTimer;
  let lastContent = '';
  editorOnChange(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastContent = editorGetValue();
      updatePreview();
    }, 300);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveContent, 600);
    updateStats();
  });

  function ensurePaletteSelectOptions() {
    if (!templateSelect || typeof PALETTES === 'undefined') return;
    const existing = new Set(Array.from(templateSelect.options).map(opt => opt.value));
    let raphaelGroup = templateSelect.querySelector('optgroup[label="Raphael 30 套样式"]');
    Object.entries(PALETTES).forEach(([key, palette]) => {
      if (existing.has(key)) return;
      if (palette.source === 'Raphael') {
        if (!raphaelGroup) {
          raphaelGroup = document.createElement('optgroup');
          raphaelGroup.label = 'Raphael 30 套样式';
          templateSelect.appendChild(raphaelGroup);
        }
        raphaelGroup.appendChild(new Option(palette.label, key));
      } else {
        templateSelect.appendChild(new Option(palette.label, key));
      }
      existing.add(key);
    });
  }

  ensurePaletteSelectOptions();

  templateSelect.addEventListener('change', () => {
    setActivePalette(templateSelect.value);
    updatePreview();
  });
  inputFormat.addEventListener('change', () => {
    updatePreview();
  });

  if (btnCopy) btnCopy.addEventListener('click', copyForWechat);
  if (btnExportHtml) btnExportHtml.addEventListener('click', downloadHtml);
  if (btnViewHtml) {
    btnViewHtml.addEventListener('click', () => {
      if (!currentHtml) { showToast('请先输入内容'); return; }
      htmlOutput.value = wrapForWechat(currentHtml);
      openModal(htmlModal);
    });
  }
  if (btnImportFile) btnImportFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) importFile(e.target.files[0]);
    fileInput.value = '';
  });
  btnClear.addEventListener('click', () => {
    if (editor.getValue() && !confirm('确定清空所有内容吗？')) return;
    editor.setValue('');
    clearStorage();
    updatePreview();
    updateStats();
    editor.focus();
  });

  deviceSelect.addEventListener('change', (e) => setPreviewDevice(e.target.value));

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
    const val = editor.getValue();
    if (val !== lastContent) {
      lastContent = val;
      saveContent();
    }
  }, 30000);

  // Markdown 快捷工具栏
  function insertMarkdown(before, after = '', defaultText = '') {
    if (!editor) return;
    // Monaco Editor path
    if (editor.getModel && editor.getSelection) {
      const model = editor.getModel();
      const selection = editor.getSelection();
      const selectedText = model ? model.getValueInRange(selection) : '';
      if (selectedText) {
        editor.executeEdits('toolbar', [{ range: selection, text: before + selectedText + after }]);
      } else {
        const newText = before + defaultText + after;
        editor.executeEdits('toolbar', [{ range: selection, text: newText }]);
        // 选中新插入的默认文本以便替换
        const pos = editor.getPosition();
        const startCol = Math.max(1, pos.column - after.length - defaultText.length);
        const endCol = Math.max(1, pos.column - after.length);
        if (typeof monaco !== 'undefined') {
          editor.setSelection(new monaco.Range(pos.lineNumber, startCol, pos.lineNumber, endCol));
        }
      }
      editor.focus();
    } else {
      // fallback textarea
      const el = document.getElementById('editor-fallback');
      if (!el) return;
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
    const content = editor.getValue();
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
    editor.setValue(converted);
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
  let findResults = [];
  let findResultIdx = -1;

  function updateFindCount() {
    let countEl = document.getElementById('findCount');
    if (!countEl) {
      countEl = document.createElement('span');
      countEl.id = 'findCount';
      countEl.style.cssText = 'font-size:11px;color:var(--text-tertiary);flex-shrink:0;min-width:40px;text-align:right;';
      const closeBtn = document.getElementById('btnCloseFind');
      if (closeBtn && findBar) findBar.insertBefore(countEl, closeBtn);
    }
    if (findResults.length === 0) {
      countEl.textContent = findInput?.value ? '0/0' : '';
    } else {
      countEl.textContent = `${findResultIdx + 1}/${findResults.length}`;
    }
  }

  function buildFindResults() {
    const query = findInput ? findInput.value : '';
    findResults = [];
    findResultIdx = -1;
    if (!query) { updateFindCount(); return; }
    const text = editor.getValue();
    let pos = 0;
    while (true) {
      const idx = text.indexOf(query, pos);
      if (idx === -1) break;
      findResults.push(idx);
      pos = idx + 1;
    }
    updateFindCount();
  }

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
    findResults = [];
    findResultIdx = -1;
    const countEl = document.getElementById('findCount');
    if (countEl) countEl.textContent = '';
  }

  function setEditorSelection(start, end) {
    if (editor && editor.getModel) {
      const startPos = indexToMonacoPos(start);
      const endPos = indexToMonacoPos(end);
      if (typeof monaco !== 'undefined') {
        editor.setSelection(new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column));
      }
      editor.revealPosition(startPos);
      editor.focus();
    } else {
      const el = document.getElementById('editor-fallback');
      if (el) {
        el.selectionStart = start;
        el.selectionEnd = end;
        el.focus();
      }
    }
  }

  function findNext() {
    const query = findInput ? findInput.value : '';
    const text = editor.getValue();
    if (!query || !text) return;
    if (findResults.length === 0) buildFindResults();
    if (findResults.length === 0) return;
    findResultIdx = (findResultIdx + 1) % findResults.length;
    lastFindIndex = findResults[findResultIdx];
    setEditorSelection(lastFindIndex, lastFindIndex + query.length);
    updateFindCount();
  }
  function findPrev() {
    const query = findInput ? findInput.value : '';
    const text = editor.getValue();
    if (!query || !text) return;
    if (findResults.length === 0) buildFindResults();
    if (findResults.length === 0) return;
    findResultIdx = findResultIdx <= 0 ? findResults.length - 1 : findResultIdx - 1;
    lastFindIndex = findResults[findResultIdx];
    setEditorSelection(lastFindIndex, lastFindIndex + query.length);
    updateFindCount();
  }
  function replaceCurrent() {
    const query = findInput ? findInput.value : '';
    const replacement = replaceInput ? replaceInput.value : '';
    const text = editorGetValue();
    if (!query || !text || lastFindIndex === -1) return;
    let selected = '';
    if (editor.getModel) {
      selected = editor.getModel().getValueInRange(editor.getSelection());
    } else {
      const el = document.getElementById('editor-fallback');
      if (el) selected = el.value.slice(el.selectionStart, el.selectionEnd);
    }
    if (selected !== query) {
      findNext();
      return;
    }
    if (editor.executeEdits) {
      editor.executeEdits('find', [{ range: editor.getSelection(), text: replacement }]);
    }
    lastFindIndex = lastFindIndex + replacement.length;
    updatePreview();
    updateStats();
    saveContent();
  }
  function replaceAll() {
    const query = findInput ? findInput.value : '';
    const replacement = replaceInput ? replaceInput.value : '';
    const text = editor.getValue();
    if (!query || !text) return;
    const newText = text.split(query).join(replacement);
    if (newText === text) return;
    editor.setValue(newText);
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
      if (e.key === 'Enter') { e.preventDefault(); buildFindResults(); findNext(); }
      if (e.key === 'Escape') { closeFindBar(); }
    });
    findInput?.addEventListener('input', () => { buildFindResults(); });
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
      openModal(historyModal);
    });
    document.getElementById('btnCloseHistory')?.addEventListener('click', () => {
      closeModal(historyModal);
    });
    document.getElementById('btnSaveVersion')?.addEventListener('click', () => {
      saveVersion(true);
      renderHistoryList();
    });
    document.getElementById('btnClearHistory')?.addEventListener('click', clearAllVersions);
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) closeModal(historyModal);
    });
    if (historyList) {
      historyList.addEventListener('click', (e) => {
        const restoreBtn = e.target.closest('[data-restore]');
        const deleteBtn = e.target.closest('[data-delete]');
        if (restoreBtn) {
          restoreVersion(Number(restoreBtn.dataset.restore));
          closeModal(historyModal);
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
      openModal(imageBedModal);
    });
    document.getElementById('btnCloseImageBed')?.addEventListener('click', () => {
      closeModal(imageBedModal);
    });
    imageBedModal.addEventListener('click', (e) => {
      if (e.target === imageBedModal) closeModal(imageBedModal);
    });
    document.getElementById('btnSaveImageBed')?.addEventListener('click', () => {
      setImgBedConfig({
        url: imgBedUrl.value.trim(),
        field: imgBedField.value.trim() || 'file',
        path: imgBedPath.value.trim() || 'data.url',
        auth: imgBedAuth.value.trim(),
      });
      showToast('图床配置已保存');
      closeModal(imageBedModal);
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

  // ===== AI 助手 =====
  const aiWriterModal = document.getElementById('aiWriterModal');
  const aiChatMessages = document.getElementById('aiChatMessages');
  const aiChatInput = document.getElementById('aiChatInput');
  const btnAiSend = document.getElementById('btnAiSend');
  const btnAiStop = document.getElementById('btnAiStop');
  const btnAiInsert = document.getElementById('btnAiInsert');
  const btnAiNewTopic = document.getElementById('btnAiNewTopic');
  const aiErrorBanner = document.getElementById('aiErrorBanner');
  const aiFuncGrid = document.getElementById('aiFuncGrid');
  const aiConfigStatus = document.getElementById('aiConfigStatus');

  let aiConversation = [];
  let aiPhase = 'idle'; // idle | chatting | generated
  let aiCurrentFunc = null;
  let aiGeneratedContent = '';
  let aiAbortController = null;
  let aiStreamingBubble = null;

  // Function card system prompts
  const AI_FUNC_PROMPTS = {
    article: {
      icon: '✍️', label: '生成文章',
      placeholder: '描述你想写的文章话题...',
      system: `你是微信公众号文章写作专家。用户会描述想写的文章话题，请先生成一个简洁的文章大纲（使用 Markdown，## 作节标题），然后用户确认后展开为完整文章。
要求：大纲包含 3-5 个章节，开头第一行用 # 加文章标题。文风亲切自然，适合移动端阅读。`,
    },
    polish: {
      icon: '✨', label: '润色文章',
      placeholder: '粘贴需要润色的文章内容，或描述润色要求...',
      system: `你是一位资深的文字编辑。用户会给你一篇文章或段落，请对其进行润色优化。
要求：
- 保持原文核心意思不变
- 优化语言表达，使其更加流畅优美
- 修正语法错误和不通顺的地方
- 适当调整段落结构增强可读性
- 输出润色后的完整文本（Markdown 格式）`,
    },
    continue: {
      icon: '📝', label: '续写文章',
      placeholder: '粘贴已有文章内容，AI 将为你续写...',
      system: `你是一位优秀的文章作者。用户会给你一篇文章的前半部分，请自然地续写下去。
要求：
- 保持与前文一致的文风和语气
- 内容逻辑连贯，过渡自然
- 使用 Markdown 格式
- 续写长度约 300-500 字`,
    },
    css: {
      icon: '🎨', label: '生成CSS',
      placeholder: '描述你想要的样式效果...',
      system: `你是一位CSS专家。用户会描述想要实现的视觉效果，请生成对应的CSS代码。
要求：
- 生成可在微信公众号中使用的内联CSS样式
- 考虑微信渲染器的兼容性
- 输出简洁优雅的CSS代码`,
    },
    translate: {
      icon: '🌐', label: '翻译内容',
      placeholder: '粘贴需要翻译的内容，或说明翻译方向（如：翻译为英文）...',
      system: `你是一位专业翻译。请将用户给出的内容翻译为目标语言。
要求：
- 保持原文的语气和风格
- 翻译准确流畅
- 如用户未指定目标语言，默认翻译为中文（如果原文是外文）或英文（如果原文是中文）`,
    },
    summary: {
      icon: '📋', label: '生成摘要',
      placeholder: '粘贴需要生成摘要的文章内容...',
      system: `你是一位内容分析专家。请为用户给出的文章生成一个精炼的摘要。
要求：
- 摘要控制在 100-200 字
- 提炼核心观点和关键信息
- 语言简洁有力
- 使用 Markdown 格式输出`,
    },
    explain: {
      icon: '💡', label: '解释说明',
      placeholder: '粘贴需要解释的内容或提出问题...',
      system: `你是一位知识渊博的解释专家。请用通俗易懂的语言解释用户给出的概念、代码或文本。
要求：
- 使用类比和举例帮助理解
- 分层次解释，从简单到深入
- 使用 Markdown 格式，适当用 **加粗** 和列表
- 如果是代码，逐行解释关键部分`,
    },
    cover: {
      icon: '🖼️', label: '生成封面',
      placeholder: '描述文章主题，AI 将生成封面图提示词...',
      system: `你是一位视觉设计专家。请根据用户的文章主题，生成一个适合微信公众号的封面图设计建议。
要求：
- 描述封面图的视觉元素、配色方案、排版建议
- 给出具体的图片描述（可用于 AI 绘图的 prompt）
- 考虑微信公众号封面的尺寸比例（2.35:1）
- 输出包含：设计风格、配色、主体元素、AI绘图提示词`,
    },
  };

  // Provider presets
  const AI_PROVIDER_PRESETS = {
    custom: { url: '', models: [] },
    siliconflow: { url: 'https://api.siliconflow.cn/v1/chat/completions', models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'] },
    zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4-flash', 'glm-4-plus', 'glm-4'] },
    openai: { url: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o-mini', 'gpt-4o'] },
    deepseek: { url: 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-chat', 'deepseek-reasoner'] },
  };

  const AI_FUNC_DESCRIPTIONS = {
    article: '根据主题生成完整初稿',
    polish: '优化表达与段落结构',
    continue: '按现有语气继续展开',
    css: '生成公众号内联样式',
    translate: '中英互译并保留语气',
    summary: '提炼核心观点和金句',
    explain: '把复杂内容讲清楚',
    cover: '输出封面设计提示词',
  };

  const AI_PROVIDER_HINTS = {
    custom: '自定义服务需要填写兼容 OpenAI Chat Completions 的接口地址。',
    siliconflow: 'SiliconFlow 可领取免费额度，填写 API Key 后即可使用推荐模型。',
    zhipu: '智谱 AI 适合中文写作和长文生成。',
    openai: 'OpenAI 模型质量稳定，请确认账号额度和网络可用。',
    deepseek: 'DeepSeek 适合写作、推理和代码相关任务。',
  };

  function enhanceAiModalLayout() {
    if (!aiWriterModal) return;

    aiWriterModal.querySelectorAll('.ai-tab').forEach(tab => {
      if (tab.querySelector('.ai-tab-icon')) return;
      const icon = tab.dataset.aitab === 'settings' ? '⚙' : '🤖';
      tab.innerHTML = `<span class="ai-tab-icon">${icon}</span><span>${tab.textContent.trim()}</span>`;
    });

    if (aiFuncGrid && !document.getElementById('aiPaneIntro')) {
      const intro = document.createElement('div');
      intro.className = 'ai-pane-intro';
      intro.id = 'aiPaneIntro';
      intro.innerHTML = '<strong>选择一个写作动作</strong><span>根据当前目标生成、润色、续写或整理内容</span>';
      aiFuncGrid.parentElement.insertBefore(intro, aiFuncGrid);
    }

    if (aiFuncGrid) {
      aiFuncGrid.querySelectorAll('.ai-func-card').forEach(card => {
        if (card.querySelector('.ai-func-desc')) return;
        const desc = document.createElement('span');
        desc.className = 'ai-func-desc';
        desc.textContent = AI_FUNC_DESCRIPTIONS[card.dataset.func] || '';
        card.appendChild(desc);
      });
    }

    const streamRow = aiWriterModal.querySelector('.ai-stream-row');
    const streamLabel = streamRow && streamRow.querySelector('.ai-stream-label');
    if (streamRow && streamLabel && !streamRow.querySelector('.ai-stream-copy')) {
      const copy = document.createElement('div');
      copy.className = 'ai-stream-copy';
      streamLabel.replaceWith(copy);
      copy.appendChild(streamLabel);
      const sub = document.createElement('span');
      sub.textContent = '开启后实时显示生成内容';
      copy.appendChild(sub);
      streamLabel.textContent = '流式输出';
    }

    if (aiChatInput && !aiWriterModal.querySelector('.ai-input-label')) {
      const label = document.createElement('label');
      label.className = 'ai-input-label';
      label.htmlFor = 'aiChatInput';
      label.textContent = '输入内容';
      aiChatInput.parentElement.insertBefore(label, aiChatInput);
      aiChatInput.rows = 4;
    }
    if (btnAiSend) btnAiSend.textContent = '生成内容';

    const settingsBody = aiWriterModal.querySelector('.ai-settings-body');
    if (settingsBody && !settingsBody.querySelector('.ai-settings-note')) {
      const note = document.createElement('div');
      note.className = 'ai-settings-note';
      note.textContent = 'API Key 仅保存在当前浏览器本地。切换服务商后会自动填入推荐接口和模型。';
      settingsBody.insertBefore(note, settingsBody.firstChild);
    }

    const provider = document.getElementById('aiProvider');
    if (provider && !document.getElementById('aiProviderHint')) {
      const hint = document.createElement('div');
      hint.id = 'aiProviderHint';
      hint.className = 'ai-provider-hint';
      provider.closest('.ai-setting-item')?.after(hint);
    }

    const apiKey = document.getElementById('aiApiKey');
    if (apiKey && !document.getElementById('btnToggleAiKey')) {
      const wrap = document.createElement('div');
      wrap.className = 'ai-key-input-wrap';
      apiKey.parentNode.insertBefore(wrap, apiKey);
      wrap.appendChild(apiKey);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btnToggleAiKey';
      btn.className = 'ai-key-toggle';
      btn.title = '显示或隐藏 API Key';
      btn.textContent = '👁';
      btn.addEventListener('click', () => {
        apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
      });
      wrap.appendChild(btn);
    }

    updateAiProviderHint();
  }

  function updateAiProviderHint() {
    const provider = document.getElementById('aiProvider');
    const hint = document.getElementById('aiProviderHint');
    if (provider && hint) hint.textContent = AI_PROVIDER_HINTS[provider.value] || AI_PROVIDER_HINTS.custom;
  }

  function getAiConfig() {
    try { return JSON.parse(localStorage.getItem('ai-writer-config') || '{}'); } catch { return {}; }
  }
  function setAiConfig(cfg) {
    localStorage.setItem('ai-writer-config', JSON.stringify(cfg));
  }

  function getResolvedModel() {
    const cfg = getAiConfig();
    const modelSelect = document.getElementById('aiModelSelect');
    if (modelSelect && modelSelect.value === 'custom') {
      const customInput = document.getElementById('aiCustomModel');
      return customInput ? customInput.value.trim() || 'glm-4-flash' : cfg.model || 'glm-4-flash';
    }
    return (modelSelect ? modelSelect.value : null) || cfg.model || 'glm-4-flash';
  }

  function loadAiConfig() {
    const cfg = getAiConfig();
    const urlInput = document.getElementById('aiApiUrl');
    const keyInput = document.getElementById('aiApiKey');
    const providerSel = document.getElementById('aiProvider');
    const modelSel = document.getElementById('aiModelSelect');
    const customModelRow = document.getElementById('aiCustomModelRow');
    const customModelInput = document.getElementById('aiCustomModel');
    const tempSlider = document.getElementById('aiTemperature');
    const tempValue = document.getElementById('aiTempValue');
    const maxTokensSlider = document.getElementById('aiMaxTokens');
    const maxTokensValue = document.getElementById('aiMaxTokensValue');
    const enableCb = document.getElementById('aiEnable');

    if (keyInput && cfg.apiKey) keyInput.value = cfg.apiKey;
    if (urlInput && cfg.apiUrl) urlInput.value = cfg.apiUrl;
    if (tempSlider) { tempSlider.value = cfg.temperature ?? 0.7; if (tempValue) tempValue.textContent = tempSlider.value; }
    if (maxTokensSlider) { maxTokensSlider.value = cfg.maxTokens ?? 4096; if (maxTokensValue) maxTokensValue.textContent = maxTokensSlider.value; }
    if (enableCb) enableCb.checked = cfg.enabled !== false;
    if (providerSel) providerSel.value = cfg.provider || 'custom';

    // Restore model selection
    if (modelSel && cfg.model) {
      const option = Array.from(modelSel.options).find(o => o.value === cfg.model);
      if (option) {
        modelSel.value = cfg.model;
      } else {
        modelSel.value = 'custom';
        if (customModelInput) customModelInput.value = cfg.model;
      }
    }
    if (modelSel && customModelRow) {
      customModelRow.style.display = modelSel.value === 'custom' ? 'flex' : 'none';
    }
    updateAiProviderHint();
    updateAiConfigStatus();
    updateAiErrorBanner();
  }

  function updateAiConfigStatus() {
    const cfg = getAiConfig();
    if (!aiConfigStatus) return;
    if (cfg.apiKey && cfg.apiUrl) {
      aiConfigStatus.textContent = '已配置（模型：' + (cfg.model || '未指定') + '）';
      aiConfigStatus.className = 'ai-config-status ok';
    } else {
      aiConfigStatus.textContent = '请先配置 API 地址和 Key';
      aiConfigStatus.className = 'ai-config-status error';
    }
  }

  function updateAiErrorBanner() {
    const cfg = getAiConfig();
    const enabled = cfg.enabled !== false;
    const configured = !!(cfg.apiKey && cfg.apiUrl);
    if (aiErrorBanner) aiErrorBanner.style.display = (!enabled || !configured) ? 'flex' : 'none';
    if (aiFuncGrid) {
      aiFuncGrid.querySelectorAll('.ai-func-card').forEach(c => {
        c.classList.toggle('disabled', !enabled || !configured);
      });
    }
  }

  // Tab switching
  function switchAiTab(tabId) {
    document.querySelectorAll('.ai-tab').forEach(t => t.classList.toggle('active', t.dataset.aitab === tabId));
    document.getElementById('aiPaneAssistant').style.display = tabId === 'assistant' ? 'flex' : 'none';
    document.getElementById('aiPaneSettings').style.display = tabId === 'settings' ? 'flex' : 'none';
  }

  function addAiMessage(role, content, actions) {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-' + role;
    div.textContent = content;
    if (actions && actions.length) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'ai-msg-actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-small';
        btn.textContent = a.label;
        btn.addEventListener('click', a.handler);
        actionsDiv.appendChild(btn);
      });
      div.appendChild(actionsDiv);
    }
    aiChatMessages.appendChild(div);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    return div;
  }

  function addAiTyping() {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-ai ai-typing-wrap';
    div.innerHTML = '<span class="ai-typing"><span></span><span></span><span></span></span>';
    aiChatMessages.appendChild(div);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    return div;
  }

  function removeAiTyping() {
    const el = aiChatMessages.querySelector('.ai-typing-wrap');
    if (el) el.remove();
  }

  function clearAiChat() {
    aiConversation = [];
    aiPhase = 'idle';
    aiCurrentFunc = null;
    aiGeneratedContent = '';
    aiAbortController = null;
    aiStreamingBubble = null;
    if (btnAiInsert) btnAiInsert.disabled = true;
    aiChatMessages.innerHTML = '';
    if (aiFuncGrid) {
      aiFuncGrid.querySelectorAll('.ai-func-card').forEach(c => c.classList.remove('active'));
    }
    if (aiFuncGrid) aiFuncGrid.style.display = 'grid';
    if (aiChatInput) aiChatInput.placeholder = '描述你想写的文章话题...';
  }

  function setAiStreaming(loading) {
    if (btnAiSend) btnAiSend.style.display = loading ? 'none' : 'inline-flex';
    if (btnAiStop) btnAiStop.style.display = loading ? 'inline-flex' : 'none';
    if (aiChatInput) aiChatInput.disabled = loading;
  }

  async function streamAiResponse(messages, onChunk, onDone, onError) {
    const cfg = getAiConfig();
    if (!cfg.apiKey || !cfg.apiUrl) {
      onError('请先在「设置」中配置 API 地址和 Key');
      return;
    }
    const useStream = document.getElementById('aiStreamToggle')?.checked ?? true;
    aiAbortController = new AbortController();
    try {
      const body = {
        model: cfg.model || 'glm-4-flash',
        messages: messages,
        temperature: cfg.temperature ?? 0.7,
        max_tokens: cfg.maxTokens ?? 4096,
      };
      if (useStream) body.stream = true;

      const res = await fetch(cfg.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(body),
        signal: aiAbortController.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) onError('API Key 无效，请检查设置');
        else if (res.status === 429) onError('请求过于频繁，请稍后重试');
        else onError(errData.error?.message || 'AI 服务错误（' + res.status + '）');
        return;
      }

      if (!useStream) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        onChunk(content);
        onDone(content);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) { fullContent += delta; onChunk(fullContent); }
          } catch { /* skip partial JSON */ }
        }
      }
      onDone(fullContent);
    } catch (err) {
      if (err.name === 'AbortError') {
        onDone(aiStreamingBubble ? aiStreamingBubble._streamedContent || '' : '');
      } else {
        onError('网络错误：' + err.message);
      }
    } finally {
      aiAbortController = null;
    }
  }

  function handleAiSend() {
    const text = aiChatInput.value.trim();
    if (!text) return;
    const cfg = getAiConfig();
    if (!cfg.apiKey || !cfg.apiUrl) {
      showToast('请先在「设置」中配置 API 密钥');
      return;
    }

    addAiMessage('user', text);
    aiChatInput.value = '';
    aiChatInput.style.height = '36px';

    const funcDef = aiCurrentFunc ? AI_FUNC_PROMPTS[aiCurrentFunc] : null;
    const sysPrompt = funcDef ? funcDef.system : AI_FUNC_PROMPTS.article.system;
    aiConversation.push({ role: 'user', content: text });
    const msgs = [{ role: 'system', content: sysPrompt }, ...aiConversation];

    addAiTyping();
    setAiStreaming(true);

    streamAiResponse(msgs,
      (partial) => {
        removeAiTyping();
        if (!aiStreamingBubble) {
          const isArticle = aiCurrentFunc === 'article' || !aiCurrentFunc;
          aiStreamingBubble = addAiMessage('ai', '', isArticle ? [
            { label: '按此大纲生成文章', handler: () => handleAiConfirmOutline(aiStreamingBubble._streamedContent) },
            { label: '继续修改', handler: () => { aiChatInput.focus(); } },
          ] : [
            { label: '插入到编辑器', handler: () => { aiGeneratedContent = aiStreamingBubble._streamedContent; handleAiInsert(); } },
            { label: '继续对话', handler: () => { aiChatInput.focus(); } },
          ]);
        }
        aiStreamingBubble._streamedContent = partial;
        aiStreamingBubble.childNodes[0].textContent = partial;
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
      },
      (full) => {
        removeAiTyping();
        setAiStreaming(false);
        if (full && aiStreamingBubble) {
          aiStreamingBubble._streamedContent = full;
          aiConversation.push({ role: 'assistant', content: full });
        }
        aiStreamingBubble = null;
      },
      (err) => {
        removeAiTyping();
        setAiStreaming(false);
        aiStreamingBubble = null;
        addAiMessage('system', err);
      }
    );
  }

  function handleAiConfirmOutline(outlineText) {
    if (!outlineText) return;
    addAiMessage('system', '正在按大纲生成完整文章...');
    aiConversation.push({ role: 'user', content: '请按以上大纲生成完整文章' });
    const msgs = [{ role: 'system', content: `你是一位优秀的微信公众号文章作者。请根据用户确认的大纲，撰写一篇完整的微信公众号文章。
要求：使用 Markdown 格式，用 ## 作为章节标题，适当使用 > 引用块、**加粗**、列表和表格，文风亲切自然，每个章节 150-300 字，严格按大纲结构展开。` }, ...aiConversation];
    setAiStreaming(true);

    streamAiResponse(msgs,
      (partial) => {
        if (!aiStreamingBubble) aiStreamingBubble = addAiMessage('ai', '');
        aiStreamingBubble._streamedContent = partial;
        aiStreamingBubble.childNodes[0].textContent = partial;
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
      },
      (full) => {
        setAiStreaming(false);
        aiGeneratedContent = full;
        aiStreamingBubble = null;
        if (btnAiInsert) btnAiInsert.disabled = false;
        addAiMessage('system', '文章已生成，点击「插入到编辑器」即可使用。');
      },
      (err) => {
        setAiStreaming(false);
        aiStreamingBubble = null;
        addAiMessage('system', err);
      }
    );
  }

  function handleAiInsert() {
    if (!aiGeneratedContent) return;
    editor.setValue(aiGeneratedContent);
    inputFormat.value = 'markdown';
    updatePreview();
    updateStats();
    saveContent();
    closeModal(aiWriterModal);
    showToast('AI 内容已插入编辑器');
  }

  function handleAiFuncCard(funcId) {
    const funcDef = AI_FUNC_PROMPTS[funcId];
    if (!funcDef) return;
    const cfg = getAiConfig();
    if (!cfg.apiKey || !cfg.apiUrl) {
      showToast('请先在「设置」中配置 API 密钥');
      return;
    }
    if (cfg.enabled === false) {
      showToast('AI 功能已禁用，请在设置中启用');
      return;
    }

    aiCurrentFunc = funcId;
    aiConversation = [];
    aiPhase = 'chatting';
    aiGeneratedContent = '';
    if (aiFuncGrid) {
      aiFuncGrid.querySelectorAll('.ai-func-card').forEach(c => {
        c.classList.toggle('active', c.dataset.func === funcId);
      });
    }

    // For functions that need editor content, auto-prefill
    const editorContent = editor.getValue().trim();
    if (['polish', 'continue', 'translate', 'summary', 'explain'].includes(funcId) && editorContent) {
      aiChatInput.value = editorContent;
      aiChatInput.style.height = Math.min(aiChatInput.scrollHeight, 100) + 'px';
    } else {
      aiChatInput.value = '';
      aiChatInput.style.height = '36px';
    }
    aiChatInput.placeholder = funcDef.placeholder;
    aiChatMessages.innerHTML = '';
    if (aiFuncGrid) aiFuncGrid.style.display = 'none';

    addAiMessage('system', `${funcDef.icon} ${funcDef.label}模式 — ${funcDef.placeholder}`);
    setTimeout(() => aiChatInput.focus(), 100);
  }

  function handleSaveAiSettings() {
    const providerSel = document.getElementById('aiProvider');
    const urlInput = document.getElementById('aiApiUrl');
    const keyInput = document.getElementById('aiApiKey');
    const modelSel = document.getElementById('aiModelSelect');
    const customModelInput = document.getElementById('aiCustomModel');
    const tempSlider = document.getElementById('aiTemperature');
    const maxTokensSlider = document.getElementById('aiMaxTokens');
    const enableCb = document.getElementById('aiEnable');

    const apiUrl = urlInput ? urlInput.value.trim() : '';
    const apiKey = keyInput ? keyInput.value.trim() : '';
    if (!apiUrl || !apiKey) {
      showToast('请填写 API 地址和 Key');
      return;
    }

    const model = getResolvedModel();
    setAiConfig({
      apiUrl, apiKey, model,
      provider: providerSel ? providerSel.value : 'custom',
      temperature: tempSlider ? parseFloat(tempSlider.value) : 0.7,
      maxTokens: maxTokensSlider ? parseInt(maxTokensSlider.value) : 4096,
      enabled: enableCb ? enableCb.checked : true,
    });
    updateAiConfigStatus();
    updateAiErrorBanner();
    updateAiProviderHint();
    showToast('AI 配置已保存');
  }

  // AI writer event bindings
  if (aiWriterModal) {
    enhanceAiModalLayout();
    document.getElementById('btnAiWriter')?.addEventListener('click', () => {
      loadAiConfig();
      switchAiTab('assistant');
      openModal(aiWriterModal);
    });
    document.getElementById('btnCloseAiWriter')?.addEventListener('click', () => {
      if (aiAbortController) aiAbortController.abort();
      setAiStreaming(false);
      closeModal(aiWriterModal);
    });
    aiWriterModal.addEventListener('click', (e) => {
      if (e.target === aiWriterModal) {
        if (aiAbortController) aiAbortController.abort();
        setAiStreaming(false);
        closeModal(aiWriterModal);
      }
    });

    // Tab switching
    aiWriterModal.querySelectorAll('.ai-tab').forEach(tab => {
      tab.addEventListener('click', () => switchAiTab(tab.dataset.aitab));
    });

    // Go to settings from error banner
    document.getElementById('aiGoSettings')?.addEventListener('click', () => switchAiTab('settings'));

    // Function cards
    if (aiFuncGrid) {
      aiFuncGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.ai-func-card');
        if (card && !card.classList.contains('disabled')) {
          handleAiFuncCard(card.dataset.func);
        }
      });
    }

    // Send / Stop
    btnAiSend.addEventListener('click', handleAiSend);
    btnAiStop.addEventListener('click', () => {
      if (aiAbortController) aiAbortController.abort();
      setAiStreaming(false);
    });
    aiChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend(); }
    });
    aiChatInput.addEventListener('input', () => {
      aiChatInput.style.height = '36px';
      aiChatInput.style.height = Math.min(aiChatInput.scrollHeight, 100) + 'px';
    });
    btnAiInsert.addEventListener('click', handleAiInsert);
    btnAiNewTopic.addEventListener('click', () => {
      if (aiAbortController) aiAbortController.abort();
      setAiStreaming(false);
      clearAiChat();
    });

    // Settings: provider change → auto-fill URL & models
    document.getElementById('aiProvider')?.addEventListener('change', (e) => {
      const preset = AI_PROVIDER_PRESETS[e.target.value];
      const urlInput = document.getElementById('aiApiUrl');
      const modelSel = document.getElementById('aiModelSelect');
      if (preset && urlInput && preset.url) urlInput.value = preset.url;
      if (preset && modelSel && preset.models.length > 0) {
        // Update model dropdown options
        const customOpt = modelSel.querySelector('option[value="custom"]');
        modelSel.innerHTML = '';
        preset.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m; opt.textContent = m;
          modelSel.appendChild(opt);
        });
        if (customOpt) modelSel.appendChild(customOpt);
        modelSel.value = preset.models[0];
      }
      updateAiProviderHint();
    });

    document.getElementById('aiModelSelect')?.addEventListener('change', (e) => {
      const customRow = document.getElementById('aiCustomModelRow');
      if (customRow) customRow.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });

    document.getElementById('aiTemperature')?.addEventListener('input', (e) => {
      document.getElementById('aiTempValue').textContent = e.target.value;
    });
    document.getElementById('aiMaxTokens')?.addEventListener('input', (e) => {
      document.getElementById('aiMaxTokensValue').textContent = e.target.value;
    });

    document.getElementById('btnSaveAiConfig')?.addEventListener('click', handleSaveAiSettings);
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

  // Tab 键缩进（fallback textarea 模式）
  const fallbackEditor = document.getElementById('editor-fallback');
  if (fallbackEditor) {
    fallbackEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = fallbackEditor.selectionStart;
        const end = fallbackEditor.selectionEnd;
        const spaces = '  ';
        fallbackEditor.value = fallbackEditor.value.slice(0, start) + spaces + fallbackEditor.value.slice(end);
        fallbackEditor.selectionStart = fallbackEditor.selectionEnd = start + spaces.length;
        updatePreview();
        updateStats();
      }
    });
  }

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

  // 弹窗 + 焦点管理
  function trapFocus(modalEl) {
    const focusable = modalEl.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    modalEl.addEventListener('keydown', handler);
    modalEl._trapHandler = handler;
  }
  function releaseFocus(modalEl) {
    if (modalEl._trapHandler) {
      modalEl.removeEventListener('keydown', modalEl._trapHandler);
      delete modalEl._trapHandler;
    }
  }

  function openModal(modalEl) {
    modalEl.style.display = 'flex';
    trapFocus(modalEl.querySelector('.modal-content') || modalEl);
  }
  function closeModal(modalEl) {
    releaseFocus(modalEl.querySelector('.modal-content') || modalEl);
    modalEl.style.display = 'none';
  }
  btnCloseModal.addEventListener('click', () => closeModal(htmlModal));
  btnCopyHtml.addEventListener('click', copyHtmlCode);
  btnDownloadHtml.addEventListener('click', downloadHtml);
  htmlModal.addEventListener('click', (e) => { if (e.target === htmlModal) closeModal(htmlModal); });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        saveContent();
        showToast('已保存');
      }
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
      const inEditor = activeEl?.closest?.('#monaco-editor') || activeEl?.closest?.('.monaco-editor') || activeEl?.closest?.('#findInput') || activeEl?.closest?.('#replaceInput') || activeEl?.closest?.('#editor-fallback');
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
      closeModal(htmlModal);
    }
    if (e.key === 'Escape' && aiWriterModal && aiWriterModal.style.display !== 'none') {
      if (aiAbortController) aiAbortController.abort();
      setAiStreaming(false);
      closeModal(aiWriterModal);
    }
    if (e.key === 'Escape' && findBar && findBar.style.display !== 'none') {
      closeFindBar();
    }
    const templateModal = document.getElementById('templateModal');
    const shortcutsModal = document.getElementById('shortcutsModal');
    if (e.key === 'Escape' && templateModal && templateModal.style.display !== 'none') {
      closeModal(templateModal);
    }
    if (e.key === 'Escape' && shortcutsModal && shortcutsModal.style.display !== 'none') {
      closeModal(shortcutsModal);
    }
  });

  // ===== 写作模板 =====
  const TEMPLATES = [
    {
      icon: '📖',
      name: '教程攻略',
      desc: '分步骤教学类文章',
      category: '教育',
      coverColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      content: `# 标题：手把手教你 XXX\n\n> 📌 你将学到\n> - 知识点一\n> - 知识点二\n> - 知识点三\n\n一段引言，说明为什么这个教程有价值。\n\n## 为什么需要这个技能？\n\n背景介绍，解释学习这个技能的意义。\n\n## 准备工作\n\n开始之前需要准备的东西。\n\n- 工具一\n- 工具二\n- 基础知识\n\n## 第一步：基础操作\n\n详细讲解第一步的操作方法。\n\n## 第二步：进阶技巧\n\n在基础上进一步提升。\n\n## 第三步：实战演练\n\n通过一个实际案例巩固所学。\n\n> 💡 NOTE：这一步是关键，请仔细操作。\n\n## 常见问题\n\n| 问题 | 解决方案 |\n|------|----------|\n| 问题一 | 解决方法一 |\n| 问题二 | 解决方法二 |\n\n## 总结\n\n回顾本教程的要点，鼓励读者实践。\n\n> 好的教程不是让你看完，而是让你动手做 —— 某位导师\n`,
    },
    {
      icon: '🔍',
      name: '产品测评',
      desc: '产品对比与评测',
      category: '商业',
      coverColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      content: `# 标题：XXX 深度测评\n\n> 📌 你将学到\n> - 产品的核心功能\n> - 优缺点分析\n> - 是否值得购买\n\n一段引人入胜的开场，说明为什么测评这个产品。\n\n## 产品简介\n\n简单介绍产品的背景和定位。\n\n## 核心功能\n\n### 功能一\n\n功能描述和体验。\n\n### 功能二\n\n功能描述和体验。\n\n### 功能三\n\n功能描述和体验。\n\n## 参数对比\n\n| 参数 | 本产品 | 竞品 A | 竞品 B |\n|------|--------|--------|--------|\n| 价格 | ¥xxx | ¥xxx | ¥xxx |\n| 性能 | 优秀 | 良好 | 一般 |\n| 易用性 | 简单 | 中等 | 复杂 |\n\n## 前后对比\n\n| 之前 | 之后 |\n|------|------|\n| 使用旧方案的体验 | 使用本产品的体验 |\n\n## 优点与不足\n\n**优点：**\n\n- 优点一\n- 优点二\n- 优点三\n\n**不足：**\n\n- 不足一\n- 不足二\n\n> ✅ TIP：如果你是 XX 类型的用户，这款产品非常适合你。\n\n## 总结\n\n综合评价和购买建议。\n`,
    },
    {
      icon: '📝',
      name: '读书笔记',
      desc: '书籍阅读总结',
      category: '生活',
      coverColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      content: `# 标题：《XXX》读书笔记\n\n一句话推荐这本书。\n\n## 基本信息\n\n- 书名：《XXX》\n- 作者：XXX\n- 类型：XXX\n- 推荐指数：★★★★☆\n\n## 这本书讲了什么？\n\n简要概述全书的核心观点。\n\n## 核心观点\n\n### 观点一：标题\n\n作者的主要论点和你的思考。\n\n> 原文金句引用 —— 作者名\n\n### 观点二：标题\n\n作者的主要论点和你的思考。\n\n### 观点三：标题\n\n作者的主要论点和你的思考。\n\n## 最触动我的 3 句话\n\n1. 「第一句金句」\n2. 「第二句金句」\n3. 「第三句金句」\n\n## 我的思考\n\n结合自身经历，谈谈这本书给你带来的启发。\n\n## 行动清单\n\n- [ ] 行动一\n- [ ] 行动二\n- [ ] 行动三\n\n## 推荐理由\n\n总结为什么推荐（或不推荐）这本书。\n\n> 读书不是为了记住，而是为了改变 —— 某位智者\n`,
    },
    {
      icon: '🍳',
      name: '美食探店',
      desc: '餐厅或美食体验',
      category: '生活',
      coverColor: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      content: `# 标题：探店 XXX\n\n一句话引出今天的探店主题。\n\n## 基本信息\n\n- 店名：XXX\n- 地址：XXX\n- 人均：¥XX\n- 推荐指数：★★★★☆\n\n## 环境氛围\n\n描述餐厅的装修风格和氛围。\n\n## 菜品点评\n\n### 招牌菜一：菜名\n\n口感、味道、摆盘的详细描述。\n\n> 💡 NOTE：这道菜是必点，不会踩雷。\n\n### 招牌菜二：菜名\n\n口感、味道、摆盘的详细描述。\n\n### 招牌菜三：菜名\n\n口感、味道、摆盘的详细描述。\n\n## 菜品评分\n\n| 菜品 | 味道 | 卖相 | 性价比 |\n|------|------|------|--------|\n| 菜品一 | ★★★★★ | ★★★★ | ★★★★ |\n| 菜品二 | ★★★★ | ★★★★★ | ★★★ |\n| 菜品三 | ★★★ | ★★★★ | ★★★★★ |\n\n## 前后对比\n\n| 之前 | 之后 |\n|------|------|\n| 期待但不确定 | 实际体验感受 |\n\n## 总结\n\n综合评价和推荐建议。\n\n> 好的餐厅不只是吃饭，更是一种体验 —— 美食家\n`,
    },
    {
      icon: '💼',
      name: '职场经验',
      desc: '职场成长与分享',
      category: '商业',
      coverColor: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      content: `# 标题：工作 X 年，我学到的 X 条经验\n\n一段引发共鸣的开场白。\n\n## 背景\n\n简单介绍自己的职场经历。\n\n## 经验一：标题\n\n详细讲述这条经验背后的故事和教训。\n\n> ✅ TIP：这里有一个实用的建议。\n\n## 经验二：标题\n\n详细讲述这条经验背后的故事和教训。\n\n> 💡 NOTE：这个道理我花了很久才明白。\n\n## 经验三：标题\n\n详细讲述这条经验背后的故事和教训。\n\n## 常见误区\n\n| 误区 | 正确做法 |\n|------|----------|\n| 误区一 | 正确做法一 |\n| 误区二 | 正确做法二 |\n| 误区三 | 正确做法三 |\n\n## 我的行动清单\n\n1. 行动一\n2. 行动二\n3. 行动三\n\n## 写在最后\n\n鼓励读者的话。\n\n> 成长不是一蹴而就的，但每一步都算数 —— 某位前辈\n`,
    },
    {
      icon: '🎯',
      name: '方法论',
      desc: '通用方法论分享',
      category: '教育',
      coverColor: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      content: `# 标题：XXX 方法论\n\n> 📌 你将学到\n> - 方法的核心原理\n> - 具体实施步骤\n> - 实际应用案例\n\n一段引发读者兴趣的开场。\n\n## 什么是 XXX 方法？\n\n简要介绍方法的来源和定义。\n\n## 为什么有效？\n\n解释方法背后的原理。\n\n## 三步实施法\n\n1. **第一步：准备** — 描述需要做什么\n2. **第二步：执行** — 描述核心操作\n3. **第三步：复盘** — 描述如何总结\n\n## 实战案例\n\n通过一个具体例子展示方法的应用。\n\n> ⚠️ 注意：避免常见的错误做法。\n\n## 前后对比\n\n| 之前 | 之后 |\n|------|------|\n| 使用方法前的状态 | 使用方法后的效果 |\n\n## 适用场景\n\n- 场景一\n- 场景二\n- 场景三\n\n## 总结\n\n> 方法不在多，在于坚持用 —— 某位专家\n`,
    },
    {
      icon: '📰',
      name: '新闻评论',
      desc: '热点事件评论',
      category: '生活',
      coverColor: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      content: `# 标题：关于 XXX 事件，我是这样看的\n\n一段简短有力的观点。\n\n## 事件回顾\n\n客观描述事件的来龙去脉。\n\n## 各方观点\n\n### 观点 A\n\n描述第一种主流观点。\n\n### 观点 B\n\n描述第二种主流观点。\n\n### 观点 C\n\n描述第三种主流观点。\n\n## 我的分析\n\n### 核心问题\n\n这个事件的核心矛盾是什么。\n\n### 深层原因\n\n表象背后的深层原因。\n\n## 数据支撑\n\n| 指标 | 数据 |\n|------|------|\n| 数据一 | XX% |\n| 数据二 | XX% |\n\n## 我的观点\n\n清晰表达自己的立场和理由。\n\n> 观点金句 —— 作者\n\n## 延伸思考\n\n从这件事想到的更深层的问题。\n\n## 写在最后\n\n给读者的建议或反思。\n`,
    },
    {
      icon: '🏋️',
      name: '生活方式',
      desc: '生活分享与感悟',
      category: '生活',
      coverColor: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      content: `# 标题：关于 XXX 的一点感悟\n\n一段温柔的开场白。\n\n## 缘起\n\n是什么触发了这次思考。\n\n## 过程\n\n详细描述经历或感受。\n\n### 阶段一\n\n最初的感受和想法。\n\n### 阶段二\n\n中间的变化和发现。\n\n### 阶段三\n\n最终的感悟。\n\n## 我的改变\n\n1. 改变一：描述具体的改变\n2. 改变二：描述具体的改变\n3. 改变三：描述具体的改变\n\n> ✅ TIP：一个小建议。\n\n## 前后对比\n\n| 之前 | 之后 |\n|------|------|\n| 改变前的状态 | 改变后的状态 |\n\n## 写在最后\n\n> 生活不是等待暴风雨过去，而是学会在雨中跳舞 —— 佚名\n`,
    },
    {
      icon: '🔧',
      name: '技术科普',
      desc: '技术概念通俗解读',
      category: '科技',
      coverColor: 'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
      content: `# 标题：一文读懂 XXX\n\n> 📌 你将学到\n> - 概念的核心定义\n> - 工作原理\n> - 实际应用\n\n用一句话解释这个技术概念。\n\n## 什么是 XXX？\n\n用最通俗的语言解释这个概念。\n\n## 它是怎么工作的？\n\n用比喻和例子解释原理。\n\n1. **步骤一：输入** — 数据或信息如何进入\n2. **步骤二：处理** — 核心处理逻辑\n3. **步骤三：输出** — 最终结果\n\n## 有什么用？\n\n### 应用场景一\n\n具体的应用案例。\n\n### 应用场景二\n\n具体的应用案例。\n\n## 代码示例\n\n\`\`\`python\n# 一个简单的代码示例\ndef example():\n    print("Hello, World!")\n\`\`\`\n\n> 💡 NOTE：如果看不懂代码也没关系，理解概念就好。\n\n## 常见误解\n\n| 误解 | 真相 |\n|------|------|\n| 误解一 | 正确理解一 |\n| 误解二 | 正确理解二 |\n\n## 总结\n\n> 技术的本质是让复杂的事情变简单 —— 某位工程师\n`,
    },
    {
      icon: '💡',
      name: '观点输出',
      desc: '个人观点和见解',
      category: '生活',
      coverColor: 'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
      content: `# 标题：我为什么认为 XXX\n\n开门见山亮出观点。\n\n## 核心论点\n\n清晰阐述你的主要观点。\n\n## 论据一：事实\n\n用数据和事实支撑。\n\n## 论据二：逻辑\n\n从逻辑角度分析。\n\n## 论据三：案例\n\n用真实案例佐证。\n\n> 名言或金句 —— 出处\n\n## 反驳可能的质疑\n\n### 质疑一\n\n有人可能说……我的回应是……\n\n### 质疑二\n\n有人可能说……我的回应是……\n\n## 类比说明\n\n用读者熟悉的事物做类比。\n\n## 总结\n\n重申观点，号召行动。\n\n> 观点不必正确，但必须真诚 —— 佚名\n`,
    },
    {
      icon: '📊',
      name: '数据分析',
      desc: '数据驱动型文章',
      category: '商业',
      coverColor: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
      content: `# 标题：数据告诉你 XXX\n\n一段引人注目的数据开场。\n\n## 数据概览\n\n| 指标 | 数值 | 同比增长 |\n|------|------|----------|\n| 指标一 | XX万 | +XX% |\n| 指标二 | XX亿 | +XX% |\n| 指标三 | XX% | +XX% |\n\n## 趋势分析\n\n### 趋势一\n\n数据和解读。\n\n### 趋势二\n\n数据和解读。\n\n## 关键发现\n\n1. **发现一** — 详细解释\n2. **发现二** — 详细解释\n3. **发现三** — 详细解释\n\n> 💡 NOTE：数据来源说明。\n\n## 深层原因\n\n数据背后的原因分析。\n\n## 前后对比\n\n| 之前 | 之后 |\n|------|------|\n| 过去的状态 | 现在的状态 |\n\n## 对我们的启示\n\n- 启示一\n- 启示二\n- 启示三\n\n## 总结\n\n> 数据不会说谎，但也不会自己说话 —— 某位分析师\n`,
    },
    {
      icon: '🗓️',
      name: '年度总结',
      desc: '年终回顾与展望',
      category: '节日',
      coverColor: 'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
      content: `# 标题：2024 年度总结\n\n一段回顾性的开场。\n\n## 年度关键词\n\n用 3-5 个关键词概括这一年。\n\n## 重要时刻\n\n1. **时刻一：标题** — 简述发生了什么\n2. **时刻二：标题** — 简述发生了什么\n3. **时刻三：标题** — 简述发生了什么\n\n## 数据回顾\n\n| 维度 | 目标 | 实际 |\n|------|------|------|\n| 维度一 | XX | XX |\n| 维度二 | XX | XX |\n| 维度三 | XX | XX |\n\n## 最大的收获\n\n详细讲述这一年最大的收获。\n\n## 最大的遗憾\n\n坦诚面对不足。\n\n> ⚠️ 注意：这是我需要改进的地方。\n\n## 学到的三件事\n\n- 第一个教训\n- 第二个教训\n- 第三个教训\n\n## 明年的计划\n\n- [ ] 目标一\n- [ ] 目标二\n- [ ] 目标三\n- [ ] 目标四\n\n## 写在最后\n\n> 过去无法改变，未来值得期待 —— 佚名\n`,
    },
  ];

  // 模板弹窗
  const templateModal = document.getElementById('templateModal');
  const templateGrid = document.getElementById('templateGrid');
  if (templateModal && templateGrid) {
    // 渲染模板网格
    templateGrid.innerHTML = TEMPLATES.map((t, i) => `
      <div class="template-card" data-template="${i}">
        <div class="template-card-icon">${t.icon}</div>
        <div class="template-card-name">${t.name}</div>
        <div class="template-card-desc">${t.desc}</div>
      </div>
    `).join('');

    document.getElementById('btnTemplates')?.addEventListener('click', () => {
      openModal(templateModal);
    });
    document.getElementById('btnCloseTemplate')?.addEventListener('click', () => {
      closeModal(templateModal);
    });
    templateModal.addEventListener('click', (e) => {
      if (e.target === templateModal) closeModal(templateModal);
    });
    templateGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.template-card');
      if (!card) return;
      const idx = parseInt(card.dataset.template, 10);
      if (TEMPLATES[idx]) {
        if (editor.getValue().trim() && !confirm('使用模板将覆盖当前内容，确定吗？')) return;
        editor.setValue(TEMPLATES[idx].content);
        inputFormat.value = 'markdown';
        updatePreview();
        updateStats();
        saveContent();
        closeModal(templateModal);
        showToast('已加载模板：' + TEMPLATES[idx].name);
        editor.focus();
      }
    });
  }

  // ===== 快捷键弹窗 =====
  const shortcutsModal = document.getElementById('shortcutsModal');
  if (shortcutsModal) {
    document.getElementById('btnShortcuts')?.addEventListener('click', () => {
      openModal(shortcutsModal);
    });
    document.getElementById('btnCloseShortcuts')?.addEventListener('click', () => {
      closeModal(shortcutsModal);
    });
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) closeModal(shortcutsModal);
    });
  }

  // ===== 导出 PDF =====
  const btnExportPdf = document.getElementById('btnExportPdf');
  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', () => {
      if (!currentHtml) {
        showToast('请先输入内容');
        return;
      }
      window.print();
    });
  }

  // ===== 初始加载（等待 Monaco 就绪） =====
  function initApp() {
    editor = window.editor || null;
    while (editor && pendingEditorChangeHandlers.length) {
      bindEditorChange(pendingEditorChangeHandlers.shift());
    }
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
      editorSetValue(sampleMarkdown);
    }
    updatePreview();
    updateStats();

    // Auto-save to article manager on content change
    editorOnChange(scheduleArticleSave);
    editorOnChange(() => {
      if (activeTab === 'outline') renderOutlineTab();
    });
  }

  async function bootApp() {
    await initPersistentStore();
    initApp();
  }

  if (window._monacoReady) {
    bootApp();
  } else {
    document.addEventListener('monaco-ready', bootApp, { once: true });
  }

  // ===== Activity Bar + Side Panel =====
  const activityBar = document.getElementById('activityBar');
  const sidePanel = document.getElementById('sidePanel');
  const sidePanelTitle = document.getElementById('sidePanelTitle');
  const sidePanelContent = document.getElementById('sidePanelContent');
  const btnCloseSidePanel = document.getElementById('btnCloseSidePanel');
  let activeTab = 'articles';

  const TAB_TITLES = {
    articles: '文章管理',
    templates: '写作模板',
    outline: '文章大纲',
    history: '历史版本',
    images: '图片管理',
    styles: '样式编辑',
    settings: '设置',
  };

  function toggleSidePanel(tabId) {
    if (activeTab === tabId && sidePanel.classList.contains('open')) {
      sidePanel.classList.remove('open');
      document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
      activeTab = null;
      return;
    }
    activeTab = tabId;
    sidePanel.classList.add('open');
    sidePanelTitle.textContent = TAB_TITLES[tabId] || tabId;
    document.querySelectorAll('.activity-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    renderSidePanelContent(tabId);
  }

  function renderSidePanelContent(tabId) {
    if (!sidePanelContent) return;
    switch (tabId) {
      case 'articles': renderArticlesTab(); break;
      case 'templates': renderTemplatesTab(); break;
      case 'outline': renderOutlineTab(); break;
      case 'history': renderHistoryTab(); break;
      case 'images': renderImagesTab(); break;
      case 'styles': renderStylesTab(); break;
      case 'settings': renderSettingsTab(); break;
    }
  }

  if (btnCloseSidePanel) {
    btnCloseSidePanel.addEventListener('click', () => {
      sidePanel.classList.remove('open');
      document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
      activeTab = null;
    });
  }

  if (activityBar) {
    activityBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.activity-btn');
      if (!btn || !btn.dataset.tab) return;
      toggleSidePanel(btn.dataset.tab);
    });
  }

  // ===== Article Management =====
  const ArticleManager = {
    _data: null,
    _load() {
      if (this._data) return this._data;
      try {
        const raw = getPersistentItem(ARTICLES_KEY);
        this._data = raw ? JSON.parse(raw) : { current: null, articles: {} };
      } catch (e) {
        this._data = { current: null, articles: {} };
      }
      return this._data;
    },
    _save() {
      return persistLargeItem(ARTICLES_KEY, JSON.stringify(this._data), '文章库');
    },
    _genId() { return 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); },
    create(title) {
      const d = this._load();
      const id = this._genId();
      d.articles[id] = { id, title: title || '无标题文章', content: '', format: 'markdown', theme: templateSelect.value, updatedAt: Date.now() };
      d.current = id;
      this._save();
      return id;
    },
    save(id, updates) {
      const d = this._load();
      if (!d.articles[id]) return;
      Object.assign(d.articles[id], updates, { updatedAt: Date.now() });
      this._save();
    },
    list() {
      const d = this._load();
      return Object.values(d.articles).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    get(id) {
      const d = this._load();
      return d.articles[id] || null;
    },
    getCurrent() {
      const d = this._load();
      return d.current ? d.articles[d.current] : null;
    },
    setCurrent(id) {
      const d = this._load();
      if (d.articles[id]) { d.current = id; this._save(); }
    },
    delete(id) {
      const d = this._load();
      delete d.articles[id];
      if (d.current === id) {
        const remaining = Object.keys(d.articles);
        d.current = remaining.length > 0 ? remaining[0] : null;
      }
      this._save();
    },
    search(query) {
      const q = query.toLowerCase();
      return this.list().filter(a => a.title.toLowerCase().includes(q));
    },
  };

  // Initialize first article from existing content if needed
  function initArticleManager() {
    const current = ArticleManager.getCurrent();
    if (!current) {
      const existing = getPersistentItem(STORAGE_KEY);
      const id = ArticleManager.create(existing ? (existing.trim().split('\n')[0].slice(0, 30) || '无标题文章') : '无标题文章');
      if (existing && existing.trim()) {
        ArticleManager.save(id, { content: existing, format: getPersistentItem(STORAGE_FORMAT_KEY) || 'markdown' });
      }
    }
  }
  initArticleManager();

  // Save to article manager on auto-save
  const _origSaveContent = saveContent;
  // Override saveContent to also save to article manager
  const origSaveContent = window._saveContent || saveContent;

  function saveToArticle() {
    let cur = ArticleManager.getCurrent();
    if (!cur && editor.getValue().trim()) {
      const title = editor.getValue().trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 30) || '无标题文章';
      ArticleManager.create(title);
      cur = ArticleManager.getCurrent();
    }
    if (cur) {
      ArticleManager.save(cur.id, { content: editor.getValue(), format: inputFormat.value, theme: templateSelect.value });
    }
  }

  // Patch auto-save to include article management
  const _origAutoSave = autoSaveVersion;

  function renderArticlesTab() {
    const articles = ArticleManager.list();
    const current = ArticleManager.getCurrent();
    let html = `<button class="sp-btn" onclick="window._spNewArticle()">+ 新建文章</button>`;
    if (articles.length === 0) {
      html += `<div style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:13px;">暂无文章</div>`;
    } else {
      html += `<div class="sp-section-title">所有文章</div>`;
      articles.forEach(a => {
        const isActive = current && current.id === a.id;
        const time = new Date(a.updatedAt);
        const timeStr = `${(time.getMonth()+1).toString().padStart(2,'0')}-${time.getDate().toString().padStart(2,'0')} ${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}`;
        html += `<div class="sp-article-item${isActive ? ' active' : ''}" data-article-id="${a.id}" onclick="window._spSwitchArticle('${a.id}')">
          <span class="sp-article-title">${escapeHtml(a.title)}</span>
          <span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${timeStr}</span>
          <button class="sp-article-delete" onclick="event.stopPropagation();window._spDeleteArticle('${a.id}')" title="删除">&times;</button>
        </div>`;
      });
    }
    sidePanelContent.innerHTML = html;
  }

  window._spNewArticle = function() {
    if (editor.getValue().trim()) {
      // Save current first
      saveToArticle();
    }
    const id = ArticleManager.create('无标题文章');
    editor.setValue('');
    inputFormat.value = 'markdown';
    updatePreview();
    updateStats();
    renderArticlesTab();
    editor.focus();
  };

  window._spSwitchArticle = function(id) {
    const cur = ArticleManager.getCurrent();
    if (cur) {
      const title = editor.getValue().trim().split('\n')[0].slice(0, 30) || '无标题文章';
      ArticleManager.save(cur.id, { content: editor.getValue(), format: inputFormat.value, theme: templateSelect.value, title });
    }
    const article = ArticleManager.get(id);
    if (!article) return;
    ArticleManager.setCurrent(id);
    editor.setValue(article.content || '');
    if (article.format) inputFormat.value = article.format;
    if (article.theme) { templateSelect.value = article.theme; }
    updatePreview();
    updateStats();
    renderArticlesTab();
  };

  window._spDeleteArticle = function(id) {
    if (!confirm('确定删除这篇文章吗？')) return;
    ArticleManager.delete(id);
    const cur = ArticleManager.getCurrent();
    if (cur) {
      editor.setValue(cur.content || '');
      if (cur.format) inputFormat.value = cur.format;
      if (cur.theme) templateSelect.value = cur.theme;
    } else {
      editor.setValue('');
    }
    updatePreview();
    updateStats();
    renderArticlesTab();
  };

  function getTemplateVisual(category, name) {
    const text = `${category || ''} ${name || ''}`;
    if (/教育|学习|教程|方法/.test(text)) return 'education';
    if (/科技|技术|AI|代码|数据/.test(text)) return 'tech';
    if (/商业|职场|管理|增长/.test(text)) return 'business';
    if (/节日|年度|总结/.test(text)) return 'festival';
    if (/生活|旅行|观点|新闻/.test(text)) return 'life';
    return 'custom';
  }

  function renderTemplateIllustration(type) {
    return `<div class="tpl-illustration tpl-illustration-${type}">
      <span class="tpl-shape tpl-shape-a"></span>
      <span class="tpl-shape tpl-shape-b"></span>
      <span class="tpl-shape tpl-shape-c"></span>
      <span class="tpl-shape tpl-shape-d"></span>
    </div>`;
  }

  function renderTemplatesTab() {
    let customTemplates = [];
    let favorites = [];
    try {
      customTemplates = JSON.parse(getPersistentItem(CUSTOM_TEMPLATES_KEY) || '[]');
      favorites = JSON.parse(getPersistentItem(FAVORITES_KEY) || '[]');
    } catch (e) {}

    const categories = [
      { label: '全部', icon: '▦' },
      { label: '收藏', icon: '☆' },
      { label: '教育', icon: '⌂' },
      { label: '科技', icon: '⚙' },
      { label: '商业', icon: '▤' },
      { label: '节日', icon: '✦' },
      { label: '生活', icon: '☕' },
    ];
    const currentFilter = window._tplFilter || '全部';
    const searchQuery = (window._tplSearch || '').toLowerCase().trim();

    const allItems = [];
    TEMPLATES.forEach((t, i) => {
      allItems.push({ type: 'system', index: i, data: t });
    });
    customTemplates.forEach((t, i) => {
      allItems.push({ type: 'custom', index: i, data: t });
    });

    let filtered = allItems;
    if (currentFilter === '收藏') {
      filtered = allItems.filter(item => {
        const key = item.type === 'system' ? `s:${item.index}` : `c:${item.index}`;
        return favorites.includes(key);
      });
    } else if (currentFilter !== '全部') {
      filtered = allItems.filter(item => (item.data.category || '自定义') === currentFilter);
    }
    if (searchQuery) {
      filtered = filtered.filter(item => {
        const name = (item.data.name || '').toLowerCase();
        const desc = (item.data.desc || '').toLowerCase();
        return name.includes(searchQuery) || desc.includes(searchQuery);
      });
    }

    let html = `
      <div class="tpl-gallery-header">
        <div class="tpl-search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" class="tpl-search" placeholder="搜索模板..." value="${escapeHtml(searchQuery)}">
        </div>
      </div>
      <div class="tpl-categories">
        ${categories.map(c => `<button class="tpl-category-tab ${c.label === currentFilter ? 'active' : ''}" data-cat="${c.label}"><span>${c.icon}</span>${c.label}</button>`).join('')}
      </div>
      <button class="tpl-create-btn" onclick="window._spSaveCustomTemplate()">+ 新建模板</button>
      <div class="tpl-grid">
    `;

    if (filtered.length === 0) {
      html += `<div class="tpl-empty">暂无符合条件的模板</div>`;
    } else {
      filtered.forEach(item => {
        const t = item.data;
        const key = item.type === 'system' ? `s:${item.index}` : `c:${item.index}`;
        const isFav = favorites.includes(key);
        const category = t.category || '自定义';
        const visual = getTemplateVisual(category, t.name);
        const onclick = item.type === 'system' ? `window._spUseTemplate(${item.index})` : `window._spUseCustomTemplate(${item.index})`;
        const previewClick = `window._spPreviewTemplate('${item.type}', ${item.index})`;
        const delBtn = item.type === 'custom' ? `<button class="tpl-del-btn" onclick="event.stopPropagation();window._spDeleteCustomTemplate(${item.index})" title="删除"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : '';
        html += `
          <div class="tpl-card">
            <div class="tpl-card-cover tpl-cover-${visual}">
              ${renderTemplateIllustration(visual)}
              <span class="tpl-card-icon">${t.icon || '📝'}</span>
              <button class="tpl-fav-btn ${isFav ? 'active' : ''}" data-fav-key="${key}" title="收藏">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              </button>
              ${delBtn}
            </div>
            <div class="tpl-card-body">
              <div class="tpl-card-title">${escapeHtml(t.name)}</div>
              <div class="tpl-card-desc">${escapeHtml(t.desc || '')}</div>
              <div class="tpl-card-footer">
                <span class="tpl-card-tag">${category}</span>
                <div class="tpl-card-actions">
                  <button class="tpl-preview-btn" onclick="event.stopPropagation();${previewClick}">预览</button>
                  <button class="tpl-use-btn" onclick="${onclick}">使用</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    sidePanelContent.innerHTML = html;

    const searchInput = sidePanelContent.querySelector('.tpl-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        window._tplSearch = e.target.value;
        renderTemplatesTab();
      });
    }

    sidePanelContent.querySelectorAll('.tpl-category-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        window._tplFilter = btn.dataset.cat;
        renderTemplatesTab();
      });
    });

    sidePanelContent.querySelectorAll('.tpl-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.favKey;
        let favs = [];
        try { favs = JSON.parse(getPersistentItem(FAVORITES_KEY) || '[]'); } catch (e) {}
        if (favs.includes(key)) {
          favs = favs.filter(k => k !== key);
        } else {
          favs.push(key);
        }
        persistLargeItem(FAVORITES_KEY, JSON.stringify(favs), '模板收藏');
        renderTemplatesTab();
      });
    });
  }

  window._spSaveCustomTemplate = function() {
    const content = editor.getValue();
    if (!content.trim()) { showToast('内容为空，无法保存为模板'); return; }
    const name = prompt('请输入模板名称：', content.trim().split('\n')[0].slice(0, 30) || '自定义模板');
    if (!name) return;
    let customTemplates = [];
    try { customTemplates = JSON.parse(getPersistentItem(CUSTOM_TEMPLATES_KEY) || '[]'); } catch (e) {}
    customTemplates.push({
      name: name,
      content: content,
      format: inputFormat.value,
      theme: templateSelect.value,
      createdAt: Date.now(),
    });
    persistLargeItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customTemplates), '自定义模板');
    showToast('模板已保存：' + name);
    renderTemplatesTab();
  };

  function getCustomTemplates() {
    try { return JSON.parse(getPersistentItem(CUSTOM_TEMPLATES_KEY) || '[]'); } catch (e) { return []; }
  }

  function getTemplateItem(type, idx) {
    if (type === 'system') return TEMPLATES[idx] || null;
    if (type === 'custom') return getCustomTemplates()[idx] || null;
    return null;
  }

  function ensureTemplatePreviewModal() {
    let modal = document.getElementById('templatePreviewModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'templatePreviewModal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', '预览模板');
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:620px">
        <div class="modal-header">
          <div class="modal-title" id="templatePreviewTitle">预览模板</div>
          <button class="modal-close" id="btnCloseTemplatePreview"></button>
        </div>
        <div class="template-preview-body">
          <div class="template-preview-paper" id="templatePreviewPaper"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btnTemplatePreviewClose">关闭</button>
          <button class="btn btn-primary" id="btnTemplatePreviewUse">使用模板</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => closeModal(modal);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#btnCloseTemplatePreview').addEventListener('click', close);
    modal.querySelector('#btnTemplatePreviewClose').addEventListener('click', close);
    modal.querySelector('#btnTemplatePreviewUse').addEventListener('click', () => {
      if (!pendingTemplatePreview) return;
      close();
      if (pendingTemplatePreview.type === 'system') window._spUseTemplate(pendingTemplatePreview.idx);
      if (pendingTemplatePreview.type === 'custom') window._spUseCustomTemplate(pendingTemplatePreview.idx);
    });
    return modal;
  }

  window._spPreviewTemplate = function(type, idx) {
    const template = getTemplateItem(type, idx);
    if (!template) return;
    pendingTemplatePreview = { type, idx };
    const modal = ensureTemplatePreviewModal();
    const paper = modal.querySelector('#templatePreviewPaper');
    const title = modal.querySelector('#templatePreviewTitle');
    if (title) title.textContent = template.name || '预览模板';
    if (paper) paper.innerHTML = renderContent(template.content || '', template.format || 'markdown');
    openModal(modal);
  };

  window._spUseCustomTemplate = function(idx) {
    let customTemplates = getCustomTemplates();
    if (!customTemplates[idx]) return;
    if (editor.getValue().trim() && !confirm('使用模板将覆盖当前内容，确定吗？')) return;
    editor.setValue(customTemplates[idx].content);
    if (customTemplates[idx].format) inputFormat.value = customTemplates[idx].format;
    if (customTemplates[idx].theme) templateSelect.value = customTemplates[idx].theme;
    updatePreview();
    updateStats();
    saveContent();
    showToast('已加载模板：' + customTemplates[idx].name);
    editor.focus();
  };

  window._spDeleteCustomTemplate = function(idx) {
    let customTemplates = [];
    try { customTemplates = JSON.parse(getPersistentItem(CUSTOM_TEMPLATES_KEY) || '[]'); } catch (e) {}
    if (!customTemplates[idx]) return;
    if (!confirm('确定删除模板 "' + customTemplates[idx].name + '" 吗？')) return;
    customTemplates.splice(idx, 1);
    persistLargeItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(customTemplates), '自定义模板');
    renderTemplatesTab();
  };

  window._spUseTemplate = function(idx) {
    if (TEMPLATES[idx]) {
      if (editor.getValue().trim() && !confirm('使用模板将覆盖当前内容，确定吗？')) return;
      editor.setValue(TEMPLATES[idx].content);
      inputFormat.value = 'markdown';
      updatePreview();
      updateStats();
      saveContent();
      showToast('已加载模板：' + TEMPLATES[idx].name);
      editor.focus();
    }
  };

  function renderOutlineTab() {
    const content = editor.getValue();
    const lines = content.split('\n');
    const items = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        items.push({ line: i, text: match[2].replace(/[*`_]/g, '').trim(), level: match[1].length });
      }
    }
    if (items.length === 0) {
      sidePanelContent.innerHTML = `<div style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:13px;">暂无标题</div>`;
      return;
    }
    sidePanelContent.innerHTML = items.map((item, idx) =>
      `<div class="sp-list-item" style="padding-left:${10 + (item.level - 1) * 12}px" onclick="window._spGotoLine(${item.line})">${escapeHtml(item.text)}</div>`
    ).join('');
  }

  window._spGotoLine = function(line) {
    if (editor && editor.revealLineInCenter) {
      editor.revealLineInCenter(line + 1);
      editor.setPosition({ lineNumber: line + 1, column: 1 });
    }
    editorFocus();
  };

  function renderHistoryTab() {
    const versions = getVersions();
    let html = `<button class="sp-btn" onclick="window._spSaveVersion()">保存当前版本</button>`;
    if (versions.length === 0) {
      html += `<div style="text-align:center;color:var(--text-tertiary);padding:20px 0;font-size:13px;">暂无历史版本</div>`;
    } else {
      html += `<div class="sp-section-title">版本列表</div>`;
      versions.slice().reverse().forEach(v => {
        const time = new Date(v.timestamp);
        const timeStr = `${(time.getMonth()+1).toString().padStart(2,'0')}-${time.getDate().toString().padStart(2,'0')} ${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}`;
        html += `<div class="sp-list-item" onclick="window._spRestoreVersion(${v.id})">
          <span style="flex:1">${escapeHtml(v.title || '无标题')}</span>
          <span style="font-size:11px;color:var(--text-tertiary)">${timeStr}</span>
        </div>`;
      });
      html += `<button class="sp-btn" style="margin-top:12px;border-color:#f87171;color:#f87171" onclick="window._spClearHistory()">清空历史</button>`;
    }
    sidePanelContent.innerHTML = html;
  }

  window._spSaveVersion = function() { saveVersion(true); renderHistoryTab(); };
  window._spRestoreVersion = function(id) { restoreVersion(id); renderHistoryTab(); };
  window._spClearHistory = function() { clearAllVersions(); renderHistoryTab(); };

  function getActivePaletteKey() {
    return Object.keys(PALETTES).find(key => PALETTES[key] === TECH_PALETTE) || templateSelect.value || 'tech';
  }

  function renderPaletteSwatch(pal) {
    return `<span class="style-swatch" style="--c1:${pal.bgLight};--c2:${pal.primary};--c3:${pal.accent};--c4:${pal.textMain}"></span>`;
  }

  function renderStylesTab() {
    const p = TECH_PALETTE;
    const activeSubTab = window._styleTab || 'templates';
    const customStyle = getCustomStyleConfig();
    const tabs = [
      { id: 'templates', label: '模板' },
      { id: 'elements', label: '元素' },
      { id: 'css', label: 'CSS' },
    ];
    const colorFields = [
      { key: 'primary', label: '主色', value: p.primary },
      { key: 'accent', label: '强调色', value: p.accent },
      { key: 'pop', label: '亮色', value: p.pop },
      { key: 'bgLight', label: '浅背景', value: p.bgLight },
      { key: 'bgCard', label: '卡片背景', value: p.bgCard },
      { key: 'textMain', label: '主文字', value: p.textMain },
      { key: 'textSub', label: '副文字', value: p.textSub },
      { key: 'textMute', label: '弱文字', value: p.textMute },
      { key: 'border', label: '边框色', value: p.border },
    ];
    const spacingFields = [
      { key: '_lineHeight', label: '行高', value: (p._lineHeight || 1.75), min: 1.2, max: 2.5, step: 0.05 },
      { key: '_paraSpacing', label: '段间距', value: (p._paraSpacing || 16), min: 4, max: 40, step: 2 },
      { key: '_fontSize', label: '正文字号', value: (p._fontSize || 15), min: 12, max: 20, step: 1 },
      { key: '_h2Size', label: '二级标题', value: (p._h2Size || 20), min: 16, max: 28, step: 1 },
      { key: '_h3Size', label: '三级标题', value: (p._h3Size || 17), min: 14, max: 24, step: 1 },
    ];
    const builtIn = Object.entries(PALETTES).filter(([, pal]) => pal.source !== 'Raphael');
    const raphael = Object.entries(PALETTES).filter(([, pal]) => pal.source === 'Raphael');

    let html = `<div class="style-panel-head">
      <div class="style-panel-title">
        <span>自定义样式</span>
        <label class="ai-switch"><input type="checkbox" id="customStyleEnabled" ${customStyle.enabled !== false ? 'checked' : ''}><span class="ai-switch-slider"></span></label>
      </div>
      <div class="style-tabs">${tabs.map(tab => `<button class="style-tab ${tab.id === activeSubTab ? 'active' : ''}" data-style-tab="${tab.id}">${tab.label}</button>`).join('')}</div>
    </div>`;

    if (activeSubTab === 'templates') {
      html += `<div class="style-group-title">系统模板</div><div class="style-preset-list">`;
      builtIn.forEach(([key, pal]) => {
        const active = key === getActivePaletteKey();
        html += `<button class="style-preset-card ${active ? 'active' : ''}" onclick="window._spSetPalette('${key}')">
          ${renderPaletteSwatch(pal)}
          <span><strong>${escapeHtml(pal.label)}</strong><small>${escapeHtml(pal.description || '内置微信排版风格')}</small></span>
        </button>`;
      });
      html += `</div><div class="style-group-title">Raphael 30 套样式</div><div class="style-preset-list">`;
      raphael.forEach(([key, pal]) => {
        const active = key === getActivePaletteKey();
        html += `<button class="style-preset-card ${active ? 'active' : ''}" onclick="window._spSetPalette('${key}')">
          ${renderPaletteSwatch(pal)}
          <span><strong>${escapeHtml(pal.label)}</strong><small>${escapeHtml(pal.description || '')}</small></span>
        </button>`;
      });
      html += `</div>`;
    }

    if (activeSubTab === 'elements') {
      html += `<div class="style-group-title">颜色</div>`;
      colorFields.forEach(f => {
        html += `<div class="style-control-row">
          <label>${f.label}</label>
          <input type="color" value="${f.value}" data-style-color="${f.key}">
          <input class="sp-setting-input" value="${f.value}" data-style-text="${f.key}">
        </div>`;
      });
      html += `<div class="style-group-title">排版</div>`;
      spacingFields.forEach(f => {
        html += `<div class="style-range-row">
          <label>${f.label}<span data-style-val="${f.key}">${f.value}</span></label>
          <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.value}" data-style-range="${f.key}">
        </div>`;
      });
      html += `<div class="style-actions"><button class="sp-btn" onclick="window._spApplyStyles()">应用样式</button><button class="sp-btn danger" onclick="window._spResetStyles()">重置</button></div>`;
    }

    if (activeSubTab === 'css') {
      html += `<div class="style-css-card">
        <label class="sp-setting-label">自定义 CSS</label>
        <textarea id="customStyleCss" class="style-css-editor" spellcheck="false" placeholder=".preview-content p { letter-spacing: 0; }">${escapeHtml(customStyle.css || '')}</textarea>
        <div class="style-actions"><button class="sp-btn" onclick="window._spSaveCustomCss()">保存 CSS</button><button class="sp-btn danger" onclick="window._spClearCustomCss()">清空</button></div>
      </div>`;
    }

    sidePanelContent.innerHTML = html;

    sidePanelContent.querySelectorAll('.style-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        window._styleTab = btn.dataset.styleTab;
        renderStylesTab();
      });
    });
    document.getElementById('customStyleEnabled')?.addEventListener('change', (e) => {
      saveCustomStyleConfig({ ...getCustomStyleConfig(), enabled: e.target.checked });
      updatePreview();
    });
    sidePanelContent.querySelectorAll('[data-style-color]').forEach(colorInput => {
      const key = colorInput.dataset.styleColor;
      const textInput = sidePanelContent.querySelector(`[data-style-text="${key}"]`);
      colorInput.addEventListener('input', () => {
        if (textInput) textInput.value = colorInput.value;
        TECH_PALETTE[key] = colorInput.value;
        updatePreview();
      });
      if (textInput) {
        textInput.addEventListener('change', () => {
          colorInput.value = textInput.value;
          TECH_PALETTE[key] = textInput.value;
          updatePreview();
        });
      }
    });
    sidePanelContent.querySelectorAll('[data-style-range]').forEach(rangeInput => {
      const key = rangeInput.dataset.styleRange;
      const valSpan = sidePanelContent.querySelector(`[data-style-val="${key}"]`);
      rangeInput.addEventListener('input', () => {
        if (valSpan) valSpan.textContent = rangeInput.value;
        TECH_PALETTE[key] = parseFloat(rangeInput.value);
        updatePreview();
      });
    });
  }

  window._spSetPalette = function(name) {
    setActivePalette(name);
    ensurePaletteSelectOptions();
    templateSelect.value = name;
    updatePreview();
    renderStylesTab();
  };

  window._spApplyStyles = function() {
    updatePreview();
    showToast('样式已应用');
  };

  window._spResetStyles = function() {
    const name = templateSelect.value || 'tech';
    setActivePalette(name);
    updatePreview();
    renderStylesTab();
    showToast('样式已重置');
  };

  window._spSaveCustomCss = function() {
    const css = document.getElementById('customStyleCss')?.value || '';
    saveCustomStyleConfig({ ...getCustomStyleConfig(), enabled: true, css });
    updatePreview();
    renderStylesTab();
    showToast('自定义 CSS 已保存');
  };

  window._spClearCustomCss = function() {
    saveCustomStyleConfig({ ...getCustomStyleConfig(), css: '' });
    updatePreview();
    renderStylesTab();
    showToast('自定义 CSS 已清空');
  };

  function renderImagesTab() {
    let html = `<div class="sp-section-title">图片上传</div>`;
    html += `<button class="sp-btn" onclick="window._spUploadImage()">选择图片上传</button>`;
    html += `<input type="file" id="spImageInput" accept="image/*" style="display:none" onchange="window._spHandleImage(this)">`;
    html += `<div class="sp-section-title" style="margin-top:16px">图片设置</div>`;
    html += `<div style="font-size:12px;color:var(--text-tertiary);line-height:1.6">粘贴或拖拽图片到编辑器即可上传。<br>需先在"设置"中配置图床接口。</div>`;
    sidePanelContent.innerHTML = html;
  }

  window._spUploadImage = function() {
    const input = document.getElementById('spImageInput');
    if (input) input.click();
  };

  window._spHandleImage = function(input) {
    if (input.files && input.files[0]) {
      handleImageFile(input.files[0]);
    }
  };

  function renderSettingsTab() {
    const imgBedConfig = JSON.parse(localStorage.getItem('wechat-formatter-imgbed') || '{}');
    const aiConfig = JSON.parse(localStorage.getItem('ai-writer-config') || '{}');
    const syncConfig = JSON.parse(localStorage.getItem('wechat-formatter-sync') || '{}');

    let html = `<div class="sp-section-title">图床设置</div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">上传接口 URL</label><input class="sp-setting-input" id="spImgBedUrl" value="${escapeHtml(imgBedConfig.url || '')}" placeholder="https://sm.ms/api/v2/upload"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">文件字段名</label><input class="sp-setting-input" id="spImgBedField" value="${escapeHtml(imgBedConfig.field || '')}" placeholder="smfile"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">图片 URL 路径</label><input class="sp-setting-input" id="spImgBedPath" value="${escapeHtml(imgBedConfig.path || '')}" placeholder="data.url"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">Authorization</label><input class="sp-setting-input" type="password" autocomplete="off" id="spImgBedAuth" value="${escapeHtml(imgBedConfig.auth || '')}" placeholder="Bearer xxx"></div>`;

    html += `<div class="sp-section-title">AI 助手设置</div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">API 地址</label><input class="sp-setting-input" id="spAiApiUrl" value="${escapeHtml(aiConfig.apiUrl || '')}" placeholder="https://open.bigmodel.cn/api/paas/v4/chat/completions"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">API Key</label><input class="sp-setting-input" type="password" id="spAiApiKey" value="${escapeHtml(aiConfig.apiKey || '')}" placeholder="API Key"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">模型名称</label><input class="sp-setting-input" id="spAiModel" value="${escapeHtml(aiConfig.model || '')}" placeholder="glm-4-flash"></div>`;
    html += `<div style="font-size:11px;color:var(--text-tertiary);padding:0 4px;">详细设置请打开 AI 助手弹窗的「设置」标签</div>`;

    html += `<div class="sp-section-title">云端同步</div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">同步方式</label><select class="sp-setting-input" id="spSyncProvider"><option value="">关闭</option><option value="gist">GitHub Gist</option><option value="webdav">WebDAV</option></select></div>`;
    html += `<div id="spSyncGist" style="display:none">`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">GitHub Token</label><input class="sp-setting-input" type="password" id="spGistToken" value="${escapeHtml(syncConfig.gistToken || '')}" placeholder="ghp_xxx"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">Gist ID（留空则新建）</label><input class="sp-setting-input" id="spGistId" value="${escapeHtml(syncConfig.gistId || '')}" placeholder=""></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">文件名</label><input class="sp-setting-input" id="spGistFilename" value="${escapeHtml(syncConfig.gistFilename || 'wechat-article.md')}" placeholder="wechat-article.md"></div>`;
    html += `<div style="display:flex;gap:8px;margin-top:8px"><button class="sp-btn" style="flex:1" onclick="window._spSyncPush()">上传</button><button class="sp-btn" style="flex:1" onclick="window._spSyncPull()">下载</button></div>`;
    html += `</div>`;
    html += `<div id="spSyncWebdav" style="display:none">`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">WebDAV URL</label><input class="sp-setting-input" id="spWebdavUrl" value="${escapeHtml(syncConfig.webdavUrl || '')}" placeholder="https://dav.example.com/articles/"></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">用户名</label><input class="sp-setting-input" id="spWebdavUser" value="${escapeHtml(syncConfig.webdavUser || '')}" placeholder=""></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">密码</label><input class="sp-setting-input" type="password" id="spWebdavPass" value="${escapeHtml(syncConfig.webdavPass || '')}" placeholder=""></div>`;
    html += `<div class="sp-setting-row"><label class="sp-setting-label">文件名</label><input class="sp-setting-input" id="spWebdavFilename" value="${escapeHtml(syncConfig.webdavFilename || 'wechat-article.md')}" placeholder="wechat-article.md"></div>`;
    html += `<div style="display:flex;gap:8px;margin-top:8px"><button class="sp-btn" style="flex:1" onclick="window._spSyncPush()">上传</button><button class="sp-btn" style="flex:1" onclick="window._spSyncPull()">下载</button></div>`;
    html += `</div>`;
    html += `<div id="spSyncStatus" style="font-size:11px;color:var(--text-tertiary);margin-top:6px;min-height:16px"></div>`;

    html += `<div class="sp-section-title">本地存储</div>`;
    html += `<div class="sp-storage-card">
      <div class="sp-storage-line"><span>存储引擎</span><strong>${persistentDb ? 'IndexedDB' : 'localStorage 兜底'}</strong></div>
      <div class="sp-storage-line"><span>内容数据</span><strong id="spStorageUsage">计算中...</strong></div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;">文章库、草稿、历史版本和自定义模板保存在本机浏览器。图片较大时仍建议配置图床，避免正文过大。</div>
      <div class="sp-storage-actions">
        <button class="sp-btn" onclick="window._spExportLocalData()">导出备份</button>
        <button class="sp-btn" onclick="window._spImportLocalData()">导入备份</button>
      </div>
      <button class="sp-btn sp-storage-danger" style="margin-top:8px;width:100%" onclick="window._spClearLocalData()">清空本地文章数据</button>
    </div>`;

    html += `<button class="sp-btn" style="margin-top:8px" onclick="window._spSaveSettings()">保存设置</button>`;
    sidePanelContent.innerHTML = html;
    updateStorageUsage();

    // Restore sync provider selection and toggle visibility
    const spProvider = document.getElementById('spSyncProvider');
    if (spProvider) {
      spProvider.value = syncConfig.provider || '';
      spProvider.addEventListener('change', () => {
        const g = document.getElementById('spSyncGist');
        const w = document.getElementById('spSyncWebdav');
        if (g) g.style.display = spProvider.value === 'gist' ? 'block' : 'none';
        if (w) w.style.display = spProvider.value === 'webdav' ? 'block' : 'none';
      });
      spProvider.dispatchEvent(new Event('change'));
    }
  }

  async function updateStorageUsage() {
    const el = document.getElementById('spStorageUsage');
    if (!el) return;
    const summary = await getStorageSummary();
    if (!document.body.contains(el)) return;
    const known = formatBytes(summary.knownUsage);
    if (summary.quota) {
      el.textContent = `${known} 内容 / ${formatBytes(summary.quota)} 可用`;
    } else {
      el.textContent = `${known} 内容`;
    }
  }

  window._spExportLocalData = exportLocalData;
  window._spImportLocalData = importLocalData;
  window._spClearLocalData = clearLocalData;

  window._spSaveSettings = function() {
    const imgBed = {
      url: document.getElementById('spImgBedUrl')?.value || '',
      field: document.getElementById('spImgBedField')?.value || '',
      path: document.getElementById('spImgBedPath')?.value || '',
      auth: document.getElementById('spImgBedAuth')?.value || '',
    };
    localStorage.setItem('wechat-formatter-imgbed', JSON.stringify(imgBed));

    const existingAi = JSON.parse(localStorage.getItem('ai-writer-config') || '{}');
    const ai = {
      ...existingAi,
      apiUrl: document.getElementById('spAiApiUrl')?.value || '',
      apiKey: document.getElementById('spAiApiKey')?.value || '',
      model: document.getElementById('spAiModel')?.value || '',
    };
    localStorage.setItem('ai-writer-config', JSON.stringify(ai));

    const syncCfg = {
      provider: document.getElementById('spSyncProvider')?.value || '',
      gistToken: document.getElementById('spGistToken')?.value || '',
      gistId: document.getElementById('spGistId')?.value || '',
      gistFilename: document.getElementById('spGistFilename')?.value || 'wechat-article.md',
      webdavUrl: document.getElementById('spWebdavUrl')?.value || '',
      webdavUser: document.getElementById('spWebdavUser')?.value || '',
      webdavPass: document.getElementById('spWebdavPass')?.value || '',
      webdavFilename: document.getElementById('spWebdavFilename')?.value || 'wechat-article.md',
    };
    localStorage.setItem('wechat-formatter-sync', JSON.stringify(syncCfg));

    // Sync to AI modal settings inputs
    const aiApiUrl = document.getElementById('aiApiUrl');
    const aiApiKey = document.getElementById('aiApiKey');
    if (aiApiUrl) aiApiUrl.value = ai.apiUrl;
    if (aiApiKey) aiApiKey.value = ai.apiKey;

    const imgBedUrl = document.getElementById('imgBedUrl');
    const imgBedField = document.getElementById('imgBedField');
    const imgBedPath = document.getElementById('imgBedPath');
    const imgBedAuth = document.getElementById('imgBedAuth');
    if (imgBedUrl) imgBedUrl.value = imgBed.url;
    if (imgBedField) imgBedField.value = imgBed.field;
    if (imgBedPath) imgBedPath.value = imgBed.path;
    if (imgBedAuth) imgBedAuth.value = imgBed.auth;

    showToast('设置已保存');
  };

  // ===== Cloud Sync =====
  const Sync = {
    _status(msg) {
      const el = document.getElementById('spSyncStatus');
      if (el) el.textContent = msg;
    },
    _cfg() {
      return JSON.parse(localStorage.getItem('wechat-formatter-sync') || '{}');
    },
    // GitHub Gist
    async gistPush(token, gistId, filename, content) {
      const url = gistId ? `https://api.github.com/gists/${gistId}` : 'https://api.github.com/gists';
      const method = gistId ? 'PATCH' : 'POST';
      const body = JSON.stringify({
        description: 'WeChat Article synced from wechat-formatter',
        public: false,
        files: { [filename]: { content } }
      });
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.id;
    },
    async gistPull(token, gistId, filename) {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const file = data.files?.[filename];
      if (!file) throw new Error('文件未找到');
      return file.content;
    },
    // WebDAV
    async webdavPut(url, user, pass, filename, content) {
      const fullUrl = url.replace(/\/$/, '') + '/' + encodeURIComponent(filename);
      const res = await fetch(fullUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass))),
          'Content-Type': 'text/plain; charset=utf-8'
        },
        body: content
      });
      if (!res.ok && res.status !== 201 && res.status !== 204) throw new Error(`WebDAV ${res.status}`);
    },
    async webdavGet(url, user, pass, filename) {
      const fullUrl = url.replace(/\/$/, '') + '/' + encodeURIComponent(filename);
      const res = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)))
        }
      });
      if (!res.ok) throw new Error(`WebDAV ${res.status}`);
      return await res.text();
    },
    async push() {
      const cfg = this._cfg();
      const content = editorGetValue();
      if (!cfg.provider) { this._status('请先选择同步方式'); return; }
      this._status('正在上传...');
      try {
        if (cfg.provider === 'gist') {
          if (!cfg.gistToken) throw new Error('缺少 GitHub Token');
          const id = await this.gistPush(cfg.gistToken, cfg.gistId, cfg.gistFilename || 'wechat-article.md', content);
          if (!cfg.gistId && id) {
            cfg.gistId = id;
            localStorage.setItem('wechat-formatter-sync', JSON.stringify(cfg));
            const el = document.getElementById('spGistId');
            if (el) el.value = id;
          }
          this._status('已上传到 Gist ✓');
          showToast('已上传到 Gist');
        } else if (cfg.provider === 'webdav') {
          if (!cfg.webdavUrl) throw new Error('缺少 WebDAV URL');
          await this.webdavPut(cfg.webdavUrl, cfg.webdavUser, cfg.webdavPass, cfg.webdavFilename || 'wechat-article.md', content);
          this._status('已上传到 WebDAV ✓');
          showToast('已上传到 WebDAV');
        }
      } catch (e) {
        this._status('上传失败: ' + e.message);
        showToast('上传失败: ' + e.message);
      }
    },
    async pull() {
      const cfg = this._cfg();
      if (!cfg.provider) { this._status('请先选择同步方式'); return; }
      this._status('正在下载...');
      try {
        let content = '';
        if (cfg.provider === 'gist') {
          if (!cfg.gistToken || !cfg.gistId) throw new Error('缺少 Gist ID 或 Token');
          content = await this.gistPull(cfg.gistToken, cfg.gistId, cfg.gistFilename || 'wechat-article.md');
          this._status('已从 Gist 下载 ✓');
          showToast('已从 Gist 下载');
        } else if (cfg.provider === 'webdav') {
          if (!cfg.webdavUrl) throw new Error('缺少 WebDAV URL');
          content = await this.webdavGet(cfg.webdavUrl, cfg.webdavUser, cfg.webdavPass, cfg.webdavFilename || 'wechat-article.md');
          this._status('已从 WebDAV 下载 ✓');
          showToast('已从 WebDAV 下载');
        }
        if (content) {
          editorSetValue(content);
          updatePreview();
          updateStats();
        }
      } catch (e) {
        this._status('下载失败: ' + e.message);
        showToast('下载失败: ' + e.message);
      }
    }
  };

  window._spSyncPush = () => Sync.push();
  window._spSyncPull = () => Sync.pull();

  // Auto-save to article manager on content change
  let articleSaveTimer = null;
  function scheduleArticleSave() {
    clearTimeout(articleSaveTimer);
    articleSaveTimer = setTimeout(() => {
      saveToArticle();
      // Update article title from first line
      const cur = ArticleManager.getCurrent();
      if (cur) {
        const title = editor.getValue().trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 30) || '无标题文章';
        if (cur.title !== title) {
          ArticleManager.save(cur.id, { title });
          if (activeTab === 'articles') renderArticlesTab();
        }
      }
    }, 2000);
  }
  // Open default tab
  toggleSidePanel('articles');

  // ===== Command Palette =====
  const commandPalette = document.getElementById('commandPalette');
  const commandInput = document.getElementById('commandInput');
  const commandList = document.getElementById('commandList');
  const commandPaletteBackdrop = document.getElementById('commandPaletteBackdrop');
  let commandSelectedIdx = 0;
  let filteredCommands = [];

  function getCommands() {
    return [
      { id: 'copy-wechat', label: '复制到微信', icon: '📋', action: copyForWechat },
      { id: 'export-html', label: '导出 HTML', icon: '💾', action: exportHtml },
      { id: 'export-pdf', label: '导出 PDF', icon: '📄', action: () => window.print() },
      { id: 'view-source', label: '查看 HTML 源码', icon: '🔍', action: () => openModal(htmlModal) },
      { id: 'import-file', label: '导入文件', icon: '📂', action: () => fileInput.click() },
      { id: 'save', label: '保存内容', icon: '✅', shortcut: 'Ctrl+S', action: () => { saveContent(); showToast('已保存'); } },
      { id: 'find', label: '查找替换', icon: '🔎', shortcut: 'Ctrl+F', action: () => openFindBar() },
      { id: 'smart-format', label: '一键智能排版', icon: '🪄', shortcut: 'Ctrl+Shift+F', action: () => { smartFormat(); } },
      { id: 'sep1', type: 'separator' },
      { id: 'tab-articles', label: '侧栏：文章管理', icon: '📄', action: () => toggleSidePanel('articles') },
      { id: 'tab-templates', label: '侧栏：写作模板', icon: '📋', action: () => toggleSidePanel('templates') },
      { id: 'tab-outline', label: '侧栏：文章大纲', icon: '📑', action: () => toggleSidePanel('outline') },
      { id: 'tab-history', label: '侧栏：历史版本', icon: '🕐', action: () => toggleSidePanel('history') },
      { id: 'tab-settings', label: '侧栏：设置', icon: '⚙️', action: () => toggleSidePanel('settings') },
      { id: 'tab-styles', label: '侧栏：样式编辑', icon: '🎨', action: () => toggleSidePanel('styles') },
      { id: 'new-article', label: '新建文章', icon: '➕', action: () => window._spNewArticle() },
      { id: 'sep2', type: 'separator' },
      { id: 'theme-tech', label: '主题：科技深蓝', icon: '🔵', action: () => { templateSelect.value = 'tech'; updatePreview(); } },
      { id: 'theme-elegant', label: '主题：文艺雅致', icon: '🟤', action: () => { templateSelect.value = 'elegant'; updatePreview(); } },
      { id: 'theme-business', label: '主题：商务简约', icon: '⚫', action: () => { templateSelect.value = 'business'; updatePreview(); } },
      { id: 'theme-fresh', label: '主题：清新自然', icon: '🟢', action: () => { templateSelect.value = 'fresh'; updatePreview(); } },
      { id: 'theme-romantic', label: '主题：浪漫粉紫', icon: '🟣', action: () => { templateSelect.value = 'romantic'; updatePreview(); } },
      { id: 'theme-vibrant', label: '主题：活力橙黄', icon: '🟠', action: () => { templateSelect.value = 'vibrant'; updatePreview(); } },
      { id: 'theme-classic', label: '主题：古典墨绿', icon: '🍃', action: () => { templateSelect.value = 'classic'; updatePreview(); } },
      { id: 'theme-minimal', label: '主题：极简黑白', icon: '⬜', action: () => { templateSelect.value = 'minimal'; updatePreview(); } },
      { id: 'theme-warm', label: '主题：温暖焦糖', icon: '🟡', action: () => { templateSelect.value = 'warm'; updatePreview(); } },
      { id: 'sep3', type: 'separator' },
      { id: 'toggle-preview', label: '显示/隐藏预览', icon: '👁️', shortcut: 'Ctrl+P', action: togglePreviewVisibility },
      { id: 'toggle-preview-pos', label: '切换预览位置', icon: '↔️', shortcut: 'Ctrl+Shift+P', action: togglePreviewPosition },
      { id: 'toggle-preview-mode', label: '切换预览设备', icon: '📱', action: () => {
        const devices = ['phone', 'tablet', 'desktop'];
        const current = normalizePreviewDevice(deviceSelect?.value || 'phone');
        const idx = devices.indexOf(current);
        const next = devices[(idx + 1) % devices.length];
        setPreviewDevice(next);
      }},
      { id: 'shortcuts', label: '查看快捷键', icon: '⌨️', action: () => openModal(document.getElementById('shortcutsModal')) },
    ];
  }

  function openCommandPalette() {
    commandPalette.style.display = 'flex';
    commandInput.value = '';
    commandSelectedIdx = 0;
    filteredCommands = getCommands().filter(c => c.type !== 'separator');
    renderCommandList();
    commandInput.focus();
  }

  function closeCommandPalette() {
    commandPalette.style.display = 'none';
    commandInput.value = '';
  }

  function renderCommandList() {
    commandList.innerHTML = filteredCommands.map((cmd, idx) =>
      `<div class="command-item${idx === commandSelectedIdx ? ' selected' : ''}" data-cmd-idx="${idx}">
        <span class="cmd-icon">${cmd.icon || ''}</span>
        <span class="cmd-label">${cmd.label}</span>
        ${cmd.shortcut ? `<span class="cmd-shortcut">${cmd.shortcut}</span>` : ''}
      </div>`
    ).join('');
    // Scroll selected into view
    const selected = commandList.querySelector('.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function filterCommands(query) {
    const q = query.toLowerCase();
    filteredCommands = getCommands().filter(c => c.type !== 'separator' && (c.label.toLowerCase().includes(q) || (c.id && c.id.includes(q))));
    commandSelectedIdx = 0;
    renderCommandList();
  }

  function executeCommand(idx) {
    if (filteredCommands[idx] && filteredCommands[idx].action) {
      closeCommandPalette();
      filteredCommands[idx].action();
    }
  }

  if (commandInput) {
    commandInput.addEventListener('input', () => filterCommands(commandInput.value));
    commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); commandSelectedIdx = Math.min(commandSelectedIdx + 1, filteredCommands.length - 1); renderCommandList(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); commandSelectedIdx = Math.max(commandSelectedIdx - 1, 0); renderCommandList(); }
      if (e.key === 'Enter') { e.preventDefault(); executeCommand(commandSelectedIdx); }
      if (e.key === 'Escape') { closeCommandPalette(); }
    });
  }

  if (commandList) {
    commandList.addEventListener('click', (e) => {
      const item = e.target.closest('.command-item');
      if (item) executeCommand(parseInt(item.dataset.cmdIdx, 10));
    });
  }

  if (commandPaletteBackdrop) {
    commandPaletteBackdrop.addEventListener('click', closeCommandPalette);
  }

  // ===== Top Menu Bar =====
  const menuBar = document.getElementById('menuBar');
  const menuDropdown = document.getElementById('menuDropdown');
  const menuDropdownInner = document.getElementById('menuDropdownInner');
  let activeMenu = null;

  const MENU_ITEMS = {
    file: [
      { label: '新建文章', action: () => window._spNewArticle() },
      { label: '导入文件', action: () => fileInput.click() },
      { label: '保存', shortcut: 'Ctrl+S', action: () => { saveContent(); showToast('已保存'); } },
      { type: 'separator' },
      { label: '导出 HTML', action: exportHtml },
      { label: '导出 PDF', action: () => window.print() },
      { label: '查看源码', action: () => openModal(htmlModal) },
    ],
    edit: [
      { label: '撤销', shortcut: 'Ctrl+Z', action: () => { if (editor) editor.trigger('source', 'undo'); } },
      { label: '重做', shortcut: 'Ctrl+Y', action: () => { if (editor) editor.trigger('source', 'redo'); } },
      { type: 'separator' },
      { label: '查找替换', shortcut: 'Ctrl+F', action: () => openFindBar() },
      { label: '智能排版', shortcut: 'Ctrl+Shift+F', action: () => smartFormat() },
    ],
    insert: [
      { label: '图片', action: () => fileInput.click() },
      { label: '链接', action: () => insertMarkdown('[', '](url)', '链接文本') },
      { label: '代码块', action: () => insertMarkdown('\n```\n', '\n```\n', '代码') },
      { label: '表格', action: () => insertMarkdown('\n| ', ' | col2 |\n|------|------|\n| data | data |\n', 'col1') },
      { label: '分隔线', action: () => insertMarkdown('\n---\n', '', '') },
      { type: 'separator' },
      { label: '写作模板', action: () => toggleSidePanel('templates') },
    ],
    view: [
      { label: '手机预览', action: () => setPreviewDevice('phone') },
      { label: '平板预览', action: () => setPreviewDevice('tablet') },
      { label: '电脑预览', action: () => setPreviewDevice('desktop') },
      { label: '显示/隐藏预览', shortcut: 'Ctrl+P', action: togglePreviewVisibility },
      { label: '切换预览位置', shortcut: 'Ctrl+Shift+P', action: togglePreviewPosition },
      { type: 'separator' },
      { label: '文章管理', action: () => toggleSidePanel('articles') },
      { label: '文章大纲', action: () => toggleSidePanel('outline') },
      { label: '历史版本', action: () => toggleSidePanel('history') },
      { type: 'separator' },
      { label: '命令面板', shortcut: 'Ctrl+K', action: openCommandPalette },
    ],
    help: [
      { label: '快捷键', action: () => openModal(document.getElementById('shortcutsModal')) },
      { label: '命令面板', shortcut: 'Ctrl+K', action: openCommandPalette },
      { type: 'separator' },
      { label: 'AI 文案', action: () => openModal(aiWriterModal) },
      { label: '图床设置', action: () => openModal(document.getElementById('imageBedModal')) },
    ],
  };

  function showMenu(menuId) {
    const items = MENU_ITEMS[menuId];
    if (!items) return;

    if (activeMenu === menuId && menuDropdown.style.display !== 'none') {
      closeMenu();
      return;
    }

    activeMenu = menuId;
    const trigger = document.querySelector(`.menu-item[data-menu="${menuId}"]`);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();

    menuDropdownInner.innerHTML = items.map(item => {
      if (item.type === 'separator') return '<div class="menu-dropdown-sep"></div>';
      return `<div class="menu-dropdown-item" data-action="${item.label}">
        <span>${item.label}</span>
        ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
      </div>`;
    }).join('');

    menuDropdown.style.display = 'block';
    menuDropdown.style.left = rect.left + 'px';
    menuDropdown.style.top = (rect.bottom + 2) + 'px';

    // Update active state
    document.querySelectorAll('.menu-item').forEach(m => m.classList.toggle('active', m.dataset.menu === menuId));

    // Bind click handlers
    menuDropdownInner.querySelectorAll('.menu-dropdown-item').forEach((el, idx) => {
      const realItems = items.filter(i => i.type !== 'separator');
      const actionItem = realItems.find(i => i.label === el.dataset.action);
      if (actionItem && actionItem.action) {
        el.addEventListener('click', () => { closeMenu(); actionItem.action(); });
      }
    });
  }

  function closeMenu() {
    menuDropdown.style.display = 'none';
    activeMenu = null;
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  }

  if (menuBar) {
    menuBar.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item');
      if (item && item.dataset.menu) showMenu(item.dataset.menu);
    });
    menuBar.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.menu-item');
      if (item && item.dataset.menu && activeMenu && activeMenu !== item.dataset.menu) {
        showMenu(item.dataset.menu);
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (activeMenu && !e.target.closest('.menu-bar') && !e.target.closest('.menu-dropdown')) {
      closeMenu();
    }
  });

  // ===== Preview Position Toggle =====
  function setPreviewVisibility(hidden) {
    if (!previewPanel || !editorContainer) return;
    previewPanel.classList.toggle('hidden', hidden);
    editorContainer.classList.toggle('preview-hidden', hidden);
    localStorage.setItem('wechat-preview-hidden', hidden ? 'true' : 'false');
    if (btnTogglePreviewVisibility) {
      btnTogglePreviewVisibility.classList.toggle('active', hidden);
      btnTogglePreviewVisibility.title = hidden ? '显示预览' : '隐藏预览';
      const label = btnTogglePreviewVisibility.childNodes[btnTogglePreviewVisibility.childNodes.length - 1];
      if (label) label.textContent = hidden ? '显示预览' : '隐藏预览';
    }
    if (editor && editor.layout) setTimeout(() => editor.layout(), 0);
  }

  function togglePreviewVisibility() {
    const hidden = previewPanel && previewPanel.classList.contains('hidden');
    setPreviewVisibility(!hidden);
  }

  function updatePreviewPositionButton() {
    if (!btnTogglePreviewPosition || !editorContainer) return;
    const reversed = editorContainer.classList.contains('reverse');
    btnTogglePreviewPosition.classList.toggle('active', reversed);
    btnTogglePreviewPosition.title = reversed ? '预览靠右' : '预览靠左';
    const label = btnTogglePreviewPosition.childNodes[btnTogglePreviewPosition.childNodes.length - 1];
    if (label) label.textContent = reversed ? '预览靠右' : '预览靠左';
  }

  function togglePreviewPosition() {
    if (editorContainer) {
      editorContainer.classList.toggle('reverse');
      localStorage.setItem('wechat-preview-reversed', editorContainer.classList.contains('reverse'));
      updatePreviewPositionButton();
      if (editor && editor.layout) setTimeout(() => editor.layout(), 0);
    }
  }

  // Restore preview position
  if (localStorage.getItem('wechat-preview-reversed') === 'true') {
    editorContainer?.classList.add('reverse');
  }
  updatePreviewPositionButton();
  setPreviewVisibility(localStorage.getItem('wechat-preview-hidden') === 'true');
  if (btnTogglePreviewVisibility) btnTogglePreviewVisibility.addEventListener('click', togglePreviewVisibility);
  if (btnTogglePreviewPosition) btnTogglePreviewPosition.addEventListener('click', togglePreviewPosition);

  // Restore preview device
  const savedDevice = localStorage.getItem('previewDevice');
  if (savedDevice && deviceSelect) {
    setPreviewDevice(savedDevice);
  }

  // ===== Keyboard shortcuts for new features =====
  // Patch into existing keydown handler by adding a global listener
  document.addEventListener('keydown', (e) => {
    // Command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (commandPalette.style.display !== 'none') {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
      return;
    }
    // Preview position toggle
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      togglePreviewPosition();
      return;
    }
    // Preview visibility toggle
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      togglePreviewVisibility();
      return;
    }
    // Close command palette on Escape
    if (e.key === 'Escape' && commandPalette && commandPalette.style.display !== 'none') {
      closeCommandPalette();
      return;
    }
    // Menu bar shortcuts (Alt+key)
    if (e.altKey) {
      const menuMap = { f: 'file', e: 'edit', i: 'insert', v: 'view', h: 'help' };
      if (menuMap[e.key]) {
        e.preventDefault();
        showMenu(menuMap[e.key]);
      }
    }
  });

  // ===== Smart Format helper =====
  function smartFormat() {
    const content = editor.getValue();
    if (!content.trim()) { showToast('内容为空'); return; }
    const format = inputFormat.value;
    if (format === 'text') {
      editor.setValue(smartConvertTextToMarkdown(content));
      inputFormat.value = 'markdown';
    }
    updatePreview();
    updateStats();
    saveContent();
    showToast('智能排版完成');
  }

  // ===== Theme Toggle =====
  function getCurrentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  function setTheme(theme) {
    if (theme === 'light') {
      document.documentElement.dataset.theme = 'light';
      if (window.monaco && window.monaco.editor) {
        window.monaco.editor.setTheme('weedit-light');
      }
      if (themeMenuLabel) themeMenuLabel.textContent = '切换到深色模式';
    } else {
      delete document.documentElement.dataset.theme;
      if (window.monaco && window.monaco.editor) {
        window.monaco.editor.setTheme('weedit-dark');
      }
      if (themeMenuLabel) themeMenuLabel.textContent = '切换到浅色模式';
    }
    localStorage.setItem('app-theme', theme);
  }
  function toggleTheme() {
    setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
  }

  // ===== Toolbar Dropdown =====
  let toolbarDropdownOpen = false;
  function openToolbarDropdown() {
    if (!toolbarDropdown) return;
    toolbarDropdown.style.display = 'block';
    toolbarDropdownOpen = true;
    if (btnMore) btnMore.classList.add('active');
  }
  function closeToolbarDropdown() {
    if (!toolbarDropdown) return;
    toolbarDropdown.style.display = 'none';
    toolbarDropdownOpen = false;
    if (btnMore) btnMore.classList.remove('active');
  }
  if (btnMore) {
    btnMore.addEventListener('click', (e) => {
      e.stopPropagation();
      if (toolbarDropdownOpen) closeToolbarDropdown();
      else openToolbarDropdown();
    });
  }
  if (toolbarDropdown) {
    toolbarDropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.toolbar-dropdown-item');
      if (!item) return;
      const action = item.dataset.action;
      closeToolbarDropdown();
      switch (action) {
        case 'new-doc':
          if (confirm('确定要新建文档吗？当前内容将自动保存到历史版本。')) {
            saveVersion(true);
            editorSetValue('');
            updatePreview();
            updateStats();
          }
          break;
        case 'undo':
          if (editor) editor.trigger('source', 'undo');
          break;
        case 'redo':
          if (editor) editor.trigger('source', 'redo');
          break;
        case 'import':
          fileInput.click();
          break;
        case 'export-html':
          downloadHtml();
          break;
        case 'export-pdf':
          window.print();
          break;
        case 'toggle-theme':
          toggleTheme();
          break;
        case 'fullscreen':
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
          break;
        case 'templates':
          openModal(document.getElementById('templateModal'));
          break;
        case 'history':
          openModal(document.getElementById('historyModal'));
          break;
        case 'image-bed':
          openModal(document.getElementById('imageBedModal'));
          break;
        case 'cloud-sync':
          toggleSidePanel('settings');
          break;
        case 'settings':
          toggleSidePanel('settings');
          break;
        case 'shortcuts':
          openModal(document.getElementById('shortcutsModal'));
          break;
      }
    });
  }
  document.addEventListener('click', (e) => {
    if (toolbarDropdownOpen && !e.target.closest('.toolbar-more-wrap')) {
      closeToolbarDropdown();
    }
  });

  // ===== Publish Modal =====
  function openPublishModal() {
    if (!publishModal) return;
    // Refresh preview
    if (publishPreview) {
      publishPreview.innerHTML = preview.innerHTML;
    }
    publishModal.style.display = 'flex';
    // Reset to first tab
    document.querySelectorAll('.publish-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.publish-tab[data-pubtab="wechat"]')?.classList.add('active');
    document.getElementById('publishPaneWechat').style.display = 'block';
    document.getElementById('publishPaneExport').style.display = 'none';
  }
  function closePublishModal() {
    if (publishModal) publishModal.style.display = 'none';
  }
  if (btnPublish) {
    btnPublish.addEventListener('click', openPublishModal);
  }
  if (btnClosePublish) {
    btnClosePublish.addEventListener('click', closePublishModal);
  }
  if (publishModal) {
    publishModal.addEventListener('click', (e) => {
      if (e.target === publishModal) closePublishModal();
    });
  }
  // Publish tabs
  document.querySelectorAll('.publish-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.publish-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const pane = tab.dataset.pubtab;
      document.getElementById('publishPaneWechat').style.display = pane === 'wechat' ? 'block' : 'none';
      document.getElementById('publishPaneExport').style.display = pane === 'export' ? 'block' : 'none';
    });
  });
  // Publish actions
  if (btnPublishCopy) {
    btnPublishCopy.addEventListener('click', async () => {
      if (!currentHtml) { showToast('请先输入内容'); return; }
      const html = wrapForWechat(currentHtml);
      await copyRichHtml(html, '已复制富文本，可直接粘贴到微信公众号编辑器');
    });
  }
  if (btnPublishExportHtml) {
    btnPublishExportHtml.addEventListener('click', exportHtml);
  }
  if (btnPublishExportPdf) {
    btnPublishExportPdf.addEventListener('click', () => window.print());
  }

  // ===== Save button =====
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      saveContent();
      saveVersion('手动保存');
      showToast('已保存');
    });
  }

  // ===== AI Writer toolbar button =====
  if (btnAiWriterToolbar) {
    btnAiWriterToolbar.addEventListener('click', () => {
      loadAiConfig();
      switchAiTab('assistant');
      openModal(aiWriterModal);
    });
  }

  // ===== Initialize theme label =====
  if (themeMenuLabel) {
    themeMenuLabel.textContent = getCurrentTheme() === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  }

})();
