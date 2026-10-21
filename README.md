# AnyAIGC · AI 聚合平台

一个入口，调度全球顶尖 AI。

AnyAIGC 把 GPT、Claude、Gemini、DeepSeek、Suno、可灵、即梦等主流大模型统一接入同一个平台：对话、图像、视频、声音与智能体，不用在十几个网站之间来回切换，一个账号全部用上。

本仓库是平台的介绍落地页 **www.anyaigc.com**。平台API主域名 **[anyaigc.ai](https://anyaigc.ai)**。

## 站点与入口

| 地址 | 用途 |
| --- | --- |
| [www.anyaigc.com](https://www.anyaigc.com) | 落地页：平台介绍 |
| [anyaigc.ai](https://anyaigc.ai) | 平台主站：注册登录、API接口 |
| [anyaigc.ai/pricing](https://anyaigc.ai/pricing) | 模型广场：300+ 模型与价格 |
| [docs.anyaigc.ai](https://docs.anyaigc.ai) | 开发者 API 文档 |
| [vip.anyaigc.ai](https://vip.anyaigc.ai) | AI 会员 |
| [anyaigc.ai/customersupport](https://anyaigc.ai/customersupport) | 企业合作 |

## 平台能力

- **万模归一**：文本、图像、视频、音频模型统一接入。换模型就像换一支笔，不用换网站，也不用换账号。
- **一句话开始**：写下一句话，挑一个模型，剩下的交给 AI。
- **多模型对比**：同一个问题，多个模型同时作答，谁更快、谁更好，一屏看清。
- **图像生成**：从提示词到成图，支持即梦、Midjourney、Nano Banana 等图像模型。
- **视频生成**：一张图、一句话，生成带运镜的视频，支持可灵、Seedance、Sora、PixVerse、Vidu 等。
- **声音**：配音、音乐、音色克隆，为作品配上声音，支持Suno。
- **智能体**：从剧本、分镜、角色、画面到视频、配音、成片，多个模型自动接力。漫剧、短视频、营销素材，一句话发起。
- **开发者 API**：通过统一接口调用平台上的模型，详见 [docs.anyaigc.ai](https://docs.anyaigc.ai)。

已接入的模型包括：GPT、Claude、Gemini、Grok、DeepSeek、Suno、通义千问、Kimi、智谱 GLM、MiniMax、阶跃星辰、豆包、即梦、Midjourney、Nano Banana、可灵、Seedance、Sora、PixVerse、Vidu 等，完整列表以 [模型广场](https://anyaigc.ai/pricing) 为准。

---

### 目录结构

```
.
├── index.html          # 页面结构与全部文案、外部链接
├── css/
│   ├── main.css        # 公共样式：顶栏、按钮、章节布局、模型标签
│   └── *.css           # 各章节叠加层样式（prompt / compare / image / video / agent）
├── js/
│   ├── main.js         # 入口：注册场景、滚动驱动、章节导航
│   ├── engine.js       # 粒子引擎：WebGL2 渲染、场景间形变、鼠标挤开；文件头有场景接口说明
│   ├── lib.js          # 场景共用工具与模型清单 MODELS
│   └── scenes/         # 每个章节一个场景文件
├── assets/
│   ├── icons/          # 模型图标（<id>.svg，id 见 js/lib.js 的 MODELS）
│   ├── showcase/       # 作品图：灵感隧道、图像与视频章节的点阵画面
│   └── og-cover.png    # 分享封面，由 npm run og 生成
├── favicon.ico
├── robots.txt
├── sitemap.xml         # 由 npm run seo 生成
├── scripts/            # 维护脚本（SEO 数据、分享封面），部署时不需要
└── package.json        # 只用于运行维护脚本
```

### 本地预览

页面使用 ES 模块，不能双击 `index.html` 打开（`file://` 下浏览器会拦截模块加载），需要起一个本地静态服务：

```bash
npm run dev    # 等同于 python -m http.server 5180
```

然后访问 http://127.0.0.1:5180/ 。

### 部署

把 `index.html`、`css/`、`js/`、`assets/`、`favicon.ico`、`robots.txt`、`sitemap.xml` 上传到任意静态托管即可。
