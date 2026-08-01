# 实现文档：管理员控制的面板状态通知

**Issue**: [#12585](https://github.com/pollinations/pollinations/issues/12585)  
**父 Issue**: [#10482](https://github.com/pollinations/pollinations/issues/10482)

## 概述

为 enter.pollinations.ai 面板添加管理员控制的状态通知横幅。管理员可以发布全站通知（如服务中断、维护、重大变更等），用户在面板每个页面顶部都能看到。通知可暂时关闭，但在管理员清除之前刷新页面会重新显示。

## 架构

```
┌─────────────────────────────────────────────────┐
│                  Dashboard Shell                 │
│  ┌───────────────────────────────────────────┐  │
│  │         StatusNoticeBanner                 │  │
│  │  • 请求 GET /api/status-notice            │  │
│  │  • 每 60 秒轮询                           │  │
│  │  • 通过 localStorage 关闭 (按 updatedAt)  │  │
│  │  • severity → Alert intent 映射           │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │              页面内容                      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   GET /api/status-notice   PUT/DELETE /api/admin/status-notice
   (公开)                   (仅管理员, Bearer PLN_ENTER_TOKEN)
          │                       │
          └───────────┬───────────┘
                      ▼
              Workers KV
         key: "status-notice:active"
```

## 修改的文件

### 新增文件

| 文件 | 说明 |
|------|------|
| `enter.pollinations.ai/src/routes/status-notice.ts` | 后端路由：GET/PUT/DELETE 端点，含 Zod 校验、KV 持久化、幂等性、链接安全 |
| `enter.pollinations.ai/frontend/src/components/status-notice-banner.tsx` | React 横幅组件：含轮询、localStorage 关闭、严重程度映射 |
| `enter.pollinations.ai/test/status-notice.test.ts` | 28 个单元测试，覆盖所有路由、认证、校验、CRUD、边界情况 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `enter.pollinations.ai/src/frontend-api.ts` | 注册公开 GET `/status-notice` 路由 |
| `enter.pollinations.ai/src/routes/admin.ts` | 注册管理员 PUT/DELETE `/status-notice` 路由（复用已有 Bearer 认证中间件） |
| `enter.pollinations.ai/frontend/src/components/layout/dashboard-shell.tsx` | 在主内容区顶部挂载 `<StatusNoticeBanner />` |
| `enter.pollinations.ai/.dev.vars.test` | 添加 `PLN_ENTER_TOKEN` 供测试环境管理员认证使用 |

## 后端设计

### API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/status-notice` | 无 | 返回 `{ notice: StatusNotice \| null }` |
| `PUT` | `/api/admin/status-notice` | Bearer `PLN_ENTER_TOKEN` | 创建或更新通知 |
| `DELETE` | `/api/admin/status-notice` | Bearer `PLN_ENTER_TOKEN` | 清除通知 |

### 数据结构 (KV 键: `status-notice:active`)

```typescript
interface StatusNotice {
  message: string;          // 必填, 1–500 字符
  severity: "info" | "warning" | "critical";  // 默认: "warning"
  linkUrl?: string;         // 可选, 必须是 http(s)
  linkLabel?: string;       // 可选, 最多 100 字符, 需要 linkUrl
  updatedAt: string;        // ISO 8601 时间戳
}
```

### 关键设计决策

1. **KV 持久化** — 使用现有 Workers KV 绑定的单个键 `status-notice:active`。Worker 重启后数据不丢失。无需数据库迁移。

2. **幂等 PUT** — 当请求内容与已存储通知完全相同时，返回 200 但不写入 KV，保留原有 `updatedAt`。这防止了无内容变更的管理员保存导致用户关闭状态失效。

3. **链接安全** — `linkUrl` 通过 `new URL(value)` 验证，必须使用 `http:` 或 `https:` 协议。拒绝 `javascript:`、`data:`、`mailto:` 和相对 URL。

4. **损坏 KV 容错** — 如果 KV 值损坏或格式错误，公开 GET 返回 `{ notice: null }` 而非报错。

5. **管理员认证** — PUT 和 DELETE 挂载在已有的 `adminRoutes` 上，复用其 Bearer token 中间件（校验 `PLN_ENTER_TOKEN`）。无重复认证逻辑。

6. **Zod 校验** — 所有请求体均通过 Zod schema 校验，含 `.refine()` 处理跨字段规则（如 `linkLabel` 需要 `linkUrl`）。

## 前端设计

### StatusNoticeBanner 组件

- **数据获取**: 挂载时及每 60 秒通过 `setInterval` 调用 `GET /api/status-notice`。
- **可见性**: 无通知、已关闭或初始加载中时隐藏。
- **关闭机制**:
  - 关闭的 `updatedAt` 存储在 `localStorage` 中，键为 `pollinations-status-notice-dismissed`。
  - 当管理员发布新通知（不同 `updatedAt`）时横幅重新显示。
  - 同一通知的关闭状态在页面刷新后保持。
- **严重程度映射**:
  - `info` → Alert `intent="info"` (中性)
  - `warning` → Alert `intent="warning"` (黄色警告)
  - `critical` → Alert `intent="danger"` (红色) + 脉冲动画
- **链接支持**: 可选外部链接以 ghost 按钮样式渲染，含 `rel="noopener noreferrer"`。
- **无障碍**: 使用 `role="status"`（危险级别为 `role="alert"`），关闭按钮有 `aria-label`，支持 focus-visible 轮廓。
- **设计系统**: 使用 `@pollinations/ui` 的 `Alert`、`Button`、`IconButton`、`XIcon` 组件。

## 测试覆盖 (28 个测试)

| 分类 | 数量 | 覆盖内容 |
|------|------|----------|
| GET | 3 | 无通知返回 null、有通知返回数据、清除后返回 null |
| 认证 | 4 | PUT 无/错误 token、DELETE 无/错误 token |
| 校验 | 14 | message 缺失/空/超长、边界值、severity 无效值、三种有效值、javascript:/data:/mailto:/相对URL 拒绝、有效 http(s) URL、linkLabel 边界值、无 linkUrl 的 linkLabel、JSON 格式错误 |
| CRUD 流程 | 1 | 完整 发布→读取→更新→读取→清除→读取 循环 |
| 幂等性 | 2 | 相同内容保留 updatedAt、变更内容更新 updatedAt |
| 边界情况 | 4 | 无通知时 DELETE 成功、KV 多次读取一致、默认 severity、最小化通知 |

## 使用方法

### 发布通知
```bash
curl -X PUT https://enter.pollinations.ai/api/admin/status-notice \
  -H "Authorization: Bearer $PLN_ENTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"图片生成服务目前有延迟","severity":"warning","linkUrl":"https://status.pollinations.ai","linkLabel":"状态页面"}'
```

### 清除通知
```bash
curl -X DELETE https://enter.pollinations.ai/api/admin/status-notice \
  -H "Authorization: Bearer $PLN_ENTER_TOKEN"
```

### 查看当前通知
```bash
curl https://enter.pollinations.ai/api/status-notice
```
