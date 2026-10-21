// 场景共用的小工具。场景文件只从这里和 engine.js 导入。
import { rand, FOCAL } from './engine.js';

export { rand, FOCAL };

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

// '#rrggbb' -> [r,g,b] 0..1
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// 主色板：青 -> 天蓝 -> 靛 -> 紫 -> 粉 -> 橙（与 CSS 的 --c1..--c6 一致）
export const PALETTE = ['#7fe8ff', '#5aa8ff', '#7c7cff', '#a77bff', '#ff6fd8', '#ffb36b'].map(hex);
export const WHITE = [1, 1, 1];

// 在色板（或任意颜色数组）上按 0..1 取色
export function ramp(t, pal = PALETTE) {
  const x = clamp(t) * (pal.length - 1);
  const i = Math.min(pal.length - 2, Math.floor(x));
  const f = x - i;
  return [lerp(pal[i][0], pal[i + 1][0], f), lerp(pal[i][1], pal[i + 1][1], f), lerp(pal[i][2], pal[i + 1][2], f)];
}
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function setP(buf, i, x, y, z) { const j = i * 3; buf.pos[j] = x; buf.pos[j + 1] = y; buf.pos[j + 2] = z; }
export function setC(buf, i, c, k = 1) { const j = i * 3; buf.col[j] = c[0] * k; buf.col[j + 1] = c[1] * k; buf.col[j + 2] = c[2] * k; }
// 一次写满一个粒子
export function put(buf, i, x, y, z, c, size, alpha) {
  const j = i * 3;
  buf.pos[j] = x; buf.pos[j + 1] = y; buf.pos[j + 2] = z;
  buf.col[j] = c[0]; buf.col[j + 1] = c[1]; buf.col[j + 2] = c[2];
  buf.size[i] = size; buf.alpha[i] = alpha;
}

// 微尘：把 [from, N) 的粒子撒在整个视口的空间里，缓慢漂浮、轻微闪烁。
// 每个场景都应调用它处理用不上的粒子；opts.alpha 控制整体亮度（默认 0.35）。
export function dust(buf, ctx, from, t = 0, { alpha = 0.35, depth = 1600, tint = null } = {}) {
  const { N, vw, vh } = ctx;
  for (let i = from; i < N; i++) {
    const z = 200 - rand(i, 3) * depth;
    // 按深度放大铺开范围，让远处的微尘也能铺满屏幕
    const k = (FOCAL - z) / FOCAL;
    const x = vw / 2 + (rand(i, 1) - 0.5) * vw * 1.3 * k + Math.sin(t * 0.07 + rand(i, 4) * TAU) * 14;
    const y = vh / 2 + (rand(i, 2) - 0.5) * vh * 1.3 * k + Math.cos(t * 0.05 + rand(i, 5) * TAU) * 10;
    const c = tint || (rand(i, 6) < 0.7 ? [0.7, 0.78, 1] : rand(i, 6) < 0.85 ? [0.85, 0.7, 1] : [0.6, 0.95, 1]);
    const tw = 0.6 + 0.4 * Math.sin(t * (0.8 + rand(i, 7) * 1.5) + rand(i, 8) * TAU);
    put(buf, i, x, y, z, c, 2 + rand(i, 9) * 3, alpha * tw * (0.3 + 0.7 * rand(i, 10)));
  }
}

// 隐藏：把粒子放在原位但亮度为 0（用于需要"藏起来"的粒子）
export function hide(buf, from, to) { for (let i = from; i < to; i++) buf.alpha[i] = 0; }

// 文字/图形转点阵：在离屏 canvas 上绘制，返回所有不透明像素的坐标（相对绘制区左上角，CSS 像素）
// draw(ctx2d, w, h) 自行绘制；step 为采样间隔
export function rasterize(w, h, draw, step = 3) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      const a = d[(y * c.width + x) * 4 + 3];
      if (a > 128) pts.push([x, y, d[(y * c.width + x) * 4] / 255, d[(y * c.width + x) * 4 + 1] / 255, d[(y * c.width + x) * 4 + 2] / 255]);
    }
  }
  return pts;
}

