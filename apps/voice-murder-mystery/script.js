/* =====================================================================
 * 语音谋杀之谜 — 核心逻辑
 * 侦探语音问询 · 本地案件库 · SpeechRecognition + TTS · BYOP 增强
 *
 * 结构：
 *   1. 工具函数
 *   2. 案件库（5 个完整案件，嫌疑人问答脚本 + 矛盾点）
 *   3. 语音识别（Web Speech API + 打字降级）
 *   4. 嫌疑人 TTS（Pollinations 匿名 + speechSynthesis 兜底 + 音色区分）
 *   5. BYOP 增强（fragment flow 登录 + AI 自由对答 + 生成案件）
 *   6. 侦探笔记本（localStorage 证词 + 可疑标记）
 *   7. 视图渲染与游戏状态机
 * ===================================================================== */
'use strict';

/* ==================== 1. 工具函数 ==================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 10);

const SAVE_KEY = 'polli-murder-save-v1';
const NOTEBOOK_KEY = 'polli-murder-notes-v1';
const CASES_KEY = 'polli-murder-cases-v1';
const BYOP_KEY = 'polli-murder-byop';

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

/* ==================== 2. 案件库 ==================== */

const CASE_LIBRARY = [
  {
    id: 'manor',
    title: '庄园夜宴谋杀案',
    emoji: '🏰',
    victim: '被害人：奥利弗伯爵，毒杀于自家书房',
    brief: '夜宴尾声，奥利弗伯爵被发现死在书房，毒酒杯里残留着苦杏仁味。\n宾客们各有去处，仆人们听见争吵。谁把毒酒端给了伯爵？',
    timeline: [
      '21:00 — 夜宴开始，伯爵在席间谈笑风生',
      '21:30 — 管家端着酒具进入书房，随后离开',
      '21:45 — 侄女离开宴席，独自前往花园透气',
      '22:00 — 私人医生进入书房为伯爵例行看诊',
      '22:30 — 仆人们听到书房传来激烈的争吵声',
      '23:00 — 管家发现伯爵倒在书桌上，已无呼吸'
    ],
    evidence: [
      '毒酒杯：杯壁残留苦杏仁味，只有伯爵用过的杯子有毒',
      '窗台脚印：书房窗台外侧有新鲜的泥土脚印，方向朝花园',
      '药箱痕迹：医生的药箱被人翻动过，少了一瓶安眠药',
      '争吵传闻：多名仆人称 22:30 听到书房内有男声争吵'
    ],
    suspects: [
      {
        id: 'butler', name: '老管家', emoji: '🕴️', role: '庄园管家，服侍伯爵三十年',
        alibi: '声称整晚都在厨房备餐、为宾客斟酒，从未离开。',
        personality: '沉默寡言，对庄园了如指掌，说话低沉缓慢。',
        voice: { rate: 0.88, pitch: 0.7, hint: 'zh-CN' },
        isKiller: true,
        contradiction: {
          claim: '声称自己整晚都在厨房备餐，从未进过书房',
          fact: '时间线显示 21:30 他曾端着酒具进入书房',
          conflict: '毒酒杯正是他用托盘送进书房的——他在撒谎'
        },
        script: {
          default: '老朽耳朵不太好，您慢慢说。这些年庄园里的事，我知道的都不多。',
          qa: [
            { k: ['在哪', '哪里', '位置', '做什么', '干什么'], a: '我整晚都在厨房备餐，为宾客们斟酒添菜，一步都没有离开过。' },
            { k: ['书房', '酒', '杯子', '托盘'], a: '酒……是的，21 点半左右我给老爷送过一次酒。只是把酒具放在桌上，我就回厨房了。' },
            { k: ['几点', '时间', '21', '22', '什么时候'], a: '21 点以后我一直在厨房。至于书房那边……我实在记不清具体时间了。' },
            { k: ['争吵', '声音', '听见', '吵架'], a: '争吵？仆人们说听到了，可我在厨房，油烟机嗡嗡响，什么也没听见。' },
            { k: ['脚印', '窗台', '花园', '泥土'], a: '窗台上的脚印？老朽腿脚不便，从不翻窗。花园我更是好几年没去过了。' },
            { k: ['安眠药', '药箱', '医生'], a: '医生的药箱？那是医生自己的东西，我一个下人，怎么敢碰老爷的医生。' },
            { k: ['嫌疑人', '凶手', '谁杀的', '谁下毒'], a: '凶手？呵……庄园这么大，谁都有可能是。我一个老仆，只想安稳度日。' },
            { k: ['你为什么', '动机', '杀人'], a: '我为伯爵卖了三十年命，他给我饭吃、给我屋住，我为什么要杀他？' }
          ]
        }
      },
      {
        id: 'niece', name: '艾达侄女', emoji: '👗', role: '伯爵的侄女，最近才搬进庄园',
        alibi: '声称 21:45 独自去花园透气，之后一直待在房间。',
        personality: '紧张不安，说话躲闪，似乎藏着心事。',
        voice: { rate: 1.12, pitch: 1.25, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称去花园只是透气，然后一直待在房间',
          fact: '她裙摆沾着新鲜的泥土，花园脚印与她鞋码吻合',
          conflict: '她隐瞒了在花园与某人见面的秘密（但与命案无关）'
        },
        script: {
          default: '我……我不知道该说什么。请您别这样看着我，我有点害怕。',
          qa: [
            { k: ['在哪', '哪里', '位置', '做什么'], a: '21 点 45 分左右我去了花园透气，宴会太闷了。之后我就回房间休息了。' },
            { k: ['花园', '泥土', '脚印', '鞋'], a: '我去过花园……但只是散步。裙摆沾了点泥土，这有什么奇怪的？' },
            { k: ['几点', '时间', '什么时候'], a: '我记不太清，大概是 21 点 45 分去的花园，没过多久就回房间了。' },
            { k: ['房间', '门', '一个人', '睡'], a: '我回房间后一直一个人待着，没有见任何人，也没有出去过。' },
            { k: ['见人', '约会', '情人', '秘密'], a: '（声音发颤）没有什么秘密……我只是想一个人静静。' },
            { k: ['叔父', '伯爵', '遗产', '关系'], a: '叔叔一直很照顾我，我搬进来是为了照顾他的起居。遗产的事我从没想过。' },
            { k: ['凶手', '谁杀的', '怀疑'], a: '我不知道……我真的不知道。凶手说不定早就离开庄园了。' },
            { k: ['为什么', '害怕', '紧张'], a: '我只是……被吓到了。谁遇到这种事都会害怕的，不是吗？' }
          ]
        }
      },
      {
        id: 'doctor', name: '艾伦医生', emoji: '🩺', role: '伯爵的私人医生，医术精湛',
        alibi: '声称 22:00 进书房看诊，离开后直接回客房。',
        personality: '冷静克制，措辞谨慎，偶尔流露职业性的回避。',
        voice: { rate: 1.0, pitch: 0.9, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称 22:00 看诊后直接回客房，药箱从未离身',
          fact: '药箱被翻动过，少了一瓶安眠药',
          conflict: '他隐瞒了药方事故：安眠药被他私下取走销毁（但与命案无关）'
        },
        script: {
          default: '作为医生，我只看事实说话。您可以问我任何专业问题。',
          qa: [
            { k: ['在哪', '哪里', '位置', '做什么'], a: '22 点我为伯爵做例行看诊，之后直接回了客房。这是标准流程。' },
            { k: ['药', '药箱', '安眠药', '看诊'], a: '我带了药箱去看诊，但只做了常规检查。安眠药？我不记得开过这个。' },
            { k: ['几点', '时间', '什么时候'], a: '22 点整进入书房，大约 22 点 20 分离开。时间我记得很清楚。' },
            { k: ['争吵', '声音', '听见'], a: '我在书房看诊时一切正常，没听见什么争吵。22 点半我已经回客房了。' },
            { k: ['毒', '苦杏仁', '中毒'], a: '苦杏仁味……那确实是氰化物的气味。但我的药箱里绝对没有这种东西。' },
            { k: ['脚印', '窗台'], a: '窗台上的脚印？我穿的是皮鞋，而且我从不靠近窗户。' },
            { k: ['凶手', '谁杀的', '怀疑'], a: '从医学角度看，伯爵死于中毒，时间应该在 21 点到 22 点之间。至于凶手……我不做猜测。' },
            { k: ['为什么', '动机'], a: '我是伯爵的医生，为他看病十年。医者仁心，我没有任何动机。' }
          ]
        }
      }
    ],
    truth: '毒杀伯爵的是老管家。三十年的主仆情分，抵不过一纸遗嘱——伯爵要在次日改立继承人，把管家赶出庄园。\n管家趁 21:30 送酒之机，把氰化物溶进伯爵的酒杯；22:30 书房里的争吵，正是伯爵质问管家为什么酒里有异味。\n侄女裙摆的泥土与医生的安眠药，都是与本案无关的巧合秘密。',
    killerNote: '真凶就是老管家：他自称整晚未进书房，却亲手端着毒酒出现在时间线上。',
    askHint: ['问问他案发时在哪里', '问问书房和酒的事', '问问他有没有听见争吵']
  },

  {
    id: 'gallery',
    title: '美术馆名画失窃案',
    emoji: '🖼️',
    victim: '被害人：美术馆馆长，名画《星夜》失窃',
    brief: '深夜的美术馆，馆长倒在《星夜》展厅，画框空空如也。\n监控线被剪断，警报曾短暂触发。谁在闭馆之后潜了进来？',
    timeline: [
      '18:00 — 美术馆闭馆，最后一名观众离场',
      '18:30 — 馆长离开办公室，走向展厅',
      '19:00 — 保安开始夜间巡逻',
      '20:00 — 修复师在修复室加班',
      '21:00 — 展厅警报异常触发 20 秒后自动复位',
      '22:00 — 保安巡逻发现馆长尸体与空画框'
    ],
    evidence: [
      '空画框：《星夜》被整幅取下，画框边缘残留修复用胶水',
      '监控线：展厅监控线被剪刀剪断，断口整齐',
      '半个纽扣：馆长手中攥着半枚金属纽扣，像是从外套上扯下',
      '警报记录：21:00 警报触发 20 秒，记录显示“误报”'
    ],
    suspects: [
      {
        id: 'guard', name: '老周', emoji: '💂', role: '夜班保安，负责全馆巡逻与监控',
        alibi: '声称 19:00–22:00 全程巡逻，监控室无人进出。',
        personality: '粗犷急躁，一再强调自己没离开过岗位。',
        voice: { rate: 0.95, pitch: 0.75, hint: 'zh-CN' },
        isKiller: true,
        contradiction: {
          claim: '声称整晚巡逻、监控线从未动过、21:00 警报是误报',
          fact: '监控线被整齐剪断，而监控室钥匙只有他有；21:00 是真警报',
          conflict: '他监守自盗：剪断监控、取画时被馆长撞见，纽扣就是他外套上的'
        },
        script: {
          default: '我在美术馆干五年了，巡逻路线倒着走都行。您尽管问！',
          qa: [
            { k: ['在哪', '哪里', '位置', '巡逻'], a: '我从 19 点开始巡逻，每半小时走一圈，22 点发现尸体之前一直在巡逻！' },
            { k: ['监控', '摄像头', '剪断', '线'], a: '监控线？我晚上检查过监控室，一切正常。谁会去剪那玩意儿？' },
            { k: ['警报', '误报', '21'], a: '21 点那个警报我知道，是误报！老鼠碰了感应器，20 秒就自己停了。' },
            { k: ['纽扣', '外套', '衣服'], a: '纽扣？我这外套……（下意识摸了一下衣襟）我这外套好好的，没少纽扣。' },
            { k: ['画', '星夜', '名画', '失窃'], a: '名画丢了我也着急啊！我巡逻那么勤，谁知道那贼怎么进来的！' },
            { k: ['馆长', '尸体', '发现'], a: '22 点我巡逻到展厅，看见馆长倒在画框前……我当时就报了警。' },
            { k: ['胶水', '修复', '画框'], a: '胶水？那是修复师的东西，我可不懂那些艺术活。' },
            { k: ['凶手', '谁干的', '怀疑'], a: '我怀疑那个修复师！他晚上加班，肯定是他！' }
          ]
        }
      },
      {
        id: 'restorer', name: '林修复师', emoji: '🖌️', role: '名画修复师，负责《星夜》日常维护',
        alibi: '声称 20:00–22:00 一直在修复室工作，未进展厅。',
        personality: '文雅内敛，手指有胶水痕迹，说话慢条斯理。',
        voice: { rate: 0.92, pitch: 1.0, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称从未复制过《星夜》',
          fact: '画框边缘的修复胶水与他工作台同款，且他抽屉里有一张《星夜》摹本',
          conflict: '他偷偷临摹了名画准备换画（但与命案无关）'
        },
        script: {
          default: '修复工作需要耐心和专注。抱歉，我可能习惯性地想事情想得慢。',
          qa: [
            { k: ['在哪', '哪里', '位置', '加班'], a: '我 20 点到 22 点都在修复室，有一幅画的颜料层需要处理，一直忙到听说出事。' },
            { k: ['胶水', '修复', '画框'], a: '我确实用胶水，修复室常备。但展厅的画框……我没碰过。' },
            { k: ['画', '星夜', '摹本', '复制'], a: '《星夜》是镇馆之宝，我只做过日常维护，从不复制任何藏品。' },
            { k: ['监控', '警报'], a: '警报响的时候我在修复室，隔了两个展厅，没听见。监控的事我更不清楚。' },
            { k: ['馆长', '关系', '认识'], a: '馆长对我很好，去年还给我加了薪。我们没有任何矛盾。' },
            { k: ['几点', '时间', '什么时候'], a: '20 点进修复室，期间没离开过，直到保安来敲门我才知道出事了。' },
            { k: ['抽屉', '私人物品', '发现'], a: '我的抽屉？都是修复工具和材料，没什么见不得人的东西。' },
            { k: ['凶手', '谁干的'], a: '作为修复师，我只想说：这幅画是国宝，偷画的人罪不可赦。' }
          ]
        }
      },
      {
        id: 'curator', name: '陈策展人', emoji: '🧐', role: '策展人，负责展览与藏家联络',
        alibi: '声称 18:30 已离开美术馆，回家后未再外出。',
        personality: '世故圆滑，对答如流，但眼神闪躲。',
        voice: { rate: 1.05, pitch: 1.1, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称 18:30 直接回家，与本案无关',
          fact: '他当晚曾与一名神秘买家通话，并透露了《星夜》的安保细节',
          conflict: '他向藏家泄露了安保信息想促成交易（但与命案无关）'
        },
        script: {
          default: '我在艺术圈多年，见过各种风浪。有什么问题尽管问。',
          qa: [
            { k: ['在哪', '哪里', '位置', '回家'], a: '18 点 30 闭馆后我就回家了，一直在客厅看画册，谁都可以作证。' },
            { k: ['电话', '买家', '藏家', '交易'], a: '电话？晚上接了几个藏家的电话很正常，艺术圈就这样。' },
            { k: ['安保', '细节', '监控', '警报'], a: '安保细节只有馆内高层知道，我一个策展人，怎么会去打听那些？' },
            { k: ['馆长', '关系', '矛盾'], a: '我和馆长是多年老友，虽然偶尔争几句策展方案，但都是公事。' },
            { k: ['画', '星夜', '价值'], a: '《星夜》价值连城，业内都知道。失窃是整个艺术界的损失。' },
            { k: ['几点', '时间'], a: '18 点 30 分准时离开，21 点左右我已经在床上了。' },
            { k: ['纽扣', '现场'], a: '纽扣？那是现场物证，与我无关。我穿的是深灰色西装，纽扣是缝死的。' },
            { k: ['凶手', '谁干的'], a: '我建议从有钥匙、懂监控的人里找。显然不是我。' }
          ]
        }
      }
    ],
    truth: '偷画又杀人的是保安老周。他欠了一屁股赌债，早就打起了《星夜》的主意。\n当晚他剪断监控线、打开展厅警报延时系统准备取画，没想到馆长 18:30 并未离开，而是折回展厅检查温湿度。\n两人撞个正着，撕扯中馆长的外套纽扣被扯落，死死攥在手里。老周惊慌中下了杀手，又伪造了 21:00 的“误报”。\n修复师的摹本与策展人的泄密，是两桩与命案无关的隐秘交易。',
    killerNote: '真凶就是保安老周：他自称监控无恙，可监控线明明被剪断；他口中的“误报”，正是真警报。',
    askHint: ['问问他巡逻时看到了什么', '问问监控线和警报的事', '问问他外套上的纽扣']
  },

  {
    id: 'cruise',
    title: '游轮赌场谋杀案',
    emoji: '🚢',
    victim: '被害人：富豪马先生，VIP 包间中被杀，筹码被抢',
    brief: '公海之上，豪赌正酣。富豪马先生赢了一大笔后独自进入 VIP 包间，再没出来。\n门锁完好，筹码消失。船上的每个人都可能说谎。',
    timeline: [
      '21:00 — 赌局开始，马先生加入德州扑克桌',
      '21:30 — 马先生连赢三局，筹码堆成小山',
      '21:50 — 马先生离席，走进 VIP 包间',
      '22:00 — 船长广播“例行安全演习提醒”',
      '22:15 — 服务生发现马先生倒在包间，筹码散落不全'
    ],
    evidence: [
      'VIP 包间：门锁完好，无强行闯入痕迹',
      '筹码：现场筹码明显少于马先生赢得的数量',
      '湿脚印：包间门口有带海雾的湿脚印，朝甲板方向',
      '抓痕：马先生右手戒指上有细小的皮肤组织'
    ],
    suspects: [
      {
        id: 'dealer', name: '凯文荷官', emoji: '🎲', role: '德州扑克桌荷官，掌管筹码箱',
        alibi: '声称 21:50 起一直在牌桌发牌，从未离开。',
        personality: '圆滑世故，笑容职业，回答滴水不漏。',
        voice: { rate: 1.0, pitch: 0.95, hint: 'zh-CN' },
        isKiller: true,
        contradiction: {
          claim: '声称 21:50 一直在牌桌发牌、筹码箱当晚从未开启',
          fact: '有人看到他 21:55 走向包间方向；被抢筹码的序列号正出自他掌管的箱子',
          conflict: '他见财起意：跟入包间抢劫杀人，湿脚印是甲板上海雾沾上的'
        },
        script: {
          default: '欢迎来船上玩两把。不过命案这种事，我一个小荷官可不敢乱说。',
          qa: [
            { k: ['在哪', '哪里', '发牌', '牌桌'], a: '21 点 50 分之后我一直在 3 号桌发牌，牌桌上的客人都可以作证。' },
            { k: ['筹码', '箱子', '少了', '被抢'], a: '筹码箱当晚一次都没开过。至于马先生的筹码，他赢了那么多，谁知道他自己放哪了？' },
            { k: ['包间', '走廊', '离开'], a: '包间？我没去过。整晚我都站在牌桌后面，一步没挪。' },
            { k: ['脚印', '甲板', '海雾', '湿'], a: '甲板？那晚海雾确实大，谁去甲板都会湿鞋。反正我穿的是皮鞋，没出去过。' },
            { k: ['抓痕', '戒指', '皮肤'], a: '戒指上有抓痕？那就是挣扎时抓的，跟发牌的人有什么关系？' },
            { k: ['赌债', '欠钱', '动机'], a: '我在这船上工作，挣的每一分都干净。我不赌钱，更不欠债。' },
            { k: ['广播', '演习', '22点'], a: '22 点广播演习的时候我正在牌桌上，大家都听到了。' },
            { k: ['凶手', '谁杀的', '怀疑'], a: '马先生赢的钱太多了，船上眼红的人一抓一大把，为什么偏偏问我？' }
          ]
        }
      },
      {
        id: 'captain', name: '罗船长', emoji: '⚓', role: '船长，负责全船秩序',
        alibi: '声称 22:00 前一直在驾驶舱值班。',
        personality: '威严但略显急躁，强调纪律却神色不宁。',
        voice: { rate: 0.9, pitch: 0.72, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称整晚在驾驶舱值班、从未进赌场',
          fact: '有船员看到 21:40 他在赌场门口徘徊',
          conflict: '他隐瞒了私自离岗去赌场下注的事（但与命案无关）'
        },
        script: {
          default: '我是这艘船的船长，一切以船上安全为重。您问吧。',
          qa: [
            { k: ['在哪', '哪里', '驾驶舱', '值班'], a: '21 点到 22 点我都在驾驶舱，值班日志写得很清楚。' },
            { k: ['赌场', '下注', '门口'], a: '我怎么会去赌场？船长带头赌博，像话吗？' },
            { k: ['广播', '演习', '22点'], a: '22 点的安全演习广播是我指示发的，当时我就在驾驶舱。' },
            { k: ['脚印', '甲板'], a: '甲板湿脚印……那晚海雾大，很多船员都去过甲板，说明不了什么。' },
            { k: ['筹码', '失窃'], a: '船上的事我负责。筹码被抢，我会彻查到底，给马先生家属一个交代。' },
            { k: ['抓痕', '戒指'], a: '抓痕？您是指马先生反抗时留下的痕迹？这说明凶手和他有过肢体接触。' },
            { k: ['监控', '摄像头'], a: '赌场监控当晚确实有些盲区，这是安保的疏漏，事后我会处分相关人员。' },
            { k: ['凶手', '谁杀的'], a: '在没有证据前，我不指认任何人。但我可以向您保证：船靠岸前，谁也跑不了。' }
          ]
        }
      },
      {
        id: 'singer', name: '萝拉', emoji: '🎤', role: '船上驻唱歌手，曾在演出时被打断',
        alibi: '声称 21:50 起在休息室排练新歌。',
        personality: '情绪化，欲言又止，似乎对马先生怀有怨恨。',
        voice: { rate: 1.1, pitch: 1.28, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称与马先生素无往来',
          fact: '她收到过马先生的恐吓信（因拒绝陪酒），信被她藏了起来',
          conflict: '她隐瞒了受威胁的旧怨（但与命案无关）'
        },
        script: {
          default: '我嗓子有点哑，您别介意。有什么事……快问吧。',
          qa: [
            { k: ['在哪', '哪里', '排练', '休息室'], a: '21 点 50 分以后我一直在休息室排练，新歌的高音部分很难。' },
            { k: ['马先生', '认识', '关系'], a: '他……只是船上的客人，我给他唱过歌，仅此而已。' },
            { k: ['恐吓', '威胁', '信', '陪酒'], a: '什么信？我不懂您在说什么。我是歌手，不是……不是那种人。' },
            { k: ['赌场', '包间'], a: '我从不去赌场。那里乌烟瘴气，我讨厌那种地方。' },
            { k: ['几点', '时间'], a: '我记不清具体时间，反正演出结束后我一直在休息室，直到有人喊出事了。' },
            { k: ['脚印', '甲板'], a: '我穿的是高跟鞋，甲板湿脚印那种纹路，跟我鞋底不一样。' },
            { k: ['怨恨', '动机', '恨他'], a: '（声音提高）我没有恨他！我为什么要恨一个客人？！' },
            { k: ['凶手', '谁杀的'], a: '我不在现场，我怎么知道？但我想说……船上有些人，比看上去危险得多。' }
          ]
        }
      }
    ],
    truth: '凶手是荷官凯文。他欠下巨额赌债，而马先生 21:30 连赢三局时，他曾亲眼看到马先生的筹码箱密码。\n21:55 他借口换班离开牌桌，潜入 VIP 包间，趁马先生不备抢夺筹码。马先生反抗，戒指抓伤了他的手背——戒指上的皮肤组织就是铁证。\n湿脚印来自他匆忙穿过甲板时沾上的海雾。船长的私自赌局与萝拉的恐吓信，都是与命案无关的隐秘。',
    killerNote: '真凶就是荷官凯文：他自称整晚发牌、筹码箱未开，可筹码正是从他那消失的。',
    askHint: ['问问他 21:50 在哪', '问问筹码箱和包间的事', '问问他手上的伤']
  },

  {
    id: 'lab',
    title: '科学实验室火灾案',
    emoji: '🧪',
    victim: '被害人：首席科学家赵教授，火灾中身亡，研究成果被盗',
    brief: '深夜的实验室燃起大火，赵教授没能逃出。\n防火保险柜被撬开，国家级研究成果不翼而飞。火是意外，还是灭口？',
    timeline: [
      '20:00 — 实验室全体下班，赵教授留在办公室整理数据',
      '20:30 — 助理返回实验室取手机，约 5 分钟后离开',
      '21:00 — 研究员回到实验室加班',
      '21:30 — 火灾警报触发，火势从材料实验室蔓延',
      '22:00 — 火势扑灭，在办公室发现赵教授遗体'
    ],
    evidence: [
      '保险柜：被撬开，核心研究数据与样品不翼而飞',
      '助燃剂：起火点检测出助燃剂残留，非自然起火',
      '白大褂：研究员的白大褂袖口有烧焦痕迹',
      '门禁记录：20:30 与 21:00 各一次刷卡记录，均指向实验室主门'
    ],
    suspects: [
      {
        id: 'researcher', name: '李研究员', emoji: '🥼', role: '赵教授的首席助手，核心数据知情者',
        alibi: '声称 21:00 起在实验室加班，警报响起时在洗手间。',
        personality: '冷静到近乎冷漠，回答精准但回避细节。',
        voice: { rate: 0.95, pitch: 0.85, hint: 'zh-CN' },
        isKiller: true,
        contradiction: {
          claim: '声称火灾是电线短路、自己 21:00 后在工位加班未离开',
          fact: '起火点有助燃剂；他的白大褂袖口有烧焦痕迹，门禁记录显示他 21:00 后曾短时离开',
          conflict: '他纵火灭口：撬开保险柜拿走数据，点燃助燃剂，赵教授是唯一能揭发他窃取成果的人'
        },
        script: {
          default: '数据就是生命。抱歉，我说话比较直接。',
          qa: [
            { k: ['在哪', '哪里', '加班', '工位'], a: '21 点我回实验室加班，一直坐在工位处理数据。警报响的时候我在洗手间。' },
            { k: ['火灾', '起火', '电线', '短路'], a: '我看就是老化的电线短路。实验室那么多设备，超负荷很正常。' },
            { k: ['助燃剂', '烧焦', '白大褂'], a: '助燃剂？我不懂化学以外的东西。白大褂袖口……可能是不小心蹭到加热台了。' },
            { k: ['保险柜', '数据', '被盗', '研究成果'], a: '保险柜密码只有赵教授和我知道。数据被盗……这是整个团队的损失。' },
            { k: ['门禁', '刷卡', '离开'], a: '门禁记录？我确实刷卡进过实验室，但我没有中途离开过……呃，除了去洗手间。' },
            { k: ['赵教授', '关系', '导师'], a: '赵教授是我的导师，也是我最尊敬的人。他的去世，我比谁都难过。' },
            { k: ['几点', '时间'], a: '21 点到 21 点 30 分我在工位，之后洗手间。具体几分钟……警报太乱，记不清了。' },
            { k: ['凶手', '谁干的'], a: '如果这是纵火，那目标一定是数据和保险柜。能撬开保险柜的人，只有……不，我不想怀疑任何人。' }
          ]
        }
      },
      {
        id: 'assistant', name: '小杨', emoji: '📱', role: '实验室助理，负责数据录入',
        alibi: '声称 20:30 取回手机后立即离开，未再返回。',
        personality: '畏缩不安，反复强调自己只是小人物。',
        voice: { rate: 1.08, pitch: 1.2, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称 20:30 取手机后立即离开',
          fact: '他偷拍了核心数据准备卖给竞争对手，在实验室停留超过一刻钟',
          conflict: '他窃取数据牟利（但与纵火命案无关）'
        },
        script: {
          default: '我、我就是个助理，真的什么都不知道。',
          qa: [
            { k: ['在哪', '哪里', '取手机', '离开'], a: '我 20 点 30 分回去拿了手机，前后不到 5 分钟就走了，再也没回过实验室。' },
            { k: ['数据', '偷拍', '手机', '照片'], a: '手机里？都是些日常照片，拍实验记录是为了工作，没别的！' },
            { k: ['几点', '时间', '20点30'], a: '我记不太准，大概 20 点 30 分，拿完手机就回家了。' },
            { k: ['竞争对手', '卖', '钱'], a: '卖数据？那是犯罪！我一个小助理，哪敢做那种事！' },
            { k: ['赵教授', '关系'], a: '赵教授平时对我不错，虽然……有时候要求很严，但他是好人。' },
            { k: ['火灾', '听到', '警报'], a: '火灾警报？我在家听到新闻才知道出事了，我当时都吓傻了。' },
            { k: ['门禁', '刷卡'], a: '门禁记录里应该只有我 20 点 30 分那一次，您可以查！' },
            { k: ['凶手', '谁干的'], a: '我不知道……但我知道赵教授最近和一个外校的人走得很近，好像要谈什么合作。' }
          ]
        }
      },
      {
        id: 'guard2', name: '王保安', emoji: '🔐', role: '园区夜班保安，负责实验室门禁',
        alibi: '声称整晚在监控室，火灾警报触发前未发现异常。',
        personality: '紧张出汗，回答越来越语无伦次。',
        voice: { rate: 0.98, pitch: 0.8, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称警报系统一切正常、整晚值守监控',
          fact: '有人给他一笔钱，让他在 21:30 前临时关闭实验室警报 5 分钟',
          conflict: '他收受贿赂关闭警报（被人利用，但与纵火无关）'
        },
        script: {
          default: '我、我一直在监控室看着呢，真的！',
          qa: [
            { k: ['在哪', '哪里', '监控', '值守'], a: '我整晚都在监控室，盯着屏幕，眼睛都没怎么眨！' },
            { k: ['警报', '关闭', '系统', '异常'], a: '警报系统？一切正常啊！21 点 30 分它响了我才发现的！' },
            { k: ['钱', '受贿', '好处'], a: '钱？！谁跟您说的？我、我工资不多，但从不拿黑钱！' },
            { k: ['几点', '时间'], a: '时间……我记不清了，反正一直盯着屏幕，中间去上了个厕所。' },
            { k: ['门禁', '刷卡记录'], a: '门禁是自动记录的，我只负责看监控，具体谁刷卡我不记得。' },
            { k: ['火灾', '发现'], a: '我是看到监控里冒烟才拉响警报的……不对，是警报先响的！我脑子有点乱。' },
            { k: ['实验室', '人员', '进出'], a: '晚上进出实验室的就那几个人，研究员、助理，我都认识。' },
            { k: ['凶手', '谁干的'], a: '我不知道，我真的不知道。我就是个看门的……' }
          ]
        }
      }
    ],
    truth: '纵火杀人的是李研究员。赵教授已发现他私自篡改实验数据、试图提前发表成果，准备向学界举报。\n21:00 他借加班之名回到实验室，撬开保险柜拿走数据，将助燃剂泼在材料室，点燃后逃出。\n赵教授在办公室中被大火围困，而门禁记录里他 21:00 后那段“短时离开”，正是他往返起火点的时间。\n助理偷拍数据、保安收受贿赂关闭警报，都是被这场大火裹挟进来的旁支秘密。',
    killerNote: '真凶就是李研究员：他声称在工位加班，白大褂却沾着起火点的焦痕。',
    askHint: ['问问他案发时在哪', '问问白大褂上的焦痕', '问问保险柜和门禁的事']
  },

  {
    id: 'opera',
    title: '歌剧院魅影案',
    emoji: '🎭',
    victim: '被害人：剧院经理，中场死于化妆间，镶钻吊灯被偷',
    brief: '首演之夜，剧院经理在化妆间遇害，价值连城的镶钻吊灯不翼而飞。\n门从内侧反锁，舞台上的每个人却都有不在场证明。',
    timeline: [
      '19:30 — 《魅影》首演开始，全场满座',
      '20:15 — 经理离开包厢，走向化妆间方向',
      '20:30 — 幕间休息结束，第二幕开始',
      '20:45 — 舞台监督发现经理尸体',
      '21:00 — 警方到场，封控剧院'
    ],
    evidence: [
      '反锁门：化妆间门从内侧反锁，但窗台有蹬踏痕迹',
      '吊灯底座：镶钻吊灯被撬走，底座留下金粉',
      '金粉：首席女高音的裙摆沾有与吊灯底座相同的金粉',
      '手套：指挥家的白手套少了一只'
    ],
    suspects: [
      {
        id: 'soprano', name: '薇拉', emoji: '🎤', role: '首席女高音，今晚饰演女主角',
        alibi: '声称 20:15 在后台换装，从未靠近化妆间。',
        personality: '高傲优雅，措辞锋利，提到经理时难掩恨意。',
        voice: { rate: 1.02, pitch: 1.3, hint: 'zh-CN' },
        isKiller: true,
        contradiction: {
          claim: '声称 20:15 在后台换装、从未进过化妆间、不认识吊灯',
          fact: '她裙摆的金粉与吊灯底座一致；有场务看到她 20:15 出现在化妆间走廊',
          conflict: '她因经理克扣薪酬而怀恨：撬下吊灯、反锁窗户伪装现场，作案后把吊灯藏进道具箱'
        },
        script: {
          default: '我可是首席。请您放尊重些，我只回答与我的演出有关的问题。',
          qa: [
            { k: ['在哪', '哪里', '换装', '后台'], a: '20 点 15 分我在后台更衣室换第二幕的服装，我的化妆师可以作证。' },
            { k: ['化妆间', '走廊', '经理'], a: '化妆间？那是经理的房间，我从不踏足。20 点 15 分我根本不在那里。' },
            { k: ['金粉', '吊灯', '裙子'], a: '金粉？舞台布景到处都有金粉，蹭到裙摆有什么稀奇？吊灯我更是看都没看过。' },
            { k: ['经理', '薪酬', '克扣', '恨'], a: '经理是个精明的商人，但那是工作上的事。我对他……谈不上恨。' },
            { k: ['道具箱', '藏着', '东西'], a: '道具箱是舞台监督管的，我怎么会知道里面有什么？' },
            { k: ['手套', '指挥家'], a: '指挥的手套？那是他自己的事。我只专注我的唱段。' },
            { k: ['几点', '时间'], a: '20 点 15 分到 20 点 30 分我都在更衣室，第二幕一开场我就上了台。' },
            { k: ['凶手', '谁杀的', '怀疑'], a: '凶手？也许……是那个总在后台鬼鬼祟祟的舞台监督。您该去问他。' }
          ]
        }
      },
      {
        id: 'conductor', name: '唐指挥', emoji: '🎻', role: '首席指挥，与经理有版权纠纷',
        alibi: '声称 20:15 在乐池指挥，手套少一只因排练磨损。',
        personality: '温文尔雅但回避版权话题，回答彬彬有礼。',
        voice: { rate: 0.94, pitch: 0.88, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称与经理只是普通同事',
          fact: '经理扣下了他新改编曲目的版权分成，两人 19:00 在后台激烈争吵',
          conflict: '他有动机，但当晚他一直在乐池（真凶另有其人）'
        },
        script: {
          default: '音乐是我的一切。请允许我用音乐家的方式回答您。',
          qa: [
            { k: ['在哪', '哪里', '乐池', '指挥'], a: '从 19 点 30 分开场到 20 点 45 分出事，我一直在乐池。第二幕的序曲还是我指挥的。' },
            { k: ['版权', '分成', '争吵', '纠纷'], a: '版权……那只是商业上的小分歧，我们早就谈好了。争吵？您听谁说的？' },
            { k: ['手套', '少一只'], a: '排练时磨破了，我随手扔了。一只手套能说明什么？' },
            { k: ['化妆间', '经理'], a: '我最后一次见到经理是开演前在后台，之后我就再没离开乐池。' },
            { k: ['吊灯', '金粉'], a: '吊灯是剧院的镇院之宝，谁会去偷它？金粉的事我更一无所知。' },
            { k: ['薇拉', '女高音', '关系'], a: '薇拉是位出色的艺术家，我们合作愉快。仅此而已。' },
            { k: ['几点', '时间'], a: '每一幕的起止我都记得清清楚楚。20 点 30 分第二幕开始，我就在指挥台上。' },
            { k: ['凶手', '谁杀的'], a: '我没有证据，但我知道：这场戏里，有人演得比台上还像。' }
          ]
        }
      },
      {
        id: 'stage', name: '吴监督', emoji: '🎪', role: '舞台监督，负责后台与道具',
        alibi: '声称整场在舞台侧翼调度，20:45 第一个发现尸体。',
        personality: '焦虑疲惫，语速快，总在撇清自己。',
        voice: { rate: 1.15, pitch: 1.0, hint: 'zh-CN' },
        isKiller: false,
        contradiction: {
          claim: '声称从未私拿剧院物品',
          fact: '他一直在偷卖剧院古董道具补贴家用',
          conflict: '他监守自盗古董（但与命案无关）'
        },
        script: {
          default: '我是舞台监督，全场调度我都要盯。您快问，我还有一堆事。',
          qa: [
            { k: ['在哪', '哪里', '侧翼', '调度'], a: '我整场都在舞台侧翼，盯着换景和道具，一秒都没离开！' },
            { k: ['发现', '尸体', '20点45'], a: '20 点 45 分我去催场，敲经理化妆间的门没人应，推开门就看到……天哪。' },
            { k: ['古董', '道具', '偷卖', '钱'], a: '偷卖古董？！那是剧院的宝贝，我碰都不敢碰！' },
            { k: ['道具箱', '吊灯', '藏'], a: '道具箱都归我管，里面都是布景和杂物。吊灯那么贵的东西，谁敢往箱子里藏！' },
            { k: ['反锁', '窗户', '窗台'], a: '门确实是反锁的，但我看窗户那条缝，爬个人出去也不是不行。' },
            { k: ['薇拉', '走廊', '看到'], a: '薇拉小姐？她一直在后台，我没注意她去没去走廊。后台那么多人，我哪记得住。' },
            { k: ['几点', '时间'], a: '19 点 30 开场，20 点 30 第二幕，20 点 45 发现尸体。我的时间表比钟还准。' },
            { k: ['凶手', '谁杀的'], a: '别问我！我要是知道凶手，早就报警抓人了！' }
          ]
        }
      }
    ],
    truth: '杀人的是首席女高音薇拉。经理长期克扣她的薪酬，还用合同条款把她绑死在剧院，她恨之入骨。\n20:15 她借口换装离开更衣室，翻窗潜入经理化妆间，用舞台道具绳将经理勒毙，随后撬走镶钻吊灯——那是经理最得意之物——并将门反锁、伪装成密室。\n裙摆上的金粉出卖了她：吊灯底座的金粉在她翻窗时蹭上了裙角。她没想到，真正的“魅影”，是她自己。\n指挥家的版权纠纷与舞台监督的偷卖古董，都是与命案无关的隐秘。',
    killerNote: '真凶就是薇拉：她说从未进过化妆间，裙摆却沾着吊灯底座的金粉。',
    askHint: ['问问她 20:15 在哪', '问问裙子上的金粉', '问问她和管理层的关系']
  }
];

