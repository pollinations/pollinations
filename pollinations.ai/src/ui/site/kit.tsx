import {
    Chip,
    CopyButton,
    cn,
    Surface,
    type SurfaceProps,
} from "@pollinations/ui";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * The site's own design vocabulary — the pieces @pollinations/ui does not
 * carry, defined once so they cannot drift apart again.
 *
 * Everything the package already solves comes from the package: Surface, Chip,
 * TabButton, Button, Prose. What lives here is the marketing site's signature,
 * which the dashboard deliberately does not share.
 *
 * NOTE: classes here are unprefixed. `polli:*` belongs to the package's own
 * Tailwind build, which never scans this app — see the comment on styles.css.
 */

/* ── Layout ─────────────────────────────────────────────────────────────── */

/**
 * `SHELL` caps the layout and centres it; without it the sheet grew with the
 * viewport and a wide monitor read as one very large expanse rather than a
 * card on a desk. `GUTTER` is the inner inset — header, sheet and footer all
 * use both, so the logo, the page title and the footer columns land on the
 * same left edge.
 *
 * They must sit on SEPARATE nested elements. On one element `px-6` and
 * `md:px-18` are the same property, the breakpoint wins, and the outer inset
 * silently vanishes.
 */
export const SHELL = "mx-auto w-full max-w-[1240px] px-6";
export const GUTTER = "px-8 md:px-18";

const GRID_MIN = {
    /** Four across: short "on the way" notes. */
    narrow: "grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))]",
    /** Three across: the default card shelf. */
    wide: "grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))]",
} as const;

/**
 * One card grid for the whole site. Seven grids were hand-written with five
 * different minimum widths, which meant two sections of the same kind could
 * break to two columns at different viewport sizes.
 */
export function CardGrid({
    min = "wide",
    gap = "gap-5",
    children,
}: {
    min?: keyof typeof GRID_MIN;
    gap?: string;
    children: ReactNode;
}) {
    return <div className={cn("grid", GRID_MIN[min], gap)}>{children}</div>;
}

/* ── Labels and headings ────────────────────────────────────────────────── */

const PIXEL_LABEL = {
    /** Page and section eyebrows — the loudest of the three. */
    eyebrow: "text-sm tracking-widest text-theme-text-soft",
    /** Inside a card, above its heading. */
    card: "text-xs tracking-wider text-theme-text-soft",
    /** Chrome: footer column headings, filter axis names. */
    chrome: "text-micro tracking-widest text-theme-text-muted",
} as const;

/** The pixel-face uppercase label, at the three sizes the site actually uses. */
export function PixelLabel({
    variant = "card",
    className,
    children,
}: {
    variant?: keyof typeof PIXEL_LABEL;
    className?: string;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "font-pixel uppercase",
                PIXEL_LABEL[variant],
                className,
            )}
        >
            {children}
        </span>
    );
}

/**
 * The pixel chip: a label with a tile behind it. `pale` is the default
 * everywhere (the three ways, app badges); `accent` is reserved for the one
 * official thing on a page, so it only ever appears once per view.
 *
 * Keep emoji out of it. Pixelify Sans has no emoji glyphs, and the fallback
 * font's advance width doesn't reconcile with the pixel metrics — "🐝 BUZZ"
 * renders with the bee sitting on top of the B.
 */
export function PixelBadge({
    tone = "pale",
    className,
    children,
}: {
    tone?: "pale" | "accent";
    className?: string;
    children: ReactNode;
}) {
    return (
        <Chip
            size="sm"
            className={cn(
                "rounded-md font-pixel whitespace-nowrap uppercase",
                tone === "pale" && "bg-theme-bg-subtle text-theme-text-soft",
                className,
            )}
        >
            {children}
        </Chip>
    );
}

/**
 * The pixel rule — a 4px amber checkerboard, the mockup's section break. Two
 * rows of squares inside an 8px tile, so it reads as pixels rather than as a
 * dotted border.
 */
export function PixelRule({ className }: { className?: string }) {
    const amber =
        "color-mix(in oklab, var(--polli-color-bg-active) 90%, transparent)";
    return (
        <div
            aria-hidden="true"
            className={cn("h-2 rounded-[2px]", className)}
            style={{
                background: `conic-gradient(${amber} 25%, transparent 0 50%, ${amber} 0 75%, transparent 0)`,
                backgroundSize: "8px 8px",
            }}
        />
    );
}

type HeadingProps = {
    eyebrow: string;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Right-aligned control, e.g. "Submit your app" or the account menu. */
    action?: ReactNode;
};

/**
 * The one place eyebrow / title / subtitle spacing is defined.
 *
 * Before this, Hello used gap-6, Apps and Play used gap-2.5, and Community
 * used mt-3 + mt-4 margins — four pages, three systems, which is what made
 * switching tabs feel like switching sites.
 *
 * Every page title is the same size, too: a smaller heading on the inner pages
 * made them read as sub-pages of Hello rather than as peers.
 */