// 采样一张图（SVG/PNG），返回 cols×rows 网格的颜色 [r,g,b,亮度]；图片加载完成后 resolve
const imgCache = new Map();
export function sampleImage(src, cols, rows) {
  const key = `${src}|${cols}x${rows}`;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = cols; c.height = rows;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, cols, rows);
      const d = g.getImageData(0, 0, cols, rows).data;
      const out = new Float32Array(cols * rows * 4);
      for (let i = 0; i < cols * rows; i++) {
        const r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
        out[i * 4] = r; out[i * 4 + 1] = gg; out[i * 4 + 2] = b; out[i * 4 + 3] = 0.3 * r + 0.59 * gg + 0.11 * b;
      }
      resolve({ cols, rows, data: out });
    };
    img.onerror = reject;
    img.src = src;
  });
  imgCache.set(key, p);
  return p;
}

// 圆角矩形轮廓上按参数 u∈[0,1) 取点，返回 [x, y]
export function roundRectPoint(x, y, w, h, r, u) {
  r = Math.min(r, w / 2, h / 2);
  const straightW = w - 2 * r, straightH = h - 2 * r, arc = (Math.PI / 2) * r;
  const L = 2 * straightW + 2 * straightH + 4 * arc;
  let d = (((u % 1) + 1) % 1) * L;
  const segs = [
    [straightW, (s) => [x + r + s, y]],
    [arc, (s) => { const a = -Math.PI / 2 + s / r; return [x + w - r + Math.cos(a) * r, y + r + Math.sin(a) * r]; }],
    [straightH, (s) => [x + w, y + r + s]],
    [arc, (s) => { const a = s / r; return [x + w - r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]; }],
    [straightW, (s) => [x + w - r - s, y + h]],
    [arc, (s) => { const a = Math.PI / 2 + s / r; return [x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]; }],
    [straightH, (s) => [x, y + h - r - s]],
    [arc, (s) => { const a = Math.PI + s / r; return [x + r + Math.cos(a) * r, y + r + Math.sin(a) * r]; }]
  ];
  for (const [len, f] of segs) { if (d <= len) return f(d); d -= len; }
  return [x + r, y];
}

// 模型清单（名称、品类、品牌色）。图标在 assets/icons/<id>.svg
export const MODELS = [
  { id: 'gpt', name: 'GPT', kind: '对话', color: '#e9eef7' },
  { id: 'claude', name: 'Claude', kind: '对话', color: '#e7865a' },
  { id: 'gemini', name: 'Gemini', kind: '多模态', color: '#7aa2ff' },
  { id: 'deepseek', name: 'DeepSeek', kind: '推理', color: '#5b7cff' },
  { id: 'qwen', name: '通义千问', kind: '对话', color: '#7b6cff' },
  { id: 'kimi', name: 'Kimi', kind: '长文本', color: '#f2f4f8' },
  { id: 'glm', name: '智谱 GLM', kind: '对话', color: '#4f7dff' },
  { id: 'minimax', name: 'MiniMax', kind: '语音', color: '#ff4f6d' },
  { id: 'grok', name: 'Grok', kind: '对话', color: '#f2f4f8' },
  { id: 'doubao', name: '豆包', kind: '对话', color: '#5ca8ff' },
  { id: 'jimeng', name: '即梦', kind: '图像', color: '#4fd6ff' },
  { id: 'midjourney', name: 'Midjourney', kind: '图像', color: '#d6dbe6' },
  { id: 'nanobanana', name: 'Nano Banana', kind: '图像', color: '#ffd05a' },
  { id: 'kling', name: '可灵', kind: '视频', color: '#4fe0b0' },
  { id: 'seedance', name: 'Seedance', kind: '视频', color: '#8f7bff' },
  { id: 'sora', name: 'Sora', kind: '视频', color: '#9cc4ff' },
  { id: 'pixverse', name: 'PixVerse', kind: '视频', color: '#ff7ac6' },
  { id: 'stepfun', name: '阶跃星辰', kind: '对话', color: '#f2f4f8' },
  { id: 'vidu', name: 'Vidu', kind: '视频', color: '#e9eef7' }
];
export const icon = (id) => `assets/icons/${id}.svg`;

// 创建一个模型标签（玻璃胶囊 + 图标 + 名称），返回元素；位置由场景每帧用 transform 设置
export function modelChip(m, { cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = `chip ${cls}`.trim();
  const img = document.createElement('img');
  img.src = icon(m.id); img.alt = ''; img.width = 18; img.height = 18;
  const span = document.createElement('span');
  span.textContent = m.name;
  const kind = document.createElement('em');
  kind.textContent = `· ${m.kind}`;
  el.append(img, span, kind);
  return el;
}
