/* =====================================================================
 * Spot the Fake — 真假 AI 猜谜游戏
 * 纯静态单页应用：HTML + CSS + JS，无构建依赖，可直接被 GitHub Pages 托管。
 *
 * 玩法：每轮展示两张图片（一张真实照片、一张 AI 生成），
 * 在倒计时内猜出哪一张是 AI 生成的。答对累积 streak 连击加分，
 * 答错重置连击；每轮结束后揭示“假图破绽”提示。
 *
 * 真图：Wikimedia Commons 公共领域 / CC 许可图片（可热链 URL + fallback）。
 * 假图：https://image.pollinations.ai/prompt/{prompt} 运行时生成，
 *       按 prompt 哈希缓存到本地存储（Cache API，降级 localStorage）。
 * ===================================================================== */

'use strict';

/* ------------------------- 可配置项 ------------------------- */

const CONFIG = {
  rounds: 10,           // 每局回合数
  timePerRound: 15,     // 每轮倒计时（秒）
  imgWidth: 800,        // AI 图生成宽度
  imgHeight: 600,       // AI 图生成高度
  maxPreloadWait: 18000,// 图片加载最久等待（毫秒）
  aiFailGrace: true,    // AI 图生成失败时用占位图继续游戏
};

/* ------------------------- 真图数据（Wikimedia Commons，公共领域 / CC 许可） -------------------------
 * 全部为已验证可热链的 thumb.wikimedia.org 图片。
 * hint：用于揭示环节展示的“真实照片小知识”。
 */
