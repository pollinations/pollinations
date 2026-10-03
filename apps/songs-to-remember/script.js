/* =====================================================================
 * 记忆歌曲 · 核心逻辑
 * 粘贴知识点 → 本地模板编曲 → 试听 → 填空测验 → 学习播放列表
 *
 * 结构：
 *   1. 工具函数
 *   2. 曲风模板（童谣/流行/嘻哈/民谣/摇滚）
 *   3. 本地歌词引擎（拆句 + 曲式 + 韵脚钩子）
 *   4. 音频（匿名 Pollinations audio + speechSynthesis 兜底）
 *   5. BYOP 增强（AI 押韵歌词 + lyria 人声歌曲）
 *   6. 填空测验
 *   7. 学习播放列表（localStorage + 导出）
 *   8. 视图渲染与事件绑定
 *   9. 初始化
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
const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function Toast(msg) {
  const box = $('#toast');
  const txt = $('#toast-text');
  if (!box || !txt) return;
  txt.textContent = msg;
  box.classList.remove('hidden');
  clearTimeout(Toast._t);
  Toast._t = setTimeout(() => box.classList.add('hidden'), 2600);
}

/** 拆句：按换行与常见标点拆分，过滤空句 */
function splitSentences(text) {
  return String(text)
    .replace(/\r/g, '')
    .split(/[；;。！？!?\n]+/)
    .map((s) => s.trim().replace(/^[；;。！？!?、,，]+|[；;。！？!?、,，]+$/g, ''))
    .filter((s) => s.length > 0)
    .map((s) => (s.length > 26 ? s.slice(0, 26) + '…' : s));
}

/* ==================== 2. 曲风模板 ==================== */

const STYLES = {
  nursery: {
    name: '童谣', emoji: '🧸', desc: '轻快儿歌',
    beat: '轻快的童谣儿歌，节奏简单，旋律温暖可爱，适合小朋友跟唱',
    hooks: ['啦啦啦 记住啦', '唱呀唱 记得牢', '哼呀哼 不会忘', '快快乐乐 记心中'],
    tpls: ['{f} 就这样记下', '{f} 别忘了它', '小脑袋 装下它', '{f} 慢慢念 轻轻唱', '{f} 一遍又一遍'],
    bridges: ['这就是我的小小歌谣', '唱着唱着 全都记住啦']
  },
  pop: {
    name: '流行', emoji: '🎤', desc: '流行金曲',
    beat: '动感流行的流行金曲，副歌洗脑重复，带电子节拍',
    hooks: ['Oh yeah 这就是重点', 'So 记住这一刻', 'Baby 别忘记', 'Yeah 一直记着它'],
    tpls: ['{f} 心动的知识点', '{f} 一直在我耳边', '副歌里 反复出现', '{f} 唱给你听', '聚光灯下 记住{f}'],
    bridges: ['这是我们的记忆主打歌', '全场跟我一起 记住重点']
  },
  hiphop: {
    name: '嘻哈', emoji: '🎧', desc: '节奏说唱',
    beat: '节奏强烈的嘻哈说唱，鼓点清晰，flow 流畅有力量',
    hooks: ['Yo 记住这个 flow', 'Check it 别忘记', 'Ayo 再来一遍', 'Listen up 记牢它'],
    tpls: ['{f} 张嘴就来', '{f} 节奏带走', '哼着 beat 记得牢', '{f} 押韵到位', '麦克风前 喊出{f}'],
    bridges: ['这是知识点的 freestyle', 'Keep going 别停下']
  },
  folk: {
    name: '民谣', emoji: '🌾', desc: '温柔民谣',
    beat: '舒缓的民谣，木吉他伴奏，温柔叙事感',
    hooks: ['风儿吹 歌儿唱', '远方的路 慢慢走', '星光下 轻轻哼', '山川湖海 记住它'],
    tpls: ['{f} 像山间清泉', '{f} 低声呢喃', '篝火旁 轻声唱', '{f} 落在心上', '夕阳下 念着{f}'],
    bridges: ['这是一首岁月的歌', '把知识唱进梦里']
  },
  rock: {
    name: '摇滚', emoji: '🎸', desc: '热血摇滚',
    beat: '热血的摇滚，电吉他失真，节奏强劲有力',
    hooks: ['Rock! 记住这律动', '大声唱 别停下', 'We will rock 知识点', '吼出来 别忘掉'],
    tpls: ['{f} 燃起来!', '{f} 震耳欲聋', '吉他 solo 记忆更深', '{f} 用尽全力', '舞台中央 唱响{f}'],
    bridges: ['这就是我的摇滚记忆', 'Everybody 一起唱']
  }
};

