// 第 2 章"一句话"：粒子勾勒的大号胶囊输入框 + 逐字打出的提示词 + 粒子发送按钮
import { dust, put, rand, ramp, clamp, smooth, roundRectPoint, TAU, MODELS, modelChip } from '../lib.js';

const TEXT = '帮我写一首关于星空的诗，再配一张赛博风插画';
const LUT = 1024; // 胶囊轮廓采样点数
const SVG_NS = 'http://www.w3.org/2000/svg';

const S = {
  ready: false,
  // 胶囊几何
  cx: 0, cy: 0, W: 0, H: 0, left: 0, top: 0,
  // 轮廓查找表（位置、法线、颜色）
  px: new Float32Array(LUT + 1), py: new Float32Array(LUT + 1),
  nx: new Float32Array(LUT + 1), ny: new Float32Array(LUT + 1),
  cr: new Float32Array(LUT + 1), cg: new Float32Array(LUT + 1), cb: new Float32Array(LUT + 1),
  // 粒子分配
  nO: 0, nR: 0, nA: 0, nI: 0,
  ringX: 0, ringY: 0, ringR: 0,
  // DOM
  ui: null, text: null, shown: -1
};

const col = [0, 0, 0];

function svgChevron() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'icon pr-chev');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M6 9l6 6 6-6');
  s.append(p);
  return s;
}

