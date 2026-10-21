// 第 8 章「灵感」：作品画框组成的 3D 隧道。
// p 0~0.2：星尘虫洞（中心黑洞、粒子沿隧道壁向镜头流动），随后向中心汇聚再散开；
// p 0.15~1：镜头沿 z 轴穿行，画框从远处小而淡逐渐变大，掠过屏幕边缘。
// 画框 = DOM <img>（按 ctx.project 计算位置与缩放）+ 粒子虚线发光边框（与图片同一深度平面，投影完全一致）。
import { dust, put, rand, TAU, smooth, roundRectPoint } from '../lib.js';

// 作品图（assets/showcase/，均为 1024×576），a = 宽/高
const ART = [
  { src: 'assets/showcase/orbital-station.webp', a: 16 / 9, alt: '轨道空间站' },
  { src: 'assets/showcase/sci-fi-fashion-portrait.webp', a: 16 / 9, alt: '科幻时装人像' },
  { src: 'assets/showcase/hologram-orb.webp', a: 16 / 9, alt: '全息光球' },
  { src: 'assets/showcase/dragon-traveler.webp', a: 16 / 9, alt: '巨龙与旅人' },
  { src: 'assets/showcase/service-robot.webp', a: 16 / 9, alt: '服务机器人' },
  { src: 'assets/showcase/fantasy-tree-lake.webp', a: 16 / 9, alt: '奇幻湖畔古树' },
  { src: 'assets/showcase/astronaut-hangar.webp', a: 16 / 9, alt: '机库里的宇航员' },
  { src: 'assets/showcase/waterfall-valley.webp', a: 16 / 9, alt: '瀑布山谷' },
  { src: 'assets/showcase/ice-rover.webp', a: 16 / 9, alt: '冰原探测车' },
  { src: 'assets/showcase/android-portrait.webp', a: 16 / 9, alt: '仿生人肖像' },
  { src: 'assets/showcase/neon-rain-city.webp', a: 16 / 9, alt: '霓虹雨夜城市' },
  { src: 'assets/showcase/audio-waveform.webp', a: 16 / 9, alt: '音频波形' }
];

const K = 16;            // 画框数量（作品循环使用）
const GAP = 480;         // 相邻画框的深度间隔
const Z0 = -2700;        // 第一个画框的初始深度
const FAR = -3000;       // 星尘隧道最远处
const DEPTH = 3700;      // 星尘隧道深度
const TMAX = -Z0 + (K - 1) * GAP - 200; // p=1 时最后一个画框接近屏幕平面

const BORDER = [0.82, 0.93, 1];
const BORDER2 = [0.62, 0.78, 1];
const DUST_A = [0.72, 0.78, 1];
const DUST_B = [0.82, 0.7, 1];
const DUST_C = [0.95, 0.95, 1];

const S = {
  frames: [], imgs: [], nb: 0, nTunnel: 0,
  lx: null, ly: null, glow: null, cx: 0, cy: 0, R: 0
};