/* ==================== 3. 本地歌词引擎 ==================== */

function fillTpl(tpl, fact) {
  return tpl.replace('{f}', fact);
}

/** 用本地模板把输入编成歌：主歌-副歌-桥段 */
function composeLyrics(input, styleKey) {
  const st = STYLES[styleKey] || STYLES.nursery;
  const facts = splitSentences(input).slice(0, 8);
  const tpls = shuffle(st.tpls);
  const hooks = shuffle(st.hooks);
  const lines = [];
  let ti = 0, hi = 0;
  const nextTpl = () => tpls[ti++ % tpls.length];
  const nextHook = () => hooks[hi++ % hooks.length];

  const put = (text, section) => lines.push({ text: text, section: section });

  /* 主歌 1 */
  if (facts[0]) put(fillTpl(nextTpl(), facts[0]), 'verse');
  if (facts[1]) put(fillTpl(nextTpl(), facts[1]), 'verse');
  /* 副歌 1 */
  put(nextHook(), 'chorus');
  put(fillTpl(nextTpl(), facts[0] || '记住重点'), 'chorus');
  put(nextHook(), 'chorus');
  /* 主歌 2 */
  if (facts[2]) put(fillTpl(nextTpl(), facts[2]), 'verse');
  if (facts[3]) put(fillTpl(nextTpl(), facts[3]), 'verse');
  /* 桥段 */
  put(pick(st.bridges), 'bridge');
  /* 副歌 2（重复钩子） */
  put(nextHook(), 'chorus');
  if (facts.length) put(fillTpl(nextTpl(), facts[facts.length - 1]), 'chorus');
  put(nextHook(), 'chorus');

  return lines;
}

function songText(lines) {
  return lines.map((l) => l.text).join('\n');
}

/* ==================== 4. 音频 ==================== */

/** 匿名音频 URL（已实测返回 audio/mpeg） */
function anonymousAudioUrl(text) {
  return 'https://gen.pollinations.ai/audio/' + encodeURIComponent(text);
}

