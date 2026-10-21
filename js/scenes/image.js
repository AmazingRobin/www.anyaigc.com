// 第 4 章 · 图像生成：右侧 16:9 粒子点阵画面，随滚动从随机噪声"降噪"成一张赛博少女侧脸。
// 每个网格点一颗粒子（类似 LED 点阵），颜色取自原创插画 assets/scenes/image-portrait.svg。
import { dust, ramp, clamp, smooth, rand, TAU, sampleImage } from '../lib.js';

const SRC = 'assets/showcase/sci-fi-fashion-portrait.webp';
const STEPS = 30;
const SHARE = 0.84; // 画面占用的粒子比例，其余交给微尘

const S = {
  n: 0, cols: 0, rows: 0, x: 0, y: 0, w: 0, h: 0, gap: 4,
  tx: null, ty: null, noise: null, img: null, seed: null,
  data: null, dataKey: '', el: null, num: null, fill: null, lastStep: -1
};

function makeOverlay(ctx) {
  const root = document.createElement('div');
  root.className = 'img-fx';
  const head = document.createElement('div');
  head.className = 'img-fx__head';
  const lab = document.createElement('span');
  lab.className = 'img-fx__lab';
  lab.textContent = 'DENOISE';
  const num = document.createElement('b');
  num.className = 'img-fx__num';
  num.textContent = '1';
  const tot = document.createElement('span');
  tot.className = 'img-fx__tot';
  tot.textContent = `/ ${STEPS}`;
  head.append(lab, num, tot);

  const line = document.createElement('div');
  line.className = 'img-fx__line';
  const fill = document.createElement('i');
  line.append(fill);

  const prompt = document.createElement('div');
  prompt.className = 'img-fx__prompt';
  const tag = document.createElement('span');
  tag.className = 'img-fx__tag';
  tag.textContent = '提示词';
  const txt = document.createElement('span');
  txt.textContent = '赛博少女，霓虹雨夜，电影光感，8K';
  prompt.append(tag, txt);

  root.append(head, line, prompt);
  ctx.layer.append(root);
  S.el = root; S.num = num; S.fill = fill;
}

function applyImage() {
  if (!S.data || !S.img) return;
  const d = S.data.data;
  for (let i = 0; i < S.n; i++) {
    // 稍微提亮暗部，加色混合下更像发光屏幕
    for (let c = 0; c < 3; c++) S.img[i * 3 + c] = Math.min(1, Math.pow(d[i * 4 + c], 0.78) * 1.15);
  }
}

