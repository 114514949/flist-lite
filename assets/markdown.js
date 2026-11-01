/**
 * 轻量 Markdown 渲染器（零依赖，可直接在浏览器里跑）
 *
 * 支持：标题 / 段落 / 硬换行 / 粗体 / 斜体 / 删除线 / 行内代码 / 代码块 /
 *      链接 / 图片 / 有序与无序列表（含嵌套、任务列表）/ 引用 / 分割线 / 表格 /
 *      裸链接自动识别，以及本项目的自定义语法 ```links 下载按钮块。
 *
 * 安全策略：所有文本先做 HTML 转义，只放行 http(s)/mailto/tel/相对链接。
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML 转义 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** 只允许安全协议，挡掉 javascript: / data: 之类的链接 */
export function isSafeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (s.startsWith('#') || s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return true; // 无协议头的相对地址
  return SAFE_PROTOCOLS.has(scheme[1].toLowerCase() + ':');
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const PLACEHOLDER_RE = /\u0000(\d+)\u0000/g;

/* ------------------------------------------------------------------ *
 * 行内元素
 * ------------------------------------------------------------------ */

function renderInline(text) {
  const held = [];
  const hold = (html) => {
    held.push(html);
    return `\u0000${held.length - 1}\u0000`;
  };

  let out = escapeHtml(text);

  // 行内代码优先，避免里面的 * _ 被当成强调
  out = out.replace(/`([^`\n]+)`/g, (_m, code) => hold(`<code>${code}</code>`));

  // 图片
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (match, alt, url, title) => {
    if (!isSafeUrl(url)) return match;
    const t = title ? ` title="${title}"` : '';
    return hold(`<img src="${url}" alt="${alt}"${t} loading="lazy" decoding="async">`);
  });

  // 链接
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (match, label, url, title) => {
    if (!isSafeUrl(url)) return match;
    const t = title ? ` title="${title}"` : '';
    const ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return hold(`<a href="${url}"${t}${ext}>${renderInline(label)}</a>`);
  });

  // 裸链接
  out = out.replace(
    /(^|[^\w\u0000])((?:https?:\/\/)[^\s<>"'）)】。，、；：！？\u0000]+)/g,
    (_m, prefix, url) => prefix + hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`),
  );

  // 强调
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?=[^_\w]|$)/g, '$1<em>$2</em>');

  // 还原占位符（可能嵌套，循环到稳定为止）
  let previous;
  do {
    previous = out;
    out = out.replace(PLACEHOLDER_RE, (_m, index) => held[Number(index)] ?? '');
  } while (out !== previous);

  return out;
}

/* ------------------------------------------------------------------ *
 * 自定义语法：```links 下载链接块
 * ------------------------------------------------------------------ */

function classifyLink(label, note) {
  const text = `${label} ${note}`;
  if (/(大陆|国内|中国|cn|直连)/i.test(text)) return 'cn';
  if (/(海外|国外|国际|境外|global|oversea|intl)/i.test(text)) return 'intl';
  if (/(备用|镜像|mirror|backup|后备)/i.test(text)) return 'backup';
  return 'plain';
}

/** 只有一条链接会被当成「主链接」：显式写了主用/推荐的第一条，否则就是第一条 */
const PRIMARY_RE = /(主用|主链|推荐|首选|primary|main)/i;

const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a2 2 0 0 0-2 2v7.5A2.5 2.5 0 0 0 6.5 15"/></svg>';

/**
 * 解析下载链接块。每行格式：
 *   名称 | 链接 | 备注（备注可省略）
 * 以 # 开头的行是注释；只有一个链接时可以直接写链接。
 *
 * 样式约定：整块是一个无边框列表（靠分隔线切行），只有一条会被标成主链接；
 * 颜色只表示「大陆 / 海外 / 备用」这三类语义，未知链接保持中性灰 —— 所以
 * 多加多少条链接都不会出现颜色循环重复的问题。
 */
