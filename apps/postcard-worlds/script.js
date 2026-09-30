/* =====================================================================
 * 明信片世界 · 核心逻辑
 * 一句话出发 → 生成明信片 → 点击热点 → 连续探索
 *
 * 结构：
 *   1. 工具函数
 *   2. 常量：风格后缀 / 热点词库 / 位置
 *   3. 状态与持久化（localStorage + URL path 编码）
 *   4. 图片生成（Pollinations 匿名 + seed 稳定）
 *   5. BYOP 增强（fragment flow 登录 + AI 视觉热点 + 参考图保持风格）
 *   6. 热点系统（本地词库 / AI 视觉分析）
 *   7. 视图渲染与事件绑定（大厅 / 场景 / 地图）
 *   8. 初始化与 URL 重放解析
 * ===================================================================== */
'use strict';

/* ==================== 1. 工具函数 ==================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function Toast(msg) {
  const box = $('#toast');
  const txt = $('#toast-text');
  if (!box || !txt) return;
  txt.textContent = msg;
  box.classList.remove('hidden');
  clearTimeout(Toast._t);
  Toast._t = setTimeout(() => box.classList.add('hidden'), 2600);
}

/* ==================== 2. 常量 ==================== */

const SAVE_KEY = 'polli-postcard-path-v1';
const BYOP_KEY = 'polli-postcard-byop';

/* 统一风格后缀：保证连续视图视觉连贯 */
const STYLE_SUFFIX = '，水彩手绘明信片风格，复古旅行插画，柔和暖色调，细腻笔触，票根式边框';

/* 热点词库：20+ 种探索元素（标签 + 下一场景叙事提示） */
const HOTSPOT_LIB = [
  { label: '老木门', desc: '推开咯吱作响的老木门，门后是一条洒满阳光的长廊' },
  { label: '林间小路', desc: '踏上林间小路，落叶沙沙作响，光斑从树隙间漏下' },
  { label: '石阶', desc: '沿着青苔石阶向上，山风送来远处钟声' },
  { label: '老木窗', desc: '探头望向老木窗外，庭院里的藤蔓开满了花' },
  { label: '瀑布小径', desc: '循着水声走近瀑布小径，水雾在阳光下架起彩虹' },
  { label: '雾中拱桥', desc: '走上雾中拱桥，对岸的灯火在薄雾里忽明忽暗' },
  { label: '地下通道', desc: '钻进幽深的地下通道，墙壁上映着暖黄的提灯' },
  { label: '阁楼天窗', desc: '爬上阁楼天窗，星光正落在一架落满灰尘的旧钢琴上' },
  { label: '风车磨坊', desc: '走进风车磨坊，麦粒的香气混着木头的温热扑面而来' },
  { label: '灯塔步道', desc: '沿着灯塔步道前行，海风把围巾吹成一面旗帜' },
  { label: '葡萄园小径', desc: '穿过葡萄园小径，藤架下的影子被夕阳拉得很长' },
  { label: '石砌拱门', desc: '穿过石砌拱门，另一头的集市正亮起灯笼' },
  { label: '吊桥', desc: '踏上摇晃的吊桥，峡谷里的风声像古老的歌谣' },
  { label: '山洞入口', desc: '靠近山洞入口，洞内传来水滴回响与幽微的光' },
  { label: '铁艺栅栏门', desc: '推开铁艺栅栏门，花园深处有一座白色凉亭' },
  { label: '船坞栈桥', desc: '走上船坞栈桥，木板上系着几艘轻轻晃动的渔船' },
  { label: '月光走廊', desc: '走进月光走廊，银白色的光铺满每一根廊柱' },
  { label: '钟楼旋梯', desc: '登上钟楼旋梯，越转越高，窗外是整座小城的屋顶' },
  { label: '花园凉亭', desc: '步入花园凉亭，茶香与玫瑰的气味混在微风里' },
  { label: '雪山垭口', desc: '翻过雪山垭口，眼前是一片澄澈的蓝绿色冰川湖' },
  { label: '沙漠商路', desc: '踏上沙漠商路，驼铃声在金色沙丘间飘荡' },
  { label: '竹林幽径', desc: '走进竹林幽径，风过竹梢发出细雨般的沙响' }
];

