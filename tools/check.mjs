#!/usr/bin/env node
/**
 * 内容校验（零依赖）
 *
 *   node tools/check.mjs
 *
 * 检查项：
 *   1. data/site.json、data/files.json 能否解析
 *   2. 同一目录下文件名是否重复
 *   3. 每个文件的 note 是否存在、是否是 .md
 *   4. 每个 note 里的 ```links 下载块是否为空
 *   5. data/notes 下有没有「写了但没被引用」的孤儿文件
 *   6. index.html 里引用的本地资源（css / js / 图标）是否存在
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMarkdown } from '../assets/markdown.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];
const warnings = [];
const usedNotes = new Set();
const pending = [];

async function readJSON(relative) {
  try {
    return JSON.parse(await readFile(join(root, relative), 'utf8'));
  } catch (error) {
    errors.push(`${relative}：${error.message}`);
    return null;
  }
}

async function exists(relative) {
  try {
    await stat(join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function checkNote(notePath, owner) {
  const relative = String(notePath).replace(/^\.?\//, '');
  const file = relative.startsWith('data/') ? relative : `data/${relative}`;
  usedNotes.add(file);

  if (!(await exists(file))) {
    errors.push(`${owner} → 找不到介绍文件 ${file}`);
    return;
  }

  const markdown = await readFile(join(root, file), 'utf8');
  if (!markdown.trim()) warnings.push(`${file}：文件是空的`);
  if (!relative.endsWith('.md')) warnings.push(`${file}：介绍文件建议用 .md 后缀`);

  const html = renderMarkdown(markdown);
  if (html.includes('md-empty-links')) {
    errors.push(`${file}：\`\`\`links 块里没有解析到有效链接（格式：名称 | 链接 | 备注）`);
  }
  const links = (html.match(/class="dl-main"/g) || []).length;
  if (!links && /```(?:links|link|dl|download)/.test(markdown)) {
    warnings.push(`${file}：有下载块但没有链接`);
  }
  if (!links && !/```(?:links|link|dl|download)/.test(markdown)) {
    warnings.push(`${file}：没有 \`\`\`links 下载块，用户在这个文件上找不到下载入口`);
  }
}

function walk(items, prefix, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !item.name) {
      errors.push(`${label}：存在缺少 name 的条目`);
      continue;
    }
    const display = prefix ? `${prefix}/${item.name}` : item.name;
    if (seen.has(item.name)) errors.push(`${label}：文件名重复「${item.name}」`);
    seen.add(item.name);

    const isFolder = item.type === 'folder' || Array.isArray(item.children);
    if (isFolder) {
      if (!Array.isArray(item.children)) {
        warnings.push(`${display}：目录没有 children 字段`);
        continue;
      }
      walk(item.children, display, `${label}/${item.name}`);
      continue;
    }

    if (item.note && item.noteText) {
      warnings.push(`${display}：note 与 noteText 同时存在，只有 noteText 生效`);
    }
    if (item.note) pending.push(checkNote(item.note, display));
    if (item.size !== undefined && typeof item.size !== 'number') {
      warnings.push(`${display}：size 建议写成字节数（数字），当前是 ${JSON.stringify(item.size)}`);
    }
  }
}

async function checkAssets() {
  let html = '';
  try {
    html = await readFile(join(root, 'index.html'), 'utf8');
  } catch {
    errors.push('index.html：读取失败');
    return;
  }
  const refs = new Set(
    [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((ref) => !/^(?:[a-z]+:|\/\/|#)/i.test(ref)),
  );
  for (const ref of refs) {
    if (!(await exists(ref.replace(/^\//, '')))) errors.push(`index.html → 引用的 ${ref} 不存在`);
  }
}

async function orphanNotes() {
  let files = [];
  try {
    files = await readdir(join(root, 'data/notes'));
  } catch {
    return;
  }
  for (const name of files) {
    if (!name.endsWith('.md')) continue;
    const relative = `data/notes/${name}`;
    if (!usedNotes.has(relative)) warnings.push(`${relative}：没有被任何文件引用`);
  }
}

async function main() {
  const site = await readJSON('data/site.json');
  const tree = await readJSON('data/files.json');

  if (site) {
    if (site.announcement && !(await exists(site.announcement))) {
      errors.push(`site.json → announcement 指向的 ${site.announcement} 不存在`);
    }
    if (site.logo && !(await exists(site.logo))) {
      warnings.push(`site.json → logo 指向的 ${site.logo} 不存在，将使用默认图标`);
    }
  }

  if (tree) {
    if (!Array.isArray(tree.items)) errors.push('files.json：缺少 items 数组');
    else walk(tree.items, '', '根目录');
  }

  await Promise.all(pending);
  await checkAssets();
  await orphanNotes();

  console.log(`\n检查完成：引用介绍 ${usedNotes.size} 篇，错误 ${errors.length} 个，警告 ${warnings.length} 个\n`);

  if (errors.length) {
    console.log('错误：');
    for (const message of errors) console.log(`  ✗ ${message}`);
    console.log('');
  }
  if (warnings.length) {
    console.log('警告：');
    for (const message of warnings) console.log(`  ! ${message}`);
    console.log('');
  }
  if (!errors.length && !warnings.length) console.log('一切正常 ✓\n');

  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
