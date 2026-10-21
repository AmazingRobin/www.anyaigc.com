// 第 5 章 · 视频生成：取景框里的粒子点阵霓虹街道，持续"播放"——
// 镜头缓慢推进（运镜）、霓虹招牌闪烁、雨丝斜落；DOM 叠加 REC 时间码、参数与进度条。
// 画面颜色取自原创插画 assets/scenes/video-street.svg。
import { dust, clamp, rand, TAU, FOCAL, sampleImage } from '../lib.js';

const SRC = 'assets/showcase/neon-rain-city.webp';
const CLIP = 5;    // 片长（秒），时间码与进度条按它循环
const FPS = 24;
const GRID = 0.7;  // 点阵占用的粒子比例
const RAIN = 0.12; // 雨丝占用的粒子比例
const TRAIL = 3;   // 每条雨丝的粒子数
const VPX = 330 / 640, VPY = 178 / 360; // 插画的消失点（归一化）

const S = {
  n: 0, cols: 0, rows: 0, x: 0, y: 0, w: 0, h: 0, gap: 4, vx: 0, vy: 0,
  gx: null, gy: null, gz: null, col: null, neon: null, blk: null,
  nr: 0, rain: null, dataKey: '',
  el: null, tc: null, bar: null, lastF: -1
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function makeOverlay(ctx) {
  const root = el('div', 'vid-fx');
  const head = el('div', 'vid-fx__head');
  const rec = el('span', 'vid-fx__rec');
  rec.append(el('i', 'vid-fx__dot'), el('span', null, 'REC'));
  const tc = el('span', 'vid-fx__tc', '00:00:00:00');
  rec.append(tc);
  const meta = el('span', 'vid-fx__meta', '图生视频 · 5s · 1080P · 24fps');
  head.append(rec, meta);
  const frame = el('div', 'vid-fx__frame');
  for (const k of ['tl', 'tr', 'bl', 'br']) frame.append(el('i', `vid-fx__c vid-fx__c--${k}`));
  const track = el('div', 'vid-fx__track');
  const bar = el('i');
  track.append(bar);
  root.append(head, frame, track);
  ctx.layer.append(root);
  S.el = root; S.tc = tc; S.bar = bar;
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;

function applyImage(data) {
  const d = data.data;
  for (let i = 0; i < S.n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // 饱和且明亮的像素视为霓虹，参与闪烁
    S.neon[i] = clamp((mx - 0.45) * 2.2) * clamp((mx - mn) * 2.2);
    S.col[i * 3] = Math.min(1, r * 1.1); S.col[i * 3 + 1] = Math.min(1, g * 1.1); S.col[i * 3 + 2] = Math.min(1, b * 1.1);
    // 越亮越"凸出"，做出参考图那种立体点阵
    S.gz[i] += mx * 26;
  }
}

export default {
  id: 'video',

  init(ctx) { makeOverlay(ctx); },

  layout(ctx) {
    const b = ctx.box;
    const top = ctx.isSmall ? 30 : 44, bottom = ctx.isSmall ? 26 : 34;
    let w = b.width - (ctx.isSmall ? 8 : 24), h = w * 9 / 16;
    const maxH = Math.max(80, b.height - top - bottom);
    if (h > maxH) { h = maxH; w = h * 16 / 9; }
    S.w = w; S.h = h;
    S.x = b.x + (b.width - w) / 2;
    S.y = b.y + top + (b.height - top - bottom - h) / 2;
    S.vx = S.x + w * VPX; S.vy = S.y + h * VPY;

    const budget = Math.floor(ctx.N * GRID);
    S.cols = Math.max(16, Math.floor(Math.sqrt(budget * w / h)));
    S.rows = Math.max(9, Math.floor(budget / S.cols));
    S.n = S.cols * S.rows;
    S.gap = w / S.cols;
    S.gx = new Float32Array(S.n); S.gy = new Float32Array(S.n); S.gz = new Float32Array(S.n);
    S.col = new Float32Array(S.n * 3); S.neon = new Float32Array(S.n); S.blk = new Float32Array(S.n);
    const bs = Math.max(2, Math.round(S.cols / 22));
    for (let r = 0; r < S.rows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const i = r * S.cols + c;
        const u = (c + 0.5) / S.cols, v = (r + 0.5) / S.rows;
        S.gx[i] = u; S.gy[i] = v;
        // 离消失点越远越靠近观众
        const dx = (u - VPX) * 16 / 9, dy = v - VPY;
        S.gz[i] = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.9) * 90 - 40;
        S.blk[i] = rand(Math.floor(c / bs) * 733 + Math.floor(r / bs) * 97, 61);
        S.col[i * 3] = 0.08; S.col[i * 3 + 1] = 0.1; S.col[i * 3 + 2] = 0.25;
      }
    }
    const key = `${S.cols}x${S.rows}`;
    S.dataKey = key;
    sampleImage(SRC, S.cols, S.rows).then((data) => { if (S.dataKey === key) applyImage(data); }).catch(() => {});

    S.nr = Math.floor(ctx.N * RAIN / TRAIL);
    S.rain = new Float32Array(S.nr * 4);
    for (let k = 0; k < S.nr; k++) {
      S.rain[k * 4] = rand(k, 71);           // 起始横向位置
      S.rain[k * 4 + 1] = rand(k, 72);       // 相位
      S.rain[k * 4 + 2] = 0.7 + rand(k, 73) * 0.8; // 速度
      S.rain[k * 4 + 3] = rand(k, 74);       // 深度
    }

    if (S.el) {
      const st = S.el.style;
      st.left = `${S.x}px`; st.top = `${S.y - top}px`;
      st.width = `${S.w}px`; st.height = `${S.h + top + bottom}px`;
      st.setProperty('--vid-top', `${top}px`);
      st.setProperty('--vid-h', `${S.h}px`);
    }
  },

  frame(buf, t, p, ctx) {
    const tt = ctx.reduceMotion ? 0 : t;
    const N = ctx.N, n = Math.min(S.n, N);
    // 运镜：围绕消失点缓慢推进（往返，避免循环跳变），滚动再额外推近一点
    const zoom = 1 + 0.09 * (0.5 - 0.5 * Math.cos(tt * TAU / 14)) + 0.05 * p;
    const sway = Math.sin(tt * 0.31) * S.w * 0.006;
    const size = clamp(S.gap * 1.75, 3, 8) * (0.9 + 0.1 * zoom);
    const x0 = S.x, y0 = S.y, x1 = S.x + S.w, y1 = S.y + S.h;
    const edge = S.gap * 1.5;
    const cx = ctx.vw / 2, cy = ctx.vh / 2;

    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const bx = x0 + S.gx[i] * S.w, by = y0 + S.gy[i] * S.h;
      const x = S.vx + (bx - S.vx) * zoom + sway;
      const y = S.vy + (by - S.vy) * zoom;
      // 推出取景框的点淡出
      const ex = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const vis = clamp(ex / edge);
      // 霓虹闪烁：按色块错峰呼吸，偶尔快速闪断
      const h = S.blk[i];
      let fl = 1;
      const ne = S.neon[i];
      if (ne > 0) {
        const ph = (tt * (0.35 + h * 0.5) + h * 7) % 1;
        const cut = ph < 0.05 ? 0.25 : ph < 0.08 ? 0.8 : 1;
        fl = 1 - ne * (1 - (0.78 + 0.22 * Math.sin(tt * (3 + h * 5) + h * 40)) * cut);
      }
      // 反投影：让带深度的点在屏幕上仍落在取景框内（透视以视口中心为原点）
      const z = S.gz[i] * zoom, inv = (FOCAL - z) / FOCAL;
      buf.pos[j] = cx + (x - cx) * inv; buf.pos[j + 1] = cy + (y - cy) * inv; buf.pos[j + 2] = z;
      buf.col[j] = S.col[j] * fl; buf.col[j + 1] = S.col[j + 1] * fl; buf.col[j + 2] = S.col[j + 2] * fl;
      buf.size[i] = size;
      buf.alpha[i] = (0.62 + 0.38 * fl) * vis;
    }

    // 雨丝：斜向下落，每条由几颗粒子拖出尾迹，范围比取景框略大
    let i = n;
    const rw = S.w * 1.15, rh = S.h * 1.25, rx = S.x - S.w * 0.1, ry = S.y - S.h * 0.15;
    const slant = 0.22;
    for (let k = 0; k < S.nr && i + TRAIL <= N; k++) {
      const sp = S.rain[k * 4 + 2], dep = S.rain[k * 4 + 3];
      const fall = (S.rain[k * 4 + 1] + tt * sp * 0.55) % 1;
      const yy = ry + fall * rh;
      const xx = rx + ((S.rain[k * 4] + fall * slant * rh / rw) % 1) * rw;
      const z = 60 + dep * 160;
      const len = (10 + sp * 12) * (0.6 + dep);
      const fade = Math.sin(fall * Math.PI);
      for (let s = 0; s < TRAIL; s++, i++) {
        const j = i * 3, f = s / TRAIL;
        buf.pos[j] = xx - f * len * slant; buf.pos[j + 1] = yy - f * len; buf.pos[j + 2] = z;
        buf.col[j] = 0.72; buf.col[j + 1] = 0.82; buf.col[j + 2] = 1;
        buf.size[i] = 2.6 + dep * 2;
        buf.alpha[i] = (0.95 - f * 0.55) * fade * (0.55 + 0.45 * dep);
      }
    }
    dust(buf, ctx, i, t);

    if (S.el) {
      S.el.style.opacity = ctx.weight.toFixed(3);
      const tot = Math.floor(tt * FPS) % (CLIP * FPS);
      if (tot !== S.lastF) {
        S.lastF = tot;
        const sec = Math.floor(tot / FPS), fr = tot % FPS;
        S.tc.textContent = `00:00:${pad2(sec)}:${pad2(fr)}`;
        S.bar.style.transform = `scaleX(${((tot + 1) / (CLIP * FPS)).toFixed(4)})`;
      }
    }
  }
};
