// 粒子引擎：一块全屏 WebGL 画布，所有章节共用同一批粒子。
// 每个场景（js/scenes/<章节id>.js）在自己的缓冲区里写出"此刻粒子应该在哪"，
// 引擎按滚动位置在相邻两个场景之间逐粒子插值（形变由滚动驱动，不依赖帧率），并叠加辉光渲染。
//
// 坐标约定：
//   x、y 为 CSS 像素，原点在视口左上角，y 向下；
//   z 为深度像素，0 在屏幕平面，正值靠近观众、负值远离；透视焦距 FOCAL，绕视口中心投影。
//
// 场景模块接口：
//   export default {
//     id: 'models',
//     init(ctx) {},             // 可选，只调用一次：在 ctx.layer 里创建 DOM 叠加层（标签、计数器等）
//     layout(ctx) {},           // 可选，视口变化时调用：ctx.box 是本章 .ch-visual 的 DOMRect（视口坐标）
//     frame(buf, t, p, ctx) {}, // 每帧（仅当前章与下一章）：写满 buf 的全部 N 个粒子
//   }
//   t：秒；p：本章滚动进度 0..1（下一章预览时恒为 0）；ctx.weight：本章当前可见度 0..1
//   buf.pos  Float32Array(N*3)  位置
//   buf.col  Float32Array(N*3)  颜色 0..1（加色混合，越多粒子叠在一起越亮，密集处会自然发白）
//   buf.size Float32Array(N)    点直径（CSS 像素，含辉光；明亮内核约为直径的 1/3），按 z 透视缩放
//   buf.alpha Float32Array(N)   亮度 0..1（0 = 不可见）
//   ctx = { N, vw, vh, dpr, isSmall, reduceMotion, box, el, layer, weight, rand(i,k), project(x,y,z) }
//   用不上的粒子请交给 lib.js 的 dust()，它们会变成空间里的微尘，形变时不会凭空消失。

export const FOCAL = 900;

