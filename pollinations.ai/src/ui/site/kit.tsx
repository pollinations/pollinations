import { cn, Surface, type SurfaceProps } from "@pollinations/ui";
import polliBee from "@pollinations/ui/brand/polli/polli.png";
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
 * The opening block, bee on the right. Hello and Community both had one and
 * they had drifted — gap-14 against gap-12, a 340px bee against a 220px one —
 * so the two pages opened at visibly different scales.
 */
export function Hero({ children }: { children: ReactNode }) {
    return (
        <section className="flex flex-wrap items-center gap-14">
            <div className="flex min-w-0 flex-1 flex-col gap-8">{children}</div>
            <img
                src={polliBee}
                alt=""
                aria-hidden="true"
                width={340}
                height={340}
                className="mx-auto w-56 shrink-0 lg:w-[340px]"
            />
        </section>
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