/* 附加案件池：AI 生成案件的锚点（仅供生成提示） */
const CASE_ANCHORS = CASE_LIBRARY.map((c) => c.title);

/* ==================== 3. 语音识别 ==================== */

const SpeechRec = {
  supported: false,
  rec: null,
  listening: false,

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    const micState = $('#mic-state');
    const micBtn = $('#btn-mic');
    const micHint = $('#mic-hint');
    if (!SR) {
      if (micState) micState.textContent = '🎙 语音识别：不支持（已自动切换打字输入）';
      if (micBtn) micBtn.classList.add('hidden');
      if (micHint) micHint.textContent = '当前浏览器不支持语音识别，请使用下方输入框打字提问。';
      return;
    }
    this.rec = new SR();
    this.rec.lang = 'zh-CN';
    this.rec.interimResults = false;
    this.rec.maxAlternatives = 1;
    this.rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      this.stop();
      $('#chat-input').value = text;
      askQuestion(text);
    };
    this.rec.onerror = (e) => {
      this.stop();
      if (micHint) micHint.textContent = '语音识别失败（' + e.error + '），请改用打字提问。';
    };
    this.rec.onend = () => this.stop();
    if (micState) micState.textContent = '🎙 语音识别：已就绪（Chrome/Edge 可用）';
  },

  toggle() {
    if (!this.supported) return;
    if (this.listening) { this.stop(); return; }
    try {
      this.listening = true;
      $('#btn-mic').classList.add('listening');
      $('#mic-hint').textContent = '🎙 正在聆听…请清晰说出你的问题';
      this.rec.start();
    } catch (e) {
      this.stop();
    }
  },

  stop() {
    this.listening = false;
    const btn = $('#btn-mic');
    if (btn) btn.classList.remove('listening');
    try { if (this.rec) this.rec.stop(); } catch (e) {}
  }
};