/** 用 speechSynthesis 兜底朗读 */
function speakFallback(text, onEnd) {
  if (!('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
  try { window.speechSynthesis.cancel(); } catch (e) {}
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.95;
  u.onend = () => { if (onEnd) onEnd(); };
  u.onerror = () => { if (onEnd) onEnd(); };
  window.speechSynthesis.speak(u);
}

/** 停止播放与高亮定时器 */
function stopPlayback() {
  if (State.timer) { clearInterval(State.timer); State.timer = null; }
  State.playing = false;
  State.currentLine = -1;
  const audio = $('#audio-player');
  if (audio) { audio.pause(); audio.removeAttribute('src'); }
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
  applyLineHighlight();
  const btn = $('#btn-play');
  if (btn) btn.textContent = '▶ 播放 / 逐行高亮';
}

/**
 * 播放整首歌 + 逐行高亮。
 * 优先播放匿名 Pollinations audio；失败降级 speechSynthesis。
 */
function playSong(lines, audioUrl) {
  stopPlayback();
  if (!lines || !lines.length) return;

  const durations = lines.map((l) => Math.max(1.4, l.text.length * 0.28));
  const audio = $('#audio-player');
  const btn = $('#btn-play');
  if (btn) btn.textContent = '⏳ 生成音频中…';

  const startHighlight = () => {
    State.playing = true;
    if (btn) btn.textContent = '⏸ 播放中';
    let acc = 0, idx = 0;
    const advance = () => {
      State.currentLine = idx;
      applyLineHighlight();
      acc += durations[idx];
      idx += 1;
      if (idx >= lines.length) { stopPlayback(); return; }
      State.timer = setTimeout(advance, durations[idx] * 1000);
    };
    advance();
  };

  const onAudioFail = () => {
    if (btn) btn.textContent = '📢 语音朗读中…';
    speakFallback(songText(lines), () => stopPlayback());
    startHighlight();
  };

  const playViaUrl = (url) => {
    audio.src = url;
    audio.onerror = () => { audio.removeAttribute('src'); onAudioFail(); };
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => onAudioFail());
    }
    startHighlight();
  };

  if (audioUrl) {
    playViaUrl(audioUrl);
  } else {
    /* 匿名音频：先探测可用性再播放 */
    const probe = new Audio();
    probe.preload = 'none';
    probe.onerror = () => { onAudioFail(); };
    probe.oncanplay = () => { playViaUrl(anonymousAudioUrl(songText(lines))); };
    probe.src = anonymousAudioUrl(songText(lines));
  }
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
        try { sessionStorage.setItem('polli-song-byop', this.key); } catch (e) {}
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
    if (!this.loggedIn) {
      try {
        const raw = sessionStorage.getItem('polli-song-byop');
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
    try { sessionStorage.removeItem('polli-song-byop'); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    this.updateUI();
    Toast('已退出登录');
  },

  updateUI() {
    const status = $('#byop-status');
    if (status) {
      status.textContent = this.loggedIn ? '✓ AI 模式' : '本地模式';
      status.style.color = this.loggedIn ? '#2458ac' : '#6b7f95';
    }
    [['btn-byop-login'], ['btn-byop-logout']].forEach(([a]) => {
      const e1 = $('#' + a);
      if (e1) e1.classList.toggle('hidden', this.loggedIn);
    });
    const e2 = $('#btn-byop-logout');
    if (e2) e2.classList.toggle('hidden', !this.loggedIn);
  },

  /** 通用 chat 调用（gpt-5.4-nano） */
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
          max_tokens: opt.max_tokens || 1000,
          temperature: opt.temperature != null ? opt.temperature : 0.8
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      const t = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return typeof t === 'string' ? t.trim() : null;
    } catch (e) { return null; }
  },

  /** AI 生成押韵专业歌词 */
  async aiLyrics(input, styleKey) {
    const st = STYLES[styleKey] || STYLES.nursery;
    const sys = '你是记忆歌曲作词人。把用户给的学习内容（知识点/公式/单词）写成一首押韵、'
      + '朗朗上口的短歌帮助记忆。风格：' + st.name + '（' + st.beat + '）。'
      + '用中文严格按 JSON 返回（不要输出其他文字）：{"lines":[{"text":"一句歌词","section":"verse|chorus|bridge"}]}。'
      + '要求：8-12 行；副歌部分重复钩子句；每行不超过 26 字；内容覆盖用户提供的全部要点。';
    const user = '学习内容：\n' + input;
    const res = await this.chat([
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ], { max_tokens: 1000, temperature: 0.8 });
    if (!res) return null;
    try {
      const json = res.match(/\[[\s\S]*\]/);
      if (!json) return null;
      const obj = JSON.parse('{"lines":' + json[0] + '}');
      if (!Array.isArray(obj.lines) || !obj.lines.length) return null;
      return obj.lines
        .filter((l) => l && l.text)
        .slice(0, 14)
        .map((l) => ({ text: String(l.text).slice(0, 30), section: /chorus|bridge/.test(l.section) ? l.section : 'verse' }));
    } catch (e) { return null; }
  },

  /** AI 生成带人声完整歌曲（lyria），返回 objectURL */
  async aiAudio(lyricsText, styleKey) {
    if (!this.key) return null;
    const st = STYLES[styleKey] || STYLES.nursery;
    const models = ['google/lyria-3.5', 'google/lyria-3-clip-preview'];
    for (const model of models) {
      try {
        const r = await fetch('https://gen.pollinations.ai/v1/audio/speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.key },
          body: JSON.stringify({
            model: model,
            input: lyricsText,
            instructions: '唱成一首' + st.beat + '的中文歌曲，带清晰人声演唱，节奏明快'
          })
        });
        if (!r.ok) continue;
        const blob = await r.blob();
        if (!blob || blob.size < 100) continue;
        return URL.createObjectURL(blob);
      } catch (e) { continue; }
    }
    return null;
  }
};

