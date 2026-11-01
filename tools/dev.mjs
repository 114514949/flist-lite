#!/usr/bin/env node
/**
 * 本地预览服务器（零依赖）
 *
 *   node tools/dev.mjs            # http://127.0.0.1:8080
 *   node tools/dev.mjs 5173       # 指定端口
 *
 * 说明：站点用了 ES Module + fetch，直接双击 index.html 会被浏览器的
 * file:// 安全策略拦住，所以本地一定要用这个脚本（或任意静态服务器）打开。
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = resolve(join(root, pathname));
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end('403 Forbidden');
    return;
  }

  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<meta charset="utf-8"><h1>404</h1><p>找不到 ${pathname}</p><p><a href="/">回到首页</a></p>`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`\n  Flist-lite 本地预览： http://127.0.0.1:${port}\n  目录： ${root}\n  按 Ctrl+C 停止\n`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，换一个：node tools/dev.mjs ${port + 1}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
