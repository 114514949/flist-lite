/**
 * 文件列表主逻辑（原生 JS，无构建、无依赖）
 *
 * 布局：页头 → 面包屑 → 文件列表 → 面板（全局公告 / 文件介绍）
 * 规则：点击文件 → 面板变成该文件的介绍（公告被替换）；返回列表 → 公告复现。
 */

import { renderMarkdown, escapeHtml } from './markdown.js';
import { fileIcon, iconKind } from './icons.js';

const $ = (selector, root = document) => root.querySelector(selector);

const state = {
  site: {},
  tree: { items: [] },
  segs: [],
  file: null,
  previousFile: null,
  sort: { key: 'name', dir: 1 },
  query: '',
  announcement: null,
};

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

async function getJSON(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

const isFolder = (item) => item.type === 'folder' || Array.isArray(item.children);

/** 把「字节数」或「1.2 GB」这类写法统一折算成字节数，用于排序比较。 */
function sizeBytes(size) {
  if (size === null || size === undefined || size === '') return 0;
  if (typeof size === 'number') return Number.isFinite(size) ? size : 0;
  const match = /^([\d.]+)\s*(B|KB|MB|GB|TB|PB)?$/i.exec(String(size).trim());
  if (!match) return 0;
  const unit = (match[2] || 'B').toUpperCase();
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  return Number(match[1]) * 1024 ** units.indexOf(unit);
}

function formatSize(size) {
  if (size === null || size === undefined || size === '') return '—';
  if (typeof size === 'string' && !/^\d+(\.\d+)?$/.test(size.trim())) return size; // 允许直接写 "1.2 GB"
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function formatDate(value) {
  if (!value) return '—';
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function hashFor(segs, file) {
  const path = segs.map((seg) => encodeURIComponent(seg)).join('/');
  const base = `#/${path}`;
  return file ? `${base}?f=${encodeURIComponent(file)}` : base;
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  // 正常情况 ? 是字面量；但有些分享/手改链接会把 ? 转义成 %3F，这里兜一下。
  const source = raw.includes('?') ? raw : safeDecode(raw).includes('?') ? safeDecode(raw) : raw;
  const [pathPart = '', queryPart = ''] = source.split('?');
  const segs = pathPart
    .split('/')
    .filter(Boolean)
    .map((seg) => safeDecode(seg));
  const query = new URLSearchParams(queryPart);
  return { segs, file: query.get('f') };
}

/** 按路径找到目录；返回 { items, folder } 或 null */
function resolveFolder(segs) {
  let items = state.tree.items || [];
  let folder = null;
  for (const seg of segs) {
    const next = items.find((item) => isFolder(item) && item.name === seg);
    if (!next) return null;
    folder = next;
    items = next.children || [];
  }
  return { items, folder };
}

function noteUrl(note) {
  const clean = String(note).replace(/^\.?\//, '');
  return clean.startsWith('data/') ? clean : `data/${clean}`;
}

/* ------------------------------------------------------------------ *
 * 文件列表
 * ------------------------------------------------------------------ */

function matchQuery(item) {
  if (!state.query) return true;
  return String(item.name).toLowerCase().includes(state.query);
}

function sortItems(items) {
  const { key, dir } = state.sort;
  const sorted = [...items];
  sorted.sort((a, b) => {
    const folderA = isFolder(a);
    const folderB = isFolder(b);
    if (folderA !== folderB) return folderA ? -1 : 1; // 目录始终在前
    let diff = 0;
    if (key === 'size') diff = sizeBytes(a.size) - sizeBytes(b.size);
    else if (key === 'date') diff = String(a.date || '').localeCompare(String(b.date || ''));
    else diff = String(a.name).localeCompare(String(b.name), 'zh-Hans-CN', { numeric: true });
    return diff * dir;
  });
  return sorted;
}

function rowHtml(item, segs, activeName, index = 0) {
  const folder = isFolder(item);
  const href = folder ? hashFor([...segs, item.name]) : hashFor(segs, item.name);
  const active = !folder && item.name === activeName;
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 2) : [];
  const sizeText = folder ? `${Array.isArray(item.children) ? item.children.length : 0} 项` : formatSize(item.size);
  return `<a class="row${active ? ' is-active' : ''}${folder ? ' is-folder' : ''}" href="${href}"${active ? ' aria-current="true"' : ''} style="--i:${index}">
  <span class="row-icon kind-${iconKind(item.name, folder)}">${fileIcon(item.name, folder)}</span>
  <span class="row-name" title="${escapeHtml(item.name)}">
    <span class="row-name-text">${escapeHtml(item.name)}</span>
    ${tags.map((tag) => `<span class="row-tag">${escapeHtml(tag)}</span>`).join('')}
  </span>
  <span class="row-size">${escapeHtml(sizeText)}</span>
  <span class="row-date">${escapeHtml(formatDate(item.date))}</span>
  <span class="row-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></span>
</a>`;
}

let listKey = null;

function renderList(items, segs) {
  const container = $('#file-list');
  const visible = sortItems(items.filter(matchQuery));
  const toolbar = $('#list-toolbar');
  toolbar.hidden = items.length < 4;

  if (!visible.length) {
    container.innerHTML = `<div class="empty">
      <p>${items.length ? '没有匹配的文件' : '这个目录还是空的'}</p>
      <p class="empty-hint">${items.length ? '换个关键词试试' : '在 data/files.json 里添加条目即可'}</p>
    </div>`;
  } else {
    container.innerHTML = visible.map((item, index) => rowHtml(item, segs, state.file?.name, index)).join('');
  }

  // 只在换目录时播放一次淡入，搜索/排序时不闪
  const key = `${segs.join('/')}|${state.query ? 'q' : ''}`;
  container.classList.remove('is-refresh');
  if (visible.length && key !== listKey) {
    void container.offsetWidth;
    container.classList.add('is-refresh');
  }
  listKey = key;

  $('#list-count').textContent = !items.length
    ? ''
    : state.query
      ? `${visible.length} / ${items.length} 个项目`
      : `${items.length} 个项目`;
  updateSortButtons();
}

function updateSortButtons() {
  document.querySelectorAll('[data-sort]').forEach((button) => {
    const active = button.dataset.sort === state.sort.key;
    button.classList.toggle('is-active', active);
    button.dataset.dir = active ? (state.sort.dir === 1 ? 'asc' : 'desc') : '';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/* ------------------------------------------------------------------ *
 * 面包屑 / 标题
 * ------------------------------------------------------------------ */

function renderBreadcrumb(segs) {
  const nav = $('#breadcrumb');
  const parts = [`<a class="crumb" href="#/">首页</a>`];
  segs.forEach((seg, index) => {
    const isLast = index === segs.length - 1;
    const href = hashFor(segs.slice(0, index + 1));
    parts.push(isLast ? `<span class="crumb is-current">${escapeHtml(seg)}</span>` : `<a class="crumb" href="${href}">${escapeHtml(seg)}</a>`);
  });
  if (state.file) {
    parts.push(`<span class="crumb is-current is-file">${escapeHtml(state.file.name)}</span>`);
  }
  nav.innerHTML = parts.join('<span class="crumb-sep">/</span>');
}

function updateTitle(segs) {
  const siteName = state.site.name || '文件列表';
  const tail = state.file ? state.file.name : segs.length ? segs[segs.length - 1] : '';
  document.title = tail ? `${tail} · ${siteName}` : siteName;
}

/* ------------------------------------------------------------------ *
 * 面板：公告 / 文件介绍
 * ------------------------------------------------------------------ */

async function loadAnnouncement() {
  if (state.announcement !== null) return state.announcement;
  const path = state.site.announcement || 'data/announcement.md';
  try {
    const text = await getText(path);
    state.announcement = renderMarkdown(text);
  } catch {
    state.announcement = '';
  }
  return state.announcement;
}

function metaChips(file) {
  const chips = [];
  if (file.size !== undefined && file.size !== null && file.size !== '') chips.push(`<span class="chip">${escapeHtml(formatSize(file.size))}</span>`);
  if (file.version) chips.push(`<span class="chip">v${escapeHtml(String(file.version).replace(/^v/i, ''))}</span>`);
  if (file.date) chips.push(`<span class="chip">${escapeHtml(formatDate(file.date))}</span>`);
  if (Array.isArray(file.tags)) file.tags.forEach((tag) => chips.push(`<span class="chip chip-accent">${escapeHtml(tag)}</span>`));
  return chips.join('');
}

function noNoteHtml(file) {
  return `<div class="md-empty">
  <p>这个文件还没有添加介绍。</p>
  <p>在 <code>data/files.json</code> 里给它加上 <code>"note": "notes/xxx.md"</code>，然后新建 <code>data/notes/xxx.md</code> 即可。</p>
  <p class="muted">文件名：<code>${escapeHtml(file.name)}</code></p>
</div>`;
}

/* 公告 ↔ 介绍 互换时重播一次淡入，避免整块内容「啪」地跳变 */
function playPanelIn(panel) {
  panel.classList.remove('is-in');
  void panel.offsetWidth;
  panel.classList.add('is-in');
}

async function renderPanel(scroll) {
  const panel = $('#panel');
  const file = state.file;

  if (!file) {
    panel.className = 'panel panel-announce';
    const html = await loadAnnouncement();
    panel.hidden = !html;
    panel.innerHTML = html
      ? `<div class="panel-head"><span class="panel-tag">公告</span></div><div class="md" id="announce-body">${html}</div>`
      : '';
    if (html) playPanelIn(panel);
    return;
  }

  panel.hidden = false;
  panel.className = 'panel panel-intro';
  panel.innerHTML = `<div class="intro-head">
      <span class="row-icon kind-${iconKind(file.name, false)} intro-icon">${fileIcon(file.name, false)}</span>
      <div class="intro-title">
        <h2>${escapeHtml(file.name)}</h2>
        <div class="chips">${metaChips(file)}</div>
      </div>
      <a class="intro-close" href="${hashFor(state.segs)}" id="intro-close">返回列表</a>
    </div>
    <div class="intro-body md" id="intro-body"><div class="loading">正在加载文件介绍…</div></div>`;

  const body = $('#intro-body');
  try {
    let html = '';
    if (file.noteText) html = renderMarkdown(file.noteText);
    else if (file.note) html = renderMarkdown(await getText(noteUrl(file.note)));
    body.innerHTML = html.trim() ? html : noNoteHtml(file);
  } catch (error) {
    body.innerHTML = `<div class="md-error">文件介绍加载失败：${escapeHtml(error.message)}<br>请检查 <code>${escapeHtml(file.note || '')}</code> 是否存在。</div>`;
  }

  playPanelIn(panel);
  if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

async function route() {
  const { segs, file: fileName } = parseHash();
  const resolved = resolveFolder(segs);

  if (!resolved) {
    $('#breadcrumb').innerHTML = '<a class="crumb" href="#/">首页</a><span class="crumb-sep">/</span><span class="crumb is-current">找不到该目录</span>';
    $('#file-list').innerHTML = `<div class="empty"><p>找不到这个目录</p><p class="empty-hint"><a href="#/">回到首页</a></p></div>`;
    state.segs = [];
    state.file = null;
    $('#panel').hidden = true;
    return;
  }

  const file = fileName ? resolved.items.find((item) => !isFolder(item) && item.name === fileName) : null;

  const previousName = state.file?.name ?? null;
  const changedFolder = state.segs.join('/') !== segs.join('/');
  state.segs = segs;
  state.file = file || null;

  // 换目录时清空搜索框，避免搜索词在小目录里把列表滤空且工具栏被隐藏后无法清除。
  if (changedFolder) {
    state.query = '';
    const search = $('#search');
    if (search) search.value = '';
  }

  renderBreadcrumb(segs);
  renderList(resolved.items, segs);
  updateTitle(segs);

  // 首次进入（含分享链接）不滚动，避免一进来就跳过列表；
  // 站内点击文件时才把介绍滚到视野里。
  const shouldScroll = booted && Boolean(file) && previousName !== file.name;
  await renderPanel(shouldScroll);
}

/* ------------------------------------------------------------------ *
 * 站点外壳
 * ------------------------------------------------------------------ */

function applySite() {
  const site = state.site;
  const name = site.name || '文件列表';
  document.getElementById('site-name').textContent = name;
  const logo = $('#site-logo');
  if (site.logo) {
    logo.innerHTML = `<img src="${escapeHtml(site.logo)}" alt="" width="26" height="26">`;
  }
  if (site.description) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', site.description);
  }
  $('#site-footer').innerHTML = `${escapeHtml(site.footer || '')}${
    site.footer ? '<span class="footer-dot">·</span>' : ''
  }<span class="footer-built">Flist-lite</span>`;

  const links = $('#header-links');
  const extra = Array.isArray(site.links) ? site.links.filter((link) => link && link.url) : [];
  links.innerHTML = extra
    .map((link) => `<a class="header-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label || link.url)}</a>`)
    .join('');
  if (site.title) document.title = site.title;
}

/* ------------------------------------------------------------------ *
 * 主题
 * ------------------------------------------------------------------ */

const THEME_KEY = 'flist-lite-theme';

function applyTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  const button = $('#theme-toggle');
  if (button) {
    button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    button.dataset.theme = theme;
  }
  if (!persist) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

function initTheme() {
  // 实际的首次取值在 assets/theme.js 里完成（避免刷新时闪白），这里只负责同步按钮状态。
  // ?theme=dark / ?theme=light 强制指定时不写入 localStorage，避免一次分享链接永久改掉访问者的主题。
  const forced = new URLSearchParams(location.search).get('theme');
  const current = document.documentElement.dataset.theme;
  const theme = current === 'dark' || current === 'light' ? current : 'light';
  applyTheme(theme, !(forced === 'dark' || forced === 'light'));
}

/* ------------------------------------------------------------------ *
 * 事件绑定
 * ------------------------------------------------------------------ */

function bindEvents() {
  window.addEventListener('hashchange', () => {
    route();
  });

  document.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) {
      event.preventDefault();
      const url = copyButton.dataset.copy;
      try {
        await navigator.clipboard.writeText(url);
        copyButton.classList.add('is-copied');
        copyButton.title = '已复制';
        setTimeout(() => {
          copyButton.classList.remove('is-copied');
          copyButton.title = '复制直链';
        }, 1600);
      } catch {
        window.prompt('复制下面的链接：', url);
      }
    }
  });

  $('#theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  const search = $('#search');
  search.addEventListener('input', () => {
    state.query = search.value.trim().toLowerCase();
    const resolved = resolveFolder(state.segs);
    if (resolved) renderList(resolved.items, state.segs);
  });

  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort;
      if (state.sort.key === key) state.sort.dir *= -1;
      else state.sort = { key, dir: key === 'name' ? 1 : -1 };
      const resolved = resolveFolder(state.segs);
      if (resolved) renderList(resolved.items, state.segs);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.file) {
      location.hash = hashFor(state.segs);
    }
    if (event.key === '/' && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
  });
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

let booted = false;

async function boot() {
  initTheme();
  bindEvents();

  try {
    const [site, tree] = await Promise.all([getJSON('data/site.json'), getJSON('data/files.json')]);
    state.site = site || {};
    state.tree = tree || { items: [] };
  } catch (error) {
    $('#file-list').innerHTML = `<div class="empty"><p>数据加载失败</p><p class="empty-hint">${escapeHtml(error.message)}</p><p class="empty-hint">请确认 data/site.json 与 data/files.json 存在；本地请用 tools/dev.mjs 启动一个静态服务，直接双击 index.html 无法读取本地文件。</p></div>`;
    return;
  }

  applySite();
  await route();
  booted = true;
}

boot();
