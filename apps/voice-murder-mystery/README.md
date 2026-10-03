---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 0bad24a035329c8b74a3cb690c3eef4f_eb22c4cdbc1d11f19ba1525400638852
    ReservedCode1: +ygokvTp6JlCrtApG6QrMjpbnwSQZ8v0jFqqZ9Myu8Qz2mJdSZ4UFCs6ezglxoH0sOK55sZoPI3aANAvXqirfyueDTzQ9Zmm7djijBNdISvm0OIyIR+Z2SbNdB6sS5SfGlzdkD+zr/YPFmZj/QnGyhaAdi3+KFsjw1T2XU5lKh/zOZEARxmUWr1GC5A=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 0bad24a035329c8b74a3cb690c3eef4f_eb22c4cdbc1d11f19ba1525400638852
    ReservedCode2: +ygokvTp6JlCrtApG6QrMjpbnwSQZ8v0jFqqZ9Myu8Qz2mJdSZ4UFCs6ezglxoH0sOK55sZoPI3aANAvXqirfyueDTzQ9Zmm7djijBNdISvm0OIyIR+Z2SbNdB6sS5SfGlzdkD+zr/YPFmZj/QnGyhaAdi3+KFsjw1T2XU5lKh/zOZEARxmUWr1GC5A=
---

# 🕵️ 语音谋杀之谜 · Voice Murder Mystery

> 纯静态侦探语音推理游戏：用语音质问 AI 嫌疑人，从证词矛盾中指认隐藏凶手。
> 无构建依赖，浏览器直接打开即可游玩，也可零配置托管于 GitHub Pages。

## 快速开始

直接用浏览器打开 `index.html` 即可开始（推荐 Chrome / Edge）。

- 打开后先在「案件选择」里挑一桩案件（内置 5 桩完整案件）。
- 阅读**案发简报**（案情 / 时间线 / 证据 / 嫌疑人档案）。
- 进入**问询室**，用**语音**或**打字**逐一向 3 名嫌疑人提问。
- 把关键证词**记入侦探笔记本**，并手动**标记可疑点**。
- 收集足够线索后**发起指控**，查看「矛盾对照表」与案件真相，判定胜负。

## 玩法说明

1. **读简报**：先了解案情全貌——时间线、现场证据、各嫌疑人不在场证明。
2. **问询**：点击麦克风🎙️直接说话提问（Chrome/Edge），或在下方面输入框打字。
   每位嫌疑人都内置 6-10 组关键词应答脚本 + 答非所问的兜底话术，
   **未登录 / 断网时也完整可玩**。
3. **笔记本**：点击「📓 记入笔记本」保存嫌疑人的关键证词；再点「⚠ 标记可疑」
   把对不上的证词标红，嫌疑人页签上会显示小红点。
4. **指控**：认定凶手后发起指控。真凶必有一处致命矛盾；无辜者也有自己的
   小秘密——但他们的秘密与命案无关。
5. **真相**：案件告破后展示「矛盾对照表」，一页看清谁在撒谎、为什么。

## 技术说明

### 纯静态单页应用

- 交付物：`index.html` + `styles.css` + `script.js` + `README.md`
- 零构建依赖：无 npm / 打包步骤；数据与逻辑全部内联在 JS 中
- 本地案件库预置 **5 桩完整案件**（庄园 / 美术馆 / 游轮 / 实验室 / 歌剧院），
  每案 3 名嫌疑人、完整时间线 / 证据 / 矛盾点 / 真相 / 真凶

### 语音输入（自动降级）

- 使用浏览器 **Web Speech API**（`webkitSpeechRecognition`），Chrome / Edge 支持；
- 不支持时自动隐藏麦克风按钮，切换为打字输入框，玩法不中断。

### 嫌疑人 TTS（自动兜底 + 音色区分）

- 优先匿名 GET：`https://gen.pollinations.ai/audio/{encodeURIComponent(文本)}`
  （实测无需登录即返回 `audio/mpeg`）；
- 失败时自动兜底为浏览器 `speechSynthesis`；
- 每名嫌疑人指定不同 **voice / pitch / rate**：沉稳男声、尖锐女声等，
  男声优先匹配 male 系音色，女声优先匹配 female 系音色；
- 顶部 🔊 / 🔇 可随时静音（偏好存 localStorage）。

### 侦探笔记本

- 证词与可疑标记实时存入 **localStorage**（`polli-murder-notes-v1`）；
- 当前调查进度自动存档（`polli-murder-save-v1`），刷新页面可从「继续调查」续玩。

### BYOP 增强（可选，绝不阻塞）

- 点击「BYOP 登录」跳转
  `https://enter.pollinations.ai/authorize?redirect_uri=<当前页URL>&scope=usage&client_id=`
- 回调后从 `location.hash` 中提取 `#api_key=sk_...`，key 仅存**内存 / sessionStorage**，
  并用 `history.replaceState` 立即清除 hash，不落盘、不写日志；
- 登录后可解锁：
  - **AI 自由对答**：嫌疑人对任意问题用 `openai/gpt-5.4-nano`（`gen.pollinations.ai/v1/chat/completions`）
    按人设即兴作答；
  - **AI 生成新案件**：一键生成结构完整的全新案件（自动并入案件库）。
- 未登录、接口 401 或超时：**一律自动回退本地脚本**，游戏流程绝不阻塞。

## 部署到 GitHub Pages

1. 将 `index.html`、`styles.css`、`script.js`、`README.md` 推送到任意 GitHub 仓库；
2. 仓库 `Settings → Pages`：`Source` 选择 `Deploy from a branch`，分支选 `main`，
   目录选 `/ (root)`；
3. 保存后等待 1-2 分钟，访问 `https://<用户名>.github.io/<仓库名>/` 即可游玩。

> 提示：BYOP 登录回调会带上当前页面 URL，部署到线上后自动使用线上地址作为
> `redirect_uri`，本地打开（`file://`）同样可用。

## 浏览器兼容

| 能力 | 兼容性 |
| --- | --- |
| 语音提问（SpeechRecognition） | Chrome / Edge（桌面与 Android） |
| 语音朗读（speechSynthesis 兜底） | Chrome / Edge / Safari / Firefox |
| 远程 TTS（Pollinations） | 需联网；失败自动兜底 |
| 打字提问 / 本地问答脚本 | 全部浏览器，离线可用 |

## 文件结构

```
polli-murder/
├── index.html    # 页面结构与五视图（案件选择/简报/问询/指控/真相）
├── styles.css    # 深色侦探主题、移动端自适应、动画
├── script.js     # 案件库、语音识别、TTS、笔记本、BYOP、游戏状态机
└── README.md     # 本文件
```
*（内容由AI生成，仅供参考）*
