# Hello / Landing Page Implementation Plan (spec Phase 4 — route `/`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the `/` placeholder with a faithful rebuild of the legacy landing page on `@pollinations/ui` primitives + unprefixed Tailwind: **Hero** (title, body, 3 CTAs, stat strip), **Dev kit** (6 feature cards), **Next** (roadmap), **CTA**. Copy is inlined as plain constants (no translation pipeline). Delete the legacy `HelloPage.tsx`.

**Architecture:** The legacy page is static (no SceneBackground — that was shell-level, now in `__root.tsx`; no apps/contributors/stars/API demos). The only legacy dynamic bit ("Latest" highlights, a GitHub-raw fetch) is **deferred** (see Out of scope). Drop the i18n machinery (`usePageCopy`/`useTranslate*`) and `useDocumentMeta` → use the route's `head()`. Feature-card markdown bullets render via a small local compact `Markdown` component (react-markdown is already a dep); the doc-scaled `Prose` primitive is for legal pages, not compact cards.

**Tech Stack:** React 19, TanStack Router, `@pollinations/ui` (`Surface`, `ExternalLinkButton`, `Button`, `ExternalLinkIcon`, `cn`, `ThemeName`), `react-markdown` + `remark-gfm` (existing deps).

**CSS convention (hard rule):** app code = **UNPREFIXED** Tailwind utilities. `polli:` is package-internal only.

**Verified facts:**
- `ExternalLinkButton` props: `{ theme: ThemeName (required); href: string; size?; className?; children }` — renders `Button as="a" target="_blank"` + trailing external icon.
- `Surface` props: `{ theme?: ThemeName; variant?: "panel"|"card"|"card-themed"; className? } & div props`.
- `Button` is polymorphic via `as`; `theme?`, `size?: "small"|"medium"|"large"`.
- `ThemeName = "amber"|"blue"|"pink"|"teal"|"violet"|"green"`; `cn`, `ExternalLinkIcon` exported from `@pollinations/ui` root.
- Legacy copy/links sourced from `src/copy/content/hello.ts` + `socialLinks.ts` (inlined below verbatim).
- `src/routes/index.tsx` is currently the placeholder; legacy `src/ui/pages/HelloPage.tsx` is orphaned (only the deleted `App.tsx` referenced it) → safe to delete, which also removes a `react-router-dom` + `useDocumentMeta` consumer.

---

## File Structure

**Create:**
- `src/components/Markdown.tsx` — compact react-markdown renderer (shared; cards/snippets).
- `src/components/hello/copy.ts` — inlined landing copy + link constants.
- `src/components/hello/ToolboxCard.tsx` — feature card (Surface + emoji + title + Markdown + optional link; rotating theme accent).

**Modify:**
- `src/routes/index.tsx` — assemble Hero + Dev kit + Next + CTA; set route `head()`.

**Delete:**
- `src/ui/pages/HelloPage.tsx` (orphaned legacy page).

---

## Task 1: Compact `Markdown` component

**Files:** Create `src/components/Markdown.tsx`.

- [ ] **Step 1: Write it**

```tsx
import { cn } from "@pollinations/ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Compact markdown for cards/snippets — small bullets, inline bold/code/links. */
export function Markdown({
    children,
    className,
}: {
    children: string;
    className?: string;
}) {
    return (
        <div className={cn("font-body leading-relaxed", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    ul: ({ children }) => (
                        <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-theme-text-muted">
                            {children}
                        </ul>
                    ),
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => (
                        <strong className="font-semibold text-theme-text-strong">
                            {children}
                        </strong>
                    ),
                    code: ({ children }) => (
                        <code className="rounded bg-theme-bg-subtle px-1 py-0.5 font-mono text-xs">
                            {children}
                        </code>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-theme-text-strong underline"
                        >
                            {children}
                        </a>
                    ),
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add pollinations.ai/src/components/Markdown.tsx
git commit -m "add compact Markdown component for cards/snippets"
```

---

## Task 2: Landing copy constants

**Files:** Create `src/components/hello/copy.ts`.

- [ ] **Step 1: Write it (copy verbatim from legacy `hello.ts` + `socialLinks.ts`)**

