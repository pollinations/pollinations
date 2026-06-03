# UI Package Primitives Implementation Plan (spec Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three primitives — `Prose`, `Textarea`, `FileUpload` — to `@pollinations/ui`, build and version-bump the package (`0.0.2 → 0.0.3`), so the website rebuild (Plan 2) has every primitive it needs.

**Architecture:** Each primitive follows the package's existing conventions: a focused `.tsx` in `src/primitives/`, `polli:`-prefixed Tailwind classes merged via the internal `cn` (`src/lib/cn.ts`), exported from `src/index.ts`. Tests are server-rendered HTML-string assertions via `react-dom/server` (the package has **no DOM/jsdom test environment**). Because of that, the only risky non-render logic — `FileUpload`'s file validation/reject — is extracted into a pure, Node-unit-tested helper (`src/lib/partition-files.ts`); interactive behavior (drag/drop, object-URL lifecycle) is implemented with canonical patterns and verified in the Play integration in Plan 2.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4 (`polli:` prefix), tsup (build), Vitest (`react-dom/server` string tests), `react-markdown` + `remark-gfm` + `rehype-slug` (for `Prose`).

**Conventions to follow (verified in the codebase):**
- Internal primitives import `cn` from `../lib/cn.ts` (the `polli:`-prefixed merge). Do **not** use `../lib/cn-app.ts` (that is the unprefixed app-facing bridge).
- Classes are `polli:`-prefixed utilities. Theme tokens available: `theme-text-base|strong|soft|muted`, `theme-border`, `theme-bg-subtle|active|hover|pale`; fonts `font-heading|subheading|body|pixel`; intent tokens `intent-danger-bg-light|text|border` (+ `success`/`warning`).
- Tests use `renderToString` / `renderToStaticMarkup` from `react-dom/server` and assert on the HTML string. No `@testing-library`, no jsdom, no event simulation.
- New primitives belong to the existing `index` tsup entry — **no tsup config change** is needed (they are re-exported from `src/index.ts`). Runtime deps are auto-externalized by tsup.
- Run all commands from `packages/ui/`. Single-file test: `npx vitest run <path>`.
- Commit messages: lowercase, concise, no attribution.

---

## File Structure

**Create:**
- `src/primitives/Textarea.tsx` — multiline counterpart to `Input` (error state, theme, optional CSS auto-grow).
- `src/primitives/Textarea.test.tsx` — SSR markup assertions.
- `src/lib/partition-files.ts` — pure file validation/partition helper (accept/size/count → accepted + rejected).
- `src/lib/partition-files.test.ts` — pure Node unit tests for the helper.
- `src/primitives/FileUpload.tsx` — controlled drag-and-drop zone with previews + remove, wired to `partitionFiles`.
- `src/primitives/FileUpload.test.tsx` — SSR markup assertions (dropzone, file input attrs, controlled previews).
- `src/primitives/Prose.tsx` — `react-markdown` renderer with element→token mapping.
- `src/primitives/Prose.test.tsx` — SSR markup assertions (headings + slugs, links, gfm table, inline code).

**Modify:**
- `src/index.ts` — add exports for `Textarea`, `FileUpload`, `Prose` (+ their prop types).
- `package.json` — add `react-markdown`, `remark-gfm`, `rehype-slug` to `dependencies`; bump `version` `0.0.2 → 0.0.3`.

---

## Task 1: `Textarea` primitive

Mirror `src/primitives/Input.tsx` (forwardRef, `error` border, disabled styles). Add an optional `autoGrow` prop that applies Tailwind's `field-sizing-content` utility — a pure-CSS progressive enhancement (Chromium 123+, recent Safari, Firefox 152 beta; degrades to fixed `rows` elsewhere).

