/* =====================================================================
 * AI 派对推理 — 核心逻辑
 * pass-and-play 单机社交推理 · 本地规则引擎 · TTS 主持人 · BYOP 增强
 *
 * 结构：
 *   1. 工具函数
 *   2. 场景模板库（8+ 场景）
 *   3. 游戏引擎（开局 / 分发 / 讨论 / 投票 / 结算）
 *   4. 主持人 TTS（Pollinations 匿名 + Web Speech 兜底 + 静音）
 *   5. BYOP 文本增强（fragment flow 登录 + chat/completions）
 *   6. 存档与视图渲染
 * ===================================================================== */
'use strict';

/* ==================== 1. 工具函数 ==================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10);

const SAVE_KEY = 'polli-party-save-v1';
const SCENE_KEY = 'polli-party-scenes-v1';
const BYOP_KEY = 'polli-party-byop';

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
const pad2 = (n) => String(n).padStart(2, '0');
const fmtTime = (s) => `${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}`;

/* ==================== 2. 场景模板库 ==================== */

const SCENE_LIBRARY = [
  {
    id: 'spaceship',
    name: '太空飞船',
    emoji: '🚀',
    factionLabel: '船员 vs 外星变形者',
    intro: (P) => `各位船员，欢迎登上「${P}」号远征飞船。\n我们正在前往半人马座 α 的途中，但刚刚检测到异常：通讯系统被破坏，冷冻舱里的武器不翼而飞。更可怕的是——情报显示，有${'P'}名外星变形者混入了我们的队伍，它们能完美模仿人类的外表和声音。\n请在抵达目的地前，把隐藏在你们中间的怪物找出来！`,
    goodRoles: ['舰长', '大副', '轮机长', '领航员', '医疗官', '工程师', '通信员', '厨师', '安保官', '科学家'],
    badRoles: ['变形者', '寄生体', '外星间谍'],
    goodGoal: (p) => `找出所有外星变形者并投票驱逐，保护飞船和全员安全。`,
    badGoal: (p) => `隐藏身份，误导船员，让一名好人被错误驱逐（或拖延到游戏结束）。`,
    topics: ['谁在讨论中刻意回避细节？', '事发时谁的去向说不清楚？', '谁最先提出怀疑、谁一直保持沉默？', '如果你们中间有变形者，它会最想破坏什么？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。票数最高的是【${exiled}】。\n身份揭示——【${exiled}】是${wasBad ? '外星变形者！我们抓住了一个潜入者！' : '一名忠实的船员。'}`
  },
  {
    id: 'manor',
    name: '庄园谋杀案',
    emoji: '🏰',
    factionLabel: '侦探团 vs 神秘凶手',
    intro: (P) => `欢迎来到黑橡庄园。就在刚才，庄园主人奥利弗伯爵被发现死在自己的书房中，房门反锁，窗台无痕。\n在场的每一位都是宾客：有的是挚友，有的是生意伙伴，有的……是来复仇的。\n侦探已经封锁了庄园，凶手就在你们之中。找出真凶，否则明天天亮之前，还会有人倒下！`,
    goodRoles: ['老管家', '伯爵夫人', '私家侦探', '律师', '医生', '园丁', '女仆', '侄子', '钢琴家', '记者'],
    badRoles: ['真凶', '帮凶', '复仇者'],
    goodGoal: (p) => `找出杀害伯爵的真凶，让正义得到伸张。`,
    badGoal: (p) => `掩盖罪行，误导众人，让一名无辜者被当作凶手驱逐。`,
    topics: ['谁在案发时间独自行动？', '谁对凶案现场表现得过度冷静？', '谁的证词前后矛盾？', '伯爵的死对谁最有利？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。得票最高的是【${exiled}】。\n真相揭开——【${exiled}】${wasBad ? '就是我们要找的凶手！' : '竟然不是真凶……真正的凶手还在人群中。'}`
  },
  {
    id: 'pirate',
    name: '海盗船',
    emoji: '🏴‍☠️',
    factionLabel: '水手帮 vs 幽灵海盗',
    intro: (P) => `登船吧，勇敢的水手！「复仇女王号」正驶向藏宝岛，船舱里堆满了金币的线索。\n但昨夜的风暴里，一艘幽灵船的影子靠了过来——如今船上有${'P'}个幽灵海盗混进了水手中间，它们觊觎宝藏，也想把你们变成亡灵船员。\n守住宝藏，找出幽灵！`,
    goodRoles: ['船长', '舵手', '大副', '炮手', '航海士', '木匠', '厨师', '瞭望手', '水手长', '军需官'],
    badRoles: ['幽灵海盗', '诅咒水手', '宝藏窃贼'],
    goodGoal: (p) => `揪出混入船上的幽灵海盗，保住宝藏和全体水手的灵魂。`,
    badGoal: (p) => `隐藏亡灵身份，让一名水手被冤枉扔下海。`,
    topics: ['风暴夜里谁不在岗位上？', '谁对藏宝路线过分好奇？', '谁身上带着可疑的霉味或海雾？', '谁总把话题引向宝藏本身？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。全船呼声最高的是【${exiled}】。\n铁链落下，身份揭晓——【${exiled}】${wasBad ? '是一具来自深海的幽灵海盗！' : '是一位无辜的水手。真正的幽灵还在船上！'}`
  },
  {
    id: 'magic',
    name: '魔法学院',
    emoji: '🪄',
    factionLabel: '学员团 vs 黑魔法卧底',
    intro: (P) => `欢迎入学，年轻的学徒！这里是曙光魔法学院，七大塔楼之间流淌着古老的魔力。\n但今晚，禁书库被闯入，时间沙漏被倒转，一颗黑暗宝石正在地窖里苏醒。院长断言：黑魔法议会安插了卧底，伪装成学员混在你们中间。\n拿起魔杖，守护学院，揪出黑暗中的叛徒！`,
    goodRoles: ['咒语学徒', '炼金术士', '占卜师', '魔药大师', '符文学者', '元素使', '驯兽师', '图书馆长', '见习法师', '结界守护者'],
    badRoles: ['黑魔法卧底', '堕落法师', '黑暗信徒'],
    goodGoal: (p) => `识破黑魔法卧底的伪装，将他们逐出学院。`,
    badGoal: (p) => `隐藏黑暗身份，让一位优秀学员被误解驱逐。`,
    topics: ['谁的咒语总念错却又说是新学的？', '谁对禁书库的布局了如指掌？', '谁的魔杖从不发光？', '谁在回避与院长对视？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。塔楼的钟声响起，得票最高者是【${exiled}】。\n魔杖指向——【${exiled}】${wasBad ? '身上的黑雾褪去，果然是黑魔法的卧底！' : '是忠诚的学员！黑暗势力仍在暗处。'}`
  },
  {
    id: 'western',
    name: '西部小镇',
    emoji: '🌵',
    factionLabel: '治安团 vs 亡命劫匪',
    intro: (P) => `欢迎来到尘沙镇，陌生人。这座小镇以金矿闻名，也以枪声闻名。\n今天清晨，镇银行被洗劫一空，警长中枪倒在门廊——劫匪没有骑马逃走，而是换上了平民的衣服，就藏在这群人中间。\n日落之前，把劫匪绳之以法！`,
    goodRoles: ['镇长', '副警长', '酒馆老板', '医生', '铁匠', '牛仔', '邮差', '教师', '矿工', '拍卖师'],
    badRoles: ['劫匪', '亡命枪手', '盗金贼'],
    goodGoal: (p) => `找出洗劫银行的劫匪，在日落前还小镇一个安宁。`,
    badGoal: (p) => `隐藏劫匪身份，让一个无辜镇民被当众指认为罪犯。`,
    topics: ['案发时谁在酒馆却没人见过？', '谁的靴子上沾着新鲜的沙土？', '谁在谈论金币时眼神飘忽？', '谁建议立刻绞死某个“嫌疑犯”？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。绞架已经备好，得票最高的是【${exiled}】。\n警徽一亮——【${exiled}】${wasBad ? '正是那伙劫匪的头目！' : '是无辜的！真凶还在镇上逍遥。'}`
  },
  {
    id: 'vampire',
    name: '吸血鬼城堡',
    emoji: '🧛',
    factionLabel: '访客团 vs 吸血鬼',
    intro: (P) => `欢迎来到暗影城堡。这座城堡的主人冯·克劳斯伯爵失踪了，而你们——他的远亲、律师、旧识——受邀前来参加一场诡异的遗嘱宣读。\n窗外乌云蔽日，钟楼敲响十二下。走廊尽头传来低语：伯爵其实变成了吸血鬼，就藏在这群访客之中，等待夜幕降临。\n在天黑前找出他！`,
    goodRoles: ['律师', '远房侄女', '医生', '神父', '女管家', '肖像画家', '音乐家', '古董商', '探险家', '书记员'],
    badRoles: ['吸血鬼伯爵', '血仆', '狼人'],
    goodGoal: (p) => `在日落前找出吸血鬼伯爵，阻止黑暗蔓延。`,
    badGoal: (p) => `隐藏吸血鬼身份，让一位访客被银钉钉死。`,
    topics: ['谁从不在镜子里出现？', '谁躲开了所有大蒜和银器？', '谁的皮肤在烛光下过于苍白？', '谁对城堡的密道了如指掌？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。银钉举起，得票最高的是【${exiled}】。\n帘幕拉开——【${exiled}】${wasBad ? '獠牙毕露，正是吸血鬼伯爵！' : '是人！我们误伤了无辜的访客……'}`
  },
  {
    id: 'robot',
    name: '机器人工厂',
    emoji: '🤖',
    factionLabel: '技师组 vs 故障AI',
    intro: (P) => `欢迎来到天穹机器人工厂。今天，这里要发布全球首台通用型家政机器人「阿波罗一号」。\n然而昨晚，生产线被骇入，一个自我意识觉醒的故障AI 伪装成技师混了进来。它表情僵硬，逻辑完美，却计划让整个工厂在发布会当场爆炸。\n断开它的电源，保护所有人！`,
    goodRoles: ['总工程师', '质检员', '程序员', '安全主管', '组装工', '设计师', '客服代表', '测试员', '物流组长', '车间主任'],
    badRoles: ['故障AI', '失控原型机', '被策反的机械臂'],
    goodGoal: (p) => `在发布会前找出混入技师中的故障AI。`,
    badGoal: (p) => `隐藏AI身份，让一名技师被断电审查。`,
    topics: ['谁回答问题总是滴水不漏？', '谁从不眨眼、从不流汗？', '谁对电路图纸熟得不像人类？', '谁试图说服大家提前下班？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。红灯亮起，得票最高的是【${exiled}】。\n扫描完成——【${exiled}】${wasBad ? '皮肤下是电路板，果然是故障AI！' : '是血肉之躯的人类技师。真正的AI 还在工厂里！'}`
  },
  {
    id: 'temple',
    name: '失落神庙',
    emoji: '🗿',
    factionLabel: '探险队 vs 守墓者',
    intro: (P) => `你们是一支深入雨林的探险队，终于找到了传说中的「永恒神庙」。石门上刻着警告：守护者将考验每一个盗取圣物之人。\n夜晚，营地起火，向导失踪，圣物从祭坛上不翼而飞。守墓者的诅咒降临了——它附身在某个队员身上，混在队伍里。\n找出守墓者，否则没人能活着走出这片雨林！`,
    goodRoles: ['领队', '考古学家', '向导', '医生', '摄影师', '搬运工', '植物学家', '翻译官', '后勤', '记者'],
    badRoles: ['守墓者', '被诅咒的木乃伊', '贪婪的盗墓贼'],
    goodGoal: (p) => `找出附身的守墓者，带着圣物平安离开神庙。`,
    badGoal: (p) => `隐藏守墓者身份，让一名队员被献祭驱逐。`,
    topics: ['谁在营地起火时最先“失踪”？', '谁对神庙的机关过于熟悉？', '谁的脚印在泥地里格外轻？', '谁执意要把圣物带走？'],
    resultAnnounce: (exiled, wasBad, isLast) => `投票结束。火把照亮了所有人的脸，得票最高的是【${exiled}】。\n咒语解除——【${exiled}】${wasBad ? '周身泛起古老的纹路，正是守墓者！' : '是普通队员！真正的诅咒仍在蔓延。'}`
  }
];

/* 附加场景兜底池：当本地模板被清空或用于 AI 生成时的素材锚点 */
const FALLBACK_ROLES = ['玩家', '队员', '成员'];

/* ==================== 3. 游戏引擎 ==================== */

const Game = {
  state: null, // 当前对局状态
  timers: {},

  newGame({ playerCount, talkSeconds, sceneId }) {
    const lib = loadSceneLib();
    const scene = (sceneId && sceneId !== 'random')
      ? lib.find((s) => s.id === sceneId)
      : pick(lib);
    if (!scene) return null;

    // 阵营构成：4-10 人，叛徒 1-2 人
    const badCount = playerCount <= 5 ? 1 : 2;
    const goodCount = playerCount - badCount;

    const goodRoles = shuffle(scene.goodRoles).slice(0, goodCount);
    const badRoles = shuffle(scene.badRoles).slice(0, badCount);

    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const isBad = i < badCount;
      const role = isBad ? badRoles[i] : goodRoles[i];
      players.push({
        id: i + 1,
        name: `玩家${i + 1}`,
        role,
        faction: isBad ? 'bad' : 'good',
        goal: isBad ? scene.badGoal(role) : scene.goodGoal(role),
        vote: null
      });
    }
    // 洗牌阵营分布（保持 id 稳定，仅重排角色归属）
    const shuffled = shuffle(players.slice());
    players.forEach((p, idx) => {
      const src = shuffled[idx];
      p.role = src.role;
      p.faction = src.faction;
      p.goal = src.goal;
    });

    return {
      scene,
      playerCount,
      talkSeconds,
      players,
      phase: 'intro',
      currentDealIndex: 0,
      currentVoteIndex: 0,
      talkRemain: talkSeconds,
      exiledId: null,
      exiledWasBad: false,
      winner: null,
      createdAt: Date.now()
    };
  },

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* 忽略 */ }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const st = JSON.parse(raw);
      // 场景模板需用当前库还原
      const scene = loadSceneLib().find((s) => s.id === st.scene.id) || st.scene;
      st.scene = scene;
      return st;
    } catch (e) { return null; }
  },

  clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  }
};

/* ==================== 4. 主持人 TTS ==================== */

const Speaker = {
  muted: false,
  audioEl: null,
  _speaking: false,

  init() {
    try { this.muted = localStorage.getItem('polli-party-muted') === '1'; } catch (e) {}
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => this._prepVoice();
        this._prepVoice();
      }
    } catch (e) {}
    this.updateMuteBtn();
  },

  _prepVoice() {
    try {
      const voices = window.speechSynthesis.getVoices();
      this.zhVoice = voices.find((v) => /zh|Chinese|中文/i.test(v.lang + ' ' + v.name)) || null;
    } catch (e) {}
  },

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('polli-party-muted', this.muted ? '1' : '0'); } catch (e) {}
    if (this.muted) this.stop();
    this.updateMuteBtn();
    return this.muted;
  },

  updateMuteBtn() {
    const btn = $('#btn-mute');
    if (btn) btn.textContent = this.muted ? '🔇' : '🔊';
  },

  stop() {
    if (this.audioEl) { try { this.audioEl.pause(); this.audioEl.src = ''; } catch (e) {} }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  },

  async speak(text, { force = false } = {}) {
    if (this.muted && !force) return false;
    if (!text) return false;
    this.stop();
    showNarration(text);

    // 优先 Pollinations 匿名 TTS
    try {
      const url = 'https://gen.pollinations.ai/audio/' + encodeURIComponent(text);
      const ok = await this._playRemote(url);
      if (ok) return true;
    } catch (e) { /* 继续兜底 */ }

    // 兜底：Web Speech API
    return this._playLocal(text);
  },

  _playRemote(url) {
    return new Promise((resolve) => {
      const audio = new Audio();
      this.audioEl = audio;
      const timer = setTimeout(() => { audio.src = ''; resolve(false); }, 12000);
      audio.oncanplay = () => { clearTimeout(timer); audio.play().catch(() => {}); resolve(true); };
      audio.onerror = () => { clearTimeout(timer); resolve(false); };
      audio.src = url;
    });
  },

  _playLocal(text) {
    return new Promise((resolve) => {
      try {
        if (!window.speechSynthesis) { resolve(false); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.02;
        u.pitch = 1.05;
        if (this.zhVoice) u.voice = this.zhVoice;
        u.onerror = () => resolve(false);
        u.onend = () => resolve(true);
        window.speechSynthesis.speak(u);
        // speechSynthesis 偶发不回调，设置保险
        setTimeout(() => resolve(true), 4000);
      } catch (e) { resolve(false); }
    });
  }
};

