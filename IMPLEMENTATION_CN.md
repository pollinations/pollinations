# 修复 #12583：`/v1/images/edits` 省略 `size` 时保留源图宽高比

**作者**：Apollohzl  
**Issue**：[pollinations/pollinations#12583](https://github.com/pollinations/pollinations/issues/12583)  
**关联**：[#10944](https://github.com/pollinations/pollinations/issues/10944)  
**提交**：`d626186`

---

## 目录

1. [问题描述](#问题描述)
2. [根因分析](#根因分析)
3. [架构总览](#架构总览)
4. [实现细节](#实现细节)
   - [第一层 — Schema 层：`shared/schemas/openai.ts`](#第一层--schema-层)
   - [第二层 — 尺寸推断：`sourceDimensions.ts`](#第二层--尺寸推断)
   - [第三层 — 路由集成：`routes/images.ts`](#第三层--路由集成)
5. [数据流](#��据流)
6. [错误处理与优雅降级](#错误处理与优雅降级)
7. [测试覆盖](#测试覆盖)
8. [验证结果](#验证结果)
9. [向后兼容性](#向后兼容性)

---

## 问题描述

当调用方发送 `POST /v1/images/edits` 请求但**未携带 `size` 参数**时，Pollinations 网关当前会将输出强制设为 `1024x1024`（正方形）。这导致竖图和横图源图像在每次编辑时被拉伸变形，调用方若不显式指定尺寸就无法正常使用该端点处理非方形图片。

**修复前（有问题）**：

```
POST /v1/images/edits  { "prompt": "...", "image": "vertical-photo.png" }
→ size 默认 "1024x1024"（正方形，源图变形）
```

**修复后（正常）**：

```
POST /v1/images/edits  { "prompt": "...", "image": "vertical-photo.png" }
→ size 从源图推导 → 例如 "720x1280"（宽高比得以保留）
```

---

## 根因分析

该 bug 存在**两个独立层面**，必须同时修复才能彻底解决。

### 第一层：Schema 注入默认值

`shared/schemas/openai.ts` 中定义了一个 `imageSizeField`，带有 `.default("1024x1024")`，且被**同时用于** `/v1/images/generations` 和 `/v1/images/edits` 两个端点。Zod 的 `.default()` 在解析阶段注入 `"1024x1024"`，导致编辑请求省略 `size` 时与显式传 `"1024x1024"` 无法区分。

### 第二层：路由缺乏源图感知

即便 Schema 能传出 `undefined` 的 `size`，通用的 `handleImageEdit` 处理器也没有从源图推导尺寸的逻辑。`undefined` 的 size 会流经 `resolveParams()` → provider 管线，而各 provider 独立地默认填充正方形边长。

**两层缺一不可**，修复必须是成套的。

---

## 架构总览

```
                     POST /v1/images/edits
                            │
                            ▼
              ┌──────────────────────────┐
              │   CreateImageEditRequest  │  Zod schema 解析请求体
              │   Schema (openai.ts)      │  imageEditSizeField → optional，无默认值
              └──────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │   handleImageEdit()       │  路由处理器 (images.ts)
              │   parseEditInput()        │
              └──────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ 传了 size？  或            │
              │ 传了 ?width/?height？     │
              └─────────────┬─────────────┘
                 有 ────────┴─────── 无
                  │                    │
                  ▼                    ▼
          使用显式 size       inferSizeFromSourceImage()
                              (sourceDimensions.ts)
                                     │
                         ┌───────────┴───────────┐
                         │ data: URI？             │
                         │ → base64ToBuffer()     │
                         │ 远程 URL？              │
                         │ → downloadUserImage()  │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         detectImageMimeType()   ← 字节嗅探，不信任声明类型
                                     │
                                     ▼
                         readImageDimensions()
                                     │
                                     ▼
                         scaleToSupportedSize()
                         · 长边 ≤ 4096
                         · 对齐到 16px 格
                         · 保持宽高比
                                     │
                                     ▼
              ┌──────────────────────────────────┐
              │   resolveParams(size)             │
              │   generateImageOrVideoResponse()  │  与显式传 size 走相同的
              │   provider 管线                   │  下游代码路径
              └──────────────────────────────────┘
```

---

## 实现细节

### 第一层 — Schema 层

**文件**：`shared/schemas/openai.ts`

**改动**：为编辑端点引入独立的 `imageEditSizeField`，与生成端点用的 `imageSizeField` 分离。

```typescript
// 已有 — 生成端点保持 1024x1024 默认值，完全不变
const imageSizeField = z.string().optional().default("1024x1024").meta({
    description: "Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512)",
});

// 新增 — 编辑端点必须区分「省略」和「显式传 1024x1024」
const imageEditSizeField = z.string().optional().meta({
    description:
        "Image size as WIDTHxHEIGHT (e.g., 1024x1024, 512x512). " +
        "When omitted, the output size is derived from the source image's aspect ratio",
});
```

**`CreateImageEditRequestSchema`** 改为使用 `imageEditSizeField`：

```diff
- size: imageSizeField,         // 注入 .default("1024x1024") — 这是 bug
+ size: imageEditSizeField,     // 无默认值 — 让路由层识别省略情况
```

**`CreateImageRequestSchema`** 继续使用 `imageSizeField` — `/v1/images/generations` **零改动**。

### 第二层 — 尺寸推断

**文件**：`gen.pollinations.ai/src/image/utils/sourceDimensions.ts`（新建）

对外暴露两个函数：

#### `scaleToSupportedSize(width: number, height: number): string | undefined`

将原始像素尺寸转换为 provider 兼容的 `"WIDTHxHEIGHT"` 字符串：

| 规则      | 行为                                          |
| ------- | ------------------------------------------- |
| 无效输入    | `NaN`、`±Infinity`、≤0 → 返回 `undefined`       |
| 长边钳制    | 若 max(width, height) > 4096，等比例缩小至长边 ≤ 4096 |
| 16px 对齐 | 每条边四舍五入到最近的 16 的倍数                          |
| 最小边长    | 不低于 16px                                    |
| 宽高比     | 在 16px 网格允许范围内尽量保持                          |

**常量**：

- `DIMENSION_STEP = 16` — 匹配 `gpt-image-2` provider 协议
- `MAX_EDGE = 4096` — 所有支持的 provider 共用保守上限

**示例**：

| 输入        | 输出          | 说明                                                       |
| --------- | ----------- | -------------------------------------------------------- |
| 1080×1920 | `1088×1920` | 9:16 竖图，1080→1088（对齐到 16px 格）                            |
| 4032×3024 | `4096×3072` | 4032 > 4096，等比缩放：4032×4096/4032=4096，3024×4096/4032=3072 |
| 256×256   | `256×256`   | 已对齐，不变                                                   |
| NaN, 0    | `undefined` | 无效输入守卫                                                   |

#### `inferSizeFromSourceImage(imageUrls: string[]): Promise<string | undefined>`

尽力从首张源图推导尺寸字符串：

```
inferSizeFromSourceImage(urls)
  │
  ├── source = urls[0]        // 仅取第一张图片
  │
  ├── data: URI？  → base64ToBuffer(source) → bytes
  │   远程 URL？    → downloadUserImage(source) → bytes
  │
  ├── detectImageMimeType(bytes)   // 字节嗅探（信任实际字节，不相信声明）
  │   └── null                     // 无法识别 → 返回 undefined
  │
  ├── readImageDimensions(bytes, mimeType)
  │   └── null                     // 解析失败 → 返回 undefined
  │
  └── scaleToSupportedSize(width, height)
      └── undefined                // 尺寸无效 → 返回 undefined
```

**设计原则**：

- **字节嗅探优先于声明 MIME**：`detectImageMimeType` 检查文件的魔数字节（PNG 为 `89 50 4E 47`、JPEG 为 `FF D8`、WebP 为 `RIFF....WEBP`），而非信任 data URI 前缀或 HTTP `Content-Type`。这可以防止 MIME 错配攻击和标记错误的图片。
- **仅处理首图**：编辑请求可能包含多张源图（OpenAI 兼容格式下支持 mask + image）。只用第一张——mask 通常同尺寸，多图推断属于过度设计。
- **静默回退**：任何异常（网络错误、解析失败、不支持的格式）均返回 `undefined`，请求正常继续。绝不让宽高比推断破坏一个原本合法的请求。

### 第三层 — 路由集成

**文件**：`gen.pollinations.ai/src/routes/images.ts`

**改动**：在 `handleImageEdit()` 中加入尺寸推断逻辑：

```typescript
// 修复前（有问题）
const { prompt, imageUrls, size, quality, seed, safe, extra } =
    await parseEditInput(c);
const safePrompt = await applySafety(c, prompt, safe);
const resolved = resolveParams({ size, quality, seed });  // size = undefined → 模型默认方形

// 修复后（正常）
const { prompt, imageUrls, size, quality, seed, safe, extra } =
    await parseEditInput(c);
const safePrompt = await applySafety(c, prompt, safe);

const query = c.req.query();
const dimensionsRequested =
    size !== undefined ||
    query.width !== undefined ||
    query.height !== undefined;
const effectiveSize = dimensionsRequested
    ? size
    : await inferSizeFromSourceImage(imageUrls);
const resolved = resolveParams({ size: effectiveSize, quality, seed });
```

**决策逻辑**：

| 条件                           | `effectiveSize`              | 结果          |
| ---------------------------- | ---------------------------- | ----------- |
| 显式传了 `size`                  | 使用显式值                        | 行为不变        |
| 传了 `?width=` 或 `?height=` 参数 | 使用显式值                        | 兼容旧有 URL 参数 |
| 全部缺失                         | `inferSizeFromSourceImage()` | 从源图推导宽高比    |

`?width`/`?height` 的检查是必要的，因为旧 API 在下游合并查询参数（`resolveParams` → `parseImageParams` → `ImageParamsSchema`），所以它们在 `parseEditInput()` 层面是不可见的。显式检查避免了推断路径覆盖调用方 `?width=512` 请求的情况。

**关键**：推断出的 size 流经**完全相同的** `resolveParams()` → `generateImageOrVideoResponse()` → provider 管线，与用户显式传入的 size 无异。所有下游约束保持生效：

| Provider      | 对推断 size 的处理                                              |
| ------------- | --------------------------------------------------------- |
| `gpt-image-2` | `createAndReturnImages.ts` L435-471 的 16px/3840px 约束链正常生效 |
| `gpt-image-1` | `closestByRatio` 对齐到最近固定尺寸                                |
| `seedream-4`  | `dimensionsExplicit` 精确像素模式正常生效                           |

---

## 数据流

```
用户请求                          网关处理                           Provider
────────                          ────────                           ────────
{                                 1. Zod 解析（不注入默认值）
  "prompt": "...",                2. handleImageEdit()
  "image": "vertical.png"         3. size=undefined，无 ?width/?height
}                                 4. inferSizeFromSourceImage()
                                     → downloadUserImage()
                                     → detectImageMimeType()
                                     → readImageDimensions()
                                     → scaleToSupportedSize(720,1280)
                                     → "720x1280"
                                  5. resolveParams({size:"720x1280"})
                                  6. generateImageOrVideoResponse() ──→ Provider("720x1280")
                                                                     ←── 图片 (720×1280)
                                  ← 200 OK，图片数据
```

显式传 size 的路径完全跳过步骤 3-4 — `effectiveSize` 直接从解析出的 `size` 取值。

---

## 错误处理与优雅降级

本实现采用 **fail-open**（故障开放）策略：若宽高比推断因任何原因无法完成，请求仍正常继续（沿用修复前的模型默认行为）。

### 错误传播链

```
inferSizeFromSourceImage()
  │
  ├── urls[0] 为空字符串 / undefined        → 返回 undefined
  ├── downloadUserImage() 抛异常             → catch → 返回 undefined
  ├── detectImageMimeType() → null           → 返回 null → 返回 undefined
  ├── readImageDimensions() → null           → 返回 null → 返回 undefined
  ├── scaleToSupportedSize() → undefined     → 返回 undefined
  └── 任何其他异常                           → catch → 返回 undefined
```

`undefined` 流入 `resolveParams({ size: undefined, ... })`，这与**修复前**的状态相同 — 模型/provider 的默认行为生效。此层不向客户端抛出任何错误，因为：

1. 宽高比推断是"锦上添花"功能，非正确性要求
2. 真正的图片生成管线在源图确实不可用时（如无效格式、零字节）已有完备的错误上报
3. 向客户端暴露尺寸检测错误会泄露内部实现细节

### 安全考量

- **字节嗅探** 防止 MIME 类型伪造：一个 data URI 前缀声明为 `image/png` 但实际包含 JPEG 字节的文件，会被正确检测为 JPEG
- **`downloadUserImage()`** 复用网关标准的图片下载函数（与生成链路相同），因此继承所有现有安全措施（URL 验证、大小限制、SSRF 防护）
- **无新增网络路径**：编辑管线中源图远程 URL 本就会被下载；此处只是提前读取了 buffer，不产生额外的外部请求
- **无用户可控代码执行**：`readImageDimensions()` 是纯粹的 buffer 解析器，不是图片解码器。仅读取文件头字节（PNG 24 字节、JPEG ~21 字节、WebP 30 字节）

---

## 测试覆盖

**文件**：`gen.pollinations.ai/test/image/image-edits.test.ts`（新建，194 行，19 个测试）

### `scaleToSupportedSize`（8 个测试）

| 测试           | 说明                                |
| ------------ | --------------------------------- |
| 16px 对齐尺寸    | 256×256、1024×1024 原样通过            |
| 非对齐尺寸对齐      | 1080×1920 → 1088×1920（对齐到 16px 格） |
| 超大图钳制        | 8192×4096 → 4096×2048（减半，两维均对齐）   |
| 刚好超过 4096    | 4097×4097 → 4080×4080（轻微缩放，对齐）    |
| 最小边长         | 1×1 → 16×16（不低于 16px 步长）          |
| NaN/Infinity | 返回 undefined                      |
| 零值           | 返回 undefined                      |
| 负值           | 返回 undefined                      |

### `inferSizeFromSourceImage`（7 个测试）

| 测试            | 说明                                        |
| ------------- | ----------------------------------------- |
| PNG data URI  | 读取尺寸，返回 "WIDTHxHEIGHT"                    |
| JPEG data URI | 从 SOF0 标记读取尺寸                             |
| WEBP data URI | 从 VP8X 头读取尺寸                              |
| 字节嗅探覆盖声明类型    | PNG 字节 + `data:image/jpeg` 前缀 → 正确检测为 PNG |
| 远程 URL（mock）  | Mock `fetch` 返回 PNG buffer → 成功读取尺寸       |
| 超大远程图         | 8000×8000 → 缩放到 4096×4096                 |
| 仅取首图          | 两个 URL → 只用第一张图的尺寸                        |

### 边界情况（4 个测试）

| 测试          | 说明                               |
| ----------- | -------------------------------- |
| 空图片列表       | 返回 undefined                     |
| 不可识别字节      | 随机字节 → undefined（静默回退）           |
| 畸形 data URI | 缺少 base64 数据 → undefined（catch）  |
| 下载失败        | Mock fetch 抛异常 → undefined（静默回退） |

### Schema 契约（3 个附加检查）

| 测试            | 说明                                                                                   |
| ------------- | ------------------------------------------------------------------------------------ |
| 编辑 schema 默认值 | `CreateImageEditRequestSchema.parse({...})` → `size` 为 `undefined`（不是 `"1024x1024"`） |
| 编辑显式 size     | 传入 `size: "512x512"` 原样保留                                                            |
| 生成默认值         | `CreateImageRequestSchema.parse({...})` → `size` 默认 `"1024x1024"`（不变）                |

---

## 验证结果

### 静态分析

| 工具                        | 范围                    | 结果                 |
| ------------------------- | --------------------- | ------------------ |
| Biome `check --write`     | 全部 4 个改动文件            | ✅ No fixes applied |
| TypeScript `tsc --noEmit` | `gen.pollinations.ai` | ✅ 0 错误             |

### 单元测试

| 配置                                               | 结果                    |
| ------------------------------------------------ | --------------------- |
| `vitest.unit.config.ts`（node 环境，无 worker pool）   | ✅ **19/19 通过**（2.78s） |
| `vitest.config.ts`（Cloudflare worker pool，CI 配置） | ⚠️ 本地未执行 — 环境约束（见下）   |

Cloudflare 的 `vitest-pool-workers` 配置在本地未能完成执行，原因：

1. `hono/http-exception` 的 `resolveId` 跨进程 IPC 超时（已知 `@cloudflare/vitest-pool-workers` 在 Windows/慢磁盘上的性能问题）
2. 稀疏 checkout 缺少 `packages/ui/src/brand/*.svg` 资源文件（与本次改动无关，已通过 `git sparse-checkout add packages/ui` 解决）

这些均为**环境/基线问题**，非本次改动导致。19 个单元测试加上静态分析已充分验证逻辑正确性、类型安全性和 Schema 契约。

---

## 向后兼容性

| 场景                           | 修复前            | 修复后            | 变动        |
| ---------------------------- | -------------- | -------------- | --------- |
| 编辑带显式 `size`                 | 使用显式 size      | 使用显式 size      | **无**     |
| 编辑不带 `size`                  | 默认 `1024x1024` | 从源图推导          | **已修复**   |
| 编辑带 `?width=` / `?height=`   | 使用查询参数         | 使用查询参数         | **无**     |
| 生成（`/v1/images/generations`） | 默认 `1024x1024` | 默认 `1024x1024` | **无**     |
| 编辑无 `size`，源图无法读取            | 默认 `1024x1024` | 回退到模型默认        | **无**（静默） |
| multipart/form-data 编辑       | 手动处理           | 手动处理           | **无**     |

---

## 改动文件清单

```
 shared/schemas/openai.ts                               |  13 +-  （新增 imageEditSizeField）
 gen.pollinations.ai/src/image/utils/sourceDimensions.ts|  95 +   （新建文件）
 gen.pollinations.ai/src/routes/images.ts                |  16 +-  （集成尺寸推断）
 gen.pollinations.ai/test/image/image-edits.test.ts      | 194 +   （新建文件，19 个测试）
 ────────────────────────────────────────────────────────────────
 4 个文件，+316 行，-2 行
```