export function PageHeader({ eyebrow, title, subtitle, action }: HeadingProps) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-2xl flex-col gap-3">
                <PixelLabel variant="eyebrow">{eyebrow}</PixelLabel>
                <h1 className="font-heading text-5xl leading-tight text-theme-text-strong lg:text-7xl">
                    {title}
                </h1>
                {subtitle && (
                    // max-w-lg, not xl: the subtitle now sits over the hero
                    // scene, and at xl its last words reached past the mask's
                    // fade into the painted scenery.
                    <p className="max-w-lg text-lg leading-relaxed text-theme-text-base">
                        {subtitle}
                    </p>
                )}
            </div>
            {action}
        </header>
    );
}

/**
 * The opening block: a painted scene behind the header, dissolving into the
 * sheet.
 *
 * Each page has its own scene (public/heroes/, generated by
 * scripts/generate-hero-scenes.mjs) — a quiet, mostly-empty pale left where
 * the text sits, that page's character small in the right third, and a bottom
 * edge that melts into the sheet cream. The dissolve is done twice on
 * purpose: the art is prompted to fade toward #fef8eb at its own bottom, and
 * a CSS alpha mask covers the same zone — the model never hits the exact hex,
 * and a near-miss cream reads as a dirty seam without the mask.
 *
 * The scene bleeds to the sheet's top and side edges via negative margins;
 * `overflow-clip` on <main> crops it at the 28px radius (clip, not hidden —
 * hidden would stop /play's sticky output panel sticking).
 *
 * Below lg the axis flips: the scene becomes a short band up top, masked
 * downward, and the text follows underneath — overlaying text on the art at
 * phone widths puts it over the busy right third, which is where the
 * character lives.
 */
export function Hero({
    scene,
    compact = false,
    children,
}: {
    /** /heroes/{home,play,apps,community}.webp */
    scene: string;
    /** Play: the product waits below, so the hero takes no extra height at
     *  all — the section is exactly as tall as its text, the same maths that
     *  spaces Hello, and the scene is cropped to whatever that leaves. */
    compact?: boolean;
    children: ReactNode;
}) {
    return (
        <section
            className={cn(
                "-mx-8 -mt-16 relative md:-mx-18 lg:flex lg:items-start",
                !compact && "lg:min-h-[540px]",
            )}
        >
            <img
                src={scene}
                alt=""
                aria-hidden="true"
                width={2048}
                height={854}
                // The LCP element on every page — never lazy.
                fetchPriority="high"
                className="hero-scene pointer-events-none h-56 w-full select-none object-cover object-right-bottom sm:h-72 lg:absolute lg:inset-0 lg:h-full"
            />
            <div className="relative flex w-full min-w-0 flex-col gap-8 px-8 pb-2 md:px-18 lg:max-w-[58%] lg:py-16">
                {children}
            </div>
        </section>
    );
}

/**
 * The row of big numbers under a hero. Hello and Community both carry one.
 *
 * Callers pass only what they could actually measure — a stat whose feed
 * failed is dropped upstream rather than rendered as a dash, because a row of
 * dashes looks broken while a shorter row just looks shorter.
 */