export default {
  id: 'prompt',

  init(ctx) {
    const ui = document.createElement('div');
    ui.className = 'pr-ui';
    const chip = modelChip(MODELS[0], { cls: 'pr-chip' });
    chip.append(svgChevron());
    const line = document.createElement('div');
    line.className = 'pr-line';
    const text = document.createElement('span');
    text.className = 'pr-text';
    const caret = document.createElement('i');
    caret.className = 'pr-caret';
    line.append(text, caret);
    ui.append(chip, line);
    ctx.layer.append(ui);
    S.ui = ui; S.text = text;

    // 叠加层是 position:fixed（摆脱吸顶容器的滚动与裁剪），可见度每帧跟随 ctx.weight；
    // 本章不在渲染范围时引擎不会调用 frame，所以用独立的 rAF 同步透明度
    let last = -1;
    const sync = () => {
      const w = Math.round(ctx.weight * 100) / 100;
      if (w !== last) {
        last = w;
        ui.style.opacity = w * w;
        ui.style.visibility = w > 0.01 ? 'visible' : 'hidden';
      }
      requestAnimationFrame(sync);
    };
    requestAnimationFrame(sync);
  },

  layout(ctx) {
    const b = ctx.box, small = ctx.isSmall || ctx.vw <= 760;
    const W = small ? b.width * 0.98 : Math.min(820, b.width * 0.94);
    const H = small ? 96 : clamp(W * 0.175, 96, 142);
    const cx = b.x + b.width / 2;
    const cy = small ? b.y + Math.min(b.height * 0.36, 170) : b.y + clamp(b.height * 0.46, H / 2 + 10, b.height - H / 2);
    Object.assign(S, { W, H, cx, cy, left: cx - W / 2, top: cy - H / 2 });

    // 轮廓查找表：沿胶囊一圈等距采样，左青 -> 右紫
    const r = H / 2;
    for (let k = 0; k <= LUT; k++) {
      const [x, y] = roundRectPoint(S.left, S.top, W, H, r, k / LUT);
      S.px[k] = x; S.py[k] = y;
      const c = ramp(clamp((x - S.left) / W) * 0.62);
      S.cr[k] = c[0]; S.cg[k] = c[1]; S.cb[k] = c[2];
    }
    for (let k = 0; k <= LUT; k++) {
      const a = (k + LUT - 1) % LUT, c = (k + 1) % LUT;
      const tx = S.px[c] - S.px[a], ty = S.py[c] - S.py[a];
      const l = Math.hypot(tx, ty) || 1;
      // 顺时针走向，外法线为 (ty, -tx)
      S.nx[k] = ty / l; S.ny[k] = -tx / l;
    }

    // 粒子预算按 N 比例分配
    const k = ctx.N / 24000;
    S.nO = Math.round(9600 * k);
    S.nR = Math.round(1900 * k);
    S.nA = Math.round(160 * k);
    S.nI = Math.round(520 * k);
    S.ringR = H * 0.27;
    S.ringX = S.left + W - H / 2;
    S.ringY = cy;

    // DOM：胶囊内部布局
    const ui = S.ui;
    if (ui) {
      ui.style.left = `${S.left}px`;
      ui.style.top = `${S.top}px`;
      ui.style.width = `${W}px`;
      ui.style.height = `${H}px`;
      ui.style.paddingLeft = `${Math.round(H * (small ? 0.16 : 0.13))}px`;
      ui.style.paddingRight = `${Math.round(H * 0.95)}px`;
      ui.classList.toggle('is-small', small);
    }
    S.ready = true;
  },

  frame(buf, t, p, ctx) {
    if (!S.ready) this.layout(ctx);
    const motion = ctx.reduceMotion ? 0 : 1;
    const tm = t * motion;
    let i = 0;

    // 1. 胶囊轮廓：沿轮廓缓慢流动的粒子 + 两个绕行的亮光斑
    const nO = S.nO;
    const spot1 = (tm * 0.045) % 1, spot2 = (tm * 0.045 + 0.47) % 1;
    for (let j = 0; j < nO; j++, i++) {
      const sp = 0.0025 + rand(i, 21) * 0.006;
      let u = (rand(i, 20) + tm * sp) % 1;
      const f = u * LUT, k0 = f | 0, fr = f - k0, k1 = k0 + 1;
      const bx = S.px[k0] + (S.px[k1] - S.px[k0]) * fr;
      const by = S.py[k0] + (S.py[k1] - S.py[k0]) * fr;
      const nx = S.nx[k0], ny = S.ny[k0];
      // 内核 70% 紧贴轮廓，30% 向外弥散成光晕
      const halo = rand(i, 22) < 0.34;
      const g = (rand(i, 23) + rand(i, 24) + rand(i, 25) - 1.5) * (halo ? 17 : 4.6);
      const br = 1 + 0.18 * Math.sin(tm * 1.4 + u * TAU * 3 + rand(i, 26) * 2);
      const off = g * br;
      // 亮光斑
      let d1 = Math.abs(u - spot1); if (d1 > 0.5) d1 = 1 - d1;
      let d2 = Math.abs(u - spot2); if (d2 > 0.5) d2 = 1 - d2;
      const glow = Math.exp(-(d1 * d1) / 0.0028) + 0.8 * Math.exp(-(d2 * d2) / 0.002);
      const wh = Math.min(0.5, glow * 0.5);
      const kk = 0.85 + glow * 0.6;
      col[0] = (S.cr[k0] + (1 - S.cr[k0]) * wh) * kk;
      col[1] = (S.cg[k0] + (1 - S.cg[k0]) * wh) * kk;
      col[2] = (S.cb[k0] + (1 - S.cb[k0]) * wh) * kk;
      const tw = 0.75 + 0.25 * Math.sin(tm * (1 + rand(i, 27) * 2) + rand(i, 28) * TAU);
      const size = (halo ? 2.2 + rand(i, 29) * 2 : 3 + rand(i, 29) * 2.6) + glow * 2.5;
      const alpha = (halo ? 0.26 : 0.55 + rand(i, 30) * 0.3) * tw * (1 + glow * 0.5);
      put(buf, i, bx + nx * off, by + ny * off, (rand(i, 31) - 0.5) * 10, col, size, Math.min(1, alpha));
    }

    // 2. 发送按钮：发光圆环（缓慢旋转、带闪烁）
    const nR = S.nR, R = S.ringR;
    for (let j = 0; j < nR; j++, i++) {
      const a = rand(i, 40) * TAU + tm * 0.35;
      const halo = rand(i, 41) < 0.25;
      const g = (rand(i, 42) + rand(i, 43) - 1) * (halo ? 7 : 2.2);
      const rr = R * (1 + 0.025 * Math.sin(tm * 2 + a * 3)) + g;
      const shine = 0.5 + 0.5 * Math.sin(a * 2 - tm * 1.6);
      col[0] = 0.86 + 0.14 * shine; col[1] = 0.88 + 0.12 * shine; col[2] = 1;
      const tw = 0.7 + 0.3 * Math.sin(tm * (1.5 + rand(i, 44) * 2) + rand(i, 45) * TAU);
      put(buf, i, S.ringX + Math.cos(a) * rr, S.ringY + Math.sin(a) * rr, 4,
        col, halo ? 2.4 + rand(i, 46) * 1.5 : 3 + rand(i, 46) * 2.4, (halo ? 0.3 : 0.6 + shine * 0.35) * tw);
    }

    // 3. 向上箭头（竖线 + 两条斜线）
    const nA = S.nA, aL = R * 0.42;
    for (let j = 0; j < nA; j++, i++) {
      const s = rand(i, 50), part = j % 3;
      let x, y;
      if (part === 0) { x = 0; y = aL - s * aL * 2; }
      else { const d = s * aL * 0.85; x = (part === 1 ? -1 : 1) * d * 0.72; y = -aL + d * 0.72; }
      put(buf, i, S.ringX + x + (rand(i, 51) - 0.5) * 1.5, S.ringY + y + (rand(i, 52) - 0.5) * 1.5, 4,
        [0.82, 0.86, 1], 2.4 + rand(i, 53), 0.5);
    }

    // 4. 框内稀疏微尘
    const nI = S.nI, iw = S.W - S.H * 0.6, ih = S.H * 0.72;
    for (let j = 0; j < nI; j++, i++) {
      const x = S.cx + (rand(i, 60) - 0.5) * iw + Math.sin(tm * 0.3 + rand(i, 61) * TAU) * 10;
      const y = S.cy + (rand(i, 62) - 0.5) * ih + Math.cos(tm * 0.25 + rand(i, 63) * TAU) * 5;
      const c = ramp(clamp((x - S.left) / S.W) * 0.62);
      const tw = 0.5 + 0.5 * Math.sin(tm * (0.8 + rand(i, 64) * 1.6) + rand(i, 65) * TAU);
      put(buf, i, x, y, (rand(i, 66) - 0.5) * 60, c, 1.8 + rand(i, 67) * 1.8, 0.28 * tw);
    }

    dust(buf, ctx, i, t, { alpha: 0.3 });

    // DOM：随滚动逐字打出（进入本章的过渡中先打出大半，吸顶后随 p 打完）
    const n = Math.round(TEXT.length * clamp(ctx.weight * 0.78 + smooth(0, 0.32, p) * 0.22));
    if (n !== S.shown) {
      S.shown = n;
      S.text.textContent = TEXT.slice(0, n);
    }
  }
};
