// 第 3 章"多模型"：三张略带透视的粒子卡片，三个模型以不同速度逐行"生成"回答
import { dust, put, rand, clamp, smooth, easeOut, roundRectPoint, TAU, FOCAL, MODELS, icon } from '../lib.js';

// 三个模型：名称、用时（决定生成速度）、文字行颜色
const CARDS = [
  { model: MODELS[0], time: 1.2, color: [0.6, 0.76, 0.9], widths: [0.97, 0.86, 1, 0.63, 0.94, 0.86, 0.73, 0.45] },
  { model: MODELS[1], time: 1.8, color: [1, 0.76, 0.5], widths: [0.95, 0.85, 1, 0.62, 0.96, 0.87, 0.72, 0.44] },
  { model: MODELS[2], time: 2.6, color: [0.74, 0.62, 1], widths: [0.96, 0.86, 1, 0.6, 0.95, 0.85, 0.72, 0.42] }
];
const MAX_T = 2.6;
const OUTLINE = [0.42, 0.5, 0.72];

const S = {
  ready: false, small: false,
  // 每张卡：中心、尺寸、倾角、行布局
  cards: CARDS.map(() => ({ cx: 0, cy: 0, w: 0, h: 0, ay: 0, headH: 0, padX: 0, lines: 0, lineY0: 0, lineGap: 0, lineW: 0 })),
  nLine: 0, nOut: 0, nSep: 0,
  dom: [], out: [0, 0]
};

// 卡片局部坐标 (lx, ly)（相对卡片中心）-> 世界坐标，写入 S.out，返回 z
function toWorld(c, lx, ly, ay) {
  S.out[0] = c.cx + lx * Math.cos(ay);
  S.out[1] = c.cy + ly;
  return -lx * Math.sin(ay);
}