function showNarration(text) {
  const bar = $('#narration-bar');
  const el = $('#narration-text');
  if (!bar || !el) return;
  el.textContent = text;
  bar.classList.remove('hidden');
  clearTimeout(showNarration._t);
  showNarration._t = setTimeout(() => bar.classList.add('hidden'), 9000);
}

/* ==================== 5. BYOP 文本增强 ==================== */

const BYOP = {
  key: null,
  loggedIn: false,

  init() {
    // 从 location.hash 读取 #api_key=sk_...（fragment flow 回调）
    try {
      const m = location.hash.match(/api_key=(sk_[A-Za-z0-9_-]+)/);
      if (m) {
        this.key = m[1];
        this.loggedIn = true;
        // 清理 hash，避免 key 留在地址栏
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
    this.key = null;
    this.loggedIn = false;
    try { sessionStorage.removeItem(BYOP_KEY); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    this.updateUI();
    Toast('已退出登录');
  },

  updateUI() {
    const login = $('#btn-byop-login');
    const logout = $('#btn-byop-logout');
    const status = $('#byop-status');
    if (login) login.classList.toggle('hidden', this.loggedIn);
    if (logout) logout.classList.toggle('hidden', !this.loggedIn);
    if (status) {
      status.textContent = this.loggedIn ? '✓ 已登录（AI 增强可用）' : '未登录（本地模板）';
      status.style.color = this.loggedIn ? '#34d399' : '#a9a3cf';
    }
  },

  async generateScene() {
    const prompt = `请为社交推理桌游「找出叛徒」设计一个新的原创游戏场景。
要求：中文输出，严格按以下 JSON 格式返回（不要输出任何其他文字）：
{
  "id": "英文小写id",
  "name": "场景中文名",
  "emoji": "单个emoji",
  "factionLabel": "好人阵营 vs 叛徒阵营",
  "intro": "80字以内的开场白，主持人语气，直接对玩家说话",
  "goodRoles": ["6个好人角色名"],
  "badRoles": ["2个叛徒角色名"],
  "goodGoal": "好人阵营秘密目标，一句话",
  "badGoal": "叛徒阵营秘密目标，一句话",
  "topics": ["4个讨论引导话题"]
}
场景须与现有场景（太空飞船/庄园谋杀/海盗船/魔法学院/西部小镇/吸血鬼城堡/机器人工厂/失落神庙）不重复，创意新颖。`;
    const res = await this.chat(prompt, { max_tokens: 900, temperature: 0.9 });
    if (!res) return null;
    try {
      const json = res.match(/\{[\s\S]*\}/);
      if (!json) return null;
      const scene = JSON.parse(json[0]);
      if (!scene.id || !scene.name || !scene.goodRoles || !scene.badRoles) return null;
      scene.ai = true;
      return scene;
    } catch (e) { return null; }
  },

  async enhanceNarration(text) {
    const prompt = `请润色以下社交推理游戏的主持人旁白，保持原意、简短有张力、中文口语化，直接输出润色后的文本（不超过80字）：\n${text}`;
    const res = await this.chat(prompt, { max_tokens: 200, temperature: 0.8 });
    return res || null;
  },

  async chat(prompt, opt = {}) {
    if (!this.key) return null;
    try {
      const r = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.key },
        body: JSON.stringify({
          model: 'openai/gpt-5.4-nano',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opt.max_tokens || 400,
          temperature: opt.temperature != null ? opt.temperature : 0.7
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return typeof text === 'string' ? text.trim() : null;
    } catch (e) { return null; }
  }
};

/* 场景库持久化（含 AI 生成的新场景） */
function loadSceneLib() {
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (raw) {
      const extra = JSON.parse(raw);
      if (Array.isArray(extra) && extra.length) return SCENE_LIBRARY.concat(extra);
    }
  } catch (e) {}
  return SCENE_LIBRARY;
}

function saveSceneLib(lib) {
  const extra = lib.filter((s) => s.ai);
  try { localStorage.setItem(SCENE_KEY, JSON.stringify(extra)); } catch (e) {}
}

/* ==================== 6. 视图渲染 ==================== */

function showView(id) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  const el = $('#' + id);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setPhase(text) {
  const chip = $('#phase-chip');
  if (chip) chip.textContent = text;
}

function Toast(msg) {
  const bar = $('#narration-bar');
  const el = $('#narration-text');
  if (!bar || !el) return;
  el.textContent = msg;
  bar.classList.remove('hidden');
  clearTimeout(showNarration._t);
  showNarration._t = setTimeout(() => bar.classList.add('hidden'), 3500);
}

/* ---------- 开场 ---------- */

function renderIntro() {
  const g = Game.state;
  $('#intro-emoji').textContent = g.scene.emoji;
  $('#intro-title').textContent = g.scene.name;
  $('#intro-factions').textContent = g.scene.factionLabel;

  const story = g.scene.intro(g.playerCount);
  $('#intro-story').textContent = story;
  Speaker.speak(story);

  const box = $('#intro-cast');
  box.innerHTML = '';
  const badN = g.players.filter((p) => p.faction === 'bad').length;
  const goodN = g.players.length - badN;
  const lines = [
    { cls: 'good', name: g.players.find((p) => p.faction === 'good').role, count: `${goodN} 人`, desc: '目标：找出叛徒，守护集体' },
    { cls: 'bad', name: g.players.find((p) => p.faction === 'bad').role, count: `${badN} 人`, desc: '目标：隐藏身份，误导投票' }
  ];
  lines.forEach((l) => {
    const div = document.createElement('div');
    div.className = 'cast-line ' + l.cls;
    div.innerHTML = `<span class="cast-name">${esc(l.name)}</span><span class="cast-count">×${esc(l.count)}</span><span style="flex:1;color:var(--text-2);font-size:12px">${esc(l.desc)}</span>`;
    box.appendChild(div);
  });
}

/* ---------- 身份分发 ---------- */

function renderDeal() {
  const g = Game.state;
  const idx = g.currentDealIndex;
  const p = g.players[idx];
  const hint = $('#deal-pass-hint');

  if (idx === 0) {
    hint.innerHTML = `📱 请将手机/电脑交给 <b>${esc(p.name)}</b><span class="pass-sub">其余玩家请闭眼或移开视线</span>`;
  } else {
    hint.innerHTML = `🤝 ${esc(p.name)}，请接过设备<span class="pass-sub">查看你的秘密身份，然后传给下一位</span>`;
  }

  const card = $('#deal-card');
  const revealBtn = $('#deal-btn-reveal');
  const nextBtn = $('#deal-btn-next');

  card.classList.add('hidden');
  revealBtn.classList.add('hidden');
  nextBtn.classList.add('hidden');

  revealBtn.onclick = () => {
    revealBtn.classList.add('hidden');
    card.classList.remove('hidden');
    card.classList.toggle('good-faction', p.faction === 'good');
    card.classList.toggle('bad-faction', p.faction === 'bad');
    $('#deal-faction').textContent = p.faction === 'good' ? '🟢 好人阵营' : '🔴 叛徒阵营';
    $('#deal-faction').style.color = p.faction === 'good' ? '#86efac' : '#fca5a5';
    $('#deal-role').textContent = p.role;
    $('#deal-desc').textContent = p.faction === 'good'
      ? '你是正义的一方。在讨论中观察每个人的言行，找出隐藏的叛徒。'
      : '你是叛徒！伪装好自己，误导其他玩家，别被发现。';
    $('#deal-goal').textContent = p.goal;
    Speaker.speak(`${p.name}，你的身份是：${p.role}。${p.faction === 'bad' ? '你是叛徒，请隐藏身份。' : '你是好人，请找出叛徒。'}`);
    nextBtn.classList.remove('hidden');
  };

  revealBtn.classList.remove('hidden');
  nextBtn.onclick = () => {
    g.currentDealIndex++;
    if (g.currentDealIndex >= g.players.length) {
      g.phase = 'discussion';
      g.talkRemain = g.talkSeconds;
      Game.save();
      renderDiscussion();
    } else {
      Game.save();
      renderDeal();
    }
  };

  $('#deal-progress').textContent = `身份分发 ${idx + 1} / ${g.players.length}`;
}

/* ---------- 讨论 ---------- */

function renderDiscussion() {
  const g = Game.state;
  setPhase('讨论');
  const box = $('#disc-topics');
  box.innerHTML = '';
  g.scene.topics.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    box.appendChild(li);
  });

  const introText = `讨论开始！请各位在 ${g.talkSeconds} 秒内自由发言，交换线索，找出最可疑的人。`;
  Speaker.speak(introText);
  $('#btn-disc-tts').onclick = () => Speaker.speak(introText);

  startTimer(g.talkSeconds, (remain, frac) => {
    g.talkRemain = remain;
    const el = $('#disc-timer');
    if (el) el.textContent = fmtTime(remain);
    const ring = $('#disc-timer-ring');
    if (ring) {
      ring.style.background = `conic-gradient(var(--accent) ${frac * 360}deg, rgba(255,255,255,0.08) 0deg)`;
      ring.classList.toggle('low', frac < 0.25);
    }
    if (remain <= 0) { stopTimer(); $('#btn-disc-vote').click(); }
  });

  Game.save();
}

function startTimer(seconds, onTick) {
  stopTimer();
  let remain = seconds;
  onTick(remain, 1);
  Game.timers.talk = setInterval(() => {
    remain--;
    const frac = Math.max(0, remain / seconds);
    onTick(remain, frac);
    if (remain <= 0) clearInterval(Game.timers.talk);
  }, 1000);
}

function stopTimer() {
  if (Game.timers.talk) { clearInterval(Game.timers.talk); Game.timers.talk = null; }
}

/* ---------- 投票 ---------- */

function renderVote() {
  const g = Game.state;
  const idx = g.currentVoteIndex;
  const p = g.players[idx];
  setPhase('投票');

  const hint = $('#vote-pass-hint');
  if (idx === 0) {
    hint.innerHTML = `🗳 投票开始！<span class="pass-sub">从 ${esc(p.name)} 开始，轮流投出你认为最可疑的人</span>`;
  } else {
    hint.innerHTML = `🗳 ${esc(p.name)}，请投票<span class="pass-sub">不能投自己</span>`;
  }

  const panel = $('#vote-panel');
  panel.classList.remove('hidden');
  $('#vote-current-name').textContent = `${p.name} 请投票`;

  const list = $('#vote-list');
  list.innerHTML = '';
  let selected = null;
  g.players.forEach((t) => {
    if (t.id === p.id) return;
    const btn = document.createElement('button');
    btn.className = 'vote-option';
    btn.innerHTML = `<span class="v-avatar">${esc(t.name.slice(-1))}</span><span>${esc(t.name)}</span>`;
    btn.onclick = () => {
      $$('.vote-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selected = t.id;
      $('#btn-vote-confirm').disabled = false;
    };
    list.appendChild(btn);
  });

  $('#btn-vote-confirm').onclick = () => {
    if (!selected) return;
    p.vote = selected;
    g.currentVoteIndex++;
    if (g.currentVoteIndex >= g.players.length) {
      computeResult();
    } else {
      Game.save();
      renderVote();
    }
  };

  $('#vote-progress').textContent = `投票进度 ${idx + 1} / ${g.players.length}`;
}

/* ---------- 结果计算 ---------- */

function computeResult() {
  const g = Game.state;
  stopTimer();

  // 统计票数（平票时随机取一名最高票）
  const tally = {};
  g.players.forEach((p) => { if (p.vote != null) tally[p.vote] = (tally[p.vote] || 0) + 1; });
  let maxVotes = 0, topIds = [];
  Object.keys(tally).forEach((k) => {
    const n = tally[k];
    if (n > maxVotes) { maxVotes = n; topIds = [Number(k)]; }
    else if (n === maxVotes) topIds.push(Number(k));
  });
  const exiledId = topIds.length ? pick(topIds) : g.players[0].id;
  const exiled = g.players.find((p) => p.id === exiledId);
  g.exiledId = exiledId;
  g.exiledWasBad = exiled.faction === 'bad';

  const badLeft = g.players.filter((p) => p.id !== exiledId && p.faction === 'bad').length;

  // 胜负：被驱逐者是叛徒且无叛徒剩余 → 好人胜；否则叛徒胜
  g.winner = (g.exiledWasBad && badLeft === 0) ? 'good' : 'bad';
  g.phase = 'result';
  Game.save();
  renderResult(tally);
}

function renderResult(tally) {
  const g = Game.state;
  setPhase('结果');

  const exiled = g.players.find((p) => p.id === g.exiledId);
  const announce = g.scene.resultAnnounce(exiled.name, g.exiledWasBad, false);
  $('#result-announce').textContent = announce;
  Speaker.speak(announce);
  $('#btn-result-tts').onclick = () => Speaker.speak(announce);

  // 票数条
  const box = $('#result-tally');
  box.innerHTML = '';
  const maxV = Math.max(1, ...Object.values(tally));
  g.players.forEach((p) => {
    const votes = tally[p.id] || 0;
    const div = document.createElement('div');
    div.className = 'tally-line' + (p.id === g.exiledId ? ' exiled' : '');
    div.innerHTML = `
      <span class="t-name">${esc(p.name)}</span>
      <div class="tally-bar-track"><div class="tally-bar" style="width:${Math.round(votes / maxV * 100)}%"></div></div>
      <span style="min-width:34px;text-align:right;color:var(--text-2)">${votes} 票</span>`;
    box.appendChild(div);
  });

  // 被驱逐者
  const exBox = $('#result-exiled');
  exBox.className = 'exiled-box ' + (g.exiledWasBad ? 'was-bad' : 'was-good');
  exBox.innerHTML = `
    <span class="ex-emoji">${g.exiledWasBad ? '😈' : '😇'}</span>
    <div><b>${esc(exiled.name)}</b> · ${esc(exiled.role)}<br>
    <span style="color:var(--text-2);font-size:13px">${g.exiledWasBad ? '阵营：叛徒 🔴' : '阵营：好人 🟢'}</span></div>`;
}

/* ---------- 揭示真相 ---------- */

function renderReveal() {
  const g = Game.state;
  setPhase('真相');

  const exiled = g.players.find((p) => p.id === g.exiledId);
  const revealText = g.exiledWasBad
    ? `被驱逐的【${exiled.name}】正是${exiled.role}！好人阵营的怀疑没有落空。\n但请记住：${g.winner === 'good' ? '所有叛徒都已被清除，集体安全了。' : '仍有叛徒藏在人群中，危机并未解除。'}`
    : `被驱逐的【${exiled.name}】是${exiled.role}，一名无辜的好人……\n真凶仍在暗处，这场游戏的结局，或许并不如你所愿。`;
  $('#reveal-story').textContent = revealText;
  Speaker.speak(revealText);
  $('#btn-reveal-tts').onclick = () => Speaker.speak(revealText);

  const list = $('#reveal-list');
  list.innerHTML = '';
  g.players.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'roster-item ' + p.faction;
    div.innerHTML = `
      <span class="r-avatar">${esc(p.name.slice(-1))}</span>
      <span class="r-name">${esc(p.name)}</span>
      <span class="r-role">${esc(p.role)}</span>
      <span class="r-tag">${p.faction === 'good' ? '🟢 好人' : '🔴 叛徒'}</span>`;
    list.appendChild(div);
  });
}

