# enter.pollinations.ai — Design System Refactor Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan phase-by-phase. Each phase ships as ONE meaningful PR.

**Goal:** Collapse six overlapping color tables and ten ad-hoc primitives into a **4-axis token system** (mode × theme × intent × tone) backed by CSS variables — so a future dark mode is a flip, not a rewrite, and adding a new themed page is ~5 lines.

**Core principle:** **Page color wins by default.** Every component on a page inherits that page's theme. The four `intent`s (`danger`, `success`, `paid`, `alpha`) are the only exceptions — they fire when *meaning* matters more than *page identity* (e.g. a Delete button must be red even on the blue Keys page).

**Tech stack:** React 19.2, Tailwind 4 (`@theme` + `@theme inline`), TypeScript, TanStack file routes (`@tanstack/react-router ^1.139.3`), Vite. No new deps.

**Scope:** `enter.pollinations.ai/src/client/` only.

---

## Decisions log (locked in)

These are settled. Phases reference them.

| # | Decision |
|---|---|
| Q1 | Light mode now; dark mode arrives shortly. Phase 0 architects for it (CSS vars, not class strings). |
| Q2 | Drop `purple`. `violet` is canonical. |
| Q3 | Rename primitive prop `color` → `theme` (when it's a hue) or `intent` (when it's semantic). |
| Q4 | **Theme list = `amber | blue | pink | teal | violet | green`.** Sections: amber (Pollen + Login), blue (Keys), pink (Activity), teal (Models), violet (News & FAQ). Green = chrome (sidebar/footer). No `gray` as theme — gray utility UI is just the soft/softer tones of whatever theme is active. |
| Q5 | Chip recipe = `bg-X-200 text-X-950`. |
| Q6 | Button `strong` = `bg-X-600 text-white hover:bg-X-700` for **every** theme. |
| Q7 | Drop `outline` button weight. |
| Q8 | **Round = clickable, rect = static.** Buttons always pill. Chips always rect. |
| Q9 | `<Surface>` `tone` axis = `"white" | "tinted"`. |
| Q10 | Drop the `bg=` escape hatch on `<Card>` — current uses are semantic (red error containers); they migrate to `intent="danger"`. |
| Q11 | Money tokens = `paid` and `tier` only. |
| Q12 | h4–h6 use `font-body` (Uncut Sans). Reserve Fraunces for h1–h3. |
| Q13 | Font-size tokens use scale-based names (`text-3xs`, `text-2xs`, `text-md`). |
| Q14 | `<Input>` focus ring is universal, single neutral CSS var. Not page-themed. |
| Q15 | `<IconButton>` follows page theme by default; `intent="danger"` overrides for delete-style icons. |
| Q16 | `rounded-md` merges into `rounded-lg`. |
| Q17 | Normalize 4px modal borders to `border-2`. |
| Q18 | `<InfoTip>` popups are flat single-tone (no gradients). |
| Q19 | Visual parity is the default; deliberate improvements OK but **listed in PR description**. |
| Q20 | Architect for dark mode. CSS variables. |
| Q21 | Dark mode is short-term. (Reinforces Q20.) |
| Q22 | `/internal/design` showcase page is part of Phase 0 (validates token names before migration). |
| Q23 | **Intent list = `danger | success | paid | alpha`** (no neutral, no warning). |
| Q24 | **Auto-top-up switch states:** off = amber (page theme, light fill); draft = `intent="danger"` (red); ready = `intent="success"` (green). |
| Q25 | **Selector model:** `data-mode` on `<html>`, `data-theme` on the page wrapper. Dark cascade uses descendant selectors: `html[data-mode="dark"] [data-theme="amber"] { … }`. |
| Q26 | **`theme` is optional on primitives.** Default = inherit from `data-theme` cascade. Local override: `<ThemeScope theme="teal">…</ThemeScope>` wraps a subtree (rare — nav dots, badges, showcase). |

---

## Why this plan, not the audit's 14 findings

The audit lists 14 issues. They aren't 14 jobs — they're symptoms of three structural decisions:

