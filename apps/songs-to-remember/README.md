---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 0bad24a035329c8b74a3cb690c3eef4f_ed5c2a3abc1d11f1a1bf52540064ee0f
    ReservedCode1: YukDrw5RHgQ3BYkk53AkbnU7DjLllcNCx9K1zUJJArTJATQHz/S9j5b7B/dTqx9D4XmTbIp+uBYGXtD1djEoLFyA7bhQrX76HGUQPYOWexrMttQJlNMr3UvwukzNJz5rKVXAUF6rSbwExXIReVS47jYUgTOl5ad2I48C93Zgm/mS3bKPV8fNsZBz70g=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 0bad24a035329c8b74a3cb690c3eef4f_ed5c2a3abc1d11f1a1bf52540064ee0f
    ReservedCode2: YukDrw5RHgQ3BYkk53AkbnU7DjLllcNCx9K1zUJJArTJATQHz/S9j5b7B/dTqx9D4XmTbIp+uBYGXtD1djEoLFyA7bhQrX76HGUQPYOWexrMttQJlNMr3UvwukzNJz5rKVXAUF6rSbwExXIReVS47jYUgTOl5ad2I48C93Zgm/mS3bKPV8fNsZBz70g=
---

# 记忆歌曲 · Memory Song

> 粘贴知识点、公式、单词表，自动变成一首朗朗上口的短歌，边唱边记。

一个**纯静态**的学习辅助应用：把你的学习内容拆句、编曲，生成一首有主歌-副歌-桥段结构的短歌；支持试听（匿名音频合成，失败自动语音朗读兜底）、五种曲风、歌词逐行高亮播放、填空测验与个人学习播放列表。

## 玩法

1. 打开 `index.html`（或 GitHub Pages 地址）。
2. 在"粘贴你的学习内容"中输入知识点 / 公式 / 单词表（用分号或换行分隔多条）。
3. 选择曲风（童谣 / 流行 / 嘻哈 / 民谣 / 摇滚）。
4. 点「✨ 谱曲成歌」生成歌词，进入歌词页。
5. 点「▶ 播放」试听：逐行高亮同步滚动；匿名音频失败时自动降级浏览器语音朗读。
6. 点「🧩 填空测验」：歌词关键词被挖空，作答后交卷评分，答对的词在歌词中黄色高亮。
7. 点「💾 存入播放列表」保存歌曲，随时重听 / 删除 / 导出文本。

## 核心特性

- **本地歌词引擎（匿名可用）**：自动拆句 → 套用曲式模板（主歌 → 副歌 → 主歌 → 桥段 → 副歌重复），副歌使用重复钩子句（"啦啦啦 记住啦"等），每风格独立句式与节奏提示词。
- **五种曲风**：童谣 / 流行 / 嘻哈 / 民谣 / 摇滚，不同模板改变句式、钩子与音频节拍描述。
- **试听**：匿名 `gen.pollinations.ai/audio/{歌词}` 生成音频（实测返回 audio/mpeg）；失败自动 speechSynthesis 中文朗读兜底。
- **逐行高亮播放**：播放时歌词逐行高亮推进，点击任意行可定位。
- **填空测验**：自动从歌词事实行挖出关键词生成 3 道 4 选 1 题，交卷自动评分并高亮正确位置。
- **学习播放列表**：localStorage 持久化全部歌曲（知识点 + 歌词 + 音频地址），可播放 / 测验 / 删除 / 导出单首或全部为 `.txt`。
- **BYOP 增强（可选）**：登录后由 `openai/gpt-5.4-nano` 生成押韵专业歌词，并用 lyria 音频模型（`google/lyria-3.5`，失败回退 `google/lyria-3-clip-preview`，POST `/v1/audio/speech`）生成带人声的完整歌曲；未登录或 401 自动降级本地模板与匿名音频/TTS，绝不阻塞。
- **学习向界面**：浅色纸白 + 墨蓝双色主题，移动端自适应。

## 部署（GitHub Pages）

纯静态单页应用（HTML + CSS + JS，零构建、零依赖）：

1. 将 `index.html`、`styles.css`、`script.js`、`README.md` 提交到 GitHub 仓库。
2. 仓库 Settings → Pages → Source 选择分支与根目录，保存。
3. 通过 `https://<用户名>.github.io/<仓库名>/` 访问。

本地验证：双击 `index.html` 即可使用（试听与 BYOP 需要联网）。

## 技术说明

| 项 | 说明 |
|---|---|
| 匿名试听 | `https://gen.pollinations.ai/audio/{encodeURIComponent(歌词)}`（返回 audio/mpeg） |
| TTS 兜底 | Web Speech API `speechSynthesis`（zh-CN） |
| AI 歌词（登录后） | `https://gen.pollinations.ai/v1/chat/completions`，模型 `openai/gpt-5.4-nano` |
| AI 人声歌曲（登录后） | `https://gen.pollinations.ai/v1/audio/speech`，模型 `google/lyria-3.5` / `google/lyria-3-clip-preview` |
| 登录方式 | `https://enter.pollinations.ai/authorize?redirect_uri={页面URL}&scope=usage&client_id=`，回调后从 `location.hash` 读取 `api_key=sk_...`，仅存内存（刷新前有效） |
| 持久化 | `localStorage`：`polli-song-library-v1` 存播放列表；`sessionStorage`：BYOP key |
| 导出 | Blob + 下载 `.txt` |

## 目录结构

```
polli-song/
├── index.html   # 页面骨架（写歌 / 歌词页 / 播放列表）
├── styles.css   # 学习向浅色双色主题
├── script.js    # 核心逻辑（编曲 / 试听 / 测验 / 播放列表 / BYOP）
└── README.md    # 本说明
```
*（内容由AI生成，仅供参考）*