export default {
  id: 'compare',

  init(ctx) {
    for (const c of CARDS) {
      const el = document.createElement('div');
      el.className = 'cmp-head';
      const img = document.createElement('img');
      img.src = icon(c.model.id); img.alt = ''; img.width = 20; img.height = 20;
      const name = document.createElement('b');
      name.textContent = c.model.name;
      const st = document.createElement('span');
      st.className = 'cmp-status mono';
      st.textContent = `完成 · ${c.time}s`;
      el.append(img, name, st);
      ctx.layer.append(el);
      S.dom.push({ el, st, done: false, x: -1, y: -1, s: -1 });
    }
    // 叠加层用 fixed 定位，透明度跟随 ctx.weight（本章不渲染时 frame 不会被调用，故单独同步）
    let last = -1;
    const sync = () => {
      const w = Math.round(ctx.weight * 100) / 100;
      if (w !== last) {
        last = w;
        for (const d of S.dom) {
          d.el.style.opacity = w * w;
          d.el.style.visibility = w > 0.01 ? 'visible' : 'hidden';
        }
      }
      requestAnimationFrame(sync);
    };
    requestAnimationFrame(sync);
  },

  layout(ctx) {
    const b = ctx.box;
    const small = S.small = ctx.isSmall || ctx.vw <= 760;
    if (small) {
      // 手机：三张卡竖排，每张 3 行
      const gap = 12, w = b.width, h = Math.min(170, (b.height - gap * 2) / 3);
      const top = b.y + Math.max(0, (b.height - (h * 3 + gap * 2)) / 2);
      S.cards.forEach((c, k) => {
        Object.assign(c, { cx: b.x + w / 2, cy: top + h / 2 + k * (h + gap), w, h, ay: 0, headH: 42, padX: 18, lines: 3 });
      });
    } else {
      const w = Math.min(330, b.width * 0.255), gap = w * 0.1, h = Math.min(w * 1.12, b.height * 0.86);
      const cy = b.y + Math.min(b.height * 0.44, b.height - h / 2);
      const cx = b.x + b.width / 2;
      S.cards.forEach((c, k) => {
        Object.assign(c, { cx: cx + (k - 1) * (w + gap) * 1.02, cy, w, h, ay: (1 - k) * 0.17, headH: 58, padX: 26, lines: 8 });
      });
    }
    for (const c of S.cards) {
      const avail = c.h - c.headH - 34;
      c.lineGap = avail / c.lines;
      c.lineY0 = -c.h / 2 + c.headH + 22 + c.lineGap * 0.35;
      c.lineW = c.w - c.padX * 2;
    }
    const k = ctx.N / 24000;
    S.nLine = Math.round(4600 * k); // 每张卡文字行粒子
    S.nOut = Math.round(1100 * k);   // 每张卡轮廓
    S.nSep = Math.round(130 * k);   // 卡头分隔线
    S.ready = true;
  },

  frame(buf, t, p, ctx) {
    if (!S.ready) this.layout(ctx);
    const tm = ctx.reduceMotion ? 0 : t;
    // 生成时钟：进入本章的过渡中开始生成，吸顶后随 p 推进到全部完成
    // 参考站在本章吸顶时三张卡已基本生成完，故主要由过渡进度驱动，吸顶后 p 很快推完
    const G = ctx.reduceMotion ? 1 : clamp(0.9 * smooth(0.12, 1, ctx.weight) + 0.1 * smooth(0, 0.1, p));
    let i = 0;

    // 先写文字行粒子（索引靠前：上一章输入框的轮廓粒子会流向这些行）
    for (let ci = 0; ci < 3; ci++) {
      const c = S.cards[ci], def = CARDS[ci];
      const ay = c.ay + Math.sin(tm * 0.4 + ci) * 0.025;
      const bob = Math.sin(tm * 0.6 + ci * 2) * 3;
      const prog = clamp(G * MAX_T / def.time); // 本卡进度 0..1
      const L = c.lines, lp = prog * L, cur = Math.min(L - 1, lp | 0);
      const curY = c.lineY0 + cur * c.lineGap;
      const done = prog >= 1;
      const n = S.nLine;
      for (let j = 0; j < n; j++, i++) {
        const line = j % L;
        const s = rand(i, 70);                    // 沿行位置 0..1
        const wl = def.widths[line % def.widths.length];
        const tx = -c.w / 2 + c.padX + s * c.lineW * wl;
        const glowP = rand(i, 83) < 0.2;
        const gy = (rand(i, 71) + rand(i, 72) - 1) * (glowP ? 10 : 5);
        const ty = c.lineY0 + line * c.lineGap + gy + Math.sin(s * 30 + tm * 2 + line) * 0.8;
        // 到达比例：本行从左到右依次落定
        const local = clamp(lp - line, -1, 2);
        const a = done ? 1 : easeOut(clamp((local * 1.25 - s) / 0.22));
        let lx = tx, ly = ty, size, alpha;
        const cc = def.color;
        if (a < 1) {
          // 未生成：在当前行下方汇聚成一团流动的散乱粒子
          const fx = (rand(i, 73) - 0.5) * c.lineW * 0.95 + Math.sin(tm * 0.7 + rand(i, 74) * TAU) * 24;
          const fy = curY + 16 + Math.abs(rand(i, 75) + rand(i, 76) - 1) * c.lineGap * 2.6 + Math.cos(tm * 0.55 + rand(i, 77) * TAU) * 12;
          const ex = fx + c.padX * 0.5, ey = Math.min(fy, c.h / 2 - 14);
          lx = ex + (tx - ex) * a;
          ly = ey + (ty - ey) * a;
          size = 1.8 + rand(i, 78) * 1.8 + a * 1.2;
          alpha = (0.22 + 0.25 * rand(i, 79)) * (1 - a) + 0.75 * a;
        } else {
          size = glowP ? 4 + rand(i, 78) * 3.5 : 3 + rand(i, 78) * 3;
          alpha = glowP ? 0.2 : 0.55 + 0.4 * rand(i, 79);
        }
        const tw = 0.8 + 0.2 * Math.sin(tm * (1.2 + rand(i, 80) * 2) + rand(i, 81) * TAU);
        const z = toWorld(c, lx, ly, ay) + (rand(i, 82) - 0.5) * 6 * (1 - a * 0.7);
        put(buf, i, S.out[0], S.out[1] + bob, z, cc, size, alpha * tw);
      }

      // DOM 卡头：投影到屏幕坐标
      const hx = -c.w / 2 + c.padX - 2, hy = -c.h / 2 + c.headH * 0.5;
      const hz = toWorld(c, hx, hy, ay);
      const kk = FOCAL / (FOCAL - hz);
      const X = (S.out[0] - ctx.vw / 2) * kk + ctx.vw / 2;
      const Y = (S.out[1] + bob - ctx.vh / 2) * kk + ctx.vh / 2;
      const d = S.dom[ci];
      d.el.style.transform = `translate(${X.toFixed(1)}px,${Y.toFixed(1)}px) translateY(-50%) scale(${kk.toFixed(3)})`;
      if (done !== d.done) { d.done = done; d.st.classList.toggle('is-on', done); }
    }

    // 卡片轮廓 + 卡头分隔线：稀疏蓝灰
    for (let ci = 0; ci < 3; ci++) {
      const c = S.cards[ci];
      const ay = c.ay + Math.sin(tm * 0.4 + ci) * 0.025;
      const bob = Math.sin(tm * 0.6 + ci * 2) * 3;
      const r = S.small ? 16 : 22;
      for (let j = 0; j < S.nOut; j++, i++) {
        const u = (rand(i, 90) + tm * 0.004) % 1;
        const pt = roundRectPoint(-c.w / 2, -c.h / 2, c.w, c.h, r, u);
        const g = (rand(i, 91) + rand(i, 92) - 1) * 2.4;
        const z = toWorld(c, pt[0] + g, pt[1] + (rand(i, 93) - 0.5) * 2.4, ay);
        const tw = 0.6 + 0.4 * Math.sin(tm * (0.8 + rand(i, 94) * 2) + rand(i, 95) * TAU);
        put(buf, i, S.out[0], S.out[1] + bob, z, OUTLINE, 1.8 + rand(i, 96) * 2, (0.35 + 0.3 * rand(i, 97)) * tw);
      }
      const sy = -c.h / 2 + c.headH;
      for (let j = 0; j < S.nSep; j++, i++) {
        const lx = -c.w / 2 + 12 + rand(i, 98) * (c.w - 24);
        const z = toWorld(c, lx, sy + (rand(i, 99) - 0.5) * 1.5, ay);
        put(buf, i, S.out[0], S.out[1] + bob, z, OUTLINE, 1.6 + rand(i, 100) * 1.2, 0.22 + 0.15 * rand(i, 101));
      }
    }

    dust(buf, ctx, i, t, { alpha: 0.3 });
  }
};
