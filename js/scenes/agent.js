// 第 7 章 智能体：右侧一条蜿蜒的 3D 流水线。
// 7 个节点（发光粒子团，像小星团）由两股流动的粒子连线串起；随进度 p 依次点亮，
// 连线上的光点从已完成节点流向下一个；整体缓慢漂浮。节点下方是 DOM 阶段标签。
import { dust, put, clamp, smooth, lerp, TAU, rand } from '../lib.js';

const STEPS = ['剧本', '分镜', '角色', '画面', '视频', '配音', '成片'];
// 节点在 .ch-visual 内的归一化位置（x, y）与深度（z，单位为 box 宽度比例）
const NODES = [
  [0.1, 0.51, 0.02], [0.24, 0.37, -0.04], [0.35, 0.41, 0.03], [0.47, 0.53, -0.02],
  [0.6, 0.6, 0.04], [0.77, 0.55, -0.03], [0.92, 0.4, 0.02]
];
const NODES_SMALL = [
  [0.06, 0.62, 0.02], [0.2, 0.36, -0.04], [0.35, 0.44, 0.03], [0.5, 0.66, -0.02],
  [0.65, 0.7, 0.04], [0.8, 0.5, -0.03], [0.95, 0.3, 0.02]
];
const K = STEPS.length;

const DIM = [0.5, 0.55, 0.66];
const LIT = [0.78, 0.94, 1];
const LINK_DIM = [0.42, 0.45, 0.6];
const LINK_LIT = [0.52, 0.5, 1];
const SPARK = [0.55, 0.85, 1];
const col = [0, 0, 0];
const mixInto = (a, b, f, k = 1) => {
  col[0] = (a[0] + (b[0] - a[0]) * f) * k; col[1] = (a[1] + (b[1] - a[1]) * f) * k; col[2] = (a[2] + (b[2] - a[2]) * f) * k;
  return col;
};

// 每帧节点位置
const NX = new Float32Array(K), NY = new Float32Array(K), NZ = new Float32Array(K);
const LITV = new Float32Array(K);
// Catmull-Rom 求值结果
let cx = 0, cy = 0, cz = 0;
function curve(seg, s) {
  const i0 = Math.max(0, seg - 1), i1 = seg, i2 = seg + 1, i3 = Math.min(K - 1, seg + 2);
  const s2 = s * s, s3 = s2 * s;
  const a = -0.5 * s3 + s2 - 0.5 * s, b = 1.5 * s3 - 2.5 * s2 + 1, c = -1.5 * s3 + 2 * s2 + 0.5 * s, d = 0.5 * s3 - 0.5 * s2;
  cx = a * NX[i0] + b * NX[i1] + c * NX[i2] + d * NX[i3];
  cy = a * NY[i0] + b * NY[i1] + c * NY[i2] + d * NY[i3];
  cz = a * NZ[i0] + b * NZ[i1] + c * NZ[i2] + d * NZ[i3];
}

let L = null;
let tags = [];

function makeLayout(ctx) {
  const { N, box } = ctx;
  const R = clamp(Math.min(box.width, box.height) * 0.058, 14, 36); // 节点半径
  const nNode = Math.round(N * 0.05);   // 每个节点星团
  const nRing = Math.round(N * 0.008);  // 每个节点光环
  const nLink = Math.round(N * 0.045);  // 每段连线
  const nPk = 4, pkSize = Math.round(N * 0.0012); // 每段光点数、每个光点粒子数
  // 星团粒子的固定球面分布
  const total = nNode;
  const ox = new Float32Array(total), oy = new Float32Array(total), oz = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const u = rand(i, 31) * 2 - 1, a = rand(i, 32) * TAU;
    const r = Math.pow(rand(i, 33), 1.8); // 中心密集
    const q = Math.sqrt(1 - u * u);
    ox[i] = q * Math.cos(a) * r; oy[i] = q * Math.sin(a) * r; oz[i] = u * r;
  }
  return { N, R, nNode, nRing, nLink, nPk, pkSize, ox, oy, oz, nodes: ctx.isSmall ? NODES_SMALL : NODES };
}