```ts
import type { ThemeName } from "@pollinations/ui";
import { ENTER_URL } from "../../config.ts";

const DISCORD = "https://discord.gg/pollinations-ai-885844321461485618";
const ENTER_DOCS = "https://gen.pollinations.ai/docs";
const BYOP_DOCS =
    "https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md";
const ENTER_MODELS = "https://enter.pollinations.ai#models";
const POLLI_CLI =
    "https://github.com/pollinations/pollinations/tree/main/packages/polli-cli";
const ENTER_TIERS_FAQ = "https://enter.pollinations.ai#what-are-tiers";
const GITHUB_FORK = "https://github.com/pollinations/pollinations/fork";

export const HELLO_META = {
    title: "pollinations.ai",
    description:
        "Build AI apps that pay for themselves. One API for text, image, audio, video. Users bring their own credits, you optionally take a share.",
};

export const HERO: {
    title: string;
    bodyPrefix: string;
    bodyBold: string;
    bodySuffix: string;
    ctas: { label: string; href: string; theme: ThemeName }[];
} = {
    title: "Build an AI app.",
    bodyPrefix:
        "⚡ Build with one API for text, image, audio, and video. ",
    bodyBold: "We handle the models and infrastructure.",
    bodySuffix: " Users spend across apps. Earn rewards. 🌱",
    ctas: [
        { label: "Register", href: ENTER_URL, theme: "green" },
        { label: "Join the Discord", href: DISCORD, theme: "blue" },
        { label: "Read the Docs", href: ENTER_DOCS, theme: "violet" },
    ],
};

export const STATS: { value: string; label: string }[] = [
    { value: "10K", label: "weekly active devs" },
    { value: "1.5M", label: "daily requests" },
    { value: "500+", label: "live apps" },
];

export type ToolboxItem = {
    emoji: string;
    title: string;
    desc: string;
    link?: { text: string; href: string };
};

export const TOOLBOX: ToolboxItem[] = [
    {
        emoji: "👛",
        title: "Wallets & earnings",
        desc: "- Users **sign in** and spend from their **own wallet** 👛\n- Set **spending caps**, **revoke access** any time\n- Turn on earnings on your **App Key** to receive a **share** when users spend in your app 💰",
        link: { text: "Add Pollen to your app", href: BYOP_DOCS },
    },
    {
        emoji: "🪩",
        title: "All the models",
        desc: "- **Text, image, video, audio**\n- **Vision, search, embeddings**\n- Streaming, tools, structured output\n- **OpenAI-compatible** endpoints",
        link: { text: "Browse the model list", href: ENTER_MODELS },
    },
    {
        emoji: "⌨️",
        title: "CLI for humans & agents",
        desc: '- `polli gen image "cat in space"` — **text, image, audio, video** in one CLI 🎛️\n- **Agent-friendly**: `--json` output, stdin context, clear exit codes\n- Point Claude Code, Cursor, or Codex at the **shipped SKILL.md**',
        link: { text: "Install polli CLI", href: POLLI_CLI },
    },
    {
        emoji: "🌱",
        title: "Free Credits",
        desc: "- **Refill Pollen** for prototypes & testing\n- Earn extra from **Pollen Quests** 🎯\n- More activity unlocks more room 📈",
        link: { text: "How tiers work", href: ENTER_TIERS_FAQ },
    },
    {
        emoji: "🎯",
        title: "Media inputs",
        desc: "- Upload **any media**, get a URL back\n- Use images, audio, documents in **model calls**",
    },
    {
        emoji: "💎",
        title: "Open Source",
        desc: "- **Open and transparent** stack\n- Shaped by the **developer community**",
        link: { text: "Fork on GitHub", href: GITHUB_FORK },
    },
];

export const ROADMAP: { title: string; description: string }[] = [
    {
        title: "Pollinations Login",
        description: "Drop-in sign-in for your users. Token handling included.",
    },
    {
        title: "App Hosting",
        description:
            "Push your app to our infra. No deploy setup, no separate bill.",
    },
    { title: "App Discovery", description: "Where users find your app." },
    {
        title: "Ads SDK",
        description: "Optional ad slots. Earnings go to your wallet.",
    },
];

export const CTA = {
    title: "Start building",
    body: "One API. Free credits to start, and earnings when your app gets used.",
    registerHref: ENTER_URL,
    docsHref: ENTER_DOCS,
};
```