// 确定性伪随机：同一粒子同一通道永远得到同一个值
export function rand(i, k = 0) {
  let h = (i * 374761393 + k * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const VERT = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aCol; in float aSize; in float aAlpha;
uniform vec2 uView; uniform float uDpr; uniform float uFocal; uniform vec2 uCam;
out vec3 vCol; out float vAlpha;
void main(){
  float s = uFocal / max(uFocal - aPos.z, 40.0);
  vec2 c = uView * 0.5;
  vec2 p = (aPos.xy - c) * s + c + uCam * (aPos.z / 600.0);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  float px = aSize * s * uDpr;
  gl_PointSize = clamp(px, 0.0, 256.0);
  // 太小的点按面积降低亮度，避免远处闪烁
  vAlpha = aAlpha * clamp(px / 1.5, 0.0, 1.0);
  vCol = aCol;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol; in float vAlpha;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  // 明亮内核 + 柔和光晕，加色叠加后形成辉光
  float core = exp(-r2 * 10.0);
  float halo = exp(-r2 * 3.2) * (1.0 - r2);
  o = vec4(vCol * vAlpha * (core + 0.32 * halo), 1.0);
}`;

// 背景星空：独立的一层，随滚动做视差，随时间闪烁
const STAR_VERT = `#version 300 es
precision highp float;
in vec4 aStar; // x01, y01, depth01, seed
uniform vec2 uView; uniform float uDpr; uniform float uScroll; uniform float uTime; uniform vec2 uCam;
out vec3 vCol; out float vAlpha;
void main(){
  float depth = aStar.z;
  float h = uView.y * 1.2;
  float y = mod(aStar.y * h - uScroll * (0.04 + depth * 0.18), h) - uView.y * 0.1;
  vec2 p = vec2(aStar.x * uView.x, y) + uCam * (depth * 0.6);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  float seed = aStar.w;
  float big = step(0.985, fract(seed * 13.7));
  float size = mix(1.4 + depth * 2.2, 7.0 + fract(seed * 7.3) * 9.0, big);
  gl_PointSize = size * uDpr;
  float tw = 0.55 + 0.45 * sin(uTime * (0.6 + fract(seed * 3.1) * 1.8) + seed * 40.0);
  vAlpha = (0.25 + depth * 0.55) * tw * mix(1.0, 0.55, big);
  float hue = fract(seed * 5.9);
  vec3 cool = vec3(0.72, 0.8, 1.0), warm = vec3(1.0, 0.82, 0.62), vio = vec3(0.78, 0.66, 1.0), cyan = vec3(0.55, 0.95, 1.0);
  vCol = hue < 0.6 ? cool : hue < 0.75 ? warm : hue < 0.9 ? vio : cyan;
}`;

const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

export class Engine {
  constructor(canvas, { count, stars = 2600, reduceMotion = false, isSmall = false }) {
    this.canvas = canvas;
    this.N = count;
    this.reduceMotion = reduceMotion;
    this.isSmall = isSmall;
    this.scenes = [];
    this.out = this.makeBuf();
    this.cam = [0, 0];
    this.camTarget = [0, 0];
    this.ptr = { x: -1e4, y: -1e4, sx: -1e4, sy: -1e4, on: false, k: 0 };
    this.scroll = 0;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    this.gl = gl;
    this.ok = !!gl;
    if (!gl) return;

    // 粒子程序
    this.prog = compile(gl, VERT, FRAG);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = {};
    for (const [name, comp] of [['aPos', 3], ['aCol', 3], ['aSize', 1], ['aAlpha', 1]]) {
      const loc = gl.getAttribLocation(this.prog, name);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, comp, gl.FLOAT, false, 0, 0);
      this.vbo[name] = b;
    }
    this.u = {};
    for (const n of ['uView', 'uDpr', 'uFocal', 'uCam']) this.u[n] = gl.getUniformLocation(this.prog, n);

    // 星空程序
    this.starProg = compile(gl, STAR_VERT, FRAG);
    this.starVao = gl.createVertexArray();
    gl.bindVertexArray(this.starVao);
    this.starCount = isSmall ? Math.round(stars * 0.5) : stars;
    const sd = new Float32Array(this.starCount * 4);
    for (let i = 0; i < this.starCount; i++) {
      sd[i * 4] = rand(i, 101); sd[i * 4 + 1] = rand(i, 102);
      sd[i * 4 + 2] = Math.pow(rand(i, 103), 2.2); sd[i * 4 + 3] = rand(i, 104);
    }
    const sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, sd, gl.STATIC_DRAW);
    const sl = gl.getAttribLocation(this.starProg, 'aStar');
    gl.enableVertexAttribArray(sl);
    gl.vertexAttribPointer(sl, 4, gl.FLOAT, false, 0, 0);
    this.su = {};
    for (const n of ['uView', 'uDpr', 'uScroll', 'uTime', 'uCam']) this.su[n] = gl.getUniformLocation(this.starProg, n);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0.016, 0.022, 0.043, 1);
  }

  makeBuf() {
    const N = this.N;
    return { pos: new Float32Array(N * 3), col: new Float32Array(N * 3), size: new Float32Array(N), alpha: new Float32Array(N) };
  }

  // sections：每章的 <section>，scene 为对应场景模块
  add(scene, section) {
    const el = section.querySelector('.ch-visual') || section;
    const layer = section.querySelector('.ch-fx');
    const s = { scene, section, el, layer, buf: this.makeBuf(), weight: 0 };
    s.ctx = this.ctxFor(s);
    this.scenes.push(s);
    return s;
  }

  ctxFor(s) {
    const self = this;
    return {
      N: this.N, rand, reduceMotion: this.reduceMotion, isSmall: this.isSmall,
      el: s.el, layer: s.layer,
      get vw() { return self.vw; }, get vh() { return self.vh; }, get dpr() { return self.dpr; },
      get box() { return s.box; }, get weight() { return s.weight; },
      // 3D -> 屏幕坐标（与着色器一致，含鼠标视差），s 为透视缩放系数
      project(x, y, z) {
        const k = FOCAL / Math.max(FOCAL - z, 40);
        return { x: (x - self.vw / 2) * k + self.vw / 2 + self.cam[0] * z / 600, y: (y - self.vh / 2) * k + self.vh / 2 + self.cam[1] * z / 600, s: k };
      }
    };
  }

  init() {
    this.resize();
    for (const s of this.scenes) s.scene.init?.(s.ctx);
    this.layoutAll();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  layoutAll() {
    // 章节内容是吸顶的：用 .ch-visual 相对 .ch-pin 的位置，得到它吸顶时在视口里的固定位置
    for (const s of this.scenes) {
      const r = s.el.getBoundingClientRect();
      const pin = s.el.closest('.ch-pin');
      const top = pin ? pin.getBoundingClientRect().top : 0;
      s.box = new DOMRect(r.left, r.top - top, r.width, r.height);
      s.scene.layout?.(s.ctx);
    }
  }

  // nx, ny ∈ [-1, 1] 为鼠标相对视口中心的位置（用于视差）；px, py 为鼠标视口坐标（用于粒子避让）
  setPointer(nx, ny, px, py) {
    if (this.reduceMotion) return;
    this.camTarget[0] = -nx * 18; this.camTarget[1] = -ny * 12;
    this.ptr.x = px; this.ptr.y = py; this.ptr.on = true;
  }
  pointerOut() { this.ptr.on = false; }

  // 鼠标悬停：光标附近的粒子被推开并略带旋涡，离开后自然回弹（目标位置每帧重算，所以无需记忆状态）
  repel() {
    const P = this.ptr;
    P.k += ((P.on ? 1 : 0) - P.k) * 0.08;
    // 光标移动时平滑跟随，避免跳变
    P.sx += (P.x - P.sx) * 0.25; P.sy += (P.y - P.sy) * 0.25;
    if (P.k < 0.01) return;
    const o = this.out, N = this.N, cx = this.vw / 2, cy = this.vh / 2;
    // 粒子挤开：只在屏幕平面内把粒子沿离开光标的方向推开，不改变深度、大小和亮度。
    // 推开距离 = d·K·e^(-d²/σ²)：光标正下方的粒子几乎不动、外圈被推得最多，
    // 所以光标附近只是变稀（密度约降到 1/(1+K)²），不会掏出黑洞
    const sig = Math.min(this.vw, this.vh) * 0.09, inv = 1 / (sig * sig), R2 = sig * sig * 9;
    const K = 0.9 * P.k;
    for (let j = 0; j < N; j++) {
      if (o.alpha[j] <= 0.001) continue;
      const j3 = j * 3, z = o.pos[j3 + 2];
      const s = FOCAL / Math.max(FOCAL - z, 40);
      const dx = (o.pos[j3] - cx) * s + cx + this.cam[0] * z / 600 - P.sx;
      const dy = (o.pos[j3 + 1] - cy) * s + cy + this.cam[1] * z / 600 - P.sy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2) continue;
      // 屏幕位移换算回粒子坐标（除以透视缩放）
      const m = K * Math.exp(-d2 * inv) / s;
      o.pos[j3] += dx * m;
      o.pos[j3 + 1] += dy * m;
    }
  }

  // i：当前章；p：本章进度；w：向下一章形变的比例 0..1
  frame(t, i, p, w, scroll) {
    this.scroll = scroll;
    this.cam[0] += (this.camTarget[0] - this.cam[0]) * 0.06;
    this.cam[1] += (this.camTarget[1] - this.cam[1]) * 0.06;
    const A = this.scenes[i], B = w > 0 ? this.scenes[i + 1] : null;
    this.scenes.forEach((s) => { s.weight = s === A ? 1 - w : s === B ? w : 0; });
    A.scene.frame(A.buf, t, p, A.ctx);
    if (B) B.scene.frame(B.buf, t, 0, B.ctx);
    this.blend(A.buf, B ? B.buf : null, w);
    this.repel();
    this.draw(t);
  }

  // 逐粒子错峰插值：每个粒子出发时间不同，飞行途中带一点三维漂移，形变更有"流动感"
  blend(a, b, w) {
    const o = this.out, N = this.N;
    if (!b || w <= 0) {
      o.pos.set(a.pos); o.col.set(a.col); o.size.set(a.size); o.alpha.set(a.alpha);
      return;
    }
    const amp = Math.min(this.vw, this.vh) * 0.16;
    for (let j = 0; j < N; j++) {
      const k = smooth01(w * 1.6 - rand(j, 9) * 0.6);
      const f = Math.sin(k * Math.PI);
      const j3 = j * 3;
      o.pos[j3] = a.pos[j3] + (b.pos[j3] - a.pos[j3]) * k + (rand(j, 10) - 0.5) * amp * f;
      o.pos[j3 + 1] = a.pos[j3 + 1] + (b.pos[j3 + 1] - a.pos[j3 + 1]) * k + (rand(j, 11) - 0.5) * amp * f;
      o.pos[j3 + 2] = a.pos[j3 + 2] + (b.pos[j3 + 2] - a.pos[j3 + 2]) * k + rand(j, 12) * amp * 1.4 * f;
      for (let c = 0; c < 3; c++) o.col[j3 + c] = a.col[j3 + c] + (b.col[j3 + c] - a.col[j3 + c]) * k;
      o.size[j] = a.size[j] + (b.size[j] - a.size[j]) * k;
      o.alpha[j] = a.alpha[j] + (b.alpha[j] - a.alpha[j]) * k;
    }
  }

  draw(t) {
    const gl = this.gl;
    if (!gl) return;
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.starProg);
    gl.bindVertexArray(this.starVao);
    gl.uniform2f(this.su.uView, this.vw, this.vh);
    gl.uniform1f(this.su.uDpr, this.dpr);
    gl.uniform1f(this.su.uScroll, this.scroll);
    gl.uniform1f(this.su.uTime, this.reduceMotion ? 0 : t);
    gl.uniform2f(this.su.uCam, this.cam[0], this.cam[1]);
    gl.drawArrays(gl.POINTS, 0, this.starCount);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.u.uView, this.vw, this.vh);
    gl.uniform1f(this.u.uDpr, this.dpr);
    gl.uniform1f(this.u.uFocal, FOCAL);
    gl.uniform2f(this.u.uCam, this.cam[0], this.cam[1]);
    const o = this.out;
    for (const [name, arr] of [['aPos', o.pos], ['aCol', o.col], ['aSize', o.size], ['aAlpha', o.alpha]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo[name]);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    }
    gl.drawArrays(gl.POINTS, 0, this.N);
    gl.bindVertexArray(null);
  }
}