export default {
  id: 'image',

  init(ctx) { makeOverlay(ctx); },

  layout(ctx) {
    const b = ctx.box;
    const top = ctx.isSmall ? 30 : 40, bottom = ctx.isSmall ? 56 : 76;
    let w = b.width, h = w * 9 / 16;
    const maxH = Math.max(80, b.height - top - bottom);
    if (h > maxH) { h = maxH; w = h * 16 / 9; }
    S.w = w; S.h = h;
    S.x = b.x + (b.width - w) / 2;
    S.y = b.y + top + (b.height - top - bottom - h) / 2;

    const budget = Math.floor(ctx.N * SHARE);
    S.cols = Math.max(16, Math.floor(Math.sqrt(budget * w / h)));
    S.rows = Math.max(9, Math.floor(budget / S.cols));
    S.n = S.cols * S.rows;
    S.gap = w / S.cols;

    S.tx = new Float32Array(S.n); S.ty = new Float32Array(S.n);
    S.noise = new Float32Array(S.n * 3); S.img = new Float32Array(S.n * 3);
    S.seed = new Float32Array(S.n * 4);
    // 噪声：粗色块 + 逐点随机亮度，像未降噪的潜空间
    const bw = Math.max(1, Math.round(S.cols / 18));
    for (let r = 0; r < S.rows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const i = r * S.cols + c;
        S.tx[i] = S.x + (c + 0.5) * S.gap;
        S.ty[i] = S.y + (r + 0.5) * (h / S.rows);
        const blk = Math.floor(c / bw) * 977 + Math.floor(r / bw) * 131;
        const col = ramp(rand(blk, 41));
        const k = 0.25 + 0.9 * rand(i, 42);
        const mixW = rand(i, 43) < 0.3 ? 1 : 0; // 三成粒子是纯随机色
        const alt = ramp(rand(i, 44));
        for (let ch = 0; ch < 3; ch++) S.noise[i * 3 + ch] = (col[ch] * (1 - mixW) + alt[ch] * mixW) * k;
        S.seed[i * 4] = rand(i, 45) - 0.5;
        S.seed[i * 4 + 1] = rand(i, 46) - 0.5;
        S.seed[i * 4 + 2] = rand(i, 47) * TAU;
        S.seed[i * 4 + 3] = rand(i, 48);
      }
    }

    // 默认先用噪声色当作图像色，图片到了再替换
    S.img.set(S.noise);
    const key = `${S.cols}x${S.rows}`;
    S.dataKey = key;
    sampleImage(SRC, S.cols, S.rows).then((data) => {
      if (S.dataKey !== key) return;
      S.data = data; applyImage();
    }).catch(() => {});

    // 叠加层位置（视口坐标）
    if (S.el) {
      const st = S.el.style;
      st.left = `${S.x}px`; st.top = `${S.y - top + 4}px`;
      st.width = `${S.w}px`; st.height = `${S.h + top + bottom - 4}px`;
      st.setProperty('--img-h', `${S.h}px`);
      st.setProperty('--img-top', `${top - 4}px`);
    }
  },

  frame(buf, t, p, ctx) {
    const tt = ctx.reduceMotion ? 0 : t;
    // 降噪进度：留出开头和结尾的停顿
    const q = smooth(0.04, 0.78, p);
    const step = Math.max(1, Math.min(STEPS, 1 + Math.floor(q * STEPS)));
    // 噪声量随步数非线性下降（前几步变化大，最后几步只剩细节）
    const k = Math.pow(1 - q, 1.6);
    const scatter = S.gap * 26 * k * k + S.gap * 1.6 * k;
    const n = Math.min(S.n, ctx.N);
    const base = ctx.isSmall ? 1.85 : 1.7;
    const size = clamp(S.gap * base, 3, 8);

    for (let i = 0; i < n; i++) {
      const s0 = S.seed[i * 4], s1 = S.seed[i * 4 + 1], ph = S.seed[i * 4 + 2], s3 = S.seed[i * 4 + 3];
      // 噪声粒子带一点抖动，画面成形后只剩轻微呼吸
      const jit = Math.sin(tt * (2 + s3 * 3) + ph);
      const x = S.tx[i] + s0 * scatter + jit * S.gap * 0.6 * k;
      const y = S.ty[i] + s1 * scatter + Math.cos(tt * 1.7 + ph) * S.gap * 0.6 * k;
      const z = (s3 - 0.5) * 220 * k * k + Math.sin(tt * 0.8 + S.tx[i] * 0.01 + S.ty[i] * 0.006) * 4 * (1 - k);
      const j = i * 3;
      const f = 1 - k;
      const r = S.noise[j] * k + S.img[j] * f;
      const g = S.noise[j + 1] * k + S.img[j + 1] * f;
      const bl = S.noise[j + 2] * k + S.img[j + 2] * f;
      const tw = 0.9 + 0.1 * Math.sin(tt * 1.3 + ph);
      const a = (0.55 + 0.45 * f) * (k > 0.02 ? 0.75 + 0.25 * jit : tw);
      buf.pos[j] = x; buf.pos[j + 1] = y; buf.pos[j + 2] = z;
      buf.col[j] = r; buf.col[j + 1] = g; buf.col[j + 2] = bl;
      buf.size[i] = size * (1 + 0.5 * k * s3);
      buf.alpha[i] = a;
    }
    dust(buf, ctx, n, t);

    if (S.el) {
      S.el.style.opacity = ctx.weight.toFixed(3);
      if (step !== S.lastStep) {
        S.lastStep = step;
        S.num.textContent = String(step);
        S.fill.style.transform = `scaleX(${(step / STEPS).toFixed(3)})`;
      }
    }
  }
};
