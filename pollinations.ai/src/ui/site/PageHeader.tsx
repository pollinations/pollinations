import type { ReactNode } from "react";

type PageHeaderProps = {
    eyebrow: string;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Right-aligned control, e.g. "Submit your app" or the account menu. */
    action?: ReactNode;
    /** `hero` is the landing page only — bigger title, same rhythm. */
    size?: "page" | "hero";
    /**
     * Keep the h1 for assistive tech and search, but don't draw it. For pages
     * where the nav already says what this is and the first real heading
     * follows immediately — a visible title there is just saying it twice.
     */
    hideTitle?: boolean;
};

/**
 * The one place eyebrow / title / subtitle spacing is defined.
 *
 * Before this, Hello used gap-6, Apps and Play used gap-2.5, and Community
 * used mt-3 + mt-4 margins — four pages, three systems, which is what made
 * switching tabs feel like switching sites. A single uniform gap means the
 * rhythm cannot drift again.
 */
export function PageHeader({
    eyebrow,
    title,
    subtitle,
    action,
    size = "page",
    hideTitle = false,
}: PageHeaderProps) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-2xl flex-col gap-3">
                <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                    {eyebrow}
                </p>
                <h1
                    className={
                        hideTitle
                            ? "sr-only"
                            : `font-heading text-theme-text-strong ${
                                  size === "hero"
                                      ? "text-5xl leading-tight lg:text-7xl"
                                      : "text-5xl"
                              }`
                    }
                >
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

type SectionHeaderProps = {
    eyebrow: string;
    title: ReactNode;
    subtitle?: ReactNode;
    aside?: ReactNode;
};

/** Same rhythm one level down. Section titles are text-4xl everywhere. */
export function SectionHeader({
    eyebrow,
    title,
    subtitle,
    aside,
}: SectionHeaderProps) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-2xl flex-col gap-3">
                <p className="font-pixel text-sm tracking-widest text-theme-text-soft uppercase">
                    {eyebrow}
                </p>
                <h2 className="font-heading text-4xl leading-tight text-theme-text-strong">
                    {title}
                </h2>
                {subtitle && (
                    <p className="max-w-xl leading-relaxed text-theme-text-base">
                        {subtitle}
                    </p>
                )}
            </div>
            {aside}
        </div>
    );
}