export default {
  id: 'gallery',

  init(ctx) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    for (let i = 0; i < K; i++) {
      const art = ART[i % ART.length];
      const img = document.createElement('img');
      img.src = art.src;
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.style.cssText = 'position:absolute;left:0;top:0;transform-origin:50% 50%;border-radius:6px;opacity:0;' +
        'will-change:transform,opacity;box-shadow:0 0 24px rgba(110,170,255,.18);user-select:none';
      img.style.zIndex = String(K - i);
      wrap.append(img);
      S.imgs.push(img);
    }
    ctx.layer.append(wrap);
  },

  layout(ctx) {
    const { N, vw, vh, isSmall } = ctx;
    S.cx = vw / 2;
    S.cy = vh / 2 + (isSmall ? vh * 0.04 : vh * 0.02);
    S.R = Math.max(vw, vh) * 0.5;
    const rx = vw * (isSmall ? 0.3 : 0.34), ry = vh * (isSmall ? 0.28 : 0.3);
    const baseW = isSmall ? vw * 0.46 : Math.min(460, vw * 0.27);

    S.nb = Math.max(80, Math.floor(N * 0.0105));
    const nb = S.nb;
    S.lx = new Float32Array(K * nb);
    S.ly = new Float32Array(K * nb);
    S.glow = new Uint8Array(K * nb);
    S.frames = [];

    for (let i = 0; i < K; i++) {
      const art = ART[i % ART.length];
      // 沿隧道壁按黄金角分布，稍带随机
      const th = i * 2.39996 + 0.6 + (rand(i, 51) - 0.5) * 0.5;
      const rad = 0.75 + rand(i, 52) * 0.45;
      const w = baseW * (0.8 + rand(i, 53) * 0.4) * (art.a < 1 ? 0.62 : 1);
      const h = w / art.a;
      const f = {
        x: Math.cos(th) * rx * rad, y: Math.sin(th) * ry * rad,
        z: Z0 - i * GAP, w, h,
        roll: (rand(i, 54) - 0.5) * 0.16,
        sway: rand(i, 55) * TAU
      };
      S.frames.push(f);
      S.imgs[i].style.width = `${w.toFixed(1)}px`;
      S.imgs[i].style.height = `${h.toFixed(1)}px`;

      // 虚线边框：沿圆角矩形取点，每段虚线占 60%；约 1/5 的粒子向外散开成光晕
      const pad = 9;
      const bw = w + pad * 2, bh = h + pad * 2;
      const perim = 2 * (bw + bh);
      const dashes = Math.max(24, Math.round(perim / 16));
      for (let j = 0; j < nb; j++) {
        const q = ((j + 0.5) / nb) * dashes;
        const u = (Math.floor(q) + (q % 1) * 0.6) / dashes;
        const pt = roundRectPoint(-bw / 2, -bh / 2, bw, bh, 8, u);
        const k = i * nb + j;
        let px = pt[0], py = pt[1];
        const g = j % 5 === 0;
        if (g) {
          const len = Math.hypot(px, py) || 1;
          const o = 3 + rand(k, 56) * 10;
          px += (px / len) * o; py += (py / len) * o;
        }
        S.lx[k] = px; S.ly[k] = py; S.glow[k] = g ? 1 : 0;
      }
    }
    S.nTunnel = Math.min(N - K * nb, Math.floor(N * 0.74));
  },

  frame(buf, t, p, ctx) {
    if (!S.lx) this.layout(ctx);
    const { N } = ctx;
    const tt = ctx.reduceMotion ? 0 : t;
    const nb = S.nb, cx = S.cx, cy = S.cy, R = S.R;
    const travel = smooth(0.14, 1, p);
    const T = travel * TMAX;
    // 虫洞汇聚：先向中心收拢压扁，再散开成隧道
    const bump = smooth(0.03, 0.15, p) * (1 - smooth(0.17, 0.3, p));
    const rk = 1 - 0.62 * bump, yk = 1 - 0.5 * bump;
    const show = smooth(0.12, 0.24, p);
    const w = ctx.weight;
    let o = 0;

    /* ---------- 画框 ---------- */
    for (let i = 0; i < K; i++) {
      const f = S.frames[i];
      const z = f.z + T;
      const fade = smooth(-2900, -1900, z) * (1 - smooth(560, 760, z)) * show;
      const roll = f.roll + Math.sin(tt * 0.4 + f.sway) * 0.02;
      const c = Math.cos(roll), s = Math.sin(roll);
      const fx = cx + f.x + Math.sin(tt * 0.3 + f.sway) * 8;
      const fy = cy + f.y + Math.cos(tt * 0.25 + f.sway) * 6;
      const zz = Math.min(z, 780);
      const breathe = 0.85 + 0.15 * Math.sin(tt * 1.6 + f.sway);

      for (let j = 0; j < nb; j++, o++) {
        const k = i * nb + j;
        const lx = S.lx[k], ly = S.ly[k];
        const x = fx + lx * c - ly * s, y = fy + lx * s + ly * c;
        if (S.glow[k]) {
          put(buf, o, x, y, zz, BORDER2, 2.6 + rand(o, 57) * 2, fade * 0.38 * breathe);
        } else {
          // 沿边框流动的亮点
          const run = 0.5 + 0.5 * Math.sin((j / nb) * TAU * 3 - tt * 2.2 + f.sway);
          put(buf, o, x, y, zz, BORDER, 3.2 + run * 1.4, fade * (0.55 + 0.45 * run));
        }
      }

      // DOM 图片：与粒子同一深度平面
      const img = S.imgs[i];
      const op = fade * w;
      if (op < 0.01 || z > 760) {
        if (img.style.opacity !== '0') img.style.opacity = '0';
        continue;
      }
      const pr = ctx.project(fx, fy, zz);
      img.style.opacity = (op * 0.95).toFixed(3);
      img.style.transform = `translate(${(pr.x - f.w / 2).toFixed(1)}px,${(pr.y - f.h / 2).toFixed(1)}px) scale(${pr.s.toFixed(4)}) rotate(${roll.toFixed(4)}rad)`;
    }

    /* ---------- 星尘隧道 / 虫洞 ---------- */
    const flow = tt * 80 + T * 1.05;
    const spin = tt * 0.035;
    const end = o + S.nTunnel;
    for (let i = o; i < end; i++) {
      const zs = rand(i, 23);
      const z = FAR + (((zs * DEPTH + flow) % DEPTH) + DEPTH) % DEPTH;
      // 靠近隧道壁更密，中心留出黑洞
      const rr = R * (0.42 + Math.pow(rand(i, 22), 1.4) * 0.85) * rk;
      const a = rand(i, 21) * TAU + spin + z * 0.00018 * (1 - travel * 0.7);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.86 * yk;
      const fade = smooth(FAR, FAR + 700, z) * (1 - smooth(250, 620, z));
      const tw = 0.65 + 0.35 * Math.sin(tt * (1 + rand(i, 24) * 2) + rand(i, 25) * TAU);
      const big = rand(i, 26) > 0.975;
      const hue = rand(i, 27);
      const col = hue < 0.65 ? DUST_A : hue < 0.85 ? DUST_B : DUST_C;
      // 远处按透视放大一部分尺寸，避免被引擎的"小点降亮"压得太暗
      const comp = Math.min(2.6, Math.max(1, (900 - z) / 1100));
      const size = (big ? 6 + rand(i, 28) * 4 : 2.2 + rand(i, 28) * 2.6) * comp;
      const alpha = (big ? 0.6 : 0.4 + rand(i, 29) * 0.5) * fade * tw * (1 + bump * 0.5);
      put(buf, i, x, y, Math.min(z, 700), col, size, alpha);
    }

    dust(buf, ctx, end, t, { alpha: 0.28 });
  }
};
