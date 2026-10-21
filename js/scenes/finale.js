// 第 9 章 开始：粒子拼出品牌字 "AnyAIGC"，银白星光质感，轻微抖动呼吸
import { dust, put, rand, rasterize, clamp, TAU } from '../lib.js';

const WORD = 'AnyAIGC';
const F_TEXT = 0.7; // 用于拼字的粒子比例

let S = null;
const col = [0, 0, 0];

export default {
  id: 'finale',

  layout(ctx) {
    const b = ctx.box, N = ctx.N;
    // 字号按区域宽高自适应
    const fs = Math.min(b.height * (ctx.isSmall ? 0.6 : 0.46), b.width / (ctx.isSmall ? 4.7 : 6.2));
    const w = Math.ceil(b.width), h = Math.ceil(b.height);
    const pts = rasterize(w, h, (g, W, H) => {
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${fs}px "PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif`;
      g.fillText(WORD, W / 2, H * 0.52);
    }, 1);
    const nText = Math.round(N * F_TEXT);
    const tx = new Float32Array(nText), ty = new Float32Array(nText);
    const sz = new Float32Array(nText), al = new Float32Array(nText), ph = new Float32Array(nText), tint = new Float32Array(nText);
    const M = pts.length || 1;
    for (let i = 0; i < nText; i++) {
      // 在全部像素中随机取点，加亚像素抖动，避免网格感
      const p = pts.length ? pts[Math.floor(rand(i, 50) * M)] : [w / 2, h / 2];
      tx[i] = b.x + p[0] + (rand(i, 51) - 0.5) * 1.6;
      ty[i] = b.y + p[1] + (rand(i, 52) - 0.5) * 1.6;
      const r = rand(i, 53);
      // 少量大星点 + 大量细点
      if (r < 0.02) { sz[i] = 7 + rand(i, 54) * 5; al[i] = 0.9; }
      else if (r < 0.12) { sz[i] = 4 + rand(i, 54) * 2; al[i] = 0.75; }
      else { sz[i] = (ctx.isSmall ? 2.4 : 2.8) + rand(i, 54) * 2.2; al[i] = 0.4 + rand(i, 55) * 0.45; }
      ph[i] = rand(i, 56) * TAU;
      tint[i] = rand(i, 57);
    }
    S = { nText, tx, ty, sz, al, ph, tint, cx: b.x + b.width / 2, cy: b.y + b.height / 2, span: b.width };
  },

  frame(buf, t, p, ctx) {
    if (!S) return;
    const { nText, tx, ty, sz, al, ph, tint, cx, span } = S;
    const m = ctx.reduceMotion ? 0 : 1;
    const breathe = 1 + 0.006 * Math.sin(t * 0.8) * m;
    for (let i = 0; i < nText; i++) {
      const f = ph[i];
      const jx = Math.sin(t * 1.3 * m + f * 5) * 1.1, jy = Math.cos(t * 1.1 * m + f * 7) * 1.1;
      const x = cx + (tx[i] - cx) * breathe + jx;
      const y = S.cy + (ty[i] - S.cy) * breathe + jy;
      const z = Math.sin(t * 0.6 * m + (tx[i] - cx) / span * 4 + f * 0.3) * 14;
      // 银白，带极淡的冷蓝 / 紫偏色
      const k = tint[i];
      if (k < 0.7) { col[0] = 0.86; col[1] = 0.9; col[2] = 1; }
      else if (k < 0.88) { col[0] = 0.72; col[1] = 0.82; col[2] = 1; }
      else { col[0] = 0.88; col[1] = 0.82; col[2] = 1; }
      // 星光闪烁：部分粒子偶尔闪亮
      const s = Math.sin(t * (1.2 + k * 2.4) * m + f * 9);
      const flash = s > 0.92 ? (s - 0.92) * 12 : 0;
      const a = al[i] * (0.7 + 0.3 * Math.sin(t * 2 * m + f)) + flash * 0.4;
      put(buf, i, x, y, z, col, sz[i] * (1 + flash * 0.5), clamp(a));
    }
    dust(buf, ctx, nText, t, { alpha: 0.3 });
  }
};