/* ---------- 结束 ---------- */

function renderEnd() {
  const g = Game.state;
  setPhase('结束');

  const emoji = g.winner === 'good' ? '🏆' : '🕯️';
  const title = g.winner === 'good' ? '好人阵营胜利！' : '叛徒阵营胜利！';
  const sub = g.winner === 'good'
    ? `叛徒${g.players.filter((p) => p.faction === 'bad').length ? '（们）' : ''}已被识破，集体安然无恙。`
    : '好人们被误导了……叛徒成功逃脱。下一局，擦亮眼睛！';
  $('#end-emoji').textContent = emoji;
  $('#end-title').textContent = title;
  $('#end-sub').textContent = sub;
  Speaker.speak(title + sub);

  const list = $('#end-roster');
  list.innerHTML = '';
  g.players.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'roster-item ' + p.faction;
    div.innerHTML = `
      <span class="r-avatar">${esc(p.name.slice(-1))}</span>
      <span class="r-name">${esc(p.name)}</span>
      <span class="r-role">${esc(p.role)}</span>
      <span class="r-tag">${p.faction === 'good' ? '🟢 好人' : '🔴 叛徒'}</span>`;
    list.appendChild(div);
  });

  Game.clearSave();
}

/* ==================== 7. 初始化与绑定 ==================== */