/* ==================== 6. 填空测验 ==================== */

/** 从歌词行提取 2 字以上中文词（优先知识点原词） */
function extractWords(line) {
  const set = new Set();
  const m = line.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g);
  if (m) m.forEach((w) => { if (w.length >= 2 && w.length <= 8) set.add(w); });
  return Array.from(set);
}

/** 构造 3 道填空题：挖空歌词事实行中的关键词，4 选 1 */
function buildQuiz(lines, inputText) {
  /* 排除纯钩子句/桥段句，只从承载知识点的句子挖词 */
  const hookTexts = new Set();
  Object.values(STYLES).forEach((st) => {
    st.hooks.forEach((h) => hookTexts.add(h));
    st.bridges.forEach((b) => hookTexts.add(b));
  });
  const factLines = lines
    .map((l, i) => ({ idx: i, text: l.text, section: l.section }))
    .filter((l) => l.section !== 'bridge' && !hookTexts.has(l.text));
  const allWords = [];
  lines.forEach((l) => allWords.push(...extractWords(l.text)));
  const pool = Array.from(new Set(allWords));
  const factWords = inputText ? extractWords(inputText) : [];

  const questions = [];
  const used = new Set();
  const usedIdxs = new Set();

  const tryPick = (fl, preferFact) => {
    if (usedIdxs.has(fl.idx)) return null;
    let blank = null;
    if (preferFact && factWords.length) {
      const hits = extractWords(fl.text).filter((w) => factWords.includes(w) && !used.has(w));
      if (hits.length) blank = hits[0];
    } else {
      const ws = extractWords(fl.text).filter((w) => !used.has(w));
      if (ws.length) blank = ws[0];
    }
    if (!blank) return null;
    used.add(blank);
    usedIdxs.add(fl.idx);
    const distractors = shuffle(pool.filter((w) => w !== blank && !used.has(w))).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push('重点' + (distractors.length + 1) + '号');
    }
    const opts = shuffle([blank, ...distractors]);
    questions.push({
      lineIdx: fl.idx,
      blank: blank,
      options: opts,
      answer: opts.indexOf(blank),
      selected: -1,
      graded: false
    });
    return true;
  };

  /* 第一轮：优先挖知识点原词 */
  for (const fl of factLines) {
    if (questions.length >= 3) break;
    tryPick(fl, true);
  }
  /* 第二轮：兜底挖任意词补足题数 */
  for (const fl of factLines) {
    if (questions.length >= 3) break;
    tryPick(fl, false);
  }
  return questions;
}

/* ==================== 7. 学习播放列表 ==================== */

const LIB_KEY = 'polli-song-library-v1';
let Library = [];

function saveLib() {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(Library)); } catch (e) {}
}
function loadLib() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) { Library = arr; return; }
    }
  } catch (e) {}
  Library = [];
}

function libText(items) {
  return items.map((it, i) =>
    '【' + (i + 1) + '】主题：' + it.topic + '（' + it.styleName + '）\n' +
    it.lines.map((l) => l.text).join('\n') + '\n'
  ).join('\n\n');
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}

/* ==================== 8. 状态 ==================== */

let State = {
  style: 'nursery',
  input: '',
  lines: [],
  audioUrl: null,       // objectURL（AI lyria）或匿名 URL
  quiz: null,
  playing: false,
  timer: null,
  currentLine: -1
};