export function StatRow({
    stats,
    placeholders = 3,
}: {
    stats: { value: string; label: string }[];
    /** How many slots to hold open while the numbers are still loading. */
    placeholders?: number;
}) {
    // Returning null used to let the hero paint short and then grow by ~66px
    // when the numbers landed. The row keeps its height from the first frame
    // and fills in, so nothing below it moves.
    const loading = stats.length === 0;
    const slots = loading
        ? Array.from({ length: placeholders }, (_, i) => ({
              value: null,
              label: null,
              key: `slot-${i}`,
          }))
        : stats.map((stat) => ({ ...stat, key: stat.label }));

    return (
        <dl className="mt-2 flex flex-wrap gap-10" aria-busy={loading}>
            {slots.map((slot) => (
                <div key={slot.key} className="flex flex-col gap-1">
                    <dt className="font-heading text-4xl text-theme-text-soft tabular-nums">
                        {slot.value ?? (
                            <span
                                aria-hidden="true"
                                className="block h-9 w-24 animate-pulse rounded-md bg-theme-bg-subtle"
                            />
                        )}
                    </dt>
                    <dd className="text-xs text-theme-text-muted">
                        {slot.label ?? (
                            <span
                                aria-hidden="true"
                                className="block h-3 w-20 animate-pulse rounded bg-theme-bg-subtle"
                            />
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/** Same rhythm one level down. Section titles are text-4xl everywhere. */
export function SectionHeader({
    eyebrow,
    title,
    subtitle,
    action,
}: HeadingProps) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-2xl flex-col gap-3">
                <PixelLabel variant="eyebrow">{eyebrow}</PixelLabel>
                <h2 className="font-heading text-4xl leading-tight text-theme-text-strong">
                    {title}
                </h2>
                {subtitle && (
                    <p className="max-w-xl leading-relaxed text-theme-text-base">
                        {subtitle}
                    </p>
                )}
            </div>
            {action}
        </div>
    );
}

/* ── Controls ───────────────────────────────────────────────────────────── */

/**
 * packages/ui's Button is a rounded-full pill that brightens on hover — right
 * for the dashboard, wrong here. This design uses a 12px rectangle with a hard
 * bottom/right edge. The edge is a real border inside the anchor's box, not a
 * shadow painted outside it, so every visible pixel has one cursor owner and
 * receives clicks.
 */
const ACTION_BASE =
    "inline-flex cursor-pointer items-center justify-center rounded-xl " +
    "border-r-4 border-b-4 border-solid px-7 py-3.5 text-base font-semibold";

/**
 * Each tone is a fill plus an edge, and hover deepens the edge.
 *
 * Deepening rather than thickening: growing the border would change the box
 * and shove the label a pixel, which is the layout-shift-under-the-pointer
 * that caused trouble in the first place. The colour change costs no layout.
 *
 * Every edge is brand-dark at an opacity, so the four tones read as one family
 * instead of four hand-written rgba() values, and hover is just a deeper step
 * of the same colour.
 *
 * Untransitioned on purpose. These resolve through --polli-color-brand-dark,
 * and Chrome cannot interpolate a colour that comes from a custom property —
 * see the note in styles.css. An instant snap also suits a hard pixel edge
 * better than a fade.
 */
const ACTION_TONE = {
    /** Primary: amber fill. */
    accent:
        "border-brand-dark/20 hover:border-brand-dark/45 " +
        "bg-theme-bg-active text-theme-text-strong",
    /** Secondary: white fill, lighter edge. */
    plain:
        "border-brand-dark/10 hover:border-brand-dark/30 " +
        "bg-surface-opaque text-theme-text-strong",
    /** For use on the amber CTA panel, where white and amber both disappear. */
    dark:
        "border-brand-dark/25 hover:border-brand-dark/50 " +
        "bg-brand-dark text-theme-bg-active",
    /**
     * For use on the dark panel. `bg-active` flips to a muted oklch(0.496 …)
     * inside `.dark` — correct for dark chrome, muddy for the one button meant
     * to be the brightest thing there. brand-accent is hue-themed but never
     * flipped, so this stays the real amber.
     */
    bright:
        "border-brand-dark/30 hover:border-brand-dark/55 " +
        "bg-brand-accent text-brand-dark",
} as const;

/**
 * Polymorphic, like the kit's other controls: most of these are links, but
 * "Show more" acts on the page and has to be a real <button> so the keyboard
 * and assistive tech treat it as one.
 */
export function ActionButton<T extends ElementType = "a">({
    as,
    tone = "accent",
    className,
    children,
    ...rest
}: {
    as?: T;
    tone?: keyof typeof ACTION_TONE;
    className?: string;
    children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">) {
    const Component: ElementType = as || "a";
    return (
        <Component
            {...(Component === "button" ? { type: "button" } : {})}
            {...rest}
            className={cn(ACTION_BASE, ACTION_TONE[tone], className)}
        >
            {children}
        </Component>
    );
}

/**
 * The quiet text link, with the arrow chosen by destination: ↗ leaves the
 * site, → goes deeper into it. Hand-written arrows had drifted — the same docs
 * URL was "Docs ↗" in the header and "read the API docs →" in the dev kit.
 */
export function ArrowLink<T extends ElementType = "a">({
    as,
    className,
    children,
    ...rest
}: { as?: T; className?: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<T>,
    "as" | "className" | "children"
>) {
    const Component: ElementType = as || "a";
    const { href } = rest as { href?: string };
    const leavesSite = typeof href === "string" && /^https?:/.test(href);

    return (
        <Component
            {...rest}
            className={cn(
                "text-sm font-semibold text-theme-text-soft hover:text-theme-text-strong",
                className,
            )}
        >
            {children} {leavesSite ? "↗" : "→"}
        </Component>
    );
}

/* ── Surfaces ───────────────────────────────────────────────────────────── */

/** Cards lift on hover so the page feels responsive rather than static. */
const HOVER_LIFT =
    "transition-shadow duration-150 hover:shadow-[4px_4px_0_var(--polli-color-bg-active)] motion-reduce:transition-none";

export function Card<T extends ElementType = "div">({
    as,
    className,
    children,
    ...rest
}: { as?: T; className?: string; children: ReactNode } & Omit<
    ComponentPropsWithoutRef<T>,
    "as" | "className" | "children"
>) {
    // One cast, at the hand-off: TypeScript cannot prove a generic component's
    // props satisfy another generic component's props, even when they do.
    const props = {
        ...rest,
        as: as || "div",
        variant: "card",
        className: cn("flex flex-col", HOVER_LIFT, className),
    } as SurfaceProps<ElementType>;

    return <Surface {...props}>{children}</Surface>;
}

/**
 * The closing block on a page: a solid panel with a heading, a line of body
 * and its actions. Hello and Community both end on one — the only difference
 * is the tone, so they share the component rather than the shape being typed
 * out twice and drifting.
 *
 * `dark` is a plain class in tokens.css, so it re-binds every `--polli-*`
 * token for this subtree and the ordinary theme utilities resolve to their
 * on-dark values.
 */
export function CalloutPanel({
    tone = "accent",
    title,
    body,
    children,
}: {
    tone?: "accent" | "dark";
    title: string;
    body: string;
    children: ReactNode;
}) {
    return (
        <section
            className={cn(
                "flex flex-wrap items-center justify-between gap-10 rounded-3xl px-10 py-12",
                tone === "dark" ? "dark bg-brand-dark" : "bg-theme-bg-active",
            )}
        >
            <div className="flex max-w-lg flex-col gap-2.5">
                <h2 className="font-heading text-4xl leading-tight text-theme-text-strong">
                    {title}
                </h2>
                <p className="leading-relaxed text-theme-text-strong/75">
                    {body}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">{children}</div>
        </section>
    );
}

/**
 * A horizontally scrolling shelf, with its label and a scroll hint above.
 *
 * Deliberately a scroller rather than a grid: the shelf is a curated handful
 * you skim sideways, and a grid of the same cards would read as a second
 * "browse everything" below the real one.
 *
 * tabIndex makes it keyboard-scrollable — a plain overflow container is
 * reachable by mouse and trackpad only.
 */
export function ScrollStrip({
    label,
    ariaLabel,
    children,
}: {
    /** Omit when a SectionHeader above already names the strip. */
    label?: string;
    /** Required when label is omitted — the scroller still needs a name. */
    ariaLabel?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3.5">
            {label && (
                <div className="flex items-center justify-between gap-4">
                    <PixelLabel variant="eyebrow">{label}</PixelLabel>
                    <span className="text-sm text-theme-text-muted">
                        scroll →
                    </span>
                </div>
            )}
            <section
                // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container needs focus to be keyboard-scrollable
                tabIndex={0}
                aria-label={label ?? ariaLabel}
                className="flex gap-4 overflow-x-auto pb-2.5"
            >
                {children}
            </section>
        </div>
    );
}

/**
 * Terminal panel: dark, elevated, with three little squares and the filename
 * in the pixel face. The squares are 2px-radius, not circles — a small thing
 * that keeps it from looking like a generic macOS window.
 *
 * Named Terminal, not CodeBlock: @pollinations/ui exports a CodeBlock already,
 * and it is a different thing (a bordered pale <pre> for docs).
 *
 * `dark` is a plain class in tokens.css, so it re-binds every `--polli-*`
 * token for this subtree and the normal theme utilities resolve to their
 * on-dark values. Writing `text-white` here does NOT work — app.css starts
 * with `--color-*: initial`, so `white` is not a colour this project has.
 */
export function Terminal({
    filename,
    code,
}: {
    filename: string;
    code: string;
}) {
    // What Copy puts on the clipboard: the runnable commands — no "$ "
    // prompts, no comment lines. Copying the decoration would be a small
    // betrayal of the one thing a developer takes from this page.
    const copyValue = code
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .map((line) => line.replace(/^\$ /, ""))
        .join("\n");

    return (
        <div className="dark flex flex-col overflow-hidden rounded-2xl bg-brand-dark shadow-[0_12px_26px_-12px_rgba(17,5,24,0.45)]">
            <div className="flex items-center gap-2 bg-theme-bg-subtle px-4 py-2.5">
                <span className="size-2 rounded-[2px] bg-theme-bg-active" />
                <span className="size-2 rounded-[2px] bg-theme-text-muted/50" />
                <span className="size-2 rounded-[2px] bg-theme-text-muted/50" />
                <span className="ml-1 font-pixel text-xs text-theme-text-muted">
                    {filename}
                </span>
                <CopyButton
                    value={copyValue}
                    tooltip={null}
                    className="ml-auto cursor-pointer font-pixel text-xs text-theme-text-muted uppercase hover:text-theme-text-strong"
                >
                    {(copied) => (copied ? "Copied" : "Copy")}
                </CopyButton>
            </div>
            <pre className="overflow-x-auto px-5 py-4 text-[13px] leading-relaxed whitespace-pre-wrap text-theme-text-base">
                <code>{code}</code>
            </pre>
        </div>
    );
}
