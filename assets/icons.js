/**
 * 文件类型图标
 *
 * 用的是 OpenList 前端同一套图标：文件图标取自 Bootstrap Icons 的 file-earmark 系列，
 * 文件夹用 Ionicons 的描边造型（两者都是 MIT）。单色、靠形状区分类型，
 * 颜色交给 CSS 的 currentColor —— 想给某一类单独上色，补一条 .kind-xxx { color: … } 就行。
 *
 * 路径数据见 icon-paths.js，由脚本从官方 npm 包里原样抽取。
 */

import { PATHS } from './icon-paths.js';

/** 类型名 → 图标数据里的键 */
const ICON_BY_KIND = {
  folder: 'folder',
  archive: 'archive',
  image: 'image',
  video: 'video',
  audio: 'audio',
  pdf: 'pdf',
  sheet: 'excel',
  slide: 'slide',
  doc: 'word',
  markdown: 'markdown',
  text: 'text',
  code: 'code',
  font: 'font',
};

const EXT_MAP = {
  archive: 'zip rar 7z tar gz tgz bz2 xz zst iso dmg',
  image: 'jpg jpeg png gif bmp webp svg ico tif tiff avif heic psd ai sketch',
  video: 'mp4 mkv webm m3u8 avi mov wmv flv m4v mpg mpeg rmvb m2ts ts',
  audio: 'mp3 wav flac aac ogg m4a ape wma mid midi',
  pdf: 'pdf',
  doc: 'doc docx odt pages rtf',
  slide: 'ppt pptx odp key',
  excel: 'xls xlsx csv ods numbers',
  markdown: 'md markdown mdx',
  text: 'txt log ini conf nfo readme',
};

/* 由扩展名反查类型，避免上面那张表写得太绕 */
const KIND_BY_EXT = (() => {
  const map = new Map();
  for (const [kind, exts] of Object.entries(EXT_MAP)) {
    for (const ext of exts.split(' ')) if (ext) map.set(ext, kind === 'excel' ? 'sheet' : kind);
  }
  for (const ext of 'js mjs cjs jsx tsx vue svelte py rb go rs java kt swift c h cpp hpp cc cs php sh bash zsh bat ps1 sql lua pl r dart scala clj ex exs erl hs ml fs json yaml yml toml ini xml html htm css scss less styl graphql proto'.split(
    ' ',
  )) {
    if (!map.has(ext)) map.set(ext, 'code');
  }
  for (const ext of 'ttf otf woff woff2 eot'.split(' ')) map.set(ext, 'font');
  return map;
})();

function suffixOf(name) {
  const clean = String(name ?? '').split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  if (dot < 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

/** 返回图标类型名（folder / archive / image / … ），给 CSS 挂 .kind-* 用 */
export function iconKind(name, isFolder = false) {
  if (isFolder) return 'folder';
  const ext = suffixOf(name);
  if (!ext) return 'plain';
  return KIND_BY_EXT.get(ext) ?? 'plain';
}

/** 返回内联 SVG 字符串（颜色由 CSS 的 currentColor 控制） */
export function fileIcon(name, isFolder = false) {
  const icon = PATHS[ICON_BY_KIND[iconKind(name, isFolder)] ?? 'doc'] ?? PATHS.doc;
  const attrs = icon.attrs ? ` ${icon.attrs}` : '';
  return `<svg viewBox="${icon.viewBox}"${attrs} aria-hidden="true" focusable="false">${icon.inner}</svg>`;
}