/* ==================== 9. 视图渲染 ==================== */

function showView(name) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  const el = $('#view-' + name);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderStyleGrid() {
  const grid = $('#style-grid');
  grid.innerHTML = Object.keys(STYLES).map((k) => {
    const st = STYLES[k];
    return '<label class="style-opt' + (State.style === k ? ' sel' : '') + '">' +
      '<input type="radio" name="style" value="' + k + '"' + (State.style === k ? ' checked' : '') + '>' +
      '<span class="style-emoji">' + st.emoji + '</span>' +
      '<span class="style-name">' + st.name + '</span>' +
      '<span class="style-desc">' + st.desc + '</span>' +
    '</label>';
  }).join('');
  grid.querySelectorAll('input[name="style"]').forEach((r) => {
    r.addEventListener('change', () => {
      State.style = r.value;
      renderStyleGrid();
    });
  });
}

/** 高亮当前歌词行（播放用） */
function applyLineHighlight() {
  $$('.lyric-line').forEach((el, i) => {
    el.classList.toggle('active', i === State.currentLine);
  });
}

/** 渲染歌词卡片；markCorrect 时高亮测验正确词 */
function renderLyrics(lines, markCorrect) {
  const card = $('#lyrics-card');
  card.innerHTML = lines.map((l, i) => {
    let text = esc(l.text);
    if (markCorrect && markCorrect[i]) {
      text = text.replace(esc(markCorrect[i]), '<span class="word-correct">' + esc(markCorrect[i]) + '</span>');
    }
    return '<div class="lyric-line section-' + esc(l.section) + '" data-i="' + i + '">' + text + '</div>';
  }).join('');
  /* 点击某行可从该行开始播放（若正在播放） */
  $$('.lyric-line').forEach((el) => {
    el.addEventListener('click', () => { State.currentLine = Number(el.dataset.i); applyLineHighlight(); });
  });
}

/** 生成歌曲（本地模板或 AI）并进入歌词页 */
async function composeSong() {
  const input = $('#study-input').value.trim();
  if (!input) { Toast('先粘贴一些学习内容吧'); return; }
  State.input = input;
  $('#btn-compose').disabled = true;
  $('#btn-compose').textContent = '⏳ 谱曲中…';
  Toast(BYOP.loggedIn ? 'AI 正在为你押韵编曲…' : '本地模板正在编曲…');

  let lines = null, audioUrl = null;
  if (BYOP.loggedIn) {
    lines = await BYOP.aiLyrics(input, State.style);
    if (lines && lines.length) {
      const lyricsText = songText(lines);
      audioUrl = await BYOP.aiAudio(lyricsText, State.style);
      if (!audioUrl) Toast('AI 歌词已生成，人声歌曲生成失败，将用匿名音频/朗读播放');
    }
  }
  if (!lines || !lines.length) {
    lines = composeLyrics(input, State.style);
  }

  State.lines = lines;
  State.audioUrl = audioUrl || null;
  State.quiz = null;

  $('#btn-compose').disabled = false;
  $('#btn-compose').textContent = '✨ 谱曲成歌';
  enterSongView();
}

function enterSongView() {
  const st = STYLES[State.style];
  $('#song-style-badge').textContent = st.emoji + ' ' + st.name;
  $('#song-title').textContent = '《' + (State.input.slice(0, 10) || '记忆之歌') + '之歌》';
  $('#song-topic').textContent = '学习内容：' + State.input;
  renderLyrics(State.lines, null);
  $('#quiz-box').classList.add('hidden');
  showView('song');
}

