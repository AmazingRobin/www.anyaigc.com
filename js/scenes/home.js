// 第 0 章 首页：右侧发光粒子球 + 倾斜星环 + 环绕的模型标签
import { dust, put, rand, clamp, TAU, PALETTE, MODELS, modelChip } from '../lib.js';

// 无分配版 ramp：结果写入 out
function rampInto(out, t) {
  const x = clamp(t) * (PALETTE.length - 1);
  const i = Math.min(PALETTE.length - 2, Math.floor(x)), f = x - i, a = PALETTE[i], b = PALETTE[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
}

// 粒子分配比例（按 ctx.N 缩放）
const F_CORE = 0.05, F_SHELL = 0.54, F_VOL = 0.14, F_RING = 0.18;
const CHIP_COUNT = 18;
const TILT = 0.38; // 球体整体前倾（绕 x 轴）

let S = null; // 预计算数据
const col = [0, 0, 0], tmp = [0, 0, 0];
const WHITE = [1, 1, 1];

function gauss(i, k) { return (rand(i, k) + rand(i, k + 1) + rand(i, k + 2) - 1.5) / 1.5; }

function build(N) {
  const nCore = Math.round(N * F_CORE), nShell = Math.round(N * F_SHELL);
  const nVol = Math.round(N * F_VOL), nRing = Math.round(N * F_RING);
  const nBody = nCore + nShell + nVol;
  const used = nBody + nRing;
  const ux = new Float32Array(used), uy = new Float32Array(used), uz = new Float32Array(used);
  const rf = new Float32Array(used), sz = new Float32Array(used), al = new Float32Array(used), ph = new Float32Array(used);
  for (let i = 0; i < used; i++) {
    ph[i] = rand(i, 40) * TAU;
    if (i < nBody) {
      // 球面均匀方向
      const zz = rand(i, 21) * 2 - 1, a = rand(i, 22) * TAU, s = Math.sqrt(1 - zz * zz);
      ux[i] = s * Math.cos(a); uy[i] = s * Math.sin(a); uz[i] = zz;
      if (i < nCore) {
        // 内核：越靠近中心越密
        rf[i] = Math.pow(rand(i, 23), 2.2) * 0.28;
        const big = rand(i, 24) < 0.08;
        sz[i] = big ? 30 + rand(i, 25) * 60 : 4 + rand(i, 25) * 5;
        al[i] = big ? 0.12 + rand(i, 26) * 0.14 : 0.6 + rand(i, 26) * 0.4;
      } else if (i < nCore + nShell) {
        // 球壳：带厚度，偏向外表面
        rf[i] = 1 - Math.pow(rand(i, 23), 2.5) * 0.16;
        const big = rand(i, 24) < 0.035;
        sz[i] = big ? 7 + rand(i, 25) * 5 : 3.2 + rand(i, 25) * 3.2;
        al[i] = big ? 0.95 : 0.55 + rand(i, 26) * 0.45;
      } else {
        // 内部体积：稀疏填充
        rf[i] = 0.25 + Math.pow(rand(i, 23), 0.6) * 0.72;
        sz[i] = 3 + rand(i, 25) * 3;
        al[i] = 0.4 + rand(i, 26) * 0.4;
      }
    } else {
      // 星环：两圈，存角度与半径偏移
      const k = i - nBody, which = k < nRing * 0.62 ? 0 : 1;
      ux[i] = rand(i, 30) * TAU;        // 角度
      uy[i] = gauss(i, 31) * (which ? 0.035 : 0.05); // 半径扰动
      uz[i] = gauss(i, 34) * 0.03;      // 环厚度（法向）
      rf[i] = which;
      const big = rand(i, 37) < 0.02;
      sz[i] = big ? 6 + rand(i, 38) * 3 : 2.2 + rand(i, 38) * 2.4;
      // 环上亮度不均：块状疏密
      const a = ux[i];
      const patch = 0.55 + 0.45 * Math.sin(a * 3 + which * 2) * Math.sin(a * 7 + 1.3);
      al[i] = clamp((0.35 + rand(i, 39) * 0.45) * (0.45 + patch * 0.8));
    }
  }
  return { N, nCore, nShell, nVol, nRing, nBody, used, ux, uy, uz, rf, sz, al, ph };
}

export default {
  id: 'home',

  init(ctx) {
    S = build(ctx.N);
    const wrap = document.createElement('div');
    wrap.className = 'home-chips';
    ctx.layer.append(wrap);
    S.chips = [];
    for (let k = 0; k < CHIP_COUNT; k++) {
      const m = MODELS[k];
      const el = modelChip(m, { cls: 'home-chip' });
      wrap.append(el);
      // 斐波那契球面分布，半径略有差异，让标签散布在球面与星环之间
      const y = 1 - ((k + 0.5) / CHIP_COUNT) * 2, r = Math.sqrt(1 - y * y), a = k * 2.39996 + 0.6;
      const rr = 1.08 + rand(k, 77) * 0.32;
      S.chips.push({ el, x: Math.cos(a) * r * rr, y: y * 0.92 * rr, z: Math.sin(a) * r * rr });
    }
  },

  layout(ctx) {
    const b = ctx.box;
    S.cx = b.x + b.width * (ctx.isSmall ? 0.5 : 0.47);
    S.cy = b.y + b.height * 0.5;
    S.R = Math.min(b.width, b.height) * (ctx.isSmall ? 0.3 : 0.31);
    S.chipBase = ctx.isSmall ? 0.62 : 1;
  },

  frame(buf, t, p, ctx) {
    if (!S) return;
    const { cx, cy, nBody, nCore, used } = S;
    const motion = ctx.reduceMotion ? 0 : 1;
    const R = S.R * (1 + 0.012 * Math.sin(t * 0.9) * motion + p * 0.08);
    const rot = (t * 0.1 * motion) + p * 1.4;
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(TILT), st = Math.sin(TILT);
    const { ux, uy, uz, rf, sz, al, ph } = S;

    // 球体
    for (let i = 0; i < nBody; i++) {
      const wob = 1 + 0.025 * Math.sin(t * 0.7 * motion + ph[i] + uy[i] * 4) ;
      const r = rf[i] * R * wob;
      // 绕 y 轴自转，再绕 x 轴前倾
      let x = ux[i] * r, y = uy[i] * r, z = uz[i] * r;
      const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      x = x1; y = y2; z = z2;
      // 屏幕空间渐变：左下青 -> 右上紫，中心发白
      const g = clamp(0.5 + (x - y) / (R * 2.6));
      rampInto(tmp, g * 0.62); const c = tmp;
      const d = Math.sqrt(x * x + y * y) / R;
      const wmix = i < nCore ? 1 : clamp(1 - d * 1.25) * 0.9;
      col[0] = c[0] + (1 - c[0]) * wmix; col[1] = c[1] + (1 - c[1]) * wmix; col[2] = c[2] + (1 - c[2]) * wmix;
      const back = z < 0 ? 0.75 + 0.25 * (1 + z / R) : 1;
      const tw = 0.75 + 0.25 * Math.sin(t * 2.2 * motion + ph[i] * 3);
      put(buf, i, cx + x, cy + y, z, i < nCore ? WHITE : col, sz[i], al[i] * back * tw);
    }

    // 星环：两圈倾斜椭圆，各自在环面内缓慢转动
    for (let i = nBody; i < used; i++) {
      const w = rf[i];
      const rr = R * (w ? 1.5 : 1.34) * (1 + uy[i]);
      const a = ux[i] + t * (w ? -0.05 : 0.07) * motion + p * 0.6;
      // 环面坐标
      let x = Math.cos(a) * rr, y = uz[i] * R, z = Math.sin(a) * rr;
      // 环面倾斜：绕 x 轴（接近正对观众），再绕 z 轴偏转
      const tx = w ? 1.2 : 1.32, tz = w ? 0.5 : -0.35;
      const cx1 = Math.cos(tx), sx1 = Math.sin(tx);
      const y1 = y * cx1 - z * sx1, z1 = y * sx1 + z * cx1;
      const cz = Math.cos(tz), sz1 = Math.sin(tz);
      const x2 = x * cz - y1 * sz1, y2 = x * sz1 + y1 * cz;
      x = x2; y = y2; z = z1;
      const g = clamp(0.5 + (x - y) / (R * 4));
      rampInto(tmp, 0.05 + g * 0.45); const c = tmp;
      col[0] = c[0] * 0.8 + 0.2; col[1] = c[1] * 0.8 + 0.2; col[2] = c[2] * 0.8 + 0.2;
      const tw = 0.7 + 0.3 * Math.sin(t * 1.7 * motion + ph[i]);
      put(buf, i, cx + x, cy + y, z, col, sz[i], al[i] * tw);
    }

    dust(buf, ctx, used, t);

    // 模型标签：随球体一起转动，按深度缩放与淡化
    const wgt = ctx.weight;
    const rotC = rot * 0.9;
    const cc = Math.cos(rotC), sc = Math.sin(rotC);
    for (let k = 0; k < S.chips.length; k++) {
      const ch = S.chips[k];
      const x0 = ch.x * R, y0 = ch.y * R, z0 = ch.z * R;
      const x1 = x0 * cc + z0 * sc, z1 = -x0 * sc + z0 * cc;
      const y2 = y0 * ct - z1 * st, z2 = y0 * st + z1 * ct;
      const q = ctx.project(cx + x1, cy + y2, z2);
      const depth = clamp(0.5 + z2 / (R * 2.6)); // 0 背面 .. 1 正面
      const s = S.chipBase * (0.6 + depth * 0.4) * Math.min(q.s, 1.05);
      const o = wgt * (0.18 + 0.82 * Math.pow(depth, 1.4));
      ch.el.style.transform = `translate3d(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${s.toFixed(3)})`;
      ch.el.style.opacity = o.toFixed(3);
      ch.el.style.zIndex = String(Math.round(depth * 100));
      ch.el.style.filter = depth < 0.4 ? `blur(${((0.4 - depth) * 3).toFixed(1)}px)` : 'none';
    }
  }
};