**Files:**
- Create: `src/primitives/Textarea.tsx`
- Create: `src/primitives/Textarea.test.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/primitives/Textarea.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea.tsx";

describe("Textarea", () => {
    it("renders a textarea with default rows and base classes", () => {
        const html = renderToStaticMarkup(
            <Textarea placeholder="Prompt" />,
        );
        expect(html).toContain("<textarea");
        expect(html).toContain('placeholder="Prompt"');
        expect(html).toContain('rows="4"');
        expect(html).toContain("polli:border-gray-300");
    });

    it("applies the error border when error is set", () => {
        const html = renderToStaticMarkup(<Textarea error />);
        expect(html).toContain("polli:border-red-400");
        expect(html).not.toContain("polli:border-gray-300");
    });

    it("opts into CSS auto-grow via field-sizing", () => {
        const html = renderToStaticMarkup(<Textarea autoGrow />);
        expect(html).toContain("polli:field-sizing-content");
    });

    it("forwards disabled and arbitrary textarea props", () => {
        const html = renderToStaticMarkup(
            <Textarea disabled rows={8} aria-label="Notes" />,
        );
        expect(html).toContain("disabled");
        expect(html).toContain('rows="8"');
        expect(html).toContain('aria-label="Notes"');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/primitives/Textarea.test.tsx`
Expected: FAIL — `Failed to resolve import "./Textarea.tsx"`.

- [ ] **Step 3: Write the implementation**

Create `src/primitives/Textarea.tsx`:

```tsx
import { forwardRef } from "react";
import { cn } from "../lib/cn.ts";

export type TextareaProps = React.ComponentPropsWithoutRef<"textarea"> & {
    error?: boolean;
    /** CSS-only auto-grow (field-sizing); falls back to `rows` where unsupported. */
    autoGrow?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, error, autoGrow, rows = 4, ...props }, ref) => (
        <textarea
            ref={ref}
            rows={rows}
            className={cn(
                "polli:w-full polli:rounded-lg polli:border polli:px-3 polli:py-2",
                "polli:min-h-20 polli:resize-y polli:font-body polli:text-base",
                "polli:disabled:opacity-50 polli:disabled:cursor-not-allowed",
                error ? "polli:border-red-400" : "polli:border-gray-300",
                autoGrow && "polli:field-sizing-content",
                className,
            )}
            {...props}
        />
    ),
);

Textarea.displayName = "Textarea";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/primitives/Textarea.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the package index**

In `src/index.ts`, add (keep the file's alphabetical-ish ordering, place after the `TabButton` export block and before `Table`):

```ts
export { Textarea, type TextareaProps } from "./primitives/Textarea.tsx";
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/primitives/Textarea.tsx src/primitives/Textarea.test.tsx src/index.ts
git commit -m "add Textarea primitive to @pollinations/ui"
```

---

## Task 2: `partitionFiles` pure helper

The deterministic validation core of `FileUpload`. Pure function, no DOM — fully unit-testable in Node. Validates each incoming file against `accept` (type), `maxSizeBytes` (size), and remaining `maxFiles` slots (count), preserving order and reporting every rejection with a reason.

**Files:**
- Create: `src/lib/partition-files.ts`
- Create: `src/lib/partition-files.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/partition-files.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { partitionFiles } from "./partition-files.ts";

const png = (name: string, bytes = 4) =>
    new File(["x".repeat(bytes)], name, { type: "image/png" });