const REAL_IMAGES = [
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d6/Half_Dome_from_Glacier_Point%2C_Yosemite_NP_-_Diliff.jpg/960px-Half_Dome_from_Glacier_Point%2C_Yosemite_NP_-_Diliff.jpg", title: "Half Dome, Yosemite", credit: "Diliff", license: "CC BY-SA 3.0", hint: "Half Dome 是优胜美地国家公园的标志性花岗岩穹顶，高约 2695 米，由冰川作用塑造。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Grand_Canyon_view_from_Pima_Point_2010.jpg/960px-Grand_Canyon_view_from_Pima_Point_2010.jpg", title: "Grand Canyon", credit: "Chensiyuan", license: "CC BY-SA 4.0", hint: "大峡谷由科罗拉多河切割而成，深度超过 1800 米，岩层记录了近 20 亿年的地质历史。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Moraine_Lake_17092005.jpg/960px-Moraine_Lake_17092005.jpg", title: "Moraine Lake", credit: "Gorgo", license: "Public domain", hint: "梦莲湖位于加拿大班夫国家公园，湖水因冰川岩粉呈标志性的蓝绿色。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Taj_Mahal%2C_Agra%2C_India_edit3.jpg/960px-Taj_Mahal%2C_Agra%2C_India_edit3.jpg", title: "Taj Mahal", credit: "Daniel Mennerich", license: "CC BY-SA 3.0", hint: "泰姬陵建于 1632–1653 年，是莫卧儿皇帝沙贾汗为爱妻修建的白色大理石陵墓，世界新七大奇迹之一。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/Eiffel_Tower_Paris.JPG/960px-Eiffel_Tower_Paris.JPG", title: "Eiffel Tower", credit: "Ohc", license: "CC BY-SA 3.0", hint: "埃菲尔铁塔建于 1889 年巴黎世博会，高 330 米，是巴黎最著名的地标。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Statue_of_Liberty%2C_NY.jpg/960px-Statue_of_Liberty%2C_NY.jpg", title: "Statue of Liberty", credit: "Flickr user", license: "CC BY 2.0", hint: "自由女神像于 1886 年落成，是法国赠予美国的礼物，高 93 米（含基座）。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7c/Sydney_Opera_House_-_Dec_2008.jpg/960px-Sydney_Opera_House_-_Dec_2008.jpg", title: "Sydney Opera House", credit: "Diliff", license: "CC BY-SA 3.0", hint: "悉尼歌剧院于 1973 年启用，帆形屋顶由预制混凝土壳构成，是 20 世纪建筑杰作。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Colosseum_in_Rome%2C_Italy_-_April_2007.jpg/960px-Colosseum_in_Rome%2C_Italy_-_April_2007.jpg", title: "Colosseum", credit: "Diliff", license: "CC BY-SA 2.5", hint: "罗马斗兽场建于公元 70–80 年，可容纳约 5 万观众，是古罗马最大的圆形竞技场。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/44/Venice_canal_gondola.jpg/960px-Venice_canal_gondola.jpg", title: "Venice Gondola", credit: "TheGreatRambler", license: "CC BY-SA 4.0", hint: "威尼斯的贡多拉船身不对称，船夫单桨划行；威尼斯由 118 座小岛和 400 多座桥梁组成。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ce/Tokyo_Tower_at_night.jpg/960px-Tokyo_Tower_at_night.jpg", title: "Tokyo Tower", credit: "Douglas P Perkins", license: "Public domain", hint: "东京塔高 333 米，1958 年建成，以埃菲尔铁塔为灵感，塔身为橙白两色。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/Petra%2C_Jordan.jpg/960px-Petra%2C_Jordan.jpg", title: "Petra", credit: "Argenberg", license: "CC BY 4.0", hint: "佩特拉古城建于公元前 4 世纪左右，纳巴泰人在玫瑰色砂岩中凿出整座城市，又称“玫瑰城”。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/Mount_Fuji_from_Lake_Kawaguchi.jpg/960px-Mount_Fuji_from_Lake_Kawaguchi.jpg", title: "Mount Fuji", credit: "Subramaniam K V", license: "CC BY 3.0", hint: "富士山海拔 3776 米，是日本最高峰，为休眠火山，山顶常年积雪。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/GoldenGateBridge-001.jpg/960px-GoldenGateBridge-001.jpg", title: "Golden Gate Bridge", credit: "RichN", license: "CC BY 2.5", hint: "金门大桥 1937 年通车，主跨 1280 米，桥身“国际橘”色是为了在海雾中保持可见。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/73/Lion_waiting_in_Namibia.jpg/960px-Lion_waiting_in_Namibia.jpg", title: "Lion in Namibia", credit: "Flickr user", license: "CC BY 2.0", hint: "非洲狮是现存第二大猫科动物，雄狮鬃毛的颜色会随年龄和健康状况变化。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e6/Red_Panda_%2824986761703%29.jpg/960px-Red_Panda_%2824986761703%29.jpg", title: "Red Panda", credit: "Flickr user", license: "CC0", hint: "小熊猫以竹子为主食但属于食肉目，尾巴上有 9 个环纹，是濒危物种。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/49/Koala_climbing_tree.jpg/960px-Koala_climbing_tree.jpg", title: "Koala", credit: "Wikimedia user", license: "CC BY-SA 3.0", hint: "考拉是澳大利亚的有袋类动物，每天睡眠约 18–20 小时，以桉树叶为食。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1e/Bald_Eagle_Portrait.jpg/960px-Bald_Eagle_Portrait.jpg", title: "Bald Eagle", credit: "Saffron Blaze", license: "CC BY-SA 3.0", hint: "白头海雕是美国的国鸟，翼展可达 2.3 米，野外寿命可达 20 年。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/960px-Machu_Picchu%2C_Peru.jpg", title: "Machu Picchu", credit: "Pedro Szekely", license: "CC BY-SA 2.0", hint: "马丘比丘是印加帝国 15 世纪的古城，位于海拔 2430 米的安第斯山脊之上。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Grosser_Panda.JPG/960px-Grosser_Panda.JPG", title: "Giant Panda", credit: "J. Patrick Fischer", license: "CC BY-SA 3.0", hint: "大熊猫是中国的国宝，以竹子为主食，野生种群主要分布在四川、陕西、甘肃。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Peru_Machu_Picchu_Sunrise.jpg/960px-Peru_Machu_Picchu_Sunrise.jpg", title: "Machu Picchu Sunrise", credit: "Allard Schmidt", license: "Public domain", hint: "马丘比丘日出时常晨雾缭绕；它于 1983 年被列入世界遗产，是南美最热门的古迹。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/960px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg", title: "Great Wall", credit: "Severin.stalder", license: "CC BY-SA 3.0", hint: "长城总长超过 2.1 万公里，始建于春秋战国时期，现存主体多为明代所建。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Aurora_borealis_over_Eielson_Air_Force_Base%2C_Alaska.jpg/960px-Aurora_borealis_over_Eielson_Air_Force_Base%2C_Alaska.jpg", title: "Aurora Borealis", credit: "US Air Force", license: "Public domain", hint: "极光由太阳带电粒子与地球高层大气碰撞产生，常见于南北极圈附近。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/Lake_Louise%2C_Banff_National_Park.jpg/960px-Lake_Louise%2C_Banff_National_Park.jpg", title: "Lake Louise", credit: "Aquitania", license: "CC BY-SA 4.0", hint: "路易斯湖位于加拿大班夫国家公园，湖水呈翡翠绿，背靠维多利亚冰川。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Antelope_Canyon%2C_Arizona.jpg/960px-Antelope_Canyon%2C_Arizona.jpg", title: "Antelope Canyon", credit: "Djaque", license: "CC BY-SA 4.0", hint: "羚羊峡谷是纳瓦霍人的圣地，由洪水侵蚀红色砂岩形成，以著名的光柱景观闻名。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/Arc_de_Triomphe%2C_Paris%2C_France.jpg/960px-Arc_de_Triomphe%2C_Paris%2C_France.jpg", title: "Arc de Triomphe", credit: "BritishMuseum", license: "CC BY-SA 3.0", hint: "巴黎凯旋门建于 1836 年，纪念拿破仑战争胜利；其无名烈士墓的火焰昼夜不熄。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Venezia%2C_Canal_Grande.jpg/960px-Venezia%2C_Canal_Grande.jpg", title: "Grand Canal, Venice", credit: "Flickr user", license: "CC BY-SA 2.0", hint: "威尼斯大运河呈 S 形穿过全城，两岸是哥特式与文艺复兴风格的建筑。" },
  { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/Niagara_Falls%2C_Ontario%2C_Canada.jpg/960px-Niagara_Falls%2C_Ontario%2C_Canada.jpg", title: "Niagara Falls", credit: "Salwa Farwaneh", license: "CC0", hint: "尼亚加拉大瀑布由马蹄瀑布、美利坚瀑布和布里达尔瀑布组成，每秒水量约 280 万升。" },
];

/* ------------------------- AI 假图提示词（Pollinations） -------------------------
 * prompt：高质量照片风格生成提示词，运行时经 image.pollinations.ai 生成图片。
 * hint：针对该主题的“假图破绽”观察点，揭示环节展示。
 */
const AI_PROMPTS = [
  { prompt: "photorealistic turquoise glacial lake surrounded by snow-capped mountain peaks, morning mist, alpine landscape photography, ultra detailed", hint: "看湖面倒影：AI 生成的雪山倒影常与实景错位或糊成一片；山脊轮廓过于“完美”，缺少真实岩石的破碎纹理。" },
  { prompt: "photorealistic golden sand dunes at sunset with long shadows and rippled sand texture, desert landscape photography", hint: "看沙丘纹理：AI 常出现重复、整齐的波浪纹；阴影方向与光源位置矛盾。" },
  { prompt: "photorealistic powerful waterfall cascading into emerald pool surrounded by lush green mossy rocks, long exposure, mist", hint: "看水流：AI 常把水拉成过度平滑的丝状，缺乏水花细节；岩石边缘发糊、形状奇异。" },
  { prompt: "photorealistic aerial view of turquoise ocean waves crashing on white sand beach with palm trees, tropical paradise", hint: "看海浪：AI 的浪花形状重复、泡沫分布过于规律；岸边植被与沙滩的交接边缘生硬。" },
  { prompt: "photorealistic milky way galaxy arching over desert rock formations at night, starry sky astrophotography, no light pollution", hint: "看星空：AI 的星点分布太均匀、缺乏真实星空的疏密；银河颜色过渡生硬、形状过于对称。" },
  { prompt: "photorealistic autumn forest path with golden and red maple leaves, soft sunlight rays through trees, misty morning", hint: "看树叶：AI 的叶子常重复出现同一形状；树干与枝条的穿插关系混乱。" },
  { prompt: "photorealistic green and purple aurora borealis dancing over snowy mountain lake, night sky reflection in water", hint: "看极光形状：AI 极光常带对称的“缎带”效果、纹理过于顺滑；水面倒影与天空不一致。" },
  { prompt: "photorealistic cherry blossom trees in full bloom along a riverside park path, pink petals falling, spring day", hint: "看花瓣与树枝：AI 花瓣形状重复、堆积不自然；树枝走向不符合真实植物的分叉规律。" },
  { prompt: "photorealistic city skyline at golden hour with skyscrapers reflecting warm sunlight, river in foreground, urban photography", hint: "看窗户：AI 建筑上的窗户格子数量与排列容易错乱；水面倒影与建筑不完全对称。" },
  { prompt: "photorealistic narrow cobblestone street in a historic european old town with colorful facades and flower boxes, sunny day", hint: "看窗户与招牌：AI 常把窗户画歪、招牌文字变成乱码；墙面的砖纹重复出现。" },
  { prompt: "photorealistic ornate golden temple with intricate carvings under clear blue sky, southeast asian architecture", hint: "看精细雕刻：AI 的复杂雕刻常糊成一片或出现重复图案；屋檐曲线失真。" },
  { prompt: "photorealistic colorful seaside village on a cliff overlooking the mediterranean sea, boats in harbor, sunny", hint: "看窗户与栏杆：AI 的阳台栏杆数量与结构混乱；海面波纹形状重复。" },
  { prompt: "photorealistic latte art of a rosetta pattern in a ceramic cup on wooden cafe table, soft window light, shallow depth of field", hint: "看拉花图案：AI 的拉花对称过度或线条断裂；杯子与桌沿的倒影/反光不一致。" },
  { prompt: "photorealistic bustling night market street food stall with steaming dumplings and glowing lanterns, shallow depth of field", hint: "看文字与人物：AI 的招牌、横幅文字常是乱码；人物面部和手部细节异常。" },
  { prompt: "photorealistic golden retriever puppy sitting in autumn leaves, big eyes, soft natural light, shallow depth of field", hint: "看毛发与眼睛：AI 毛发纹理过于顺滑或重复；眼睛高光位置不对称。" },
  { prompt: "photorealistic ginger cat lying on a sunlit windowsill with green plants, warm cozy atmosphere, fur detail", hint: "看胡须与耳朵：AI 的胡须数量与方向混乱；窗台植物的叶片边缘生硬。" },
  { prompt: "photorealistic white horse running through a meadow at sunrise, dust particles in golden light, motion", hint: "看马蹄与鬃毛：AI 的马蹄结构容易出错、鬃毛纹理重复；奔跑姿态不符合生物力学。" },
  { prompt: "photorealistic bald eagle soaring with spread wings against dramatic cloudy sky, sharp talons, wildlife photography", hint: "看翅膀羽毛：AI 的羽毛排列整齐得反常；爪子指节的数量可能出错。" },
  { prompt: "photorealistic giant panda eating bamboo in a misty bamboo forest, close-up, soft natural lighting", hint: "看毛发纹理与眼睛：AI 熊猫的眼睛位置/大小不对称；竹叶形状重复、排列机械。" },
  { prompt: "photorealistic portrait of an elderly fisherman with weathered face and straw hat, harbor background, natural light, 85mm", hint: "看皮肤纹理与手：AI 皮肤常过度平滑、缺少毛孔细节；手指数量或关节结构易错。" },
  { prompt: "photorealistic candid portrait of a young woman reading a book in a cozy coffee shop, warm bokeh background", hint: "看手部与书页：AI 的手指容易扭曲、书页文字变成乱码；背景虚化过于均匀。" },
  { prompt: "photorealistic vintage bicycle leaning against a brick wall with climbing ivy, morning sunlight, film photography style", hint: "看车轮辐条与链条：AI 的辐条数量与交叉关系错乱；链条结构不连续。" },
  { prompt: "photorealistic gourmet burger with melted cheese and fresh vegetables on wooden board, studio lighting, appetizing", hint: "看食材纹理：AI 的生菜/奶酪形状重复；芝麻的分布过于均匀，缺少随机性。" },
  { prompt: "photorealistic modern glass skyscraper reflecting blue sky and clouds, low angle view, sharp geometric lines", hint: "看玻璃反射：AI 反射的云层形状与天空不一致；楼体边缘线条出现异常扭曲。" },
];

/* ------------------------- 通用破绽提示池 ------------------------- */
const GENERIC_FLAWS = [
  "整体看：AI 生成的“照片”往往细节过度完美，真实世界充满了不规则与瑕疵。",
  "放大看边缘：AI 常把主体与背景交接处处理得发糊、生硬。",
  "寻找对称与重复：自然界几乎没有完全重复的纹理，AI 却喜欢“复制粘贴”。",
  "光线逻辑：留意阴影方向、高光位置是否与光源一致。",
  "细节陷阱：手指、文字、窗格、树叶——这些高信息密度区域是 AI 的弱点。",
];

/* ------------------------- Fallback 图（SVG Data URI） ------------------------- */
const FALLBACK_REAL = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3c72"/><stop offset="1" stop-color="#2a5298"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="400" cy="240" r="70" fill="none" stroke="#ffffff88" stroke-width="8"/><rect x="330" y="270" width="140" height="96" rx="10" fill="none" stroke="#ffffff88" stroke-width="8"/><path d="M360 320l30-34 24 28 18-20 34 38v-118H330z" fill="#ffffffaa"/><text x="400" y="470" font-family="Arial" font-size="30" fill="#ffffff" text-anchor="middle">REAL PHOTO</text><text x="400" y="510" font-family="Arial" font-size="18" fill="#ffffffbb" text-anchor="middle">image unavailable</text></svg>'
);
const FALLBACK_AI = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a1c71"/><stop offset="0.5" stop-color="#d76d77"/><stop offset="1" stop-color="#ffaf7b"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="400" cy="250" r="58" fill="none" stroke="#ffffffcc" stroke-width="7"/><rect cx="0" x="338" y="276" width="124" height="88" rx="12" fill="none" stroke="#ffffffcc" stroke-width="7"/><circle cx="452" cy="296" r="7" fill="#ffffffee"/><path d="M366 320l26-28 22 24 16-18 30 34v-104H366z" fill="#ffffffcc"/><text x="400" y="470" font-family="Arial" font-size="30" fill="#ffffff" text-anchor="middle">AI IMAGE</text><text x="400" y="510" font-family="Arial" font-size="18" fill="#ffffffcc" text-anchor="middle">generation unavailable</text></svg>'
);