- [ ] **Step 2: Commit**

```bash
git add pollinations.ai/src/components/hello/copy.ts
git commit -m "add inlined landing copy constants"
```

---

## Task 3: `ToolboxCard`

**Files:** Create `src/components/hello/ToolboxCard.tsx`.

- [ ] **Step 1: Write it**

```tsx
import { ExternalLinkIcon, Surface, type ThemeName } from "@pollinations/ui";
import { Markdown } from "../Markdown.tsx";
import type { ToolboxItem } from "./copy.ts";

/** Rotating accent theme so the grid alternates colors (legacy did i % 4). */
const ACCENTS: ThemeName[] = ["green", "blue", "pink", "violet"];

export function ToolboxCard({
    item,
    index,
}: {
    item: ToolboxItem;
    index: number;
}) {
    const theme = ACCENTS[index % ACCENTS.length];
    return (
        <Surface
            theme={theme}
            variant="card-themed"
            className="flex flex-col gap-3 p-5"
        >
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-2xl">
                    {item.emoji}
                </span>
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {item.title}
                </h3>
            </div>
            <Markdown className="text-sm text-theme-text-base">
                {item.desc}
            </Markdown>
            {item.link && (
                <a
                    href={item.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-theme-text-strong hover:underline"
                >
                    {item.link.text}
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
            )}
        </Surface>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add pollinations.ai/src/components/hello/ToolboxCard.tsx
git commit -m "add ToolboxCard for the dev-kit grid"
```

---

## Task 4: Assemble the `/` route + delete legacy page

**Files:** Modify `src/routes/index.tsx`; delete `src/ui/pages/HelloPage.tsx`.

- [ ] **Step 1: Replace `src/routes/index.tsx`**

```tsx
import { Button, ExternalLinkButton } from "@pollinations/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ToolboxCard } from "../components/hello/ToolboxCard.tsx";
import {
    CTA,
    HELLO_META,
    HERO,
    ROADMAP,
    STATS,
    TOOLBOX,
} from "../components/hello/copy.ts";

export const Route = createFileRoute("/")({
    head: () => ({
        meta: [
            { title: HELLO_META.title },
            { name: "description", content: HELLO_META.description },
        ],
    }),
    component: HelloPage,
});

function HelloPage() {
    return (
        <div
            data-theme="green"
            className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6"
        >
            {/* Hero */}
            <section className="flex flex-col gap-5">
                <h1 className="font-heading text-4xl text-theme-text-strong sm:text-5xl">
                    {HERO.title}
                </h1>
                <p className="max-w-2xl font-body text-lg text-theme-text-base">
                    {HERO.bodyPrefix}
                    <strong className="font-semibold text-theme-text-strong">
                        {HERO.bodyBold}
                    </strong>
                    {HERO.bodySuffix}
                </p>
                <div className="flex flex-wrap gap-3">
                    {HERO.ctas.map((c) => (
                        <ExternalLinkButton key={c.label} href={c.href} theme={c.theme}>
                            {c.label}
                        </ExternalLinkButton>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-theme-text-soft">
                    {STATS.map((s, i) => (
                        <span key={s.label} className="flex items-center gap-2">
                            {i > 0 && <span className="text-theme-text-muted">·</span>}
                            <strong className="font-heading text-base text-theme-text-strong">
                                {s.value}
                            </strong>
                            {s.label}
                        </span>
                    ))}
                </div>
            </section>

            {/* Dev kit */}
            <section className="flex flex-col gap-5">
                <h2 className="font-subheading text-2xl text-theme-text-strong">
                    Dev kit
                </h2>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {TOOLBOX.map((item, i) => (
                        <ToolboxCard key={item.title} item={item} index={i} />
                    ))}
                </div>
            </section>

            {/* Next */}
            <section className="flex flex-col gap-5">
                <h2 className="font-subheading text-2xl text-theme-text-strong">Next</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {ROADMAP.map((r) => (
                        <div
                            key={r.title}
                            className="rounded-lg border border-theme-border bg-theme-bg-subtle p-4"
                        >
                            <h3 className="font-subheading text-base text-theme-text-strong">
                                {r.title}
                            </h3>
                            <p className="mt-1 text-sm text-theme-text-soft">
                                {r.description}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className="flex flex-col gap-4 border-t border-theme-border pt-8">
                <h2 className="font-heading text-3xl text-theme-text-strong">
                    {CTA.title}
                </h2>
                <p className="max-w-2xl text-theme-text-base">{CTA.body}</p>
                <div className="flex flex-wrap gap-3">
                    <ExternalLinkButton href={CTA.registerHref} theme="green">
                        Register
                    </ExternalLinkButton>
                    <Button as={Link} to="/community" theme="blue">
                        Community
                    </Button>
                    <ExternalLinkButton href={CTA.docsHref} theme="violet">
                        Read the Docs
                    </ExternalLinkButton>
                </div>
            </section>
        </div>
    );
}
```