/* ==================== 4. 嫌疑人 TTS ==================== */

const Speaker = {
  muted: false,
  audioEl: null,
  _allVoices: [],
  _voiceCache: {},

  init() {
    try { this.muted = localStorage.getItem('polli-murder-muted') === '1'; } catch (e) {}
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => this._cacheVoices();
        this._cacheVoices();
      }
    } catch (e) {}
    this.updateMuteBtn();
  },

  _cacheVoices() {
    try { this._allVoices = window.speechSynthesis.getVoices(); } catch (e) {}
  },

  _pickVoice(suspect) {
    if (!this._allVoices || !this._allVoices.length) return null;
    const voices = this._allVoices;
    const zh = voices.filter((v) => /zh|Chinese/i.test(v.lang + ' ' + v.name));
    const pool = zh.length ? zh : voices;
    // 按音调挑：低音嫌疑人选男声，高音选女声
    const wantFemale = !suspect || !suspect.voice || (suspect.voice.pitch || 1) >= 1.1;
    const candidates = pool.filter((v) => {
      const s = v.lang + ' ' + v.name;
      return wantFemale
        ? /female|woman|xiaoxiao|huihui|lili|tingting|yaoyao|meijia|jenny/i.test(s)
        : /male|man|yunjian|yunyang|kangkang|david|mark|george|danny/i.test(s);
    });
    const list = candidates.length ? candidates : pool;
    const key = wantFemale ? 'f' : 'm';
    if (!this._voiceCache[key]) this._voiceCache[key] = list[Math.floor(Math.random() * list.length)];
    return this._voiceCache[key];
  },

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('polli-murder-muted', this.muted ? '1' : '0'); } catch (e) {}
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

  /** 朗读嫌疑人台词（带音色区分） */
  async speakSuspect(text, suspect) {
    if (this.muted) return false;
    if (!text) return false;
    this.stop();
    showNarration(text);
    // 优先 Pollinations 匿名 TTS
    try {
      const url = 'https://gen.pollinations.ai/audio/' + encodeURIComponent(text);
      const ok = await this._playRemote(url);
      if (ok) return true;
    } catch (e) { /* 继续兜底 */ }
    // 兜底：speechSynthesis，按嫌疑人指定不同 voice / pitch / rate
    return this._playLocal(text, suspect);
  },

  /** 朗读旁白 / 真相 */
  async speak(text) {
    if (this.muted) return false;
    if (!text) return false;
    this.stop();
    showNarration(text);
    try {
      const url = 'https://gen.pollinations.ai/audio/' + encodeURIComponent(text);
      const ok = await this._playRemote(url);
      if (ok) return true;
    } catch (e) {}
    return this._playLocal(text, null);
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

  _playLocal(text, suspect) {
    return new Promise((resolve) => {
      try {
        if (!window.speechSynthesis) { resolve(false); return; }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = (suspect && suspect.voice && suspect.voice.rate) || 1.0;
        u.pitch = (suspect && suspect.voice && suspect.voice.pitch) || 1.0;
        const v = this._pickVoice(suspect);
        if (v) u.voice = v;
        u.onerror = () => resolve(false);
        u.onend = () => resolve(true);
        window.speechSynthesis.speak(u);
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

function Toast(msg) {
  const bar = $('#narration-bar');
  const el = $('#narration-text');
  if (!bar || !el) return;
  el.textContent = msg;
  bar.classList.remove('hidden');
  clearTimeout(showNarration._t);
  showNarration._t = setTimeout(() => bar.classList.add('hidden'), 3200);
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
    const aiBtn = $('#btn-ai-case');
    if (login) login.classList.toggle('hidden', this.loggedIn);
    if (logout) logout.classList.toggle('hidden', !this.loggedIn);
    if (aiBtn) aiBtn.disabled = !this.loggedIn;
    if (status) {
      status.textContent = this.loggedIn ? '✓ 已登录（AI 自由对答 / 生成案件可用）' : '未登录（本地案件库）';
      status.style.color = this.loggedIn ? '#34d399' : '#a89ec4';
    }
  },

  /** AI 嫌疑人自由对答任意问题 */
  async askSuspect(question, suspect, caseObj) {
    if (!this.key) return null;
    const sys = '你是中文语音推理游戏《语音谋杀之谜》中的嫌疑人「' + suspect.name + '」（' + suspect.role + '）。\n案件：' + caseObj.title + '。背景：' + caseObj.brief + '\n你的设定：' + suspect.personality + ' ' + suspect.alibi + '\n你是' + (suspect.isKiller ? '真凶，必须隐瞒罪行、用看似合理但略带矛盾的证词回应' : '无辜者，但你有自己的小秘密（与命案无关），要隐瞒但不要主动说谎误导') + '。\n用第一人称、简短口语化地回答问题（不超过 60 字），符合角色人设。';
    const user = '玩家（侦探）问你：「' + question + '」';
    try {
      const r = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.key },
        body: JSON.stringify({
          model: 'openai/gpt-5.4-nano',
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
          max_tokens: 200,
          temperature: 0.8
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      const t = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return typeof t === 'string' ? t.trim() : null;
    } catch (e) { return null; }
  },

  /** AI 生成全新案件 */
  async generateCase() {
    const anchors = CASE_ANCHORS.join('、');
    const prompt = '请为中文语音推理游戏《语音谋杀之谜》设计一个新的原创谋杀案件。\n要求：中文输出，严格按以下 JSON 格式返回（不要输出其他任何文字）：\n{\n  "id": "英文小写id",\n  "title": "案件中文名",\n  "emoji": "单个emoji",\n  "victim": "被害人描述",\n  "brief": "80字以内案情简报",\n  "timeline": ["4-6条时间线，每条格式：时间 — 事件"],\n  "evidence": ["4条现场证据"],\n  "suspects": [{\n    "id": "s1",\n    "name": "嫌疑人姓名",\n    "emoji": "单个emoji",\n    "role": "身份描述",\n    "alibi": "不在场证明描述",\n    "personality": "人设描述",\n    "isKiller": false,\n    "contradiction": {"claim": "真凶的谎话", "fact": "事实", "conflict": "矛盾结论"}\n  }, {同样结构，共3名嫌疑人，其中一人isKiller=true}],\n  "truth": "150字以内案件真相",\n  "killerNote": "一句话点破真凶破绽",\n  "askHint": ["3个调查提示问题"]\n}\n案件须与已有案件（' + anchors + '）不重复，设定有新意。';
    const res = await this.chat(prompt, { max_tokens: 1800, temperature: 0.9 });
    if (!res) return null;
    try {
      const json = res.match(/\{[\s\S]*\}/);
      if (!json) return null;
      const c = JSON.parse(json[0]);
      if (!c.id || !c.title || !Array.isArray(c.suspects) || c.suspects.length < 3) return null;
      c.suspects.forEach((s) => {
        if (!s.script) s.script = { default: '（沉默片刻）这件事……我不太想谈。', qa: [] };
        if (!s.voice) s.voice = { rate: 1.0, pitch: 1.0, hint: 'zh-CN' };
      });
      c.ai = true;
      return c;
    } catch (e) { return null; }
  },

  async chat(prompt, opt) {
    if (!this.key) return null;
    opt = opt || {};
    try {
      const r = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.key },
        body: JSON.stringify({
          model: 'openai/gpt-5.4-nano',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opt.max_tokens || 800,
          temperature: opt.temperature != null ? opt.temperature : 0.7
        })
      });
      if (!r.ok) return null;
      const data = await r.json();
      const t = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return typeof t === 'string' ? t.trim() : null;
    } catch (e) { return null; }
  }
};

/* ==================== 6. 侦探笔记本 ==================== */

const Notebook = {
  notes: [],

  load() {
    try {
      const raw = localStorage.getItem(NOTEBOOK_KEY);
      this.notes = raw ? JSON.parse(raw) : [];
    } catch (e) { this.notes = []; }
  },

  save() {
    try { localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(this.notes)); } catch (e) {}
  },

  add(who, emoji, text, marked) {
    this.notes.push({
      id: uid(), who, emoji, text,
      marked: !!marked,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    });
    this.save();
    renderNotebook();
  },

  toggleMark(id) {
    const n = this.notes.find((x) => x.id === id);
    if (n) { n.marked = !n.marked; this.save(); renderNotebook(); }
  },

  remove(id) {
    this.notes = this.notes.filter((x) => x.id !== id);
    this.save();
    renderNotebook();
  }
};

/* ==================== 7. 视图渲染与游戏状态机 ==================== */

let G = null; // 当前案件状态

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

/* ---------- 案件列表 ---------- */

function loadCaseLib() {
  try {
    const raw = localStorage.getItem(CASES_KEY);
    if (raw) {
      const extra = JSON.parse(raw);
      if (Array.isArray(extra) && extra.length) return CASE_LIBRARY.concat(extra);
    }
  } catch (e) {}
  return CASE_LIBRARY;
}

function saveCaseLib(lib) {
  const extra = lib.filter((c) => c.ai);
  try { localStorage.setItem(CASES_KEY, JSON.stringify(extra)); } catch (e) {}
}

function renderCaseList() {
  const box = $('#case-list');
  box.innerHTML = '';
  loadCaseLib().forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'case-card';
    btn.innerHTML = `
      <span class="c-emoji">${esc(c.emoji)}</span>
      <span>
        <span class="c-title">${esc(c.title)}${c.ai ? ' ✨' : ''}</span>
        <span class="c-meta">${esc(c.victim)}<br>嫌疑人：${c.suspects.length} 名</span>
      </span>
      <span class="c-badge">第 ${i + 1} 案</span>`;
    btn.onclick = () => startCase(c.id);
    box.appendChild(btn);
  });
}