/* ------------------------- 工具函数 ------------------------- */

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** djb2 字符串哈希 -> 32 位无符号整数 */
function hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 生成 AI 假图 URL（seed 固定为 prompt 哈希，保证同 prompt 同图、利于缓存） */
function aiImageUrl(prompt) {
  const seed = hashStr(prompt);
  const p = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${p}?width=${CONFIG.imgWidth}&height=${CONFIG.imgHeight}&seed=${seed}&nologo=true&model=flux`;
}

function cacheKeyOf(prompt) {
  return 'spot-the-fake:' + hashStr(prompt).toString(16);
}

/* ------------------------- 本地缓存（Cache API -> localStorage 降级） ------------------------- */

const CACHE_NAME = 'spot-the-fake-ai-v1';

async function cacheGet(prompt) {
  const url = aiImageUrl(prompt);
  try {
    if ('caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return URL.createObjectURL(await hit.blob());
    }
  } catch (e) { /* file:// 或隐私模式下不可用，继续降级 */ }
  try {
    const raw = localStorage.getItem(cacheKeyOf(prompt));
    if (raw) return raw; // dataURL
  } catch (e) { /* ignore */ }
  return null;
}

async function cachePut(prompt, blobOrDataUrl) {
  const url = aiImageUrl(prompt);
  try {
    if ('caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(url, new Response(blobOrDataUrl, { headers: { 'Content-Type': 'image/jpeg' } }));
      return;
    }
  } catch (e) { /* fall through */ }
  try {
    if (typeof blobOrDataUrl === 'string') {
      localStorage.setItem(cacheKeyOf(prompt), blobOrDataUrl);
    } else {
      const dataUrl = await blobToDataUrl(blobOrDataUrl, 520, 0.72);
      localStorage.setItem(cacheKeyOf(prompt), dataUrl);
    }
  } catch (e) { /* 容量满或不可用，忽略 */ }
}

function blobToDataUrl(blob, maxW, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      try { resolve(canvas.toDataURL('image/jpeg', quality)); }
      catch (e) { reject(e); }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** 获取 AI 图：先查缓存，未命中则在线生成并写缓存。返回可显示的 URL。 */
async function getAiImage(prompt) {
  const cached = await cacheGet(prompt);
  if (cached) return { url: cached, fromCache: true };
  const resp = await fetch(aiImageUrl(prompt), { mode: 'cors' });
  if (!resp.ok) throw new Error('AI image HTTP ' + resp.status);
  const blob = await resp.blob();
  await cachePut(prompt, blob);
  return { url: URL.createObjectURL(blob), fromCache: false };
}

/** 预加载一张图（真图或假图 URL），返回是否成功 */
function preloadImage(url, timeoutMs) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    setTimeout(() => finish(false), timeoutMs || 15000);
    img.src = url;
  });
}

/* ------------------------- 游戏状态 ------------------------- */

const state = {
  phase: 'start',        // start | loading | playing | reveal | end
  round: 0,              // 0-based 当前回合
  totalRounds: CONFIG.rounds,
  timePerRound: CONFIG.timePerRound,
  score: 0,
  streak: 0,
  maxStreak: 0,
  correctCount: 0,
  history: [],
  realDeck: [],
  aiDeck: [],
  current: null,         // { real, ai, aiPrompt, aiIndex, realIndex, leftIsAi, timer, revealed }
  timerHandle: null,
  timerLeft: 0,
};

/* ------------------------- DOM 引用 ------------------------- */

const views = {
  start: $('#view-start'),
  loading: $('#view-loading'),
  game: $('#view-game'),
  reveal: $('#view-reveal'),
  end: $('#view-end'),
};

/* ------------------------- 视图切换 ------------------------- */

function showView(name) {
  Object.keys(views).forEach((k) => {
    views[k].classList.toggle('active', k === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------- 开始界面 ------------------------- */

function bindStart() {
  $('#btn-start').addEventListener('click', () => {
    const rounds = parseInt($('#set-rounds').value, 10) || CONFIG.rounds;
    const time = parseInt($('#set-time').value, 10) || CONFIG.timePerRound;
    startGame(rounds, time);
  });
  $('#btn-start-short').addEventListener('click', () => startGame(5, 15));
  $('#btn-start-long').addEventListener('click', () => startGame(20, 20));
}

function startGame(rounds, time) {
  state.totalRounds = Math.min(30, Math.max(3, rounds));
  state.timePerRound = Math.min(60, Math.max(5, time));
  state.round = 0;
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.correctCount = 0;
  state.history = [];
  state.realDeck = shuffle(REAL_IMAGES);
  state.aiDeck = shuffle(AI_PROMPTS);
  nextRound();
}

/* ------------------------- 回合流程 ------------------------- */

function nextRound() {
  // 准备当前回合数据
  if (state.realDeck.length === 0) state.realDeck = shuffle(REAL_IMAGES);
  const real = state.realDeck.pop();
  const realIndex = REAL_IMAGES.indexOf(real);
  const aiItem = state.aiDeck[state.round % state.aiDeck.length];
  const aiIndex = AI_PROMPTS.indexOf(aiItem);
  const leftIsAi = Math.random() < 0.5;

  state.current = {
    real, realIndex,
    aiItem, aiIndex,
    leftIsAi,
    revealed: false,
    roundResult: null, // 'correct' | 'wrong' | 'timeout' | 'aifail'
    aiFailed: false,
  };

  updateHud();
  renderRoundLoading();
  loadRoundImages();
}

function renderRoundLoading() {
  showView('loading');
  $('#loading-msg').textContent = `第 ${state.round + 1} / ${state.totalRounds} 回合 · 正在生成图片…`;
  $('#loading-progress').style.width = '0%';
}

async function loadRoundImages() {
  const cur = state.current;
  const realUrl = cur.real.url;
  let aiUrl = null;

  // 先尝试取/生成 AI 图（可能需要数秒）
  try {
    const got = await getAiImage(cur.aiItem.prompt);
    aiUrl = got.url;
  } catch (e) {
    cur.aiFailed = true;
    aiUrl = FALLBACK_AI;
  }

  // 预加载两张图（真图失败则 fallback）
  const [realOk] = await Promise.all([
    preloadImage(realUrl, CONFIG.maxPreloadWait),
    aiUrl ? preloadImage(aiUrl, CONFIG.maxPreloadWait) : Promise.resolve(false),
  ]);
  if (!realOk) cur.realFailed = true;

  // 渲染游戏界面
  renderRound(realUrl, aiUrl);
}

function renderRound(realUrl, aiUrl) {
  const cur = state.current;
  showView('game');

  $('#round-label').textContent = `Round ${state.round + 1} / ${state.totalRounds}`;
  $('#score-label').textContent = `Score ${state.score}`;
  $('#streak-label').textContent = `🔥 ${state.streak}`;

  const leftImg = $('#img-left');
  const rightImg = $('#img-right');
  const leftCaption = $('#caption-left');
  const rightCaption = $('#caption-right');

  const leftSrc = cur.leftIsAi ? (aiUrl || FALLBACK_AI) : (realUrl || FALLBACK_REAL);
  const rightSrc = cur.leftIsAi ? (realUrl || FALLBACK_REAL) : (aiUrl || FALLBACK_AI);

  leftImg.onerror = () => { leftImg.src = cur.leftIsAi ? FALLBACK_AI : FALLBACK_REAL; };
  rightImg.onerror = () => { rightImg.src = cur.leftIsAi ? FALLBACK_REAL : FALLBACK_AI; };
  leftImg.src = leftSrc;
  rightImg.src = rightSrc;

  leftCaption.textContent = 'A';
  rightCaption.textContent = 'B';

  // 清理旧状态
  $('#card-left').classList.remove('correct', 'wrong', 'ai-mark', 'real-mark', 'picked');
  $('#card-right').classList.remove('correct', 'wrong', 'ai-mark', 'real-mark', 'picked');
  $('#round-banner').textContent = '哪一张是 AI 生成的？';
  $('#round-banner').className = 'banner';

  $('#card-left').onclick = () => answer(false);
  $('#card-right').onclick = () => answer(true);
  $('#card-left').style.pointerEvents = 'auto';
  $('#card-right').style.pointerEvents = 'auto';

  // 开始倒计时
  startTimer();
}

function startTimer() {
  const total = state.timePerRound;
  state.timerLeft = total;
  $('#timer-num').textContent = total;
  $('#timer-bar').style.transition = 'none';
  $('#timer-bar').style.width = '100%';
  // 强制回流后启动动画
  void $('#timer-bar').offsetWidth;
  $('#timer-bar').style.transition = `width ${total}s linear`;
  $('#timer-bar').style.width = '0%';

  clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    state.timerLeft -= 0.1;
    $('#timer-num').textContent = Math.max(0, Math.ceil(state.timerLeft));
    if (state.timerLeft <= 0) {
      clearInterval(state.timerHandle);
      if (!state.current.revealed) {
        answer(null); // 超时视为答错
      }
    }
  }, 100);
}

/** pickedIsAi: true=玩家选了左侧是 AI；false=选了右侧；null=超时 */
function answer(pickedLeftIsAi) {
  const cur = state.current;
  if (!cur || cur.revealed) return;
  cur.revealed = true;
  clearInterval(state.timerHandle);
  $('#timer-bar').style.transition = 'none';

  const isCorrect = pickedLeftIsAi === cur.leftIsAi;
  const wasTimeout = pickedLeftIsAi === null;
  const aiLeft = cur.leftIsAi;

  // 计分
  let gained = 0;
  if (isCorrect) {
    state.streak += 1;
    gained = 100 + (state.streak - 1) * 25;
    state.score += gained;
    state.correctCount += 1;
    if (state.streak > state.maxStreak) state.maxStreak = state.streak;
  } else {
    state.streak = 0;
  }

  cur.roundResult = isCorrect ? 'correct' : (wasTimeout ? 'timeout' : 'wrong');
  cur.gained = gained;

  // 视觉标记
  const aiCard = aiLeft ? $('#card-left') : $('#card-right');
  const realCard = aiLeft ? $('#card-right') : $('#card-left');
  aiCard.classList.add('ai-mark', 'picked');
  realCard.classList.add('real-mark');
  if (isCorrect) {
    aiCard.classList.add('wrong'); // 玩家点的就是 AI 卡，标红意为“这就是 AI”
    realCard.classList.add('correct');
  } else {
    aiCard.classList.add('wrong');
    if (!wasTimeout) {
      const pickedCard = pickedLeftIsAi ? $('#card-left') : $('#card-right');
      pickedCard.classList.add('picked', 'wrong');
    }
    realCard.classList.add('correct');
  }
  $('#card-left').style.pointerEvents = 'none';
  $('#card-right').style.pointerEvents = 'none';

  // 提示语
  const banner = $('#round-banner');
  if (isCorrect) {
    banner.textContent = `✅ 正确！连对 ×${state.streak}，+${gained} 分`;
    banner.className = 'banner good';
  } else if (wasTimeout) {
    banner.textContent = '⏰ 超时！左边是 ' + (aiLeft ? 'AI 生成' : '真实照片') + ' / 右边是 ' + (aiLeft ? '真实照片' : 'AI 生成');
    banner.className = 'banner bad';
  } else {
    banner.textContent = '❌ 猜错了！' + (aiLeft ? '左边（A）' : '右边（B）') + ' 才是 AI 生成的';
    banner.className = 'banner bad';
  }

  // 延时展示揭示面板
  setTimeout(() => showReveal(), 1100);
}

function showReveal() {
  const cur = state.current;
  showView('reveal');

  const isCorrect = cur.roundResult === 'correct';
  $('#reveal-title').textContent = isCorrect ? '答对了！' : (cur.roundResult === 'timeout' ? '超时了' : '答错了');
  $('#reveal-title').className = isCorrect ? 'reveal-title good' : 'reveal-title bad';

  // 破绽提示（AI 图）
  const flawText = cur.aiFailed
    ? '⚠️ 本轮 AI 图在线生成失败，使用了占位图。请检查网络后重试；本局其余回合不受影响。'
    : ('🤖 假图破绽：' + cur.aiItem.hint);
  $('#reveal-flaw').textContent = flawText;
  $('#reveal-flaw').className = cur.aiFailed ? 'flaw-box warn' : 'flaw-box';

  // 真图小知识
  $('#reveal-truth').textContent = '📷 真实照片：' + cur.real.title + ' — ' + cur.real.hint;

  // 两张对比图（揭示状态）
  const aiSrc = cur.aiFailed ? FALLBACK_AI : (cur.leftIsAi ? $('#img-left').src : $('#img-right').src);
  const realSrc = cur.leftIsAi ? $('#img-right').src : $('#img-left').src;
  $('#reveal-ai-img').src = aiSrc;
  $('#reveal-real-img').src = realSrc;
  $('#reveal-ai-title').textContent = cur.leftIsAi ? '左图（A）是 AI' : '右图（B）是 AI';
  $('#reveal-real-title').textContent = cur.leftIsAi ? '右图（B）是真实照片' : '左图（A）是真实照片';

  // 本轮得分 + 连击
  $('#reveal-score').textContent = isCorrect ? `+${cur.gained} 分` : '+0 分';
  $('#reveal-streak').textContent = isCorrect ? `连对 +${cur.gained} 分，火力全开！` : (cur.roundResult === 'timeout' ? '超时了，连击已重置' : '连击已重置，下次加油');
  const revealStreak2 = $('#reveal-streak2');
  if (revealStreak2) revealStreak2.textContent = `当前连对：${state.streak} · 总得分：${state.score}`;
  $('#reveal-credit').textContent = `真实照片：${cur.real.title}（${cur.real.credit}，${cur.real.license}，via Wikimedia Commons）`;

  // 记录历史
  state.history.push({
    round: state.round + 1,
    result: cur.roundResult,
    gained: cur.gained,
    realTitle: cur.real.title,
    aiPrompt: cur.aiItem.prompt,
    flaw: cur.aiItem.hint,
    aiFailed: cur.aiFailed,
    leftIsAi: cur.leftIsAi,
  });

  $('#btn-next').textContent = (state.round + 1 >= state.totalRounds) ? '查看成绩' : '下一回合';
  $('#btn-next').onclick = () => {
    if (state.round + 1 >= state.totalRounds) {
      renderEnd();
    } else {
      state.round += 1;
      nextRound();
    }
  };
}

/* ------------------------- HUD ------------------------- */

function updateHud() {
  $('#round-label').textContent = `Round ${state.round + 1} / ${state.totalRounds}`;
  $('#score-label').textContent = `Score ${state.score}`;
  $('#streak-label').textContent = `🔥 ${state.streak}`;
}

/* ------------------------- 结束界面 ------------------------- */

function renderEnd() {
  showView('end');
  const total = state.totalRounds;
  const correct = state.correctCount;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  $('#end-title').textContent = pct >= 80 ? '🏆 火眼金睛！' : (pct >= 50 ? '👏 不错的眼力！' : '🧐 继续练习！');
  $('#end-stats').innerHTML =
    `<div class="stat"><span>总分</span><b>${state.score}</b></div>` +
    `<div class="stat"><span>正确率</span><b>${pct}%</b></div>` +
    `<div class="stat"><span>最高连对</span><b>${state.maxStreak}</b></div>`;

  // 逐轮回顾
  const list = $('#history-list');
  list.innerHTML = '';
  state.history.forEach((h) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const cls = h.result === 'correct' ? 'good' : 'bad';
    const badge = h.result === 'correct' ? '✓' : (h.result === 'timeout' ? '⏰' : '✗');
    item.innerHTML =
      `<div class="history-head"><span class="history-badge ${cls}">${badge}</span>` +
      `<span>第 ${h.round} 回合</span>` +
      `<span class="history-score">${h.gained > 0 ? '+' + h.gained : '+0'}</span></div>` +
      `<div class="history-real">真实照片：${h.realTitle}</div>` +
      `<div class="history-flaw">${h.aiFailed ? '（AI 图生成失败）' : '破绽：' + h.flaw}</div>`;
    list.appendChild(item);
  });

  $('#btn-replay').onclick = () => { showView('start'); };
  $('#btn-replay-same').onclick = () => {
    startGame(state.totalRounds, state.timePerRound);
  };
}

/* ------------------------- 初始化 ------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  bindStart();
  showView('start');
});