describe("partitionFiles", () => {
    it("accepts matching files within all limits", () => {
        const a = png("a.png");
        const b = png("b.png");
        const result = partitionFiles([a, b], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
            accept: "image/*",
        });
        expect(result.accepted).toEqual([a, b]);
        expect(result.rejected).toEqual([]);
    });

    it("rejects files whose type does not match accept", () => {
        const txt = new File(["x"], "note.txt", { type: "text/plain" });
        const result = partitionFiles([txt], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
            accept: "image/*",
        });
        expect(result.accepted).toEqual([]);
        expect(result.rejected).toEqual([{ file: txt, reason: "type" }]);
    });

    it("matches accept by file extension and exact mime", () => {
        const webp = new File(["x"], "pic.WEBP", { type: "" });
        const jpeg = png("p.jpg");
        const result = partitionFiles([webp, jpeg], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
            accept: ".webp,image/png",
        });
        expect(result.accepted).toEqual([webp, jpeg]);
    });

    it("rejects oversized files", () => {
        const big = png("big.png", 200);
        const result = partitionFiles([big], [], {
            maxFiles: 4,
            maxSizeBytes: 100,
            accept: "image/*",
        });
        expect(result.rejected).toEqual([{ file: big, reason: "size" }]);
    });

    it("rejects files past the remaining count, accounting for current selection", () => {
        const a = png("a.png");
        const b = png("b.png");
        const c = png("c.png");
        const result = partitionFiles([a, b, c], [png("existing.png")], {
            maxFiles: 2,
            maxSizeBytes: 1000,
            accept: "image/*",
        });
        // 2 max, 1 already selected -> only 1 slot left
        expect(result.accepted).toEqual([a]);
        expect(result.rejected).toEqual([
            { file: b, reason: "count" },
            { file: c, reason: "count" },
        ]);
    });

    it("accepts everything when accept is omitted", () => {
        const txt = new File(["x"], "note.txt", { type: "text/plain" });
        const result = partitionFiles([txt], [], {
            maxFiles: 4,
            maxSizeBytes: 1000,
        });
        expect(result.accepted).toEqual([txt]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/partition-files.test.ts`
Expected: FAIL — `Failed to resolve import "./partition-files.ts"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/partition-files.ts`:

```ts
export type RejectReason = "type" | "size" | "count";

export type RejectedFile = { file: File; reason: RejectReason };

export type PartitionOptions = {
    maxFiles: number;
    maxSizeBytes: number;
    /** Comma-separated list: mime ("image/png"), wildcard ("image/*"), or extension (".webp"). */
    accept?: string;
};

export type PartitionResult = {
    accepted: File[];
    rejected: RejectedFile[];
};

function matchesAccept(file: File, accept: string | undefined): boolean {
    if (!accept) return true;
    const tokens = accept
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.some((token) => {
        if (token.startsWith(".")) {
            return file.name.toLowerCase().endsWith(token.toLowerCase());
        }
        if (token.endsWith("/*")) {
            const prefix = token.slice(0, token.length - 1); // "image/"
            return file.type.startsWith(prefix);
        }
        return file.type === token;
    });
}

/**
 * Partition `incoming` files against the already-selected `current` files.
 * Deterministic: order preserved; every rejection carries a reason.
 * The count limit counts `current.length` against `maxFiles`.
 */
export function partitionFiles(
    incoming: File[],
    current: File[],
    { maxFiles, maxSizeBytes, accept }: PartitionOptions,
): PartitionResult {
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];
    let slots = Math.max(0, maxFiles - current.length);

    for (const file of incoming) {
        if (!matchesAccept(file, accept)) {
            rejected.push({ file, reason: "type" });
        } else if (file.size > maxSizeBytes) {
            rejected.push({ file, reason: "size" });
        } else if (slots <= 0) {
            rejected.push({ file, reason: "count" });
        } else {
            accepted.push(file);
            slots -= 1;
        }
    }

    return { accepted, rejected };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/partition-files.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/partition-files.ts src/lib/partition-files.test.ts
git commit -m "add partitionFiles helper for FileUpload validation"
```

---

## Task 3: `FileUpload` primitive

Controlled drag-and-drop zone. Contract (from the spec): controlled-only (`value` is the single source of truth, no internal file state); never uploads (pure input — Play hands `value` to the SDK); object-URL previews created in an effect and revoked on change/unmount; deterministic reject via `partitionFiles`, reported through `onReject`. Uses existing `IconButton` + `XIcon` (remove) and `ImageIcon` (dropzone).

**SSR-test note:** `renderToStaticMarkup` does not run effects, so `URL.createObjectURL` is never called during tests (and the previews state stays empty → the placeholder tile renders, the filename text always renders). This keeps the component SSR-safe and the test deterministic. Object-URL revocation and drag/drop wiring are verified in the Play integration (Plan 2).

**Files:**
- Create: `src/primitives/FileUpload.tsx`
- Create: `src/primitives/FileUpload.test.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/primitives/FileUpload.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileUpload } from "./FileUpload.tsx";

describe("FileUpload", () => {
    it("renders a dropzone with a file input honoring accept and multiple", () => {
        const html = renderToStaticMarkup(
            <FileUpload
                value={[]}
                onChange={() => {}}
                accept="image/*"
                maxFiles={4}
            />,
        );
        expect(html).toContain('type="file"');
        expect(html).toContain('accept="image/*"');
        expect(html).toContain("multiple");
        expect(html).toContain("browse");
    });

    it("disables the input when disabled", () => {
        const html = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} disabled />,
        );
        expect(html).toContain("disabled");
        expect(html).toContain("polli:cursor-not-allowed");
    });

    it("renders a controlled preview entry with a remove control per file", () => {
        const file = new File(["x"], "ref.png", { type: "image/png" });
        const html = renderToStaticMarkup(
            <FileUpload value={[file]} onChange={() => {}} />,
        );
        expect(html).toContain("ref.png");
        expect(html).toContain('aria-label="Remove ref.png"');
    });

    it("uses single-select when maxFiles is 1", () => {
        const html = renderToStaticMarkup(
            <FileUpload value={[]} onChange={() => {}} maxFiles={1} />,
        );
        expect(html).not.toContain("multiple");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/primitives/FileUpload.test.tsx`
Expected: FAIL — `Failed to resolve import "./FileUpload.tsx"`.

- [ ] **Step 3: Write the implementation**

Create `src/primitives/FileUpload.tsx`:

```tsx
import { useEffect, useState } from "react";
import { cn } from "../lib/cn.ts";
import { partitionFiles, type RejectedFile } from "../lib/partition-files.ts";
import { IconButton } from "./IconButton.tsx";
import { ImageIcon, XIcon } from "./icons/index.tsx";

export type FileUploadProps = {
    value: File[];
    onChange: (files: File[]) => void;
    onReject?: (rejected: RejectedFile[]) => void;
    maxFiles?: number;
    maxSizeBytes?: number;
    accept?: string;
    disabled?: boolean;
    className?: string;
};

export function FileUpload({
    value,
    onChange,
    onReject,
    maxFiles = 4,
    maxSizeBytes = 10 * 1024 * 1024,
    accept = "image/*",
    disabled = false,
    className,
}: FileUploadProps) {
    const [previews, setPreviews] = useState<string[]>([]);

    // Created after mount (never during SSR); revoked on change/unmount.
    useEffect(() => {
        const urls = value.map((file) => URL.createObjectURL(file));
        setPreviews(urls);
        return () => {
            for (const url of urls) URL.revokeObjectURL(url);
        };
    }, [value]);

    const atLimit = value.length >= maxFiles;
    const blocked = disabled || atLimit;

    function addFiles(incoming: File[]) {
        if (incoming.length === 0) return;
        const { accepted, rejected } = partitionFiles(incoming, value, {
            maxFiles,
            maxSizeBytes,
            accept,
        });
        if (accepted.length > 0) onChange([...value, ...accepted]);
        if (rejected.length > 0) onReject?.(rejected);
    }

    return (
        <div className={cn("polli:flex polli:flex-col polli:gap-3", className)}>
            <label
                className={cn(
                    "polli:flex polli:flex-col polli:items-center polli:justify-center polli:gap-2",
                    "polli:rounded-xl polli:border polli:border-dashed polli:border-theme-border",
                    "polli:bg-theme-bg-pale polli:px-4 polli:py-6 polli:text-center polli:text-sm",
                    "polli:text-theme-text-soft polli:transition-colors",
                    blocked
                        ? "polli:cursor-not-allowed polli:opacity-50"
                        : "polli:cursor-pointer polli:hover:bg-theme-bg-hover",
                )}
                onDragOver={(e) => {
                    if (blocked) return;
                    e.preventDefault();
                }}
                onDrop={(e) => {
                    if (blocked) return;
                    e.preventDefault();
                    addFiles(Array.from(e.dataTransfer.files));
                }}
            >
                <ImageIcon className="polli:h-6 polli:w-6" />
                <span>
                    Drag images here or{" "}
                    <span className="polli:underline">browse</span>
                </span>
                <input
                    type="file"
                    accept={accept}
                    multiple={maxFiles > 1}
                    disabled={blocked}
                    className="polli:sr-only"
                    onChange={(e) => {
                        addFiles(Array.from(e.target.files ?? []));
                        e.target.value = "";
                    }}
                />
            </label>

            {value.length > 0 && (
                <ul className="polli:m-0 polli:flex polli:flex-wrap polli:gap-3 polli:p-0">
                    {value.map((file, index) => (
                        <li
                            key={`${file.name}-${index}`}
                            className="polli:relative polli:flex polli:list-none polli:flex-col polli:gap-1"
                        >
                            {previews[index] ? (
                                <img
                                    src={previews[index]}
                                    alt={file.name}
                                    className="polli:h-16 polli:w-16 polli:rounded-lg polli:object-cover"
                                />
                            ) : (
                                <div className="polli:h-16 polli:w-16 polli:rounded-lg polli:bg-theme-bg-active" />
                            )}
                            <span className="polli:max-w-16 polli:truncate polli:text-xs polli:text-theme-text-muted">
                                {file.name}
                            </span>
                            <div className="polli:absolute polli:-top-2 polli:-right-2">
                                <IconButton
                                    intent="danger"
                                    title={`Remove ${file.name}`}
                                    onClick={() =>
                                        onChange(value.filter((_, i) => i !== index))
                                    }
                                >
                                    <XIcon className="polli:h-3 polli:w-3" />
                                </IconButton>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/primitives/FileUpload.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Export from the package index**

In `src/index.ts`, add (place near the other `F` exports, after the `ExternalLinkButton` block / before `Field`, or wherever alphabetical fit is cleanest):

```ts
export { FileUpload, type FileUploadProps } from "./primitives/FileUpload.tsx";
```

Also re-export the reject type for consumers handling `onReject` (add after the `FileUpload` line):

```ts
export type { RejectedFile, RejectReason } from "./lib/partition-files.ts";
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/primitives/FileUpload.tsx src/primitives/FileUpload.test.tsx src/index.ts
git commit -m "add FileUpload primitive to @pollinations/ui"
```

---

## Task 4: Add markdown dependencies

`Prose` needs `react-markdown` + `remark-gfm` + `rehype-slug`. Versions match those already used by the current site (`pollinations.ai/package.json`). This repo uses npm workspaces, so install with the workspace flag from the **repo root** (updates `packages/ui/package.json` deps and the root lockfile together).

**Files:**
- Modify: `package.json` (dependencies)
- Modify: root `package-lock.json` (generated)

- [ ] **Step 1: Install the deps into the `@pollinations/ui` workspace**

Run from the **repository root**:

```bash
npm install react-markdown@^10.1.0 remark-gfm@^4.0.1 rehype-slug@^6.0.0 -w @pollinations/ui
```

- [ ] **Step 2: Verify they landed in the package, not the root**

Run from `packages/ui/`: `node -e "const d=require('./package.json').dependencies; console.log(d['react-markdown'], d['remark-gfm'], d['rehype-slug'])"`
Expected: prints three version ranges (e.g. `^10.1.0 ^4.0.1 ^6.0.0`), none `undefined`.

> Note: tsup auto-externalizes `dependencies`, so no `tsup.config.ts` change is needed — the consuming app resolves these transitively through `@pollinations/ui`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "add react-markdown deps for Prose primitive"
```

---

## Task 5: `Prose` primitive

Render a markdown string through `react-markdown` with GFM (tables/strikethrough) and heading slugs (`rehype-slug`), mapping each element to `polli:` theme/font tokens. `react-markdown` renders synchronously, so `renderToStaticMarkup` produces full HTML in tests. Each mapped component strips react-markdown's `node` prop before spreading onto the DOM element (otherwise React warns about an unknown `node` attribute).

**Files:**
- Create: `src/primitives/Prose.tsx`
- Create: `src/primitives/Prose.test.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/primitives/Prose.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prose } from "./Prose.tsx";

const markdown = [
    "# Title",
    "",
    "Some **bold** text and a [link](https://example.com).",
    "",
    "| Col A | Col B |",
    "| ----- | ----- |",
    "| 1     | 2     |",
    "",
    "`inline code`",
].join("\n");

describe("Prose", () => {
    it("renders headings with rehype-slug ids and heading font", () => {
        const html = renderToStaticMarkup(<Prose>{markdown}</Prose>);
        expect(html).toContain("<h1");
        expect(html).toContain('id="title"');
        expect(html).toContain("polli:font-heading");
    });

    it("renders gfm tables and themed links", () => {
        const html = renderToStaticMarkup(<Prose>{markdown}</Prose>);
        expect(html).toContain("<table");
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain("polli:underline");
    });

    it("renders inline code and bold", () => {
        const html = renderToStaticMarkup(<Prose>{markdown}</Prose>);
        expect(html).toContain("<code");
        expect(html).toContain("polli:font-pixel");
        expect(html).toContain("<strong");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/primitives/Prose.test.tsx`
Expected: FAIL — `Failed to resolve import "./Prose.tsx"`.

- [ ] **Step 3: Write the implementation**

Create `src/primitives/Prose.tsx`:

```tsx
import Markdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn.ts";

export type ProseProps = {
    children: string;
    className?: string;
};

const components: Components = {
    h1: ({ node, ...props }) => (
        <h1
            className="polli:mt-8 polli:mb-4 polli:font-heading polli:text-4xl polli:text-theme-text-strong"
            {...props}
        />
    ),
    h2: ({ node, ...props }) => (
        <h2
            className="polli:mt-8 polli:mb-3 polli:font-subheading polli:text-2xl polli:tracking-tight polli:text-theme-text-strong"
            {...props}
        />
    ),
    h3: ({ node, ...props }) => (
        <h3
            className="polli:mt-6 polli:mb-2 polli:font-subheading polli:text-xl polli:text-theme-text-strong"
            {...props}
        />
    ),
    p: ({ node, ...props }) => (
        <p className="polli:my-4 polli:leading-relaxed" {...props} />
    ),
    a: ({ node, ...props }) => (
        <a
            className="polli:text-theme-text-strong polli:underline polli:underline-offset-2"
            {...props}
        />
    ),
    ul: ({ node, ...props }) => (
        <ul
            className="polli:my-4 polli:list-disc polli:pl-6 polli:leading-relaxed"
            {...props}
        />
    ),
    ol: ({ node, ...props }) => (
        <ol
            className="polli:my-4 polli:list-decimal polli:pl-6 polli:leading-relaxed"
            {...props}
        />
    ),
    blockquote: ({ node, ...props }) => (
        <blockquote
            className="polli:my-4 polli:border-l-4 polli:border-theme-border polli:pl-4 polli:text-theme-text-soft"
            {...props}
        />
    ),
    code: ({ node, ...props }) => (
        <code
            className="polli:rounded polli:bg-theme-bg-active polli:px-1 polli:py-0.5 polli:font-pixel polli:text-sm"
            {...props}
        />
    ),
    pre: ({ node, ...props }) => (
        <pre
            className="polli:my-4 polli:overflow-x-auto polli:rounded-lg polli:bg-theme-bg-active polli:p-4"
            {...props}
        />
    ),
    table: ({ node, ...props }) => (
        <table
            className="polli:my-4 polli:w-full polli:border-collapse polli:text-sm"
            {...props}
        />
    ),
    th: ({ node, ...props }) => (
        <th
            className="polli:border polli:border-theme-border polli:px-3 polli:py-2 polli:text-left polli:font-semibold"
            {...props}
        />
    ),
    td: ({ node, ...props }) => (
        <td
            className="polli:border polli:border-theme-border polli:px-3 polli:py-2"
            {...props}
        />
    ),
    hr: ({ node, ...props }) => (
        <hr className="polli:my-6 polli:border-theme-border" {...props} />
    ),
};

export function Prose({ children, className }: ProseProps) {
    return (
        <div
            className={cn(
                "polli:font-body polli:text-theme-text-base polli:leading-relaxed",
                className,
            )}
        >
            <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSlug]}
                components={components}
            >
                {children}
            </Markdown>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/primitives/Prose.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from the package index**

In `src/index.ts`, add (alphabetical fit — after `PeriodPicker`, before `ScrollArea`):

```ts
export { Prose, type ProseProps } from "./primitives/Prose.tsx";
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/primitives/Prose.tsx src/primitives/Prose.test.tsx src/index.ts
git commit -m "add Prose markdown primitive to @pollinations/ui"
```

---

## Task 6: Version bump, full build, and package verification

Bump `0.0.2 → 0.0.3` (the new primitives — distinct from the `0.0.1 → 0.0.2` peer-dep fix already shipped in #11577), then prove the whole package builds and tests green, and that the new `polli:` classes are emitted into the built CSS.

**Files:**
- Modify: `package.json` (version)

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.0.2"` to `"version": "0.0.3"`.

- [ ] **Step 2: Run the full package test suite**

Run: `npm run test`
Expected: PASS — all suites, including the four new files (`Textarea`, `partition-files`, `FileUpload`, `Prose`) and the pre-existing ones.

- [ ] **Step 3: Build the package**

Run: `npm run build`
Expected: completes with no errors; regenerates `dist/` (js + css + fonts + assets).

- [ ] **Step 4: Verify new primitives are in the built output**

Run: `node -e "const x=require('./dist/index.cjs'); console.log(typeof x.Prose, typeof x.Textarea, typeof x.FileUpload)"`
Expected: `function function function`.

Run: `grep -c 'field-sizing\|border-dashed' dist/styles.css`
Expected: a non-zero count (confirms Tailwind picked up the new `polli:` classes from the new components).

- [ ] **Step 5: Format and commit**

Run from repo root: `npx biome check --write packages/ui/src`
Expected: clean (applies any formatting).

```bash
git add package.json src
git commit -m "bump @pollinations/ui to 0.0.3 for new primitives"
```

---

## Verification (whole plan)

- `npm run test` (from `packages/ui/`) passes, including the 4 new test files (17 new assertions total).
- `npm run typecheck` clean.
- `npm run build` succeeds; `dist/index.cjs` exports `Prose`, `Textarea`, `FileUpload`; `dist/styles.css` contains the new utilities.
- `npx biome check packages/ui/src` clean.
- `partitionFiles` has full unit coverage of the reject contract (type / size / count / accept-omitted / extension+mime matching / current-selection accounting).
- `@pollinations/ui` is at `0.0.3`; `@pollinations/sdk` peer remains `^5.0.0` (already aligned in #11577).

## Out of scope for this plan (handled in Plan 2 — website rebuild)

- Wiring `Textarea`/`FileUpload`/`Prose` into Play, legal pages, etc.
- Runtime verification of `FileUpload` drag/drop, object-URL revocation, and `onReject` UX (integration-tested on the Play page).
- Adding any new icons the site needs beyond the current set (add when a consuming page actually needs one).
- Publishing the package to npm (the site consumes it via `file:`/prebuild hooks per Plan 2, so a registry publish is not required for the rebuild).
```