/* ---------- 开始案件 ---------- */

function startCase(caseId) {
  const lib = loadCaseLib();
  const c = lib.find((x) => x.id === caseId);
  if (!c) { Toast('案件加载失败'); return; }
  G = {
    caseObj: c,
    phase: 'brief',
    suspectIdx: 0,
    askedCount: {},   // 每个嫌疑人已提问记录
    askedQ: {},       // 每个嫌疑人已提问的具体问题
    accusedId: null,
    verdict: null,
    lastAnswer: null,
    startedAt: Date.now()
  };
  clearSave();
  saveGame();
  renderBrief();
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const st = JSON.parse(raw);
    const lib = loadCaseLib();
    const c = lib.find((x) => x.id === st.caseObj.id);
    if (!c) return null;
    st.caseObj = c;
    return st;
  } catch (e) { return null; }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

/* ---------- 案发简报 ---------- */

function renderBrief() {
  const c = G.caseObj;
  setPhase('案发');
  showView('view-brief');
  $('#brief-emoji').textContent = c.emoji;
  $('#brief-title').textContent = c.title;
  $('#brief-victim').textContent = c.victim;
  $('#brief-story').textContent = c.brief;
  Speaker.speak(c.brief + ' 凶手就在他们中间。');

  const tl = $('#brief-timeline');
  tl.innerHTML = '';
  c.timeline.forEach((t) => {
    const li = document.createElement('li');
    const m = t.match(/^(\d{2}:\d{2})\s*—\s*(.*)$/);
    li.innerHTML = m ? `<span class="t-time">${esc(m[1])}</span>${esc(m[2])}` : esc(t);
    tl.appendChild(li);
  });

  const ev = $('#brief-evidence');
  ev.innerHTML = '';
  c.evidence.forEach((e) => {
    const li = document.createElement('li');
    li.textContent = e;
    ev.appendChild(li);
  });

  const sp = $('#brief-suspects');
  sp.innerHTML = '';
  c.suspects.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'suspect-profile';
    div.innerHTML = `
      <span class="sp-emoji">${esc(s.emoji)}</span>
      <div>
        <div class="sp-name">${esc(s.name)} · ${esc(s.role)}</div>
        <div class="sp-desc">不在场证明：${esc(s.alibi)}</div>
      </div>`;
    sp.appendChild(div);
  });

  $('#btn-brief-next').onclick = () => {
    G.phase = 'investigate';
    saveGame();
    renderInvestigate();
  };
}

