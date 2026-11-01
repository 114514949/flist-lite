#!/usr/bin/env node
/**
 * Markdown 渲染器自测（零依赖）
 *
 *   node tools/selftest.mjs
 */

import { renderMarkdown, renderLinkBlock, escapeHtml, isSafeUrl } from '../assets/markdown.js';
import { iconKind, fileIcon } from '../assets/icons.js';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? `\n    实际输出：${detail}` : ''}`);
}

const has = (html, needle) => html.includes(needle);

// 1 转义
check('转义 HTML', escapeHtml('<a href="x">&</a>') === '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');

// 2 强调
check('粗体', has(renderMarkdown('**加粗**'), '<strong>加粗</strong>'));
check('斜体', has(renderMarkdown('*斜体*'), '<em>斜体</em>'));
check('删除线', has(renderMarkdown('~~删掉~~'), '<del>删掉</del>'));

// 3 链接安全
check('普通链接', has(renderMarkdown('[点我](https://example.com/a)'), 'href="https://example.com/a"'));
check('链接新窗口', has(renderMarkdown('[点我](https://example.com/a)'), 'rel="noopener noreferrer"'));
check('拦截 javascript:', !has(renderMarkdown('[x](javascript:alert(1))'), '<a '));
check('拦截 data:', !has(renderMarkdown('![x](data:text/html;base64,xx)'), '<img '));
check('isSafeUrl 相对路径', isSafeUrl('./a/b.png') && isSafeUrl('#/软件'));

// 4 行内代码
const code = renderMarkdown('`a*b*c`');
check('行内代码不被强调', has(code, '<code>a*b*c</code>') && !has(code, '<em>'));

// 5 代码块
const fence = renderMarkdown('```js\nconst a = 1 < 2;\n```');
check('代码块语言类', has(fence, 'class="language-js"'));
check('代码块转义', has(fence, 'const a = 1 &lt; 2;'));

// 6 下载链接块
const links = renderMarkdown(`\`\`\`links
大陆主用 | https://cn.example.com/a | 直连
海外主用 | https://us.example.com/a
备用线路 | https://mirror.example.com/a | 兜底
# 这是注释
\`\`\``);
check('下载块数量', (links.match(/class="dl-main"/g) || []).length === 3, links);
check('下载块分类 cn', has(links, 'is-cn'));
check('下载块分类 intl', has(links, 'is-intl'));
check('下载块分类 backup', has(links, 'is-backup'));
check('下载块显示域名', has(links, 'cn.example.com'));
check('下载块备注', has(links, '直连'));
check('下载块复制按钮', has(links, 'data-copy="https://cn.example.com/a"'));
check('下载块过滤注释', !has(links, '这是注释'));
check('空下载块提示', has(renderMarkdown('```links\n不是链接\n```'), 'md-empty-links'));

// 6.1 主链接：只有一条，且认「主用」而不是死认第一条
check('只有一条主链接', (links.match(/is-primary/g) || []).length === 1, links);
const reordered = renderLinkBlock('备用线路 | https://mirror.example.com/f\n大陆主用 | https://cn.example.com/f');
const primaryAt = reordered.indexOf('is-primary');
check(
  '主链接认「主用」而不是第一条',
  primaryAt > reordered.indexOf('备用线路') && reordered.slice(primaryAt).includes('大陆主用'),
  reordered,
);
const noKeyword = renderLinkBlock('甲 | https://a.example.com/f\n乙 | https://b.example.com/f');
check(
  '没有关键词时第一条当主链接',
  (noKeyword.match(/is-primary/g) || []).length === 1 && noKeyword.indexOf('is-primary') < noKeyword.indexOf('乙'),
  noKeyword,
);
const many = renderLinkBlock(
  Array.from({ length: 6 }, (_, i) => `线路 ${i + 1} | https://m${i}.example.com/f`).join('\n'),
);
check('额外链接一律中性色', (many.match(/is-plain/g) || []).length === 6, many);
check('自己写了「主用」就不再加「主」标签', !has(reordered, 'dl-badge'), reordered);
const fallback = renderLinkBlock('甲 | https://a.example.com/f');
check('兜底选中的那条补「主」标签', has(fallback, 'dl-badge') && has(fallback, 'is-primary'), fallback);

// 6.2 文件类型图标（Bootstrap Icons 16 网格 / Ionicons 512 网格）
check('图标：压缩包', iconKind('a.zip') === 'archive');
check('图标：文件夹', iconKind('随便', true) === 'folder');
check('图标：markdown', iconKind('说明.MD') === 'markdown');
check('图标：未知扩展名', iconKind('a.qqqq') === 'plain');
check('图标输出 SVG', has(fileIcon('a.mp4'), '<svg') && has(fileIcon('a.mp4'), 'viewBox="0 0 16 16"'));
check('文件夹图标走 Ionicons', has(fileIcon('随便', true), 'viewBox="0 0 512 512"'));
check('图标不再带 48 网格的旧路径', !has(fileIcon('a.pdf'), 'viewBox="0 0 48 48"'));

// 7 表格
const table = renderMarkdown('| 名称 | 大小 |\n| --- | ---: |\n| a | 1 MB |');
check('表格表头', has(table, '<th>名称</th>'));
check('表格单元格', has(table, '1 MB</td>'));
check('表格右对齐', has(table, 'text-align:right'));
check('表格包裹层', has(table, 'md-table-wrap'));

// 8 列表
const nested = renderMarkdown('- 一级\n  - 二级\n- 另一个');
check('嵌套列表', has(nested, '<li>一级<ul><li>二级</li></ul></li>'), nested);
check('任务列表', has(renderMarkdown('- [x] 完成'), 'checked'));

// 9 其它块
check('引用', has(renderMarkdown('> 引用内容'), '<blockquote>'));
check('分割线', has(renderMarkdown('---'), '<hr>'));
check('标题', has(renderMarkdown('## 二级标题'), '<h2>二级标题</h2>'));
check('单换行变 <br>', has(renderMarkdown('第一行\n第二行'), '<br>'));

// 10 裸链接
const bare = renderMarkdown('看这里 https://example.com/x?a=1 结束');
check('裸链接自动识别', has(bare, '<a href="https://example.com/x?a=1"'), bare);

// 11 XSS
const xss = renderMarkdown('<script>alert(1)</script>');
check('脚本被转义', has(xss, '&lt;script&gt;') && !has(xss, '<script>'));

// 12 中文标点不会吞进链接
const cjk = renderMarkdown('下载地址：https://example.com/a。');
check('中文句号不进入链接', has(cjk, 'href="https://example.com/a"'), cjk);

console.log(`\n自测：${passed} 通过，${failures.length} 失败\n`);
if (failures.length) {
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log('');
  process.exitCode = 1;
} else {
  console.log('全部通过 ✓\n');
}
