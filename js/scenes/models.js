// 第 1 章「万模归一」：右侧倾斜的螺旋星系，19 个模型标签沿不同半径的轨道公转。
// 星系结构（由内向外）：暖白核心 + 柔光晕 -> 金色环 -> 白/青星轨 -> 蓝 -> 靛/紫外环 -> 零散亮星。
// 内圈角速度大、外圈小（差速旋转）；滚动进度 p 让镜头稍稍拉近、倾角略微抬起、星系多转一点。
import { dust, put, rand, TAU, PALETTE, MODELS, modelChip, clamp, lerp, smooth } from '../lib.js';

// 星轨环带：中心半径（相对星系半径）、宽度、权重
const BANDS = [
  [0.34, 0.016, 1.0], [0.43, 0.018, 1.15], [0.53, 0.02, 1.2],
  [0.64, 0.022, 1.15], [0.76, 0.024, 1.1], [0.88, 0.026, 1.05], [0.98, 0.03, 0.8]
];
const BAND_SUM = BANDS.reduce((s, b) => s + b[2], 0);

// 半径 -> 颜色：白 -> 青 -> 天蓝 -> 靛 -> 紫
const RSTOPS = [
  [0.28, [0.95, 0.96, 1.0]],
  [0.42, [0.82, 0.95, 1.0]],
  [0.55, PALETTE[0]],
  [0.68, [0.52, 0.74, 1.0]],
  [0.8, PALETTE[2]],
  [0.92, PALETTE[3]],
  [1.05, [0.62, 0.45, 1.0]]
];
function radialColor(r) {
  if (r <= RSTOPS[0][0]) return RSTOPS[0][1];
  for (let i = 1; i < RSTOPS.length; i++) {
    if (r <= RSTOPS[i][0]) {
      const [r0, c0] = RSTOPS[i - 1], [r1, c1] = RSTOPS[i];
      const f = (r - r0) / (r1 - r0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return RSTOPS[RSTOPS.length - 1][1];
}

// 近似高斯（-1..1 附近）
const gauss = (i, k) => (rand(i, k) + rand(i, k + 1) + rand(i, k + 2) - 1.5) / 0.75;

const ROLL = -0.13; // 星系在屏幕内略微顺时针倾斜

let S = null; // 预计算的粒子属性
let G = { cx: 0, cy: 0, R: 300, chipScale: 1, left: 0, small: false };
let chips = [];
const tmp = [0, 0, 0];

function build(N) {
  const nGlow = Math.max(24, Math.round(N * 0.0025));
  const nCore = Math.round(N * 0.08);
  const nGold = Math.round(N * 0.09);
  const nBand = Math.round(N * 0.66);
  const nStar = Math.round(N * 0.025);
  const used = nGlow + nCore + nGold + nBand + nStar;
  const s = {
    used,
    r: new Float32Array(used), a0: new Float32Array(used), h: new Float32Array(used),
    w: new Float32Array(used), col: new Float32Array(used * 3), size: new Float32Array(used),
    alpha: new Float32Array(used), tw: new Float32Array(used), ph: new Float32Array(used),
    glow: nGlow
  };
  let i = 0;
  const set = (r, h, c, size, alpha, tw) => {
    s.r[i] = r; s.a0[i] = rand(i, 21) * TAU; s.h[i] = h;
    // 差速旋转：内圈快、外圈慢
    s.w[i] = 0.055 / Math.pow(Math.max(r, 0.08), 0.75);
    s.col[i * 3] = c[0]; s.col[i * 3 + 1] = c[1]; s.col[i * 3 + 2] = c[2];
    s.size[i] = size; s.alpha[i] = alpha; s.tw[i] = tw; s.ph[i] = rand(i, 29) * TAU;
    i++;
  };
  // 柔光晕：少量大而淡的暖色粒子，叠出核心的辉光
  for (let k = 0; k < nGlow; k++) {
    const r = Math.abs(gauss(i, 30)) * 0.12;
    const warm = rand(i, 34);
    set(r, gauss(i, 35) * 0.02, [1, 0.86 - warm * 0.08, 0.68 - warm * 0.18], 80 + rand(i, 38) * 160, 0.06 + rand(i, 39) * 0.06, 0);
  }
  // 核心：致密暖白
  for (let k = 0; k < nCore; k++) {
    const r = Math.pow(rand(i, 40), 1.5) * 0.16;
    const f = r / 0.16;
    const c = [1, 0.97 - f * 0.12, 0.9 - f * 0.32];
    set(r, gauss(i, 41) * 0.03 * (1 - f), c, 3 + rand(i, 44) * 5, 0.55 + rand(i, 45) * 0.45, 0.15);
  }
  // 金色环
  for (let k = 0; k < nGold; k++) {
    const r = 0.235 + gauss(i, 50) * 0.022;
    const g = rand(i, 53);
    const c = g < 0.3 ? [1, 0.95, 0.82] : [1, 0.76 + g * 0.08, 0.38 + g * 0.12];
    set(r, gauss(i, 54) * 0.008, c, 2.5 + rand(i, 57) * 4, 0.5 + rand(i, 58) * 0.5, 0.3);
  }
  // 星轨环带 + 弥散填充
  for (let k = 0; k < nBand; k++) {
    let r;
    if (rand(i, 60) < 0.1) {
      r = 0.27 + rand(i, 61) * 0.78;
    } else {
      let pick = rand(i, 62) * BAND_SUM, b = BANDS[0];
      for (let q = 0; q < BANDS.length; q++) { pick -= BANDS[q][2]; if (pick <= 0) { b = BANDS[q]; break; } }
      r = b[0] + gauss(i, 63) * b[1];
    }
    let c = radialColor(r + (rand(i, 66) - 0.5) * 0.06);
    const sparkle = rand(i, 67) < 0.06;
    if (sparkle) c = [0.95, 0.97, 1];
    const big = rand(i, 68);
    const size = sparkle ? 5 + big * 4 : 3 + big * big * 4;
    // 外圈稍淡、内圈稍亮
    const alpha = (0.45 + rand(i, 69) * 0.55) * (1.1 - r * 0.3);
    set(r, gauss(i, 70) * 0.008, c, size, alpha, 0.35);
  }
  // 外缘零散亮星
  for (let k = 0; k < nStar; k++) {
    const r = 0.85 + rand(i, 80) * 0.35;
    const c = rand(i, 81) < 0.5 ? [0.92, 0.94, 1] : rand(i, 81) < 0.8 ? [0.78, 0.68, 1] : PALETTE[0];
    set(r, gauss(i, 82) * 0.03, c, 5 + rand(i, 85) * 5, 0.6 + rand(i, 86) * 0.4, 0.7);
  }
  return s;
}

export default {
  id: 'models',

  init(ctx) {
    S = build(ctx.N);
    const layer = ctx.layer;
    // 5 条轨道（3+4+4+4+4），同轨等距、相邻轨错开，整体同速公转，标签互不重叠
    const ORBITS = [[0.37, 3, 0.4], [0.5, 4, 1.3], [0.64, 4, 0.2], [0.79, 4, 1.0], [0.94, 4, 0.55]];
    const slots = [];
    for (const [r, n, off] of ORBITS) for (let q = 0; q < n; q++) slots.push([r, off + (q / n) * TAU]);
    chips = MODELS.map((m, k) => {
      const el = modelChip(m, { cls: 'm-chip' });
      el.style.opacity = '0';
      layer.append(el);
      const [r, a0] = slots[(k * 7) % slots.length];
      return { el, r, a0, w: 0.045, z: -1 };
    });
  },

  layout(ctx) {
    const b = ctx.box;
    G.left = b.x;
    G.small = ctx.isSmall || ctx.vw <= 760;
    if (ctx.isSmall || ctx.vw <= 760) {
      G.R = Math.min(b.width * 0.52, b.height * 0.7);
      G.cx = b.x + b.width * 0.5;
      G.cy = b.y + b.height * 0.5;
      G.chipScale = 0.66;
    } else {
      G.R = Math.min(b.width * 0.68, b.height * 0.82);
      G.cx = b.x + b.width * 0.5;
      G.cy = b.y + b.height * 0.47;
      G.chipScale = 1;
    }
  },

  frame(buf, t, p, ctx) {
    if (!S) S = build(ctx.N);
    const tt = ctx.reduceMotion ? 0 : t;
    // 滚动叙事：镜头拉近一点、倾角略抬、星系多转一点
    const zoom = 1 + smooth(0, 1, p) * 0.06;
    const R = G.R * zoom;
    const cosI = lerp(G.small ? 0.6 : 0.44, G.small ? 0.66 : 0.52, p) + Math.sin(tt * 0.25) * 0.008; // 俯视约 64°，轻微呼吸
    const sinI = Math.sqrt(1 - cosI * cosI);
    const spin = p * 0.7;
    const cr = Math.cos(ROLL), sr = Math.sin(ROLL);
    const zk = 0.38; // 压缩深度，避免近侧被透视放得过大
    const { cx, cy } = G;
    const used = S.used;


    for (let i = 0; i < used; i++) {
      const r0 = S.r[i];
      const a = S.a0[i] + tt * S.w[i] + spin * (0.5 + 0.5 / Math.max(r0 * 3, 1));
      const ca = Math.cos(a), sa = Math.sin(a);
      // 密度波：两条旋臂让环带微微扭成螺旋
      const r = r0 * (1 + 0.018 * Math.sin(2 * a - r0 * 9 + tt * 0.05)) * R;
      const lx = r * ca, lz = r * sa, h = S.h[i] * R;
      const X = lx, Y = lz * cosI - h * sinI;
      const Z = (lz * sinI + h * cosI) * zk;
      const x = cx + X * cr - Y * sr;
      const y = cy + X * sr + Y * cr;
      let al = S.alpha[i];
      const tw = S.tw[i];
      if (tw > 0) al *= 1 - tw + tw * (0.5 + 0.5 * Math.sin(tt * (1.2 + (i % 7) * 0.3) + S.ph[i]));
      // 远侧略暗
      al *= 0.82 + 0.18 * (sa * 0.5 + 0.5);
      const j = i * 3;
      tmp[0] = S.col[j]; tmp[1] = S.col[j + 1]; tmp[2] = S.col[j + 2];
      put(buf, i, x, y, Z, tmp, S.size[i] * (i < S.glow ? zoom : 1), clamp(al));
    }
    dust(buf, ctx, used, t);

    // 模型标签：沿轨道公转，投影到屏幕，按深度缩放/淡化
    const wgt = ctx.weight;
    const cs = G.chipScale;
    for (let k = 0; k < chips.length; k++) {
      const c = chips[k];
      const a = c.a0 + tt * c.w + spin * 0.6;
      const ca = Math.cos(a), sa = Math.sin(a);
      const r = c.r * R;
      const X = r * ca, Y = r * sa * cosI;
      const Z = r * sa * sinI * zk;
      const pr = ctx.project(cx + X * cr - Y * sr, cy + X * sr + Y * cr, Z);
      const d = sa * 0.5 + 0.5; // 0 远 .. 1 近
      const sc = (0.8 + d * 0.3) * cs;
      // 飘到左侧文案区域的标签淡出，避免压住文字
      const edge = G.small ? 1 : smooth(G.left - 40, G.left + 60, pr.x);
      const op = (0.62 + d * 0.38) * wgt * edge;
      c.el.style.transform = `translate3d(${pr.x.toFixed(1)}px,${pr.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
      c.el.style.opacity = op.toFixed(3);
      const zi = Math.round(d * 20);
      if (zi !== c.z) { c.z = zi; c.el.style.zIndex = String(zi); }
    }
  }
};