/* ---------- 问询室 ---------- */

function renderInvestigate() {
  const c = G.caseObj;
  setPhase('调查');
  showView('view-investigate');
  $('#inv-case-title').textContent = `${c.emoji} ${c.title} · 问询室`;

  // 嫌疑人页签
  const tabs = $('#inv-tabs');
  tabs.innerHTML = '';
  c.suspects.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = 'suspect-tab' + (i === G.suspectIdx ? ' active' : '') +
      (G.askedCount[s.id] ? ' interviewed' : '') +
      (hasMarkedNote(s.name) ? ' marked' : '');
    btn.innerHTML = `<span class="t-emoji">${esc(s.emoji)}</span><span>${esc(s.name)}</span><span class="t-dot"></span>`;
    btn.onclick = () => {
      G.suspectIdx = i;
      saveGame();
      renderInvestigate();
    };
    tabs.appendChild(btn);
  });

  // 当前嫌疑人
  const s = c.suspects[G.suspectIdx];
  $('#chat-avatar').textContent = s.emoji;
  $('#chat-name').textContent = s.name;
  $('#chat-role').textContent = s.role;
  $('#chat-log').innerHTML = '';
  addChat('system', '你是侦探。' + s.name + '正在接受问询。' + s.alibi);

  // 建议问题
  const hint = c.askHint && c.askHint.length ? c.askHint[G.suspectIdx % c.askHint.length] : '';
  $('#inv-hint').textContent = '建议提问：' + hint;

  $('#chat-input').value = '';
  $('#chat-input').onkeydown = (e) => { if (e.key === 'Enter') askQuestion($('#chat-input').value); };
  $('#btn-mic').onclick = () => SpeechRec.toggle();
  $('#btn-replay').onclick = () => { if (G.lastAnswer) Speaker.speakSuspect(G.lastAnswer, s); };
  $('#btn-note').onclick = () => {
    const last = G.lastAnswer;
    if (!last) { Toast('还没有可记录的证词'); return; }
    Notebook.add(s.name, s.emoji, last, false);
    Toast('已记入侦探笔记本');
  };
  $('#btn-inv-accuse').onclick = () => {
    G.phase = 'accuse';
    saveGame();
    renderAccuse();
  };
}

