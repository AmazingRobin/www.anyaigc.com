// 第 6 章 声音：横贯整屏的粒子声波。
// 中间一条极亮细线（青→蓝→紫→粉→橙），周围一团体积感的粒子云；
// 振幅包络沿 x 方向有几个"音节"鼓包，随时间流动、跳动，像正在播放的音频。
import { dust, put, ramp, clamp, smooth, TAU, rand } from '../lib.js';

const G = 320;                       // 包络采样点数
const env = new Float32Array(G + 1);  // 每帧重算的振幅包络（0..1）
const base = new Float32Array(G + 1); // 每帧重算的中心线 y 偏移
const col = [0, 0, 0];
// 色板查找表：避免 frame 内调用 ramp() 分配数组
const LUT_N = 256;
const LUT = Array.from({ length: LUT_N + 1 }, (_, k) => ramp(k / LUT_N));
const lut = (xn) => LUT[Math.round(clamp(xn) * LUT_N)];

// 音节鼓包：中心 x（0..1）、宽度、峰值
const BUMPS = [
  [0.12, 0.05, 0.35],
  [0.27, 0.07, 0.72],
  [0.47, 0.075, 1.0],
  [0.63, 0.06, 0.82],
  [0.8, 0.07, 0.62],
  [0.93, 0.05, 0.5]
];

let L = null;

function makeLayout(ctx) {
  const { N, vw, box } = ctx;
  const nLine = Math.round(N * 0.12);
  const nGlow = Math.round(N * 0.025);
  const nCloud = Math.round(N * 0.78);
  const cy = box.y + box.height * (ctx.isSmall ? 0.5 : 0.38);
  const H = Math.min(box.height * 0.3, ctx.isSmall ? 70 : 115);
  // 每个云粒子的固定属性
  const cu = new Float32Array(nCloud), cr = new Float32Array(nCloud), cz = new Float32Array(nCloud);
  const cs = new Float32Array(nCloud), ca = new Float32Array(nCloud), cv = new Float32Array(nCloud);
  for (let i = 0; i < nCloud; i++) {
    const k = 1000 + i;
    cu[i] = rand(k, 1);
    const u = rand(k, 2);
    // 中心密、外缘稀：大部分粒子靠近中心，少部分外扩到包络边缘
    cr[i] = (rand(k, 3) < 0.5 ? -1 : 1) * Math.pow(u, 1.25);
    cz[i] = rand(k, 4) - 0.5;
    cs[i] = 2.6 + rand(k, 5) * 3;
    ca[i] = 0.5 + rand(k, 6) * 0.5;
    cv[i] = 0.6 + rand(k, 7) * 0.8; // 横向流速
  }
  return { N, nLine, nGlow, nCloud, cy, H, x0: -vw * 0.03, w: vw * 1.06, cu, cr, cz, cs, ca, cv };
}

function sample(arr, xn) {
  const f = clamp(xn) * G, i = Math.min(G - 1, f | 0);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

export default {
  id: 'audio',
  layout(ctx) { L = makeLayout(ctx); },
  frame(buf, t, p, ctx) {
    if (!L || L.N !== ctx.N) L = makeLayout(ctx);
    const { nLine, nGlow, nCloud, cy, H, x0, w, cu, cr, cz, cs, ca, cv } = L;
    const tm = ctx.reduceMotion ? 0 : t;
    const gain = 0.82 + 0.25 * smooth(0, 1, p);
    const ph = p * 2.2;

    // 1) 本帧包络与中心线
    for (let g = 0; g <= G; g++) {
      const xn = g / G;
      let e = 0.1;
      for (let b = 0; b < BUMPS.length; b++) {
        const B = BUMPS[b];
        const c = B[0] + 0.025 * Math.sin(tm * 0.35 + b * 1.9 + ph);
        const d = (xn - c) / B[1];
        // 跳动：两个不同频率的脉冲叠加，像音节的响度起伏
        const beat = (0.72 + 0.28 * Math.sin(tm * 2.1 + b * 1.7 + ph * 3)) * (0.82 + 0.18 * Math.sin(tm * 3.9 + b * 2.3));
        e += B[2] * beat * Math.exp(-d * d);
      }
      // 向右流动的细小波纹
      e += 0.12 * Math.max(0, Math.sin(xn * 26 - tm * 2.4 - ph * 4));
      const edge = smooth(0, 0.08, xn) * smooth(1, 0.9, xn);
      env[g] = Math.min(1.15, e) * (0.35 + 0.65 * edge) * gain;
      base[g] = -H * 0.28 * Math.sin(Math.PI * xn) + H * 0.06 * Math.sin(xn * 9 - tm * 1.3) + H * 0.04 * Math.sin(xn * 17 + tm * 2.0);
    }

    let i = 0;
    // 2) 中心亮线
    for (let k = 0; k < nLine; k++, i++) {
      const xn = (k + 0.5) / nLine;
      const x = x0 + xn * w;
      const jit = (rand(i, 21) - 0.5) * 2.2;
      const y = cy + sample(base, xn) + jit;
      const c = lut(xn);
      const lum = 0.1 + 0.12 * sample(env, xn);
      col[0] = c[0] + (1 - c[0]) * lum; col[1] = c[1] + (1 - c[1]) * lum; col[2] = c[2] + (1 - c[2]) * lum;
      const tw = 0.85 + 0.15 * Math.sin(tm * 6 + rand(i, 22) * TAU);
      put(buf, i, x, y, (rand(i, 23) - 0.5) * 6, col, 3.5 + rand(i, 24) * 2.5, tw);
    }
    // 3) 亮线辉光（少量大而淡的点）
    for (let k = 0; k < nGlow; k++, i++) {
      const xn = (k + 0.5) / nGlow;
      const x = x0 + xn * w;
      const c = lut(xn);
      put(buf, i, x, cy + sample(base, xn) + (rand(i, 25) - 0.5) * 4, 0, c, 10 + rand(i, 26) * 6, 0.22);
    }
    // 4) 体积粒子云
    for (let k = 0; k < nCloud; k++, i++) {
      let xn = cu[k] + tm * 0.006 * cv[k];
      xn -= Math.floor(xn);
      const e = sample(env, xn);
      const r = cr[k];
      const ar = Math.abs(r);
      // 轻微的横向抖动，让云"呼吸"
      const breathe = 1 + 0.06 * Math.sin(tm * 3 + k * 0.37);
      const y = cy + sample(base, xn) + r * e * H * breathe;
      const z = cz[k] * e * H * 1.6;
      const x = x0 + xn * w + Math.sin(tm * 0.8 + k) * 2;
      const c = lut(xn);
      // 靠近中心偏白、外缘保持色相
      const wht = 0.12 * (1 - ar);
      col[0] = c[0] + (1 - c[0]) * wht; col[1] = c[1] + (1 - c[1]) * wht; col[2] = c[2] + (1 - c[2]) * wht;
      const edge = smooth(0, 0.04, xn) * smooth(1, 0.96, xn);
      const a = ca[k] * (1 - 0.35 * ar) * edge * (0.75 + 0.25 * Math.sin(tm * (1.5 + cv[k]) + k));
      put(buf, i, x, y, z, col, cs[k], a);
    }
    dust(buf, ctx, i, t);
  }
};
