// 入口：注册场景、按滚动驱动粒子形变、生成右侧章节导航。
import { Engine } from './engine.js';
import home from './scenes/home.js';
import models from './scenes/models.js';
import prompt from './scenes/prompt.js';
import compare from './scenes/compare.js';
import image from './scenes/image.js';
import video from './scenes/video.js';
import audio from './scenes/audio.js';
import agent from './scenes/agent.js';
import gallery from './scenes/gallery.js';
import finale from './scenes/finale.js';

const SCENES = { home, models, prompt, compare, image, video, audio, agent, gallery, finale };

// 正式环境把这里改成应用地址 / 开发者文档地址
const APP_URL = '#';
const API_URL = '#';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = window.matchMedia('(max-width: 760px)').matches;
const sections = [...document.querySelectorAll('.ch')];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

document.getElementById('year').textContent = new Date().getFullYear();
document.querySelectorAll('[data-app-link]').forEach((a) => { a.href = APP_URL; });
document.querySelectorAll('[data-api-link]').forEach((a) => { a.href = API_URL; });

// 每章滚动长度
function sizeSections() {
  for (const s of sections) s.style.height = `${(parseFloat(s.dataset.len) || 2) * window.innerHeight}px`;
}
sizeSections();

/* ---------- 右侧章节导航 ---------- */
const rail = document.getElementById('rail');
for (const s of sections) {
  const a = document.createElement('a');
  a.href = `#${s.id}`;
  const label = document.createElement('span');
  label.textContent = s.dataset.label;
  a.append(label, document.createElement('i'));
  rail.append(a);
}
const railLinks = [...rail.querySelectorAll('a')];
const skipEnd = document.querySelector('.skip-end');
const bar = document.getElementById('progress-bar');

// 锚点跳转：直接跳到章节吸顶的起点（平滑滚动交给浏览器）
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute('href') === '#') return;
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  window.scrollTo({ top: target.offsetTop, behavior: reduceMotion ? 'auto' : 'smooth' });
  history.replaceState(null, '', a.getAttribute('href'));
});

/* ---------- 滚动状态 ---------- */
// 返回当前章 i、本章进度 p（吸顶期间 0..1）、向下一章形变的比例 w
function measure() {
  const vh = window.innerHeight;
  let i = 0;
  for (let k = 0; k < sections.length; k++) if (sections[k].getBoundingClientRect().top <= 1) i = k;
  const r = sections[i].getBoundingClientRect();
  const p = clamp(-r.top / Math.max(r.height - vh, 1));
  const next = sections[i + 1];
  const w = next ? smooth(0, 1, (vh - next.getBoundingClientRect().top) / vh) : 0;
  return { i, p, w };
}

function updateDom(i, p, w) {
  const vh = window.innerHeight;
  sections.forEach((s, k) => {
    const r = s.getBoundingClientRect();
    const span = Math.max(r.height - vh, 1);
    const enter = k === 0 ? 1 : smooth(0.35, 1, (vh - r.top) / vh);
    // 最后一章不淡出：滚到底时停在结尾页，按钮一直可见
    const exit = k === sections.length - 1 ? 1 : 1 - smooth(0.86, 1, -r.top / span);
    s.style.setProperty('--in', (enter * exit).toFixed(3));
  });
  const cur = w > 0.5 ? i + 1 : i;
  railLinks.forEach((a, k) => a.classList.toggle('is-on', k === cur));
  const max = document.documentElement.scrollHeight - vh;
  bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  skipEnd.classList.toggle('is-hidden', cur === sections.length - 1);
}

/* ---------- 引擎 ---------- */
const canvas = document.getElementById('stage');
let engine = null;
try {
  engine = new Engine(canvas, { count: isSmall ? 12000 : 24000, reduceMotion, isSmall });
  if (!engine.ok) engine = null;
} catch (err) {
  console.warn('WebGL 不可用，跳过粒子动画', err);
  engine = null;
}

if (engine) {
  for (const s of sections) engine.add(SCENES[s.dataset.scene], s);
  engine.init();
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { sizeSections(); engine.resize(); engine.layoutAll(); }, 120);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    engine.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1, e.clientX, e.clientY);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => engine.pointerOut());
} else {
  document.documentElement.classList.add('no-webgl');
  window.addEventListener('resize', sizeSections);
}

const t0 = performance.now();
function tick(now) {
  const t = (now - t0) / 1000;
  const { i, p, w } = measure();
  if (engine) engine.frame(t, i, p, w, window.scrollY);
  updateDom(i, p, w);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