function hasMarkedNote(name) {
  return Notebook.notes.some((n) => n.who === name && n.marked);
}

function addChat(kind, text) {
  const log = $('#chat-log');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + kind;
  if (kind !== 'system') {
    const who = kind === 'user' ? '你（侦探）' : (G.caseObj.suspects[G.suspectIdx] || {}).name || '嫌疑人';
    div.innerHTML = `<div class="msg-who">${esc(who)}</div>${esc(text)}`;
  } else {
    div.textContent = text;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function askQuestion(q) {
  q = (q || '').trim();
  if (!q) return;
  const c = G.caseObj;
  const s = c.suspects[G.suspectIdx];
  G.lastAnswer = null;
  addChat('user', q);
  $('#chat-input').value = '';
  $('#mic-hint').textContent = '🤔 ' + s.name + ' 正在思考…';

  // 记录提问
  G.askedCount[s.id] = (G.askedCount[s.id] || 0) + 1;
  G.askedQ[s.id] = G.askedQ[s.id] || [];
  G.askedQ[s.id].push(q);

  // 回答：优先 AI 自由对答（BYOP 已登录），失败/未登录用本地脚本
  let answer = null;
  if (BYOP.loggedIn) {
    answer = await BYOP.askSuspect(q, s, c);
  }
  if (!answer) answer = localAnswer(q, s);

  G.lastAnswer = answer;
  addChat('suspect', answer);
  Speaker.speakSuspect(answer, s);
  $('#mic-hint').textContent = '💡 觉得可疑？点击「记入笔记本」，或点击「🔊 重听回答」。';
  saveGame();
}

/** 本地问答脚本：关键词匹配 + 兜底答非所问 */
function localAnswer(q, s) {
  const script = s.script || { default: '这件事……我不太想谈。', qa: [] };
  const qs = q.toLowerCase();
  let best = null, bestScore = 0;
  (script.qa || []).forEach((item) => {
    const kws = item.k || [];
    const score = kws.filter((k) => qs.includes(k.toLowerCase())).length;
    if (score > bestScore) { bestScore = score; best = item.a; }
  });
  if (bestScore > 0) return best;
  return script.default || '这个问题……我没法回答。';
}

/* ---------- 侦探笔记本渲染 ---------- */

function renderNotebook() {
  const box = $('#notebook');
  const empty = $('#notebook-empty');
  box.innerHTML = '';
  if (!Notebook.notes.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  Notebook.notes.forEach((n) => {
    const div = document.createElement('div');
    div.className = 'note-item' + (n.marked ? ' marked' : '');
    div.innerHTML = `
      <div class="n-head">
        <span>${esc(n.emoji)}</span>
        <span class="n-who">${esc(n.who)}</span>
        <span class="n-time">${esc(n.time)}</span>
      </div>
      <div class="n-text">${esc(n.text)}</div>
      <div class="n-actions">
        <button class="btn btn-small btn-ghost n-mark">${n.marked ? '✓ 已标记可疑' : '⚠ 标记可疑'}</button>
        <button class="btn btn-small btn-ghost n-del">删除</button>
      </div>`;
    div.querySelector('.n-mark').onclick = () => Notebook.toggleMark(n.id);
    div.querySelector('.n-del').onclick = () => Notebook.remove(n.id);
    box.appendChild(div);
  });
  if (G && G.caseObj) renderInvestigateTabsOnly();
}

function renderInvestigateTabsOnly() {
  const tabs = $('#inv-tabs');
  if (!tabs) return;
  const c = G.caseObj;
  Array.from(tabs.children).forEach((btn, i) => {
    const s = c.suspects[i];
    btn.className = 'suspect-tab' + (i === G.suspectIdx ? ' active' : '') +
      (G.askedCount[s.id] ? ' interviewed' : '') +
      (hasMarkedNote(s.name) ? ' marked' : '');
  });
}

/* ---------- 指控 ---------- */

function renderAccuse() {
  const c = G.caseObj;
  setPhase('指控');
  showView('view-accuse');
  const box = $('#accuse-list');
  box.innerHTML = '';
  G.accusedId = null;
  $('#btn-accuse-confirm').disabled = true;

  c.suspects.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'accuse-option';
    btn.innerHTML = `
      <span class="a-emoji">${esc(s.emoji)}</span>
      <span>
        <span>指认 ${esc(s.name)}</span>
        <span class="a-desc">${esc(s.role)} · 问询次数：${G.askedCount[s.id] || 0}</span>
      </span>`;
    btn.onclick = () => {
      $$('.accuse-option').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      G.accusedId = s.id;
      $('#btn-accuse-confirm').disabled = false;
    };
    box.appendChild(btn);
  });

  $('#btn-accuse-confirm').onclick = () => {
    if (!G.accusedId) return;
    const killer = c.suspects.find((s) => s.isKiller);
    G.verdict = G.accusedId === killer.id ? 'win' : 'lose';
    G.phase = 'truth';
    clearSave();
    renderTruth();
  };
}

/* ---------- 真相 ---------- */

function renderTruth() {
  const c = G.caseObj;
  const killer = c.suspects.find((s) => s.isKiller);
  const accused = c.suspects.find((s) => s.id === G.accusedId);
  setPhase('真相');
  showView('view-truth');

  const win = G.verdict === 'win';
  $('#truth-emoji').textContent = win ? '🎯' : '💔';
  $('#truth-title').textContent = win ? '指控正确！真凶落网' : '指控错误……真凶逍遥法外';
  $('#truth-sub').textContent = win
    ? '你识破了 ' + killer.name + ' 的伪装，' + c.title + '告破。'
    : '你指控了 ' + accused.name + '，但真正的凶手是 ' + killer.name + '。';

  $('#truth-story').textContent = c.truth;
  Speaker.speak(c.truth);

  // 矛盾对照表
  const box = $('#truth-contradictions');
  box.innerHTML = '';
  c.suspects.forEach((s) => {
    const isK = s.isKiller;
    const isAccused = s.id === G.accusedId;
    const div = document.createElement('div');
    div.className = 'contra-card ' + (isK ? 'killer' : 'innocent');
    const tag = isK ? '🔴 真凶' : (isAccused ? '🟠 被指控' : '🟢 无辜');
    const contra = s.contradiction || { claim: '无矛盾证词', fact: '无冲突事实', conflict: '' };
    div.innerHTML = `
      <div class="c-who">${esc(s.emoji)} ${esc(s.name)} · ${tag}</div>
      <div class="contra-row"><span class="c-tag claim">他说</span><span>${esc(contra.claim)}</span></div>
      <div class="contra-row"><span class="c-tag fact">事实</span><span>${esc(contra.fact)}</span></div>
      <div class="contra-row"><span class="c-tag conflict">矛盾</span><span>${esc(contra.conflict)}</span></div>`;
    box.appendChild(div);
  });

  $('#btn-truth-restart').onclick = () => { showView('view-home'); setPhase('待命'); renderCaseList(); };
  $('#btn-truth-replay').onclick = () => { renderCaseList(); startCase(c.id); };
}

/* ---------- 初始化 ---------- */

function init() {
  Notebook.load();
  Speaker.init();
  BYOP.init();
  SpeechRec.init();

  // 顶部按钮
  $('#btn-mute').onclick = () => { Speaker.toggleMute(); };
  $('#btn-byop-login').onclick = () => BYOP.login();
  $('#btn-byop-logout').onclick = () => BYOP.logout();
  $('#btn-ai-case').onclick = async () => {
    $('#btn-ai-case').disabled = true;
    Toast('✨ AI 正在构思全新案件…');
    const c = await BYOP.generateCase();
    if (!c) {
      Toast('生成失败（可能未登录或接口超时），已回退本地案件库');
      $('#btn-ai-case').disabled = false;
      return;
    }
    const lib = loadCaseLib();
    lib.push(c);
    saveCaseLib(lib);
    Toast('✨ 新案件已生成：' + c.title);
    renderCaseList();
    $('#btn-ai-case').disabled = false;
  };

  // 首页按钮
  const homeLogin = $('#btn-home-login');
  if (homeLogin) homeLogin.onclick = () => BYOP.login();
  $('#btn-continue').onclick = () => {
    const st = loadGame();
    if (!st) { Toast('没有可继续的案件'); return; }
    G = st;
    if (st.phase === 'brief') { renderBrief(); }
    else if (st.phase === 'investigate') { renderInvestigate(); }
    else if (st.phase === 'accuse') { renderAccuse(); }
    else { renderCaseList(); showView('view-home'); }
  };
  $('#btn-new-game').onclick = () => {
    clearSave();
    Notebook.notes = [];
    Notebook.save();
    showView('view-home');
    setPhase('待命');
    renderCaseList();
    renderNotebook();
  };

  renderCaseList();
  renderNotebook();

  // 检测续玩存档
  const st = loadGame();
  const cont = $('#btn-continue');
  if (st && cont) {
    cont.classList.remove('hidden');
    cont.textContent = '继续调查：' + st.caseObj.title;
  } else if (cont) {
    cont.classList.add('hidden');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
