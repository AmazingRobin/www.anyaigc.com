// 生成分享封面 assets/og-cover.png（1200×630）：截取首屏粒子星云。
// 页面使用 ES 模块，必须通过 http 访问，所以脚本会临时起一个本地静态服务。
// 用法：npm run og
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'og-cover.png');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, rel.endsWith('/') ? `${rel}index.html` : rel);
  // 只允许读取项目目录内的文件
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// 优先 Playwright 自带 Chromium，没装时用系统 Chrome / Edge
async function launch() {
  for (const opts of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { return await chromium.launch({ ...opts, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); } catch {}
  }
  throw new Error('找不到可用的浏览器：npx playwright install chromium，或安装 Chrome / Edge');
}

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: '.rail,.skip-end,.scroll-hint,.progress{display:none !important}' });
  // 等粒子从星空形变成星云并转到合适角度
  await page.waitForTimeout(3500);
  await page.screenshot({ path: OUT });
  console.log(`封面已生成：${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
  server.close();
}