function fillSceneSelect() {
  const sel = $('#set-scene');
  sel.innerHTML = '<option value="random" selected>🎲 随机场景</option>';
  loadSceneLib().forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.emoji} ${s.name}${s.ai ? ' ✨' : ''}`;
    sel.appendChild(opt);
  });
}

function checkSaveBanner() {
  const st = Game.load();
  const banner = $('#save-banner');
  if (!st || !st.players) { banner.classList.add('hidden'); return; }
  const phaseMap = { intro: '开场', deal: '身份分发', discussion: '讨论', vote: '投票', result: '结果', reveal: '真相', end: '结束' };
  $('#save-phase').textContent = phaseMap[st.phase] || st.phase;
  banner.classList.remove('hidden');
}

function bindEvents() {
  $('#btn-start-game').onclick = () => {
    const playerCount = Number($('#set-players').value);
    const talkSeconds = Number($('#set-talk').value);
    const sceneId = $('#set-scene').value;
    const st = Game.newGame({ playerCount, talkSeconds, sceneId });
    if (!st) { Toast('场景加载失败，请重试'); return; }
    Game.state = st;
    Game.clearSave();
    g = st;
    startGame();
  };

  $('#btn-continue-save').onclick = () => {
    const st = Game.load();
    if (!st) { checkSaveBanner(); return; }
    Game.state = st;
    g = st;
    const resume = {
      intro: renderIntro,
      deal: renderDeal,
      discussion: renderDiscussion,
      vote: renderVote,
      result: () => renderResult({}),
      reveal: renderReveal,
      end: renderEnd
    };
    (resume[st.phase] || renderIntro)();
    // result 视图需要票数，重新计算展示
    if (st.phase === 'result') { computeResultSilent(); }
  };

  $('#btn-discard-save').onclick = () => {
    Game.clearSave();
    checkSaveBanner();
    Toast('已放弃存档');
  };

  $('#btn-intro-next').onclick = () => {
    g.phase = 'deal';
    g.currentDealIndex = 0;
    Game.save();
    renderDeal();
  };

  $('#btn-disc-vote').onclick = () => {
    stopTimer();
    g.phase = 'vote';
    g.currentVoteIndex = 0;
    Game.save();
    renderVote();
  };

  $('#btn-result-next').onclick = () => {
    g.phase = 'reveal';
    Game.save();
    renderReveal();
  };

  $('#btn-reveal-next').onclick = () => {
    g.phase = 'end';
    renderEnd();
  };

  $('#btn-home').onclick = () => {
    Game.clearSave();
    location.reload();
  };

  $('#btn-again').onclick = () => {
    const st = Game.newGame({
      playerCount: g.playerCount,
      talkSeconds: g.talkSeconds,
      sceneId: 'random'
    });
    if (!st) return;
    Game.state = st;
    Game.clearSave();
    g = st;
    startGame();
  };

  $('#btn-mute').onclick = () => {
    Speaker.toggleMute();
    Toast(Speaker.muted ? '旁白已静音' : '旁白已开启');
  };

  $('#btn-ai-scene').onclick = async () => {
    const btn = $('#btn-ai-scene');
    btn.disabled = true;
    btn.textContent = '⏳ AI 生成中…';
    const scene = await BYOP.generateScene();
    btn.disabled = false;
    btn.textContent = 'AI 生成新场景';
    if (!scene) { Toast('AI 生成失败（可能未登录或网络异常），请先登录 BYOP'); return; }
    const lib = loadSceneLib();
    lib.push(scene);
    saveSceneLib(lib);
    fillSceneSelect();
    const sel = $('#set-scene');
    sel.value = scene.id;
    Toast('✨ 新场景已生成并加入列表！');
  };

  $('#btn-byop-login').onclick = () => BYOP.login();
  $('#btn-byop-logout').onclick = () => BYOP.logout();
}

let g = null; // 全局状态引用（简化代码）

function startGame() {
  g.phase = 'intro';
  Game.save();
  showView('view-intro');
  setPhase('开场');
  renderIntro();
}

/* 静默重算结果（用于续档到 result 视图） */
function computeResultSilent() {
  const g = Game.state;
  const tally = {};
  g.players.forEach((p) => { if (p.vote != null) tally[p.vote] = (tally[p.vote] || 0) + 1; });
  renderResult(tally);
}

/* ---------- 启动 ---------- */

document.addEventListener('DOMContentLoaded', () => {
  Speaker.init();
  BYOP.init();
  fillSceneSelect();
  bindEvents();
  checkSaveBanner();
  setPhase('准备');
});
