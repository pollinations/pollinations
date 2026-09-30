---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 0bad24a035329c8b74a3cb690c3eef4f_ec864345bc1d11f19ba1525400638852
    ReservedCode1: +RVmsTMyt1jXsuV782qLCHBGeMiKBi10AB2NdyAQibhasz+sa9Jh4FSzbw7+6lT3yHeIEdZck95sl8ffH64VxJgDNaPq50ItA/ZkgL5AXKgqTZYJNsyQBfARSElsMP+CLjiFYd/eiBCL785FgIi9lofmSVY57Sw+k9mPIF4TJBDF/MOnH40RvpXMJpI=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 0bad24a035329c8b74a3cb690c3eef4f_ec864345bc1d11f19ba1525400638852
    ReservedCode2: +RVmsTMyt1jXsuV782qLCHBGeMiKBi10AB2NdyAQibhasz+sa9Jh4FSzbw7+6lT3yHeIEdZck95sl8ffH64VxJgDNaPq50ItA/ZkgL5AXKgqTZYJNsyQBfARSElsMP+CLjiFYd/eiBCL785FgIi9lofmSVY57Sw+k9mPIF4TJBDF/MOnH40RvpXMJpI=
---

# 明信片世界 · Postcard World

> 一句话生成明信片视图，点击热点，一步步探索你的小世界。

一个**纯静态**的单页探索游戏：输入一句话描述一个场景，立即生成一张水彩手绘风格的明信片；明信片上有 2-3 个可点击的探索热点（门、窗、路、桥、梯、洞…），点击热点就会生成"下一张明信片"，由此串联成一条不断延伸的旅程。

## 玩法

1. 打开 `index.html`（或 GitHub Pages 地址）。
2. 在出发大厅输入一句话，比如"雨后的山间小镇，石板路泛着光"。
3. 稍等片刻，收到第一张明信片；画面上的发光圆点是可探索热点，点任意一个继续。
4. 顶部面包屑记录你走过的每一站；「探索地图」可回看完整路径，点击任一站可跳回。
5. 「分享旅程」会生成一个 `?path=...` 链接，复制给朋友，对方打开即可按同一路径重放探索。
6. 点「重新出发」可从当前场景延伸出新的旅程分支。

## 核心特性

- **一句话出发**：任意场景描述 → 生成 768×512 水彩手绘明信片（匿名 Pollinations 图片接口，无需登录）。
- **热点探索**：每个视图 3 个热点，本地词库 22 种探索元素（老木门 / 林间小路 / 石阶 / 雾中拱桥 / 阁楼天窗 / 灯塔步道…）随机组合，每个热点带一段"继续探索"叙事文案。
- **视觉连贯**：所有生成请求统一追加水彩手绘 / 复古旅行插画 / 柔和暖色调风格后缀，连续视图风格统一。
- **面包屑地图**：localStorage 持久化已访问场景（标题 + 图片 + 描述），地图视图可视化整条探索路径。
- **URL 路径重放**：整条 prompt 链编码进 `?path=` 参数，分享即可原路径重放；重放时固定 seed，画面保持一致。
- **BYOP 增强（可选）**：右上角登录 Pollinations（`enter.pollinations.ai` fragment flow），登录后热点改为由 `openai/gpt-5.4-nano` 视觉模型分析当前明信片图片，返回**真实位置与描述**的热点；未登录或接口 401 自动降级为本地词库热点，绝不阻塞游玩。
- **移动端适配**：暖色旅行主题界面，窄屏自适应，图片懒加载 + 明信片加载动画。

## 部署（GitHub Pages）

本项目为纯静态单页应用（HTML + CSS + JS，零构建、零依赖），任意静态托管均可直接运行：

1. 将 `index.html`、`styles.css`、`script.js`、`README.md` 提交到 GitHub 仓库。
2. 仓库 Settings → Pages → Source 选择分支 `main` 与根目录 `/`，保存。
3. 数分钟后即可通过 `https://<用户名>.github.io/<仓库名>/` 访问。

本地验证：双击 `index.html` 即可离线游玩（仅图片生成与 BYOP 登录需要联网）。

## 技术说明

| 项 | 说明 |
|---|---|
| 图片生成 | `https://image.pollinations.ai/prompt/{encodeURIComponent(prompt)}?width=768&height=512&nologo=true&seed={seed}`（匿名可用） |
| 视觉热点（登录后） | `https://gen.pollinations.ai/v1/chat/completions`，模型 `openai/gpt-5.4-nano`，多模态图文输入 |
| 登录方式 | `https://enter.pollinations.ai/authorize?redirect_uri={页面URL}&scope=usage&client_id=`，回调后从 `location.hash` 读取 `api_key=sk_...`，仅存内存（刷新前有效） |
| 持久化 | `localStorage`：`polli-postcard-path-v1` 存探索路径；`sessionStorage`：BYOP key |
| 路径重放 | `?path=` + Base64(JSON 场景链)，解码后按序重建并固定 seed |

## 目录结构

```
polli-postcard/
├── index.html   # 页面骨架（大厅 / 明信片 / 地图 三视图）
├── styles.css   # 暖色旅行主题样式
├── script.js    # 核心逻辑（生成 / 热点 / 地图 / 重放 / BYOP）
└── README.md    # 本说明
```
*（内容由AI生成，仅供参考）*