/* 固定热点位置（本地模式）：左下 / 右下 / 顶部 */
const POS_CLASSES = ['pos-bl', 'pos-br', 'pos-top'];

/* ==================== 3. 状态与持久化 ==================== */

let State = {
  steps: [],    // [{ title, desc, seed, imgUrl, hot:[{label,pos,x,y,desc}] }]
  idx: -1
};

function savePath() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(State.steps)); } catch (e) {}
}

function loadPath() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) { State.steps = arr; return true; }
    }
  } catch (e) {}
  return false;
}

function clearPath() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  State.steps = [];
  State.idx = -1;
}

/* ---------- 路径重放链接：?path=base64(...) ---------- */

function buildShareLink() {
  const data = State.steps.map((s) => ({ t: s.title, d: s.desc, sd: s.seed }));
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return location.href.split('?')[0].split('#')[0] + '?path=' + encodeURIComponent(b64);
}

function parsePathParam() {
  try {
    const m = location.search.match(/[?&]path=([^&]+)/);
    if (!m) return null;
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]))));
    const arr = JSON.parse(json);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.filter((x) => x && x.t && x.d).map((x) => ({
      title: String(x.t), desc: String(x.d), seed: x.sd || (Date.now() % 100000)
    }));
  } catch (e) { return null; }
}

/* ==================== 4. 图片生成 ==================== */

function imageUrl(prompt, seed) {
  const p = encodeURIComponent(prompt);
  return 'https://image.pollinations.ai/prompt/' + p +
    '?width=768&height=512&nologo=true&seed=' + encodeURIComponent(seed);
}

function buildPrompt(desc) {
  return desc + STYLE_SUFFIX;
}

/** 加载一张图到 img 元素（懒加载 + 加载动画） */
function loadImageInto(img, url) {
  const loading = $('#img-loading');
  if (loading) loading.classList.remove('hidden');
  if (loading) $('#loading-text').textContent = '正在寄出这张明信片…';
  img.classList.remove('loaded');
  img.removeAttribute('src');
  img.onload = () => {
    img.classList.add('loaded');
    if (loading) loading.classList.add('hidden');
  };
  img.onerror = () => {
    if (loading) { $('#loading-text').textContent = '这张明信片被雨打湿了，重试一下…'; }
    // 短暂延迟后重试（最多 1 次）
    if (!img._retried) {
      img._retried = true;
      setTimeout(() => { img.src = url + '&retry=' + Date.now(); }, 1200);
    }
  };
  img.src = url;
}

/* ==================== 5. BYOP 增强 ==================== */