/** 渲染填空测验 */
function renderQuiz() {
  if (!State.quiz) {
    State.quiz = buildQuiz(State.lines, State.input);
  }
  const box = $('#quiz-box');
  const list = $('#quiz-list');
  const res = $('#quiz-result');
  res.className = 'quiz-result';
  res.textContent = '';
  list.innerHTML = State.quiz.map((q, qi) => {
    const text = esc(State.lines[q.lineIdx].text).replace(esc(q.blank), '<span class="blank">______</span>');
    const opts = q.options.map((o, oi) => {
      let cls = 'quiz-opt';
      if (q.graded) {
        if (oi === q.answer) cls += ' right';
        else if (oi === q.selected) cls += ' wrong';
      } else if (oi === q.selected) cls += ' sel';
      return '<button type="button" class="' + cls + '" data-q="' + qi + '" data-o="' + oi + '"' +
        (q.graded ? ' disabled' : '') + '>' + esc(o) + '</button>';
    }).join('');
    return '<div class="quiz-q"><div class="quiz-q-text">第 ' + (qi + 1) + ' 题 · ' + text + '</div>' +
      '<div class="quiz-opts">' + opts + '</div></div>';
  }).join('');
  box.classList.remove('hidden');
  list.querySelectorAll('.quiz-opt:not([disabled])').forEach((b) => {
    b.addEventListener('click', () => {
      const q = State.quiz[Number(b.dataset.q)];
      if (q.graded) return;
      q.selected = Number(b.dataset.o);
      renderQuiz();
    });
  });
  /* 歌词中标记填空位置 */
  const mark = {};
  State.quiz.forEach((q) => { mark[q.lineIdx] = q.blank; });
  renderLyrics(State.lines, mark);
  showView('song');
}

/** 评分 */
function gradeQuiz() {
  if (!State.quiz) return;
  const res = $('#quiz-result');
  let correct = 0;
  State.quiz.forEach((q) => {
    q.graded = true;
    if (q.selected === q.answer) correct += 1;
  });
  const total = State.quiz.length;
  const ok = correct === total;
  res.textContent = '得分 ' + correct + ' / ' + total + (ok ? ' 🎉 全对，这首歌你记住了！' : ' — 答错的词已在歌词中用黄色高亮，再听一遍吧');
  res.classList.add(ok ? 'good' : 'bad');
  renderQuiz();
  Toast('测验评分完成');
}

/* ---------- 播放列表渲染 ---------- */

