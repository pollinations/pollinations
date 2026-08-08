# 社区模型输入模态声明 — 实现文档

> **Issue**: [#12989](https://github.com/pollinations/pollinations/issues/12989) — "Let community models declare input modalities"
> **关联**: [#12762](https://github.com/pollinations/pollinations/issues/12762) — "Community models `input_modalities` hardcoded to `["text"]`"
> **验证**: 27 个单元测试通过、TypeScript 0 错误、Biome clean

---

## 1. 问题描述

社区模型端点（community endpoints）在 `/text/models` 和 `/v1/models` 目录中**始终**报告 `input_modalities: ["text"]`，无论上游实际接受什么类型的输入。

### 影响

| 影响范围 | 具体表现 |
|----------|----------|
| **目录误导** | 像 `glm-4.6v-flash`（视觉）、`mimo-v2.5`（全模态）等多模态模型被列为纯文本，与其描述自相矛盾 |
| **SDK/工具链** | 检查 `input_modalities` 来决定是否发送图片/音频的 SDK 永远不会向社区模型发起多模态调用 |
| **用户困惑** | 用户无法从目录获知社区模型支持哪些输入类型 |

---

## 2. 根因分析

### 2.1 原始问题

在修复前，`communityModelDefinition()` 在 `shared/community-endpoints.ts` 中硬编码了 `inputModalities: ["text"]`，社区端点创建/编辑流程中没有声明输入模态的途径。

### 2.2 分层根因

```
┌─────────────────────────────────────────┐
│  层 1: 数据库 Schema                      │
│  community_endpoint 表无 input_modalities │
│  列 → 数据无法存储                         │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  层 2: 类型/Runtime                       │
│  CommunityEndpointRuntime 无             │
│  inputModalities 字段 → 数据无法传递       │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  层 3: catalog 端点                       │
│  communityModelDefinition() 硬编码        │
│  "text" → 所有模型都相同                  │
└─────────────────────────────────────────┘
```

---

## 3. 架构与数据流

```
用户界面                        后端                        数据层
─────────                    ─────────                     ──────

┌──────────────┐   POST    ┌─────────────────┐   INSERT   ┌──────────────────┐
│ Dialog UI    │ ────────→ │ community-       │ ────────→ │ D1: community_   │
│ "Accepted    │           │ endpoints route  │           │ endpoint          │
│  inputs"     │           │ (Zod 验证 +      │           │ .input_modalities │
│  [✓text]     │           │  模态约束检查)    │           │  = ["text",       │
│  [✓image]    │           └────────┬────────┘           │     "image"]      │
│  [ audio]    │                    │                    └────────┬─────────┘
│  [ video]    │                    │ SELECT                        │
└──────────────┘                    ▼                               ▼
                            ┌──────────────┐            ┌──────────────────┐
                            │normalizeCEIM()│            │ getCommunity     │
                            │ 空→["text"]  │            │ ModelRegistry    │
                            │ 过滤不支持    │            │ Entries()        │
                            │ 模态         │            └────────┬─────────┘
                            └──────┬───────┘                     │
                                   │                             ▼
                                   ▼                    ┌──────────────────┐
                            ┌──────────────┐            │ communityModel   │
                            │ community    │            │ Definition()     │
                            │ ModelDef     │            │                  │
                            │ .inputMod    │            │ 标准化后的        │
                            │ alities      │            │ inputModalities  │
                            └──────┬───────┘            └────────┬─────────┘
                                   │                             │
                                   ▼                             │
                            ┌──────────────┐                     │
                            │ modelInfo    │ ←───────────────────┘
                            │ FromDef()    │
                            │              │
              ┌─ GET ──→    │ input_mod:   │
              │ /text/models│ ["text",     │
              │ /v1/models  │  "image"]    │
              │ /models     └──────────────┘
              │
              ▼
         ┌────────────────┐
         │ JSON Response  │
         │ {              │
         │  name: "...",  │
         │  input_modalities: 
         │   ["text","image"],
         │  ...           │
         │ }              │
         └────────────────┘
```

---

## 4. 实现细节

### 4.1 数据库迁移 (0042)

**文件**: `enter.pollinations.ai/drizzle/0042_lethal_marvel_apes.sql`

```sql
ALTER TABLE `community_endpoint` ADD `input_modalities` text;
--> statement-breakpoint
UPDATE `community_endpoint`
SET `input_modalities` = CASE
    WHEN `modality` = 'image' AND `supports_image_edits` = 1
        THEN '["text","image"]'
    ELSE '["text"]'
END
WHERE `input_modalities` IS NULL;
```

**向后兼容策略**：
- 图像端点且已探测到支持编辑 → `["text", "image"]`
- 所有其他现有行 → `["text"]`（安全的文本默认值）
- 新行由创建流程显式声明

### 4.2 共享类型与正常化

**文件**: `shared/community-endpoints.ts`

#### 许可的输入模态映射

```typescript
export const COMMUNITY_ENDPOINT_INPUT_MODALITIES = {
    text: MODEL_INPUT_MODALITIES,      // ["text", "image", "audio", "video"]
    image: ["text", "image"],          // 仅文本+图像
} as const;
```

#### 正常化函数

```typescript
export function normalizeCommunityEndpointInputModalities(
    value: readonly ModelInputModality[] | null | undefined,
    endpointModality: CommunityEndpointModality,
): ModelInputModality[] {
    if (!value?.length) return ["text"];  // 空 → 默认文本
    const declared = new Set(value);
    const normalized = COMMUNITY_ENDPOINT_INPUT_MODALITIES[
        endpointModality
    ].filter((modality) => declared.has(modality));
    return normalized.length ? [...normalized] : ["text"];
    // 所有声明被过滤 → 回退到文本
}
```

**三重保护**:
1. `value` 为 `null/undefined/空数组` → `["text"]`
2. 仅保留属于当前端点模态允许集合的模态
3. 过滤后为空 → `["text"]`（安全回退）

#### CommunityEndpointRuntime 类型

```typescript
export type CommunityEndpointRuntime = {
    // ...
    inputModalities: ModelInputModality[] | null;  // DB 行可空
    // ...
};
```

#### communityModelDefinition()

```typescript
const inputModalities = normalizeCommunityEndpointInputModalities(
    endpoint.inputModalities,  // 来自 DB 或显式声明
    modality,
);
return {
    // ...
    inputModalities,  // 直接传递给 ModelDefinition
    // ...
};
```

### 4.3 路由器: 创建与更新

**文件**: `enter.pollinations.ai/src/routes/community-endpoints.ts`

#### Zod Schema

```typescript
const InputModalitySchema = z.enum(MODEL_INPUT_MODALITIES);
const InputModalitiesSchema = z
    .array(InputModalitySchema)
    .min(1);

// Create schema
const CreateEndpointSchema = z.object({
    // ...
    inputModalities: InputModalitiesSchema.optional().default(["text"]),
});

// Update schema
const UpdateEndpointSchema = z.object({
    // ...
    inputModalities: InputModalitiesSchema.optional(),
});
```

#### 验证

```typescript
function enforceCommunityEndpointInputModalities(
    modality: CommunityEndpointModality,
    inputModalities: readonly string[],
): void {
    const permitted = COMMUNITY_ENDPOINT_INPUT_MODALITIES[modality];
    const unsupported = inputModalities.find(
        (input) => !(permitted as readonly string[]).includes(input),
    );
    if (!unsupported) return;
    throw new HTTPException(400, {
        message: `${unsupported} input is not supported for ${modality} models`,
    });
}
```

#### 图像端点探测

文件 `enter.pollinations.ai/src/services/community-endpoint-openai.ts` 测试图像端点时：
- 探测 `/v1/images/generations` → 验证生成能力
- 探测 `/v1/images/edits` → 检测图片输入支持
- 编辑成功 → `inputModalities: ["text", "image"]`
- 编辑失败 → `inputModalities: ["text"]`

### 4.4 前端选择器

**文件**: `enter.pollinations.ai/frontend/src/components/community-endpoints/community-endpoint-dialog.tsx`

```
┌─ "Accepted inputs" ────────────────────────┐
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │ ✓text│  │✓image│  │ audio│  │ video│    │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│                                              │
│  Select every input type supported by        │
│  this model. At least one is required.       │
└──────────────────────────────────────────────┘
```

- 根据 `modality` 动态过滤可选项（text 端点显示全部，image 端点仅 text/image）
- 至少保留 1 个选项
- 模态切换时自动重新正常化

### 4.5 Catalog 端点数据流

**完整数据链路**:

```
DB (input_modalities JSON 列)
  → getCommunityModelRegistryEntries()       [community-models.ts:63]
  → CommunityEndpointRuntime.inputModalities [community-models.ts:106]
  → communityModelDefinition()               [community-endpoints.ts:487-490]
  → normalizeCommunityEndpointInputModalities() [community-endpoints.ts:262-272]
  → ModelDefinition.inputModalities          [community-endpoints.ts:501]
  → modelInfoFromDefinition()                [model-info.ts:119]
  → ModelInfo.input_modalities               [model-info.ts:49]
  → communityEntryToGenerationEntry()        [model-registry.ts:105-128]
  → GET /text/models → entry.info            [proxy.ts:248]
  → GET /v1/models  → entry.info            [proxy.ts:248]

终点: JSON response 包含 input_modalities 字段
```

---

## 5. 错误处理与安全

### 5.1 输入验证层级

| 层级 | 检查 | 失败行为 |
|------|------|----------|
| Zod schema | `ModelInputModality[]` 类型、非空 | 400 错误 |
| 后端 enforce | 模态对应当前 endpoint modality | 400 错误 + 描述消息 |
| normalizer | 过滤未知模态 | 静默回退到 `["text"]` |

### 5.2 安全考量

1. **注入防护**: `inputModalities` 作为 JSON 数组存储，从不进行字符串拼接或 HTML 渲染
2. **权限模型**: 仅端点所有者可修改 `inputModalities`（通过 `POST /my-models` / `POST /:id/update`）
3. **不可变约束**: `COMMUNITY_ENDPOINT_INPUT_MODALITIES` 是 `as const` 常量——只有维护者可更新允许的模态组合
4. **无存储的 XSS**: 值通过 Zod 枚举和 JSON 序列化，确保只存储有效的枚举字符串

---

## 6. 测试覆盖

| 测试 (27 项) | 覆盖内容 |
|---|---|
| **默认行为** | 未声明时默认为 `["text"]`、image 端点默认、空值处理 |
| **显式声明** | 多模态声明保持、image 端点文本+图片通过 |
| **过滤** | 不支持的模态被静默过滤（如 image 端点的 audio） |
| **定价** | flat-rate image、token-priced image、零价、社区价格字段 |
| **Fallback 定价** | 等价位允许、低价允许、任何字段更贵则拒绝 |
| **图片端点计费** | request 模式、tokens 模式、零宽 image、image edits /v1/images/edits |
| **Catalog 输出** | `/image/models` 含 `input_modalities`、`/v1/models` 含 `input_modalities`、text-only 不在 image 目录中 |
| **边缘情况** | 空数组、null 值、所有声明被过滤、模态切换重计算 |

---

## 7. 向后兼容性

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| 创建社区端点（未指定 inputModalities） | N/A | 默认 `["text"]` |
| 创建社区端点（指定 inputModalities） | N/A | 使用声明的值（经正常化） |
| 更新社区端点 | N/A | 可更新 inputModalities |
| 现有 DB 行（迁移后） | (`["text"]`) | 图像+编辑 → `["text","image"]`，其他 → `["text"]` |
| Catalog 输出 | `input_modalities` 缺或 `["text"]` | 正确反映声明的模态 |
| `/v1/images/edits` 出现在 image 端点 | N/A | 仅当 `"image"` ∈ inputModalities |
| 所有现有测试 | 全部通过 | 全部通过 |

---

## 8. 受影响的文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `enter.pollinations.ai/drizzle/0042_lethal_marvel_apes.sql` | 新增 | 迁移：添加 `input_modalities` 列 |
| `shared/community-endpoints.ts` | 修改 | `CommunityEndpointRuntime`、`normalizeCEIM()`、`communityModelDefinition()` |
| `shared/db/better-auth.ts` | 修改 | Drizzle schema: `inputModalities` JSON 列 |
| `enter.pollinations.ai/src/routes/community-endpoints.ts` | 修改 | Create/update schema + 验证 |
| `enter.pollinations.ai/frontend/.../community-endpoint-dialog.tsx` | 修改 | "Accepted inputs" 选择器 UI |
| `enter.pollinations.ai/frontend/.../types.ts` | 修改 | 表单状态 + payload 序列化 |
| `enter.pollinations.ai/src/services/community-endpoint-openai.ts` | 修改 | 图像探测返回 inputModalities |
| `gen.pollinations.ai/src/community-models.ts` | 修改 | 读取 + 传递 inputModalities |
| `gen.pollinations.ai/src/model-registry.ts` | 修改 | 图像端点条件公开 |
| `gen.pollinations.ai/src/community-endpoints.test.ts` | 修改 | 27 个测试：默认、声明、过滤、定价、catalog |

---

## 9. 验证

| 验证项 | 结果 | 说明 |
|--------|------|------|
| TypeScript `tsc --noEmit` | ✅ 0 错误 | 完整类型检查 |
| Vitest (worker-pool) | ✅ 27/27 通过 | 含 miniflare、D1 迁移 |
| Biome `check --write` | ✅ No fixes | 代码风格一致 |
| 手动审查 | ✅ 通过 | 所有数据路径已追踪 |

---