export default {
  id: 'agent',
  init(ctx) {
    tags = STEPS.map((name, k) => {
      const el = document.createElement('div');
      el.className = 'agent-tag';
      const b = document.createElement('b');
      b.textContent = String(k + 1).padStart(2, '0');
      const s = document.createElement('span');
      s.textContent = name;
      el.append(b, s);
      ctx.layer.append(el);
      return el;
    });
  },
  layout(ctx) { L = makeLayout(ctx); },
  frame(buf, t, p, ctx) {
    if (!L || L.N !== ctx.N) L = makeLayout(ctx);
    const { R, nNode, nRing, nLink, nPk, pkSize, ox, oy, oz, nodes } = L;
    const b = ctx.box;
    const tm = ctx.reduceMotion ? 0 : t;

    // 进度：p=0 时第 1 个节点已点亮，p≈0.85 时全部点亮
    const prog = clamp(p / 0.85) * (K - 1);
    const cur = Math.min(K - 1, Math.round(prog));

    // 整体缓慢漂浮 + 绕竖轴轻微摆动
    const yaw = Math.sin(tm * 0.22) * 0.12, cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const midX = b.x + b.width / 2, midY = b.y + b.height / 2;
    for (let k = 0; k < K; k++) {
      const n = nodes[k];
      const lx = (n[0] - 0.5) * b.width, lz = n[2] * b.width + Math.sin(tm * 0.5 + k * 1.3) * 12;
      NX[k] = midX + lx * cyw - lz * syw;
      NZ[k] = lx * syw + lz * cyw;
      NY[k] = b.y + n[1] * b.height + Math.sin(tm * 0.6 + k * 0.9) * 6 + Math.sin(tm * 0.25) * 8;
      LITV[k] = smooth(k - 0.6, k, prog + 0.0001);
    }
    LITV[0] = 1;

    let i = 0;
    // 1) 节点星团
    for (let k = 0; k < K; k++) {
      const lv = LITV[k];
      const pulse = 1 + 0.08 * Math.sin(tm * 2.2 + k) + (k === cur ? 0.12 * Math.sin(tm * 4) : 0);
      const rr = R * (0.8 + 0.3 * lv) * pulse;
      const spin = tm * 0.4 + k;
      const cs = Math.cos(spin), sn = Math.sin(spin);
      for (let j = 0; j < nNode; j++, i++) {
        const x0 = ox[j], z0 = oz[j];
        const x = NX[k] + (x0 * cs - z0 * sn) * rr, z = NZ[k] + (x0 * sn + z0 * cs) * rr;
        const y = NY[k] + oy[j] * rr;
        const tw = 0.7 + 0.3 * Math.sin(tm * (2 + rand(j, 34) * 3) + j);
        if (j < 14) {
          // 少量大而淡的点：星团外的柔光
          put(buf, i, NX[k] + oy[j] * rr * 0.3, NY[k] + ox[j] * rr * 0.3, NZ[k], mixInto(DIM, LIT, lv), rr * (2.2 + rand(j, 36)), lerp(0.03, 0.12, lv));
          continue;
        }
        const a = lerp(0.2, 0.95, lv) * tw;
        put(buf, i, x, y, z, mixInto(DIM, LIT, lv), 2.2 + rand(j, 35) * 3.6, a);
      }
    }
    // 2) 节点光环（倾斜的椭圆，像土星环）
    for (let k = 0; k < K; k++) {
      const lv = LITV[k];
      for (let j = 0; j < nRing; j++, i++) {
        const a = (j / nRing) * TAU + tm * 0.6 + k;
        const rr = R * (1.7 + rand(i, 36) * 0.35);
        const x = NX[k] + Math.cos(a) * rr;
        const y = NY[k] + Math.sin(a) * rr * 0.22 + Math.cos(a) * rr * 0.1;
        const z = NZ[k] + Math.sin(a) * rr * 0.8;
        put(buf, i, x, y, z, mixInto(DIM, SPARK, lv), 2 + rand(i, 37) * 1.5, lerp(0.08, 0.45, lv));
      }
    }
    // 3) 连线：两股交织的粒子流
    for (let k = 0; k < K - 1; k++) {
      const lv = Math.min(LITV[k], LITV[k + 1]);
      // 正在推进中的连线：已点亮部分到前沿为止
      const front = clamp((prog - k) / 1);
      for (let j = 0; j < nLink; j++, i++) {
        const strand = j & 1;
        let s = rand(i, 41) + tm * 0.05 * (0.6 + rand(i, 42));
        s -= Math.floor(s);
        // 两端避开星团内部
        s = 0.06 + s * 0.88;
        curve(k, s);
        const tw = s * TAU * 1.2 + tm * 1.2 + strand * Math.PI;
        const amp = R * 0.38 * Math.sin(Math.PI * s);
        const fz = (rand(i, 43) - 0.5) * R * 0.12;
        const x = cx + (rand(i, 44) - 0.5) * 3;
        const y = cy + Math.sin(tw) * amp + fz;
        const z = cz + Math.cos(tw) * amp * 1.4;
        const on = s < front ? 1 : 0;
        const f = Math.max(lv, on * 0.85);
        put(buf, i, x, y, z, mixInto(LINK_DIM, LINK_LIT, f), 2 + rand(i, 45) * 2, lerp(0.12, 0.55, f));
      }
    }
    // 4) 流动光点：从已完成的节点流向下一个
    for (let k = 0; k < K - 1; k++) {
      const active = LITV[k] * (0.35 + 0.65 * clamp((prog - k) * 2));
      for (let m = 0; m < nPk; m++) {
        let s = m / nPk + tm * 0.16;
        s -= Math.floor(s);
        const fade = Math.sin(Math.PI * s);
        const strand = m & 1;
        curve(k, s);
        const tw = s * TAU * 1.2 + tm * 1.2 + strand * Math.PI;
        const amp = R * 0.38 * Math.sin(Math.PI * s);
        const px = cx, py = cy + Math.sin(tw) * amp, pz = cz + Math.cos(tw) * amp * 1.4;
        for (let j = 0; j < pkSize; j++, i++) {
          const g = Math.pow(rand(i, 51), 2) * 6;
          const a = rand(i, 52) * TAU;
          put(buf, i, px + Math.cos(a) * g, py + Math.sin(a) * g, pz + (rand(i, 53) - 0.5) * 6,
            SPARK, j === 0 ? 14 : 2.5 + rand(i, 54) * 2.5, (j === 0 ? 0.35 : 0.9) * active * fade);
        }
      }
    }
    dust(buf, ctx, i, t, { alpha: 0.3 });

    // DOM 标签：投影到节点下方
    const w = ctx.weight;
    const below = R * 2.2 + 18;
    for (let k = 0; k < K; k++) {
      const el = tags[k];
      if (!el) continue;
      const q = ctx.project(NX[k], NY[k], NZ[k]);
      el.style.transform = `translate3d(${(q.x).toFixed(1)}px, ${(q.y + below * q.s).toFixed(1)}px, 0) translate(-50%, 0)`;
      el.style.opacity = (w * (0.55 + 0.45 * LITV[k])).toFixed(3);
      const isCur = k === cur;
      if (el._cur !== isCur) { el.classList.toggle('is-cur', isCur); el._cur = isCur; }
      const isLit = LITV[k] > 0.5;
      if (el._lit !== isLit) { el.classList.toggle('is-lit', isLit); el._lit = isLit; }
    }
  }
};