function renderLibrary() {
  const list = $('#lib-list');
  const empty = $('#lib-empty');
  list.innerHTML = '';
  if (!Library.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  Library.forEach((it) => {
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.innerHTML =
      '<div class="lib-head">' +
        '<span class="style-badge">' + (STYLES[it.styleKey] ? STYLES[it.styleKey].emoji : '🎵') + ' ' + esc(it.styleName) + '</span>' +
        '<span class="lib-title">' + esc(it.topic.slice(0, 18)) + '</span>' +
      '</div>' +
      '<div class="lib-meta">' + new Date(it.createdAt).toLocaleString() + ' · ' + it.lines.length + ' 行</div>' +
      '<div class="lib-preview">' + esc(it.lines[0].text) + '</div>' +
      '<div class="lib-btns">' +
        '<button class="btn btn-small btn-primary" data-play="' + esc(it.id) + '">▶ 播放</button>' +
        '<button class="btn btn-small btn-ghost" data-quiz="' + esc(it.id) + '">🧩 测验</button>' +
        '<button class="btn btn-small btn-ghost" data-export="' + esc(it.id) + '">📄 导出</button>' +
        '<button class="btn btn-small btn-ghost" data-del="' + esc(it.id) + '">🗑 删除</button>' +
      '</div>';
    list.appendChild(item);
  });
}

function renderRecent() {
  const list = $('#recent-list');
  const empty = $('#recent-empty');
  list.innerHTML = '';
  const recent = Library.slice(-3).reverse();
  if (!recent.length) {
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  recent.forEach((it) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'recent-item';
    el.innerHTML =
      '<span class="recent-title">' + esc(it.topic.slice(0, 16)) + '</span>' +
      '<span class="recent-meta">' + esc(it.styleName) + ' · ' + it.lines.length + ' 行</span>';
    el.addEventListener('click', () => {
      State.style = it.styleKey;
      renderStyleGrid();
      loadSongIntoState(it);
    });
    list.appendChild(el);
  });
}

/** 把播放列表项载入当前状态并进入歌词页 */
function loadSongIntoState(it) {
  State.input = it.topic;
  State.lines = it.lines;
  State.audioUrl = it.audioUrl || null;
  State.quiz = null;
  enterSongView();
}

/* ==================== 10. 事件绑定 ==================== */

function bindEvents() {
  renderStyleGrid();

  $('#btn-compose').addEventListener('click', composeSong);
  $('#study-input').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      composeSong();
    }
  });

  /* BYOP */
  $('#btn-byop-login').addEventListener('click', () => BYOP.login());
  $('#btn-byop-logout').addEventListener('click', () => BYOP.logout());

  /* 歌词页 */
  $('#btn-play').addEventListener('click', () => {
    if (State.playing) { stopPlayback(); return; }
    playSong(State.lines, State.audioUrl);
  });
  $('#btn-stop').addEventListener('click', () => stopPlayback());
  $('#btn-back-home').addEventListener('click', () => { stopPlayback(); showView('home'); renderRecent(); });

  $('#btn-quiz').addEventListener('click', () => { stopPlayback(); renderQuiz(); });
  $('#btn-grade').addEventListener('click', gradeQuiz);

  $('#btn-save').addEventListener('click', () => {
    if (!State.lines || !State.lines.length) return;
    const it = {
      id: uid(),
      topic: State.input,
      styleKey: State.style,
      styleName: STYLES[State.style].name,
      lines: State.lines,
      audioUrl: State.audioUrl,
      createdAt: Date.now()
    };
    Library.push(it);
    saveLib();
    renderRecent();
    Toast('已存入播放列表');
  });

  $('#btn-export-song').addEventListener('click', () => {
    if (!State.lines || !State.lines.length) return;
    downloadText('记忆歌曲-' + State.input.slice(0, 8) + '.txt',
      '【' + STYLES[State.style].name + '】' + State.input + '\n\n' + songText(State.lines));
  });

  /* 播放列表页 */
  $('#btn-export-all').addEventListener('click', () => {
    if (!Library.length) { Toast('播放列表为空'); return; }
    downloadText('记忆歌曲-全部.txt', libText(Library));
    Toast('已导出全部歌词文本');
  });
  $('#btn-lib-home').addEventListener('click', () => { stopPlayback(); showView('home'); renderRecent(); });

  const libList = $('#lib-list');
  libList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-play], button[data-quiz], button[data-export], button[data-del]');
    if (!btn) return;
    const id = btn.dataset.play || btn.dataset.quiz || btn.dataset.export || btn.dataset.del;
    const it = Library.find((x) => x.id === id);
    if (!it) return;
    if (btn.dataset.play) {
      State.style = it.styleKey;
      renderStyleGrid();
      loadSongIntoState(it);
      playSong(it.lines, it.audioUrl);
    } else if (btn.dataset.quiz) {
      State.style = it.styleKey;
      renderStyleGrid();
      loadSongIntoState(it);
      renderQuiz();
    } else if (btn.dataset.export) {
      downloadText('记忆歌曲-' + it.topic.slice(0, 8) + '.txt', '【' + it.styleName + '】' + it.topic + '\n\n' + songText(it.lines));
    } else if (btn.dataset.del) {
      Library = Library.filter((x) => x.id !== id);
      saveLib();
      renderLibrary();
      renderRecent();
      Toast('已从播放列表删除');
    }
  });

  /* 播放列表入口 */
  const gotoLib = $('#btn-goto-lib');
  if (gotoLib) {
    gotoLib.addEventListener('click', () => { stopPlayback(); showView('library'); renderLibrary(); });
  }

  /* 导航 */
}

/* ==================== 11. 初始化 ==================== */

function init() {
  loadLib();
  BYOP.init();
  bindEvents();
  renderRecent();
  showView('home');
}

document.addEventListener('DOMContentLoaded', init);