export function renderLinkBlock(raw) {
  const rows = String(raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const links = [];
  for (const row of rows) {
    const parts = row.split('|').map((part) => part.trim());
    let label = parts[0] ?? '';
    let url = parts[1] ?? '';
    let note = (parts[2] ?? '').trim();

    if (!url && /^https?:\/\//i.test(label)) {
      url = label;
      label = '';
    }
    if (!url || !isSafeUrl(url)) continue;
    if (!label) label = hostOf(url) || '下载';
    links.push({ label, url, note, kind: classifyLink(label, note) });
  }

  if (!links.length) {
    return '<p class="md-empty-links">（下载链接块为空，请检查 <code>```links</code> 的写法）</p>';
  }

  let primary = links.findIndex((link) => PRIMARY_RE.test(link.label));
  if (primary < 0) primary = 0;

  const items = links
    .map((link, index) => {
      const host = hostOf(link.url);
      const cls = ['dl-item', `is-${link.kind}`, index === primary ? 'is-primary' : ''].filter(Boolean).join(' ');
      // 自己写了「主用」就不用再补一个「主」字，只有兜底选中的那条需要解释
      const ownBadge = PRIMARY_RE.test(link.label);
      const badge = index === primary && !ownBadge ? '<span class="dl-badge">主</span>' : '';
      return `<div class="${cls}">
  <a class="dl-main" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer nofollow">
    <span class="dl-label">${escapeHtml(link.label)}${badge}</span>
    ${link.note ? `<span class="dl-note">${escapeHtml(link.note)}</span>` : ''}
    <span class="dl-host">${escapeHtml(host)}</span>
  </a>
  <button class="dl-copy" type="button" data-copy="${escapeHtml(link.url)}" title="复制直链" aria-label="复制 ${escapeHtml(link.label)} 的直链">${COPY_ICON}</button>
</div>`;
    })
    .join('\n');

  return `<div class="dl-list">\n${items}\n</div>`;
}

/* ------------------------------------------------------------------ *
 * 块级元素
 * ------------------------------------------------------------------ */

const isListItem = (line) => /^\s*([-*+]|\d{1,9}[.)])\s+\S/.test(line);
const isHr = (line) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
const isHeading = (line) => /^\s{0,3}#{1,6}\s+/.test(line);

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

const isTableSep = (line) => {
  if (!line || !line.includes('|')) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
};

function renderTable(headerLine, sepLine, bodyLines) {
  const headers = splitRow(headerLine);
  const aligns = splitRow(sepLine).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return '';
  });
  const style = (index) => (aligns[index] ? ` style="text-align:${aligns[index]}"` : '');
  const head = headers.map((cell, i) => `<th${style(i)}>${renderInline(cell)}</th>`).join('');
  const body = bodyLines
    .map((line) => {
      const cells = splitRow(line);
      while (cells.length < headers.length) cells.push('');
      return `<tr>${cells
        .slice(0, headers.length)
        .map((cell, i) => `<td${style(i)}>${renderInline(cell)}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return `<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function collectList(lines, start) {
  const entries = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      const next = lines[i + 1];
      if (next && (isListItem(next) || /^\s{2,}\S/.test(next))) {
        i += 1;
        continue;
      }
      break;
    }
    const match = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
    if (match) {
      entries.push({
        indent: match[1].replace(/\t/g, '    ').length,
        ordered: /^\d/.test(match[2]),
        text: match[3],
      });
      i += 1;
      continue;
    }
    if (/^\s{2,}\S/.test(line) && entries.length) {
      entries[entries.length - 1].text += `\n${line.trim()}`;
      i += 1;
      continue;
    }
    break;
  }
  return { entries, next: i };
}

function buildListTree(entries) {
  const root = { indent: -1, children: [] };
  const stack = [root];
  for (const entry of entries) {
    while (stack.length > 1 && entry.indent <= stack[stack.length - 1].indent) stack.pop();
    const node = { indent: entry.indent, ordered: entry.ordered, text: entry.text, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

function renderListTree(node) {
  if (!node.children.length) return '';
  const ordered = node.children[0].ordered;
  const tag = ordered ? 'ol' : 'ul';
  const items = node.children
    .map((child) => {
      let text = child.text;
      let checkbox = '';
      const task = /^\[( |x|X)\]\s+/.exec(text);
      if (task) {
        checkbox = `<input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}> `;
        text = text.slice(task[0].length);
      }
      const body = text.split('\n').map((part) => renderInline(part)).join('<br>');
      return `<li>${checkbox}${body}${renderListTree(child)}</li>`;
    })
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 代码块 / 下载链接块
    const fence = /^\s*```+\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1].toLowerCase();
      const buffer = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束围栏
      if (lang === 'links' || lang === 'link' || lang === 'dl' || lang === 'download') {
        out.push(renderLinkBlock(buffer.join('\n')));
      } else {
        const cls = lang ? ` class="language-${lang}"` : '';
        out.push(`<pre><code${cls}>${escapeHtml(buffer.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (isHr(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const buffer = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buffer.push(lines[i].replace(/^\s*> ?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderBlocks(buffer)}</blockquote>`);
      continue;
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = line;
      const sep = lines[i + 1];
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        body.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(header, sep, body));
      continue;
    }

    // 列表
    if (isListItem(line)) {
      const { entries, next } = collectList(lines, i);
      out.push(renderListTree(buildListTree(entries)));
      i = next;
      continue;
    }

    // 段落
    const buffer = [];
    while (i < lines.length) {
      const current = lines[i];
      if (!current.trim()) break;
      if (buffer.length && (isHeading(current) || isListItem(current) || /^\s*```/.test(current) || isHr(current) || /^\s*>/.test(current))) {
        break;
      }
      buffer.push(current.trim());
      i += 1;
    }
    out.push(`<p>${buffer.map((part) => renderInline(part)).join('<br>')}</p>`);
  }

  return out.join('\n');
}

/**
 * 渲染 Markdown 文本为 HTML
 * @param {string} source Markdown 源码
 * @returns {string} HTML
 */
export function renderMarkdown(source) {
  const lines = String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n');
  return renderBlocks(lines).trim();
}
