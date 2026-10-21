// 生成结构化数据（JSON-LD）与 sitemap.xml。
// 首页正文本身就是静态 HTML（粒子只是装饰），所以不需要像会员页那样预渲染，只需要维护这两样。
// 用法：npm run seo
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(ROOT, 'index.html');
const SITE = 'https://www.anyaigc.com/';

// 平台接入的模型：首页文案与结构化数据共用这份清单
const MODELS = ['GPT', 'Claude', 'Gemini', 'Grok', 'DeepSeek', '通义千问', 'Kimi', '智谱 GLM', 'MiniMax', '豆包', '即梦', '可灵', 'Vidu', 'Sora', 'PixVerse', 'Midjourney', 'Seedance', 'Nano Banana'];
const FEATURES = ['AI 对话', 'AI 图像生成', 'AI 视频生成', 'AI 配音与音乐', 'AI 智能体工作流', '多模型同屏对比', '开发者 API'];

const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE}#org`,
      name: 'AnyAIGC',
      url: SITE,
      logo: `${SITE}favicon.ico`,
      sameAs: ['https://anyaigc.ai/', 'https://vip.anyaigc.ai/']
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}#site`,
      url: SITE,
      name: 'AnyAIGC · AI 聚合平台',
      inLanguage: 'zh-CN',
      publisher: { '@id': `${SITE}#org` }
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE}#app`,
      name: 'AnyAIGC',
      url: SITE,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web',
      inLanguage: 'zh-CN',
      description: '一站式 AI 聚合平台：对话、图像、视频、声音与智能体，主流大模型统一接入，一个账号全部用上。',
      featureList: FEATURES,
      keywords: MODELS.join(','),
      publisher: { '@id': `${SITE}#org` }
    }
  ]
};

const safeJson = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

let html = await readFile(PAGE, 'utf8');
const re = /(<!--SEO:JSONLD-->)[\s\S]*?(<!--\/SEO:JSONLD-->)/;
if (!re.test(html)) throw new Error('index.html 里找不到 <!--SEO:JSONLD--> 标记');
html = html.replace(re, (_, a, b) => `${a}\n<script type="application/ld+json">\n${safeJson(ld)}\n</script>\n${b}`);
await writeFile(PAGE, html);

const today = new Date().toISOString().slice(0, 10);
await writeFile(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);
console.log(`JSON-LD 已写入 index.html；sitemap.xml lastmod=${today}`);