| Root cause | Symptoms it explains |
|---|---|
| Tokens hand-typed per theme instead of derived | Chip drift (#01, #07, #08), strong-weight inconsistency (#04), `text-green-950` everywhere bug (#02), teal off-by-one (#12), blue light=strong (#05) |
| No primitive for "small colored container" | Tag/Pill/Tab/Button-light overlap (#01) |
| No primitive for switch / surface / money / intent | Switch dup (#03), Card/Panel split (#10), raw hex money (#12), semantic-red as `bg=` escape hatch |

Fix the structure once and most findings dissolve. **9 phases, 9 PRs.**

---

## Verified current state (audit findings, code-confirmed)

Paths relative to `enter.pollinations.ai/src/client/`. All 17 audit claims verified TRUE in code (1 partial).

| # | Finding | Where |
|---|---|---|
| 01 | `tagColors`, `pillColors`, `tabColors[X].active`, `buttonColors[X].light` all encode `bg-X-200 text-X-?00` | `components/layout/dashboard-theme.ts:43-179`, `components/ui/tag.tsx:4-15` |
| 02 | `dashboardThemeClasses[X].active` uses `text-green-950` for **every** theme | `dashboard-theme.ts:399-476` |
| 03 | Two hand-rolled switch implementations | `components/balance/auto-top-up-panel.tsx:378-431`, `components/api-keys/publishable-key-settings.tsx:105-143` |
| 04 | `buttonColors[X].strong` shades vary 500/600/700/900/950 across themes | `dashboard-theme.ts:68-127` |
| 05 | `buttonColors.blue.light === buttonColors.blue.strong` | `dashboard-theme.ts:75-80` |
| 06 | `buttonColors.purple` renders **indigo** | `dashboard-theme.ts:105-109` |
| 07 | `tagColors.green/pink/teal` use `text-gray-900`; pills use `text-X-900` | `ui/tag.tsx:4-15` vs `dashboard-theme.ts:129-138` |
| 08 | `tagColors.blue` is `bg-blue-100 text-blue-700`; pill blue is `bg-blue-200 text-blue-900` | `ui/tag.tsx:10` vs `dashboard-theme.ts:131` |
| 09 | `yellow` lives only in `tagColors` and `InfoTip` | `ui/tag.tsx:14`, `ui/info-tip.tsx:21-23` |
| 10 | Card = `rounded-xl bg-white/80`, Panel = `rounded-2xl bg-X-50/70` — same primitive, two fills | `ui/card.tsx:16-34`, `ui/panel.tsx:11-27` |
| 11 | `cardColors.teal` and `panelColors.teal` use `border-teal-200`; everyone else uses `border-300` | `dashboard-theme.ts:51, 64` |
| 12 | Money hex (6 values) scattered as raw `bg-[#…]` / `text-[#…]` | `lib/balance-colors.ts:6-16`, `components/balance/pollen-balance.tsx:122,139,143-144`, etc. |
| 13 | Arbitrary `text-[10px]`, `text-[11px]`, `text-[15px]` in 11+ locations; h4–h6 have no font family | `style.css:90-94`, `components/layout/dashboard-shell.tsx:392,408,413,416,419,425`, others |
| 14 | `<Input>` focus ring hardcoded `border-green-500 ring-green-500/60` regardless of page theme | `ui/input.tsx:12-15` |
| 15 | `<IconButton>` supports only `blue/red/gray` | `ui/icon-button.tsx:4-8` |
| 16 | `<InfoTip>` popup uses two-color gradients | `ui/info-tip.tsx:12-33` |
| 17 | h4–h6 have no font family set | `style.css:90-94` |

**Plus, surfaced during code review:**
- Semantic red used via `bg="bg-red-100"` escape hatch on `<Surface>`: `delete-confirmation.tsx`, `edit-api-key-dialog.tsx` (2×), `api-key-dialog.tsx`, `api-key-list.tsx`. **6 callsites** — these become `intent="danger"`.
- Alpha tags via `<Tag color="orange">ALPHA</Tag>`: `model-row.tsx:233`, `model-table.tsx:345`. **2 callsites** — these become `intent="alpha"`.
- `themeTokens[theme]` consumed in 8 places, all in `usage-analytics/`: `stat.tsx`, `multi-select.tsx`, `period-picker.tsx`, `usage-graph.tsx` (3×), `earnings-graph.tsx` (2×). Get their own migration phase.
- Tier color mapping in `tier-panel.tsx:76` (`getTierColor`) returns one of 7 hues per tier. Stays as a small lookup table; not promoted to an intent.

---

## Architecture: 4-axis token system on CSS variables

### The four axes

| Axis | What it controls | Where it's set | When it changes |
|---|---|---|---|
| `mode` | day / night | `<html data-mode="light|dark">` | User toggles |
| `theme` | which hue this scope uses | page wrapper `data-theme="amber"`, or `<ThemeScope>` | User navigates / nested override |
| `intent` | semantic meaning that overrides theme | component prop `<Button intent="danger">` | Per component, rare |
| `tone` | surface fill style | component prop `<Surface tone="tinted">` | Per component |

### Layer 1 — Hue ramps (constants)

In `style.css @theme`. Tailwind 4 already exposes `--color-amber-200` etc.; we just confirm they're available and add aliases for our 6 themes + semantic palettes.

```css
@theme {
  /* Tailwind palettes used by themes — already exposed by Tailwind 4, listed for clarity */
  /* amber, blue, pink, teal, violet, green */

  /* Semantic palettes — orthogonal to page themes */
  /* red (danger), emerald (success — distinct from green chrome to avoid ambiguity) */

  /* Money — promoted from balance-colors.ts hex */
  --color-paid:        #E08A52;
  --color-paid-hover:  #C97540;
  --color-paid-deep:   #7C3F1E;
  --color-tier:        #FCD34D;
  --color-tier-hover:  #EAB818;
  --color-tier-deep:   #7A5807;

  /* Universal */
  --color-focus-ring: oklch(from var(--color-emerald-500) l c h / 0.6);
  --color-surface-white-light: oklch(1 0 0 / 0.8);
  --color-surface-white-dark:  oklch(0.18 0.01 240 / 0.85);
}
```

### Layer 2 — Mode + theme cascade (the flippable layer)

In `style.css`. **Defaults are light mode.** Dark mode overrides via descendant selector so `data-mode` lives on `<html>` and `data-theme` lives on the page wrapper without coupling.

```css
/* Light defaults — applied via [data-theme] on the page wrapper */
[data-theme="amber"] {
  --theme-text-label:   var(--color-amber-600);
  --theme-text-base:    var(--color-amber-900);
  --theme-text-strong:  var(--color-amber-950);
  --theme-text-muted:   oklch(from var(--color-amber-800) l c h / 0.75);
  --theme-text-soft:    var(--color-amber-700);
  --theme-text-softer:  oklch(from var(--color-amber-700) l c h / 0.6);

  --theme-border-idle:    var(--color-amber-300);
  --theme-border-soft:    oklch(from var(--color-amber-300) l c h / 0.7);
  --theme-border-subtle:  var(--color-amber-200);

  --theme-bg-idle:    oklch(from var(--color-amber-50) l c h / 0.8);
  --theme-bg-subtle:  oklch(from var(--color-amber-50) l c h / 0.5);
  --theme-bg-tinted:  oklch(from var(--color-amber-50) l c h / 0.7);
  --theme-bg-active:  var(--color-amber-200);
  --theme-bg-hover:   var(--color-amber-300);

  --theme-chip-bg:    var(--color-amber-200);
  --theme-chip-text:  var(--color-amber-950);

  --theme-button-light-bg:    var(--color-amber-200);
  --theme-button-light-text:  var(--color-amber-900);
  --theme-button-light-hover: var(--color-amber-300);
  --theme-button-strong-bg:    var(--color-amber-600);
  --theme-button-strong-text:  white;
  --theme-button-strong-hover: var(--color-amber-700);

  --theme-ring-focus: oklch(from var(--color-amber-400) l c h / 0.7);
}

[data-theme="blue"]   { /* same shape, blue ramps */ }
[data-theme="pink"]   { /* same shape, pink ramps */ }
[data-theme="teal"]   { /* same shape, teal ramps */ }
[data-theme="violet"] { /* same shape, violet ramps */ }
[data-theme="green"]  { /* same shape, green ramps — for chrome */ }

/* Dark mode — descendant selector means data-mode lives on <html> independently */
html[data-mode="dark"] [data-theme="amber"] {
  --theme-text-label:   var(--color-amber-300);
  --theme-text-base:    var(--color-amber-100);
  --theme-text-strong:  var(--color-amber-50);
  --theme-bg-idle:      oklch(from var(--color-amber-950) l c h / 0.5);
  --theme-bg-tinted:    oklch(from var(--color-amber-950) l c h / 0.4);
  --theme-chip-bg:      var(--color-amber-800);
  --theme-chip-text:    var(--color-amber-50);
  /* …etc */
}
/* …same dark block per theme. Curating dark values is a follow-up plan after Phase 8. */
```

### Layer 2b — Intents (semantic overrides, applied per component)

Intents do **not** cascade like themes. They're component-prop-driven because the use cases are point-overrides (one button, one surface, one tag).

```css
/* Intent tokens — flat, mode-aware, theme-independent */
:root {
  --intent-danger-bg-light:    var(--color-red-100);
  --intent-danger-bg-strong:   var(--color-red-600);
  --intent-danger-bg-hover:    var(--color-red-700);
  --intent-danger-text:        var(--color-red-700);
  --intent-danger-text-on-bg:  white;
  --intent-danger-border:      var(--color-red-300);

  --intent-success-bg-light:   var(--color-emerald-100);
  --intent-success-bg-strong:  var(--color-emerald-600);
  --intent-success-text:       var(--color-emerald-700);
  --intent-success-text-on-bg: white;
  --intent-success-border:     var(--color-emerald-300);

  --intent-paid-bg:            var(--color-paid);
  --intent-paid-bg-hover:      var(--color-paid-hover);
  --intent-paid-text-deep:     var(--color-paid-deep);

  --intent-alpha-bg:           var(--color-orange-200);
  --intent-alpha-text:         var(--color-orange-900);
}

html[data-mode="dark"] {
  --intent-danger-bg-light:    oklch(from var(--color-red-950) l c h / 0.4);
  --intent-danger-text:        var(--color-red-300);
  /* …etc */
}
```

### Layer 3 — Tailwind utility surface (`@theme inline`)

`@theme inline` is required because these utilities reference other CSS vars (without `inline`, Tailwind 4 may flatten/freeze the values at build time and dark mode would stop flipping).

```css
@theme inline {
  /* Themed utilities — auto-flip with mode + theme */
  --color-theme-text-base:        var(--theme-text-base);
  --color-theme-text-strong:      var(--theme-text-strong);
  --color-theme-text-muted:       var(--theme-text-muted);
  --color-theme-text-soft:        var(--theme-text-soft);
  --color-theme-text-softer:      var(--theme-text-softer);
  --color-theme-border:           var(--theme-border-idle);
  --color-theme-border-subtle:    var(--theme-border-subtle);
  --color-theme-bg-tinted:        var(--theme-bg-tinted);
  --color-theme-bg-subtle:        var(--theme-bg-subtle);
  --color-theme-chip-bg:          var(--theme-chip-bg);
  --color-theme-chip-text:        var(--theme-chip-text);
  --color-theme-button-light-bg:    var(--theme-button-light-bg);
  --color-theme-button-light-text:  var(--theme-button-light-text);
  --color-theme-button-light-hover: var(--theme-button-light-hover);
  --color-theme-button-strong-bg:    var(--theme-button-strong-bg);
  --color-theme-button-strong-text:  var(--theme-button-strong-text);
  --color-theme-button-strong-hover: var(--theme-button-strong-hover);

  /* Intent utilities */
  --color-intent-danger-bg-light:   var(--intent-danger-bg-light);
  --color-intent-danger-bg-strong:  var(--intent-danger-bg-strong);
  --color-intent-danger-text:       var(--intent-danger-text);
  --color-intent-danger-border:     var(--intent-danger-border);
  --color-intent-success-bg-strong: var(--intent-success-bg-strong);
  --color-intent-success-text:      var(--intent-success-text);
  --color-intent-paid:              var(--intent-paid-bg);
  --color-intent-paid-deep:         var(--intent-paid-text-deep);
  --color-intent-alpha-bg:          var(--intent-alpha-bg);
  --color-intent-alpha-text:        var(--intent-alpha-text);

  /* Universal */
  --color-focus-ring:           var(--color-focus-ring);
  --color-surface-white:        var(--color-surface-white-light);
}

html[data-mode="dark"] {
  --color-surface-white: var(--color-surface-white-dark);
}
```

### After this lands, JSX becomes:

```jsx
<main data-theme="amber">
  {/* Inherits page theme */}
  <Chip>NEW</Chip>                      {/* bg-theme-chip-bg text-theme-chip-text */}
  <Button>Top up</Button>               {/* bg-theme-button-strong-bg text-theme-button-strong-text */}

  {/* Intent overrides theme */}
  <Button intent="danger">Delete</Button>            {/* red, regardless of page */}
  <Surface intent="danger">Error message</Surface>   {/* red bg-light, red border */}
  <Tag intent="alpha">ALPHA</Tag>                    {/* orange, regardless of page */}
  <Switch status="ready" />              {/* uses intent="success" internally */}
</main>
```

Switching pages: `<main>`'s `data-theme` changes. **Zero JSX touches.**
Switching dark mode: `<html>`'s `data-mode` changes. **Zero JSX touches.**

### `dashboard-theme.ts` — what's left

```ts
export const themes = ["amber", "blue", "pink", "teal", "violet", "green"] as const;
export type ThemeName = typeof themes[number];

export const intents = ["danger", "success", "paid", "alpha"] as const;
export type IntentName = typeof intents[number];

export const navItems = [
  { id: "updates", label: "News & FAQ", theme: "violet" },
  { id: "models",  label: "Models",     theme: "teal"   },
  { id: "keys",    label: "Keys",       theme: "blue"   },
  { id: "pollen",  label: "Pollen",     theme: "amber"  },
  { id: "usage",   label: "Activity",   theme: "pink"   },
] as const satisfies ReadonlyArray<{ id: string; label: string; theme: ThemeName }>;

// Old: panelColors, cardColors, pillColors, tagColors, tabColors, buttonColors,
//      themeTokens, dashboardThemeClasses → ALL DELETED (cascade does the work).
```

After this lands, **6 color tables × 7 themes ≈ 60 hand-typed entries → 0**.

---

## Phase plan (one PR per phase)

Each phase: scope, files, verifications, ship gate. **Ship the phase only when verifications pass.** Phases are dependency-ordered.

---

### Phase 0 — CSS-var cascade + Design showcase page (paired)

**The change:** Stand up Layers 1, 2, 2b, 3 of the cascade **and** build the `/internal/design` showcase route in the same PR. They validate each other: building the showcase forces the token names to make sense before any component migrates.

**Files:**
- Modify: `enter.pollinations.ai/src/client/style.css` — add hue ramps (Layer 1), `[data-theme="*"]` blocks for all 6 themes (Layer 2), intent vars (Layer 2b), `@theme inline` utility surface (Layer 3), `html[data-mode="dark"]` skeletal overrides per theme.
- Modify: `enter.pollinations.ai/src/client/components/layout/dashboard-theme.ts` — add slim `themes`, `ThemeName`, `intents`, `IntentName`, simplified `navItems`. Keep all old exports intact for now.
- Modify: `enter.pollinations.ai/src/client/main.tsx` (or root entry) — set `<html data-mode="light">` on mount. Wire a temporary URL-query toggle (`?mode=dark`) for showcase testing; production toggle UI lands with the dark-mode launch plan.
- Modify: `enter.pollinations.ai/src/client/components/layout/dashboard-shell.tsx` — add `data-theme={currentTheme}` to the main page wrapper based on `dashboardThemeByPage`.
- Modify: `tailwind.config.*` or `style.css @source` — ensure JIT scans the new `bg-theme-*` / `text-theme-*` / `bg-intent-*` utility class names.
- Create: `enter.pollinations.ai/src/client/routes/internal.design.tsx` — the showcase route.
- Create: `enter.pollinations.ai/src/client/components/internal/design-showcase.tsx` — the page contents.

**Showcase route gating** (TanStack file routes will compile any file in `routes/` into `routeTree.gen.ts`, so prod gating is explicit):

```tsx
// routes/internal.design.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/internal/design")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: DesignShowcase,
});
```

**Showcase contents** (each section labeled, each variant rendered side-by-side):

1. **Mode + theme override toggles** at the top — flip `data-mode` and `data-theme` on a wrapper to preview the entire page in any combination.
2. **Themes strip** — 6 hue ramps as swatches.
3. **Typography** — h1, h2, h3, h4, h5, h6, body, all size tokens (`text-3xs`, `text-2xs`, `text-xs`, `text-sm`, `text-md`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl`).
4. **Chips** — one per theme.
5. **Buttons** — per theme: `weight="light"`, `weight="strong"`, `disabled`. Plus `intent="danger"`, `intent="success"` overrides.
6. **Switches** — per theme: `status="off"`, `"draft"` (red), `"ready"` (green).
7. **Surfaces** — per theme: `(tone="white", size="card")`, `(tone="tinted", size="card")`, same for `size="panel"`. Plus `intent="danger"` for error surfaces.
8. **Tabs** — `<TabButton>` strip per theme, active + inactive.
9. **Inputs** — default, focused (`autofocus` instance), error.
10. **IconButtons** — default (inherits theme) + `intent="danger"`.
11. **InfoTip** — every tone, popup expanded.
12. **Money colors** — `bg-intent-paid`, `bg-intent-paid-hover`, `text-intent-paid-deep`, `bg-color-tier`, etc.
13. **Intent demo** — same component (Tag, Button, Surface) on each of the 5 themes with `intent="danger"` to prove the override wins everywhere.

**Steps:**
1. Add Layers 1, 2, 2b, 3 to `style.css`.
2. Wire `data-theme` on the dashboard wrapper; `data-mode` on `<html>`.
3. Add the `/internal/design` route with prod gating.
4. Build the showcase, section by section. Sections that require not-yet-migrated primitives (Chip, Switch, Surface, Intent-aware Button) render placeholders with `// Phase N` notes.
5. The showcase sections that CAN be built today against raw cascade utilities (Themes strip, Typography, intent demo using inline `bg-intent-*` classes, Mode/Theme toggles) **must work** before this PR lands.
6. Visual sweep: every existing screen unchanged.
7. Commit: `chore(theme): introduce CSS-var cascade + design showcase`.

**Verification:**
- `npm run dev` — open `localhost:3000/internal/design` — page renders, theme override toggle changes the visible color, `?mode=dark` query flips the dark cascade (looks raw but no white-on-white).
- `npm run build && npm run preview` — `/internal/design` redirects to `/`.
- Every existing screen visually identical (cascade is added but no primitive consumes it yet).
- `npm run test`, `npx biome check --write` clean.

**Ship gate:** Showcase loads in dev, gated in prod. Theme override toggle flips visible color on every showcase section that's wired. Existing dashboard pages are pixel-identical.

---

### Phase 1 — Collapse `chip` (Tag + Pill + Tab-active + Button-light)

**The change:** All four primitives that render `bg-X-200 text-X-?00` migrate to `bg-theme-chip-bg text-theme-chip-text`. The four hand-typed tables get deleted. Per Q8: static chips are rect (`rounded-lg`); clickable chips inherit pill from their button host.

**Files:**
- Create: `ui/chip.tsx` — `<Chip>` (rect, default) reads from cascade. Replaces `<Tag>` and `<Pill>`. Accepts optional `theme?: ThemeName` and `intent?: IntentName` props (intent wins if both set).
- Modify: `ui/tag.tsx` — re-export `Tag` as `Chip` for migration; flag for deletion in Phase 9.
- Modify: `ui/tab-button.tsx` — active state reads `bg-theme-chip-bg text-theme-chip-text border-theme-border`; inactive reads `bg-theme-bg-subtle text-theme-text-base border-theme-border-soft`.
- Modify: `ui/button.tsx` — `weight="light"` reads `bg-theme-button-light-bg text-theme-button-light-text hover:bg-theme-button-light-hover`. Keep `color` prop temporarily (renamed to `theme`) until Phase 4.
- Delete from `dashboard-theme.ts`: `tagColors` (move to `ui/tag.tsx` first if not already), `pillColors`, `tabColors`, `buttonColors[*].light` field.
- Migrate `<Tag color="orange">ALPHA</Tag>` → `<Chip intent="alpha">` (introduces intent for the first time).
- Migrate `<Tag color="green">NEW</Tag>` → `<Chip>` on the `green` chrome theme — verify visual.
- Find consumers: `rg "tagColors|pillColors|tabColors|<Tag |<Pill " enter.pollinations.ai/src/client/`.

**Showcase update:** Unstub the Chips section.

**Verification:**
- `rg "tagColors|pillColors|tabColors" enter.pollinations.ai/src/client/` → zero.
- Drift bugs (#07, #08) auto-fixed (one source).
- Visual sweep — every chip on every page reads the chip recipe.
- Showcase Chips section displays correctly per theme.

**Ship gate:** No chip looks "off"; tabs feel identical; ALPHA tags still orange.

---

### Phase 2 — Promote `<Switch>` to a shared primitive

**The change:** Create `ui/switch.tsx`. Replace both copies (`AutoTopUpToggle`, `DeveloperEarningsSwitch`). Switch reads from theme cascade for `off`; uses intent vars for `draft` (danger) and `ready` (success).

**Files:**
- Create: `ui/switch.tsx`
  ```tsx
  type SwitchStatus = "off" | "on" | "draft" | "ready";
  interface SwitchProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    status?: SwitchStatus;          // default: checked ? "on" : "off"
    label?: string;
    disabled?: boolean;
  }
  ```
  - Geometry locked: `h-7 w-12` track, `h-5 w-5` thumb, `translate-x-1` ↔ `translate-x-6`.
  - `off`: `bg-theme-bg-subtle border-theme-border-soft` (page theme, light fill).
  - `on`: `bg-theme-chip-bg border-theme-border` (page theme, active fill).
  - `draft`: `bg-intent-danger-bg-light border-intent-danger-border` (red, page-theme-independent).
  - `ready`: `bg-intent-success-bg-strong border-intent-success-border` (green, page-theme-independent).
- Modify: `components/balance/auto-top-up-panel.tsx:378-431` — replace `AutoTopUpToggle` with `<Switch status={toggleStatus} ... />` where `toggleStatus` is computed from existing `ToggleStatus` type, mapping `"on"` → `"ready"` when fully configured.
- Modify: `components/api-keys/publishable-key-settings.tsx:105-143` — replace `DeveloperEarningsSwitch` with `<Switch ... />`.
- Test: `ui/__tests__/switch.test.tsx` — render each status, assert classes, click toggles.

**Showcase update:** Unstub the Switches section. Show all 4 statuses on each theme.

**Verification:**
- Vitest passes.
- Manual: toggle auto-top-up off → draft (after enabling without payment method) → ready (after full setup). Toggle developer earnings off/on.
- `rg "h-7 w-12.*rounded-full" enter.pollinations.ai/src/client/` → only `ui/switch.tsx`.

**Ship gate:** Both screens behave identically; the auto-top-up draft state visibly shifts to red and ready to green; off-state amber matches page theme.

---

### Phase 3 — Collapse Card + Panel into `<Surface>`

**The change:** One primitive, two well-named axes. Per Q9: `tone="white"|"tinted"`. Per Q10: drop the `bg=` escape hatch — current uses are semantic and migrate to `intent` in Phase 4.

**Files:**
- Create: `ui/surface.tsx`
  ```tsx
  interface SurfaceProps {
    tone?: "white" | "tinted";        // default "white"
    size?: "card" | "panel";          // default "card"
    intent?: IntentName;              // optional — overrides theme cascade
    children: React.ReactNode;
    className?: string;
  }
  ```
  - `tone="white"` → `bg-surface-white` (CSS var, mode-aware).
  - `tone="tinted"` → `bg-theme-bg-tinted` (theme + mode aware).
  - `size="card"` → `rounded-xl border p-4`.
  - `size="panel"` → `rounded-2xl border p-6`.
  - Border = `border-theme-border` by default, `border-intent-{intent}-border` when intent is set (auto-fixes teal off-by-one #11).
  - When `intent` is set, bg is `bg-intent-{intent}-bg-light` regardless of tone.
- Modify: `ui/card.tsx`, `ui/panel.tsx` — re-export as thin wrappers. Mark for deletion in Phase 9.
- Delete: `cardColors`, `panelColors` from `dashboard-theme.ts`.

**Showcase update:** Unstub the Surfaces section. Show all `(tone, size)` combos per theme + `intent="danger"` row.

**Verification:**
- `rg "cardColors|panelColors" enter.pollinations.ai/src/client/` → zero.
- Visual sweep — teal cards/panels gain border-300 (intentional).

**Ship gate:** No visible change except the teal border bump (note in PR description per Q19).

---

### Phase 4 — Button + Intent system

**The change:** This is the biggest phase. Apply Q6, Q7, Q8 + introduce `intent` as a first-class prop on `<Button>`, `<Surface>`, `<Tag/Chip>`, `<IconButton>`. Migrate every semantic-color callsite (red errors, alpha tags, paid balance UI).

- **Q6:** `strong` weight = `bg-theme-button-strong-bg text-theme-button-strong-text hover:bg-theme-button-strong-hover` for every theme. Bug #05 auto-fixed.
- **Q7:** Drop `outline` weight. Migrate to `light` or `strong`.
- **Q8:** Lock `<Button>` to pill. Delete `shape="rect"`. Static rectangular containers use `<Chip>`.
- **Intent system:** `<Button intent="danger">` reads `bg-intent-danger-bg-strong text-intent-danger-text-on-bg hover:bg-intent-danger-bg-hover`. `intent` prop on every primitive that accepts it (Button, Surface, Tag/Chip, IconButton).

**Files:**
- Modify: `ui/button.tsx`
  - Reduce `weight` union to `"light" | "strong"`.
  - Remove `shape` prop (always `rounded-full`).
  - Add `intent?: IntentName` prop (overrides theme).
  - Rename `color` prop to `theme` (per Q3 — `theme` is optional; default = inherit from `data-theme`).
- Modify: `dashboard-theme.ts` — delete `buttonColors` table entirely.
- Migrate `<Button color="purple">` → `<Button theme="violet">` (per Q2).
- Migrate `<Button color="dark|gray">` — these aren't a page theme. Most should become **no theme prop** (inherit from cascade). For chrome-only buttons that genuinely need page-independent styling, use `intent="neutral"` — but **wait**: we dropped neutral. Re-evaluate per call-site:
  - Sidebar/footer buttons → wrap in `<ThemeScope theme="green">` (chrome theme) and use default Button.
  - True utility (e.g. modal close X) → use a `<IconButton>` instead.
- Migrate `<Button color="red">` → `<Button intent="danger">`. Callsites: `delete-confirmation.tsx`, `edit-api-key-dialog.tsx`, `api-key-dialog.tsx`, `api-key-list.tsx`.
- Migrate `<Surface color="red" bg="bg-red-100">` → `<Surface intent="danger" tone="tinted">`. Same files.
- Migrate `<Tag color="orange">ALPHA</Tag>` → `<Chip intent="alpha">` (already done in Phase 1 — verify).
- Delete `bg=` prop on `<Surface>` (no consumers left after migration).

**Steps:**
1. Implement intent props on `<Button>`, `<Surface>`, `<Chip>` (Tag), `<IconButton>`.
2. Mass-migrate consumers via grep:
   - `rg 'color="(purple|dark|gray|red|outline)"|shape="rect"|weight="outline"' enter.pollinations.ai/src/client/`
   - Replace each per the rules above.
3. Delete `buttonColors`, the `bg=` prop on `<Surface>`.
4. Commit: `refactor(button): unify strong rule, drop outline/rect/purple, introduce intent system`.

**Showcase update:** Unstub the Buttons + Intent demo sections.

**Verification:**
- `rg 'color="(purple|dark|gray|red)"' enter.pollinations.ai/src/client/` → zero.
- `rg 'shape="rect"|weight="outline"' enter.pollinations.ai/src/client/` → zero.
- `rg 'bg="bg-' enter.pollinations.ai/src/client/` → zero.
- Every primary CTA on every page reads as the same lightness.
- Delete buttons render red on every page (test: open delete dialog from `/keys` and verify).

**Ship gate:** Side-by-side primary buttons on each of the 5 pages match in lightness. Delete-confirmation dialog still reads as destructive.

---

### Phase 5 — Migrate `themeTokens` consumers in usage-analytics

**The change:** 8 callsites in `usage-analytics/` import `themeTokens[theme]` and read fields like `tokens.text.label`, `tokens.border.idle`, `tokens.scrollbar.*`. They must migrate to direct utility classes (`text-theme-text-label`, `border-theme-border`, etc.) so we can delete `themeTokens` from `dashboard-theme.ts`.

**Files:**
- Modify: `components/usage-analytics/stat.tsx:12`
- Modify: `components/usage-analytics/multi-select.tsx:30`
- Modify: `components/usage-analytics/period-picker.tsx:82`
- Modify: `components/usage-analytics/usage-graph.tsx:32, 264, 296`
- Modify: `components/usage-analytics/earnings-graph.tsx:27, 265`

For each: replace `tokens.text.label` → `text-theme-text-label` className, etc. The `theme` prop on these components becomes optional (defaults to inheriting from cascade); when provided, the component wraps its content in `<ThemeScope theme={theme}>` so the cascade picks up the override.

**Steps:**
1. Build `<ThemeScope>` if not already present from earlier phases.
   ```tsx
   // ui/theme-scope.tsx
   export function ThemeScope({ theme, children, className }: { theme: ThemeName; children: React.ReactNode; className?: string }) {
     return <div data-theme={theme} className={className}>{children}</div>;
   }
   ```
2. Migrate each callsite (8 total). Per file, verify the chart/picker still renders identically.
3. Delete `themeTokens` and `dashboardThemeClasses` from `dashboard-theme.ts`.
4. Commit: `refactor(usage-analytics): migrate themeTokens consumers to cascade`.

**Verification:**
- `rg "themeTokens\\[" enter.pollinations.ai/src/client/` → zero.
- `rg "dashboardThemeClasses" enter.pollinations.ai/src/client/` → zero (also fixes bug #02 structurally).
- Charts render identically; period picker, multi-select unchanged.

**Ship gate:** Activity page's charts, stats, period picker visually identical.

---

### Phase 6 — Hoist money colors to tokens

**The change:** Money hex constants live in `style.css @theme` as CSS vars; exposed via `bg-intent-paid`, `text-intent-paid-deep`, `bg-color-tier`, `text-color-tier-deep` (also hover variants). `lib/balance-colors.ts` shrinks to the hex-export needed by Recharts.

**Files:**
- Modify: `style.css @theme` — vars already added in Phase 0 (Layer 1); confirm.
- Modify: `lib/balance-colors.ts` — keep hex exports for Recharts only.
- Migrate inline hex:
  - `rg '#E08A52|#C97540|#7C3F1E|#FCD34D|#EAB818|#7A5807' enter.pollinations.ai/src/client/`
  - Files (audit): `components/balance/pollen-balance.tsx:122,139,143-144`, `components/balance/pollen-pack-controls.tsx:289`, `components/balance/earnings-graph.tsx`, `components/balance/usage-graph.tsx`.
  - Replace `bg-[#E08A52]` → `bg-intent-paid`, `text-[#7C3F1E]` → `text-intent-paid-deep`, `bg-[#FCD34D]` → `bg-color-tier`, etc.

**Showcase update:** Unstub the Money colors section.

**Verification:**
- `rg '\\[#(E08A52|C97540|7C3F1E|FCD34D|EAB818|7A5807)\\]' enter.pollinations.ai/src/client/` → zero.
- PollenBalance, EarningsGraph, UsageGraph visually identical.

**Ship gate:** Charts and balance UI unchanged.

---

### Phase 7 — Type scale + h4–h6

**The change:** Per Q12, Q13. Promote off-scale font sizes; switch h4–h6 to body sans.

**Files:**
- Modify: `style.css @theme`
  ```css
  --text-3xs: 10px;
  --text-2xs: 11px;
  --text-md:  15px;
  ```
- Modify: `style.css` h4–h6 rule
  ```css
  h4 { @apply text-lg font-body font-semibold; }
  h5 { @apply text-base font-body font-semibold; }
  h6 { @apply text-sm font-body font-semibold; }
  ```
- Migrate: `text-[10px]` → `text-3xs`, `text-[11px]` → `text-2xs`, `text-[15px]` → `text-md`.
  - Files (audit): `components/layout/dashboard-shell.tsx:392,408,413,416,419,425`, `components/ui/info-tip.tsx:71`, `components/balance/tier-explanation.tsx:78,80`, `components/balance/pollen-balance.tsx:143,144`, `components/api-keys/api-key-list.tsx:334`, `components/balance/period-picker.tsx:348`, `components/ui/chart.tsx:370`, `components/balance/auto-top-up-panel.tsx:412,539`.

**Showcase update:** Typography section now shows the new tokens.

**Verification:**
- `rg "text-\\[(10|11|15)px\\]" enter.pollinations.ai/src/client/` → zero.
- h4–h6 render in Uncut Sans.

**Ship gate:** You sign off on the heading hierarchy in showcase.

---

### Phase 8 — Theme leaks fix (Input + IconButton)

**The change:** Per Q14, Q15.

1. **`<Input>` focus ring** — switch to single neutral CSS var.
   ```tsx
   className={cn(
     "px-3 py-2 border border-gray-300 rounded-lg",
     "focus:outline-none focus-visible:border-[--color-focus-ring] focus-visible:ring-1 focus-visible:ring-[--color-focus-ring]",
   )}
   ```
2. **`<IconButton>`** — drop the `color` prop. Default reads from theme cascade. Optional `intent="danger"` for delete-style icons.
   ```tsx
   interface IconButtonProps {
     intent?: IntentName;        // optional — when set, overrides theme
     children: React.ReactNode;
     onClick?: () => void;
     // …
   }

   // Default classes (no intent): bg-theme-bg-subtle hover:bg-theme-bg-active text-theme-text-soft hover:text-theme-text-strong
   // intent="danger": bg-intent-danger-bg-light hover:bg-intent-danger-bg-strong text-intent-danger-text hover:text-intent-danger-text-on-bg
   ```
3. **Bug #02** (`dashboardThemeClasses[X].active` text-green-950) — already fixed structurally in Phase 5 when `dashboardThemeClasses` was deleted; cascade now drives nav row coloring. Verify.

**Files:** `ui/input.tsx`, `ui/icon-button.tsx`, all `<IconButton>` consumers.

**Showcase update:** Unstub the Inputs + IconButtons sections.

**Steps:**
1. Patch `<Input>`. Test: tab into a form on each page; focus ring is consistent.
2. Patch `<IconButton>`. Migrate consumers (`<IconButton color="red">` → `<IconButton intent="danger">`; `<IconButton color="blue|gray">` → drop the prop).
3. Verify nav row coloring is correct on each page (no text-green-950 leaking).
4. Commit: `fix(theme): page-theme leaks in nav, input, icon-button`.

**Verification:**
- Active nav row text matches page theme on all 5 pages.
- Form focus ring is uniform neutral.
- Delete icons read red on every page.

**Ship gate:** Tab through every themed page; focus rings uniform; delete icons red.

---

### Phase 9 — Cleanup + Q16/Q17/Q18

**The change:** Remove what no longer has any consumer.

**Sub-tasks:**
1. **Drop `yellow`** — `<InfoTip tone="yellow">` → `tone="amber"`. Audit confirmed yellow has no other home.
2. **Flatten `<InfoTip>` (Q18)** — replace `bg-gradient-to-r from-X-50 to-Y-50` with single-tone bg. For themed tones use `bg-theme-bg-tinted` if InfoTip should follow page theme, else use semantic intent-based bg.
3. **Drop `rounded-md` (Q16)** — sweep replacement to `rounded-lg`.
4. **Normalize `border-4` → `border-2` (Q17)** — auth modal, API key dialog.
5. **Delete legacy wrappers** — `ui/tag.tsx`, `ui/card.tsx`, `ui/panel.tsx` re-exports introduced earlier.
6. **Final grep cleanup** — any `bg-[#`, `text-[#` remaining in components must be deliberate (chart libs).

**Steps:**
1. Drop yellow from InfoTip + sweep consumers.
2. Flatten InfoTip popups.
3. Sweep `rounded-md` → `rounded-lg`.
4. Sweep `border-4` → `border-2`.
5. Delete wrapper re-exports.
6. Final grep audit.
7. Commit: `chore(theme): drop dead colors, flatten gradients, finalize cleanup`.

**Verification:**
- `rg "yellow|gradient-to-r|rounded-md|border-4" enter.pollinations.ai/src/client/components/` → only intentional residuals (none expected).
- Hex literal grep: only chart-library callsites.

**Ship gate:** Sit with the dashboard 10 minutes; anything off gets noted and fixed.

---

## Cross-cutting verification (run after Phase 9)

- [ ] `rg "tagColors|pillColors|tabColors|cardColors|panelColors|buttonColors|themeTokens|dashboardThemeClasses" enter.pollinations.ai/src/client/` → zero.
- [ ] `rg "bg-\\[#|text-\\[#" enter.pollinations.ai/src/client/components/` → only chart-library callsites.
- [ ] `rg 'color="(purple|yellow|dark|gray|red|orange)"' enter.pollinations.ai/src/client/` → zero.
- [ ] `rg "text-\\[(10|11|15)px\\]" enter.pollinations.ai/src/client/` → zero.
- [ ] `rg "rounded-md|border-4" enter.pollinations.ai/src/client/` → zero.
- [ ] `rg 'weight="outline"|shape="rect"|bg="bg-' enter.pollinations.ai/src/client/` → zero.
- [ ] `rg "text-green-950" enter.pollinations.ai/src/client/components/layout/` → only inside the green chrome theme.
- [ ] `npm run test` in `enter.pollinations.ai/` passes.
- [ ] `npx biome check --write enter.pollinations.ai/src/client/` clean.
- [ ] `npm run build && npm run preview` — `/internal/design` redirects to `/`.
- [ ] **Dark-mode smoke test**: in dev, `?mode=dark` query — every primitive on every page looks intentional (raw values, not curated yet — but no white-on-white). Confirms cascade is wired.
- [ ] Manual smoke on the dashboard pages (Pollen, Keys, Activity, Models, News & FAQ) + login flow.

---

## Estimated effort

For one engineer, uninterrupted, including verification:

| Phase | Effort |
|---|---|
| 0 — Cascade + showcase (paired) | 1.5 days |
| 1 — Chip collapse | 1.5 days |
| 2 — Switch primitive | 0.5 day |
| 3 — Surface unification | 1 day |
| 4 — Button + Intent system | 1.5 days |
| 5 — Migrate `themeTokens` in usage-analytics | 0.5 day |
| 6 — Money colors | 0.5 day |
| 7 — Type scale + h4–h6 | 0.5 day |
| 8 — Theme leaks (Input, IconButton) | 0.5 day |
| 9 — Cleanup | 0.5 day |
| **Total** | **~8 days** |

Each phase amortizes ~0.25 day for unstubbing the showcase section and re-scanning.

---

## Notes

- This plan does **not** touch `pollinations.ai/` (marketing site). Separate plan if needed.
- Each phase ships as one PR. Resist scope creep.
- Per Q19, deliberate visual improvements are OK but **must be listed in the PR description**. Examples: chips going from `text-X-900` to `text-X-950` (Q5); teal borders going from 200 to 300 (#11); buttons becoming consistent at strong-600 (Q6); auto-top-up draft state going from amber to red (Q24).
- **Dark mode rollout is a follow-up plan.** The cascade will be ready after Phase 0; the work is curating per-theme dark color values, building the user-facing toggle (replacing the `?mode=dark` dev shortcut), and walking the showcase page to verify every state.
- `superpowers:subagent-driven-development` works well: Phase 0 is the only one with hard sequencing dependencies; everything after is largely independent.