const BYOP = {
  key: null,
  loggedIn: false,

  init() {
    try {
      const m = location.hash.match(/api_key=(sk_[A-Za-z0-9_-]+)/);
      if (m) {
        this.key = m[1];
        this.loggedIn = true;
        try { sessionStorage.setItem(BYOP_KEY, this.key); } catch (e) {}
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
    if (!this.loggedIn) {
      try {
        const raw = sessionStorage.getItem(BYOP_KEY);
        if (raw) { this.key = raw; this.loggedIn = true; }
      } catch (e) {}
    }
    this.updateUI();
  },

  login() {
    const redirect = encodeURIComponent(location.href.split('#')[0]);
    location.href = 'https://enter.pollinations.ai/authorize?redirect_uri=' + redirect + '&scope=usage&client_id=';
  },

  logout() {
    this.key = null; this.loggedIn = false;
    try { sessionStorage.removeItem(BYOP_KEY); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    this.updateUI();
    Toast('已退出登录');
  },

  updateUI() {
    const status = $('#byop-status');
    if (status) {
      status.textContent = this.loggedIn ? '✓ AI 热点已启用' : '未登录 · 本地热点';
      status.style.color = this.loggedIn ? '#3e5c4b' : '#7c6552';
    }
    [['btn-byop-login', 'btn-byop-login2'], ['btn-byop-logout', 'btn-byop-logout2']].forEach(([a, b]) => {
      const e1 = $('#' + a), e2 = $('#' + b);
      if (e1) e1.classList.toggle('hidden', this.loggedIn);
      if (e2) e2.classList.toggle('hidden', this.loggedIn);
    });
  },

  /** 调用 gpt-5.4-nano（文本或带图视觉） */
  async chat(messages, opt) {
    if (!this.key) return null;
    opt = opt || {};
    try {
      const r = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.key },
        body: JSON.stringify({
          model: 'openai/gpt-5.4-nano',
          messages: messages,
          max_tokens: opt.max_tokens || 900,
          temperature: opt.temperature != null ? opt.temperature : 0.7
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      const t = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return typeof t === 'string' ? t.trim() : null;
    } catch (e) { return null; }
  },

  /** AI 视觉分析：看当前明信片图，返回真实可点击热点（含坐标） */
  async analyzeHotspots(imgUrl, desc) {
    const sys = '你是明信片世界游戏的场景分析器。用户会给出一张 AI 生成的明信片风景图，'
      + '请你找出图中 2-3 个最自然、最合理的"可探索热点"（如门、窗、路、桥、梯、洞、小径等入口元素）。'
      + '用中文严格按 JSON 数组返回（不要输出其他文字），每项：'
      + '{"label":"热点名称（4-8字）","x":0到1的横向比例,"y":0到1的纵向比例,"desc":"一句叙事文案：从该热点继续探索会看到什么，20-40字"}。'
      + '坐标必须落在图中的实际入口/通道位置，不要指在纯装饰区域。';
    const user = '请分析这张明信片风景图，给出可点击热点：' + imgUrl + '\n场景描述：' + desc;
    const res = await this.chat([
      { role: 'system', content: sys },
      { role: 'user', content: [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: imgUrl } }
      ] }
    ], { max_tokens: 700, temperature: 0.6 });
    if (!res) return null;
    try {
      const json = res.match(/\[[\s\S]*\]/);
      if (!json) return null;
      const arr = JSON.parse(json[0]);
      if (!Array.isArray(arr) || !arr.length) return null;
      return arr.slice(0, 3).map((h) => ({
        label: String(h.label || '未知入口').slice(0, 10),
        x: Math.max(0.06, Math.min(0.94, Number(h.x) || 0.5)),
        y: Math.max(0.08, Math.min(0.92, Number(h.y) || 0.5)),
        desc: String(h.desc || '继续探索，前方还有新的风景').slice(0, 60)
      }));
    } catch (e) { return null; }
  }
};

/* ==================== 6. 热点系统 ==================== */

/** 本地模式：从词库随机取 3 个不同元素，分配到固定位置 */
function localHotspots() {
  const picks = shuffle(HOTSPOT_LIB).slice(0, 3);
  const posOrder = shuffle(POS_CLASSES);
  return picks.map((h, i) => ({
    label: h.label, pos: posOrder[i], x: null, y: null, desc: h.desc
  }));
}

/** 统一入口：生成某场景的热点；BYOP 登录优先 AI 视觉，失败降级本地 */
async function makeHotspots(desc, imgUrl) {
  if (BYOP.loggedIn) {
    try {
      const ai = await BYOP.analyzeHotspots(imgUrl, desc);
      if (ai && ai.length >= 2) {
        return ai.map((h) => ({ label: h.label, pos: '', x: h.x, y: h.y, desc: h.desc }));
      }
    } catch (e) {}
  }
  return localHotspots();
}

/* ==================== 7. 视图渲染 ==================== */

function showView(name) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  const el = $('#view-' + name);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** 渲染场景页（idx 对应的步骤） */
function renderScene() {
  const s = State.steps[State.idx];
  if (!s) return;

  /* 面包屑 */
  const crumbBox = $('#scene-breadcrumb');
  crumbBox.innerHTML = State.steps.map((st, i) =>
    '<span class="crumb' + (i === State.idx ? ' current' : '') + '">' + esc(st.title) + '</span>'
  ).join('<span class="crumb-sep">→</span>');

  /* 明信片 */
  const img = $('#scene-img');
  $('#scene-title').textContent = '第 ' + (State.idx + 1) + ' 站 · ' + s.title;
  $('#scene-desc').textContent = s.desc;
  $('#scene-index').textContent = (State.idx + 1) + '/' + State.steps.length;
  loadImageInto(img, s.imgUrl);

  /* 热点层 */
  const layer = $('#hotspots-layer');
  layer.innerHTML = '';
  s.hot.forEach((h, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotspot' + (h.pos ? ' ' + h.pos : '');
    btn.style.left = h.x != null ? (h.x * 100) + '%' : null;
    btn.style.top = h.y != null ? (h.y * 100) + '%' : null;
    btn.dataset.i = i;
    btn.innerHTML =
      '<span class="hotspot-dot"></span>' +
      '<span class="hotspot-label">' + esc(h.label) + '</span>';
    btn.addEventListener('click', () => onHotspot(i));
    layer.appendChild(btn);
  });

  /* 动作区 */
  const reExploreBtn = $('#btn-again');
  if (reExploreBtn) reExploreBtn.classList.toggle('hidden', State.idx >= State.steps.length - 1);

  savePath();
  renderMap();
  showView('scene');
}

/** 点击热点 → 进入下一场景 */
async function onHotspot(i) {
  const s = State.steps[State.idx];
  const h = s.hot[i];
  if (!h) return;
  const nextDesc = h.desc + '，延续此地氛围：' + s.desc.slice(0, 46);
  const seed = (s.seed + i * 7 + 13) % 999983;
  const p = buildPrompt(nextDesc);
  const url = imageUrl(p, seed);

  const next = { title: h.label, desc: nextDesc, seed: seed, imgUrl: url, hot: [] };
  State.steps.push(next);
  State.idx = State.steps.length - 1;

  /* 先渲染视图占位（热点稍后填充） */
  State.steps[State.idx].hot = localHotspots(); // 默认占位，避免无热点
  renderScene();
  Toast('正在探索「' + h.label + '」…');

  const hot = await makeHotspots(nextDesc, url);
  next.hot = hot;
  renderScene();
}

/** 地图视图 */
function renderMap() {
  const list = $('#map-list');
  const empty = $('#map-empty');
  if (!list) return;
  list.innerHTML = '';
  const replayBtn = $('#btn-map-replay');
  if (replayBtn) replayBtn.disabled = !State.steps.length;
  const hint = $('#home-path-hint');
  if (hint) hint.classList.toggle('hidden', State.steps.length > 0);
  if (!State.steps.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  State.steps.forEach((s, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'map-item';
    item.innerHTML =
      '<span class="map-index">' + (i + 1) + '</span>' +
      '<img class="map-thumb" loading="lazy" src="' + esc(s.imgUrl) + '" alt="' + esc(s.title) + '">' +
      '<span class="map-info">' +
        '<span class="map-title">' + esc(s.title) + '</span><br>' +
        '<span class="map-meta">' + esc(s.desc.slice(0, 40)) + '…</span>' +
      '</span>';
    item.addEventListener('click', () => { State.idx = i; renderScene(); });
    list.appendChild(item);
  });
}

/** 大厅：从一句话出发 */
async function startJourney(raw) {
  const desc = raw.trim();
  if (!desc) return;
  clearPath();
  const seed = (Date.now() % 999983) || 1;
  const p = buildPrompt(desc);
  const url = imageUrl(p, seed);
  const first = { title: '起点', desc: desc, seed: seed, imgUrl: url, hot: [] };
  State.steps.push(first);
  State.idx = 0;
  first.hot = localHotspots();
  renderScene();
  Toast('明信片正在路上…');

  const hot = await makeHotspots(desc, url);
  first.hot = hot;
  renderScene();
}

/** 路径重放：重建 steps 后展示第一站 */
function replayPath(list) {
  clearPath();
  let seedBase = Date.now() % 999983;
  State.steps = list.map((it, i) => {
    const seed = it.seed || ((seedBase + i * 31) % 999983);
    const url = imageUrl(buildPrompt(it.desc), seed);
    return { title: it.title, desc: it.desc, seed: seed, imgUrl: url, hot: localHotspots() };
  });
  State.idx = 0;
  savePath();
  renderScene();
  Toast('正在重放这段旅程…');
  State.steps.forEach((s, i) => {
    makeHotspots(s.desc, s.imgUrl).then((hot) => { s.hot = hot; if (State.idx === i) renderScene(); });
  });
}

/* ==================== 8. 事件绑定与初始化 ==================== */

function bindEvents() {
  $('#btn-start').addEventListener('click', () => {
    const v = $('#scene-input').value;
    if (!v.trim()) { Toast('先写一句话描述你想去的场景吧'); return; }
    startJourney(v);
  });
  $('#scene-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = $('#scene-input').value;
      if (v.trim()) startJourney(v);
    }
  });

  /* BYOP */
  $('#btn-byop-login').addEventListener('click', () => BYOP.login());
  $('#btn-byop-login2').addEventListener('click', () => BYOP.login());
  $('#btn-byop-logout').addEventListener('click', () => BYOP.logout());
  $('#btn-byop-logout2').addEventListener('click', () => BYOP.logout());
  $('#btn-ai-hotspots').addEventListener('click', () => {
    if (!BYOP.loggedIn) { Toast('需要先 BYOP 登录才能使用 AI 热点分析'); BYOP.login(); }
    else { Toast('AI 热点分析已启用，新场景将自动分析真实位置'); }
  });

  /* 场景页动作 */
  $('#btn-map').addEventListener('click', () => { renderMap(); showView('map'); });
  $('#btn-home').addEventListener('click', () => showView('home'));
  $('#btn-again').addEventListener('click', () => {
    const raw = prompt('重新出发：输入一句话描述新方向（留空则取消）', '');
    if (raw == null) return;
    if (raw.trim()) startJourney(raw.trim());
  });

  /* 大厅动作 */
  $('#btn-home-map').addEventListener('click', () => { renderMap(); showView('map'); });

  /* 地图页动作 */
  $('#btn-map-home').addEventListener('click', () => showView('home'));
  $('#btn-map-replay').addEventListener('click', () => {
    if (!State.steps.length) return;
    replayPath(State.steps.map((s) => ({ title: s.title, desc: s.desc, seed: s.seed })));
  });

  /* 分享 */
  $('#btn-share').addEventListener('click', () => {
    if (!State.steps.length) { Toast('还没有可分享的探索路径'); return; }
    const url = buildShareLink();
    const inp = $('#share-link');
    const box = $('#share-box');
    inp.value = url;
    box.classList.remove('hidden');
    inp.select();
    try { document.execCommand('copy'); Toast('重放链接已复制'); } catch (e) { Toast('链接已生成，请手动复制'); }
  });
  $('#btn-copy-link').addEventListener('click', () => {
    const inp = $('#share-link');
    inp.select();
    try { document.execCommand('copy'); Toast('链接已复制'); } catch (e) {}
  });
}

function init() {
  bindEvents();
  BYOP.init();

  const path = parsePathParam();
  if (path) {
    replayPath(path);
    return;
  }
  if (loadPath()) {
    State.idx = State.steps.length - 1;
    renderScene();
    return;
  }
  showView('home');
}

document.addEventListener('DOMContentLoaded', init);