> The Community CTA uses `Button as={Link} to="/community"` (polymorphic Button + TanStack Link). If `tsc` rejects the typed `to` flowing through the polymorphic prop, fall back to a styled internal link: `<Link to="/community" className="inline-flex items-center rounded-full border border-theme-border bg-theme-bg-active px-4 py-2 text-sm font-semibold text-theme-text-strong">Community</Link>`.

- [ ] **Step 2: Delete the legacy page**

```bash
git rm pollinations.ai/src/ui/pages/HelloPage.tsx
```

> Removes a `react-router-dom` + `useDocumentMeta` consumer. Confirm nothing else imports it: `grep -rn "pages/HelloPage" pollinations.ai/src` → expect no matches.

- [ ] **Step 3: Commit**

```bash
git add pollinations.ai/src/routes/index.tsx
git commit -m "rebuild / landing page (hero, dev kit, next, cta); drop legacy HelloPage"
```

---

## Task 5: Build + verify

- [ ] **Step 1: Lint + typecheck + build**

From repo root: `npx biome check --write pollinations.ai/src/components/Markdown.tsx pollinations.ai/src/components/hello pollinations.ai/src/routes/index.tsx` — expect clean.
From `pollinations.ai/`: `npm run build` (tsc + vite) and `npm run build:production` — expect success + `wrangler.json`.

- [ ] **Step 2: Runtime verify (dev + Playwright)**

Start `npx vite --port 5180 --strictPort --no-open`. On `/` (1280×720):
- Page renders with header/footer shell intact; **zero page errors**.
- Hero: `<h1>` "Build an AI app." present; 3 hero CTAs are anchors with `target="_blank"` and `href` = enter / discord / docs URLs.
- Stat strip shows `10K` / `1.5M` / `500+`.
- Dev kit: exactly **6** cards render; each card with a `link` has an external anchor; markdown bullets render as `<li>` (not raw `- ` text or `**`).
- Next: 4 roadmap items.
- CTA: "Start building"; Community control links internally to `/community` (clicking it navigates within the SPA, URL → `/community`, no full reload).
- Inner-scroll contract still holds (reuse `scroll-gate.js`); all routes smoke still passes (`smoke.js`).

Stop the dev server.

- [ ] **Step 3: Commit (if biome changed anything)**

```bash
git add -A pollinations.ai/src
git commit -m "verify landing page build + render"
```

---

## Verification (whole plan)

- `npm run build` + `build:production` succeed; `wrangler.json` emitted; `tsc --noEmit` clean over all `src/` (HelloPage deletion removed a `react-router-dom`/`useDocumentMeta` consumer).
- `/` renders Hero + Dev kit (6 cards) + Next + CTA with correct copy, working external CTAs, internal Community link; markdown bullets render; zero page errors.
- Shell (header/footer/scroll) and all other routes unaffected.
- `npx biome check pollinations.ai/src` clean.

## Out of scope (later plans / deferred)

- **"Latest" highlights section** — the one network-dependent section (GitHub-raw `highlights.md` fetch + parse, legacy `useHighlights`/`useCachedFetch`, 1h cache). Defer: add later as a route loader (graceful empty fallback) or a cached client fetch. Re-source the parser from `src/hooks/useHighlights.ts` when implemented.
- Per-card "lead" subtitles (present in legacy copy but never rendered).
- Plans 5–7: Apps, Play, Community page rebuilds.
- Plan 8 cleanup: delete legacy `hello.ts`, `useHighlights`/`useCachedFetch`, CVA design system, translation pipeline, `SceneBackground`; bundle-size code-split.
