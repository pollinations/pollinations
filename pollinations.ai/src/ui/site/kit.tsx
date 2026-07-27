import { Chip, cn, Surface, type SurfaceProps } from "@pollinations/ui";
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
                    <p className="max-w-xl text-lg leading-relaxed text-theme-text-base">
                        {subtitle}
                    </p>
                )}
            </div>
            {action}
        </header>
    );
}

/**
 * The opening block, with a character on the right.
 *
 * Every page gets a different one, doing something that belongs to that page —
 * Polli on Hello, the monitor robot on Play, the nomnom on Apps, all three
 * together on Community. The layout is shared so the pages can't drift apart
 * again: they had already reached gap-14 against gap-12 and a 340px bee
 * against a 220px one, which is why switching tabs changed scale.
 */
export function Hero({
    aside,
    children,
}: {
    /** A HeroCharacter on every page today. */
    aside: ReactNode;
    children: ReactNode;
}) {
    return (
        // Stacks below lg rather than relying on flex-wrap. With `flex-1
        // min-w-0` the text column shrinks instead of wrapping, so the heading
        // overflowed its own box and ran underneath the character — 257px of
        // overlap at 432px wide.
        <section className="flex flex-col items-center gap-10 lg:flex-row lg:gap-14">
            <div className="flex w-full min-w-0 flex-col gap-8 lg:flex-1">
                {children}
            </div>
            {aside}
        </section>
    );
}

/**
 * Bounded by the BOX, not by width. The sprites have very different aspects —
 * the nomnom is 492x732, the group portrait 1032x468 — so fixing width alone
 * rendered them 332px and 506px tall on facing pages. Capping both gives every
 * character the same visual weight, and the wide group lands short and broad
 * on its own.
 */
export function HeroCharacter({ src }: { src: string }) {
    return (
        <img
            src={src}
            alt=""
            aria-hidden="true"
            className="mx-auto max-h-[220px] w-auto max-w-[280px] shrink-0 lg:max-h-[340px] lg:max-w-[460px]"
        />
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
}: {
    stats: { value: string; label: string }[];
}) {
    if (stats.length === 0) return null;
    return (
        <dl className="mt-2 flex flex-wrap gap-10">
            {stats.map((stat) => (
                <div key={stat.label} className="flex flex-col">
                    <dt className="font-heading text-4xl text-theme-text-soft tabular-nums">
                        {stat.value}
                    </dt>
                    <dd className="text-xs text-theme-text-muted">
                        {stat.label}
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
 * offset shadow that *grows* on hover, so the control appears to lift off the
 * page. Colours still come from `--polli-*`; only the geometry is local.
 */
const ACTION_BASE =
    "inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-base font-semibold " +
    "transition-shadow duration-150 motion-reduce:transition-none";

const ACTION_TONE = {
    /** Primary: amber fill. */
    accent:
        "bg-theme-bg-active text-theme-text-strong " +
        "shadow-[3px_3px_0_rgba(17,5,24,0.22)] hover:shadow-[5px_5px_0_rgba(17,5,24,0.28)]",
    /** Secondary: white fill, lighter shadow. */
    plain:
        "bg-surface-opaque text-theme-text-strong " +
        "shadow-[3px_3px_0_rgba(17,5,24,0.12)] hover:shadow-[5px_5px_0_rgba(17,5,24,0.18)]",
    /** For use on the amber CTA panel, where white and amber both disappear. */
    dark:
        "bg-brand-dark text-theme-bg-active " +
        "shadow-[3px_3px_0_rgba(17,5,24,0.25)] hover:shadow-[5px_5px_0_rgba(17,5,24,0.32)]",
    /**
     * For use on the dark panel. `bg-active` flips to a muted oklch(0.496 …)
     * inside `.dark` — correct for dark chrome, muddy for the one button meant
     * to be the brightest thing there. brand-accent is hue-themed but never
     * flipped, so this stays the real amber.
     */
    bright:
        "bg-brand-accent text-brand-dark " +
        "shadow-[3px_3px_0_rgba(0,0,0,0.3)] hover:shadow-[5px_5px_0_rgba(0,0,0,0.38)]",
} as const;

export function ActionButton({
    href,
    tone = "accent",
    className,
    children,
}: {
    href: string;
    tone?: keyof typeof ACTION_TONE;
    className?: string;
    children: ReactNode;
}) {
    return (
        <a
            href={href}
            className={cn(ACTION_BASE, ACTION_TONE[tone], className)}
        >
            {children}
        </a>
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

/**
 * A card that lifts on hover — the same hard offset shadow as the buttons,
 * which is what makes the page feel responsive rather than static.
 */
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
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-4">
                <PixelLabel variant="eyebrow">{label}</PixelLabel>
                <span className="text-sm text-theme-text-muted">scroll →</span>
            </div>
            <section
                // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container needs focus to be keyboard-scrollable
                tabIndex={0}
                aria-label={label}
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
    children,
}: {
    filename: string;
    children: ReactNode;
}) {
    return (
        <div className="dark flex flex-col overflow-hidden rounded-2xl bg-brand-dark shadow-[0_12px_26px_-12px_rgba(17,5,24,0.45)]">
            <div className="flex items-center gap-2 bg-theme-bg-subtle px-4 py-3">
                <span className="size-2 rounded-[2px] bg-theme-bg-active" />
                <span className="size-2 rounded-[2px] bg-theme-text-muted/50" />
                <span className="size-2 rounded-[2px] bg-theme-text-muted/50" />
                <span className="ml-1 font-pixel text-xs text-theme-text-muted">
                    {filename}
                </span>
            </div>
            <pre className="overflow-x-auto px-4 py-3 text-[11.5px] leading-relaxed whitespace-pre-wrap text-theme-text-base">
                <code>{children}</code>
            </pre>
        </div>
    );
}
