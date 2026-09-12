import {
    Chip,
    ClockIcon,
    cn,
    GitHubIcon,
    InlineLink,
    LinkCard,
    StarIcon,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import { type ReactNode, useState } from "react";
import {
    type DirectoryApp,
    formatStars,
    githubProfileUrl,
    isBuzz,
    isFresh,
    isPollen,
    platformsOf,
} from "../../data/publicStats";
import { appCover, isAppScreenshot, MISSING_SCREENSHOT } from "./cover";

/**
 * The app tile and compact directory row share their signals, cover fallback,
 * and link behavior here so the two views cannot drift apart.
 */

function AppSignals({ app }: { app: DirectoryApp }) {
    if (!isBuzz(app) && !isPollen(app) && !isFresh(app)) return null;

    return (
        <span className="flex shrink-0 items-center gap-1.5 text-theme-text-muted">
            {isFresh(app) ? (
                <span role="img" title="New" aria-label="New">
                    <ClockIcon className="size-4" />
                </span>
            ) : null}
            {isBuzz(app) ? (
                <span role="img" title="Popular" aria-label="Popular">
                    <TrendUpIcon className="size-4" />
                </span>
            ) : null}
            {isPollen(app) ? (
                <span role="img" title="Pollen Pay" aria-label="Pollen Pay">
                    <WalletIcon className="size-4" />
                </span>
            ) : null}
        </span>
    );
}

const appHref = (app: DirectoryApp) => app.web_url || app.github_repository_url;

function AppCoverImage({
    src,
    className,
}: {
    src: string | null;
    className: string;
}) {
    const requested = src || MISSING_SCREENSHOT;
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const resolved =
        failedSource === requested ? MISSING_SCREENSHOT : requested;

    return (
        <img
            src={resolved}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={1200}
            height={600}
            onError={
                resolved === MISSING_SCREENSHOT
                    ? undefined
                    : () => setFailedSource(requested)
            }
            className={`block w-full bg-theme-bg-subtle object-cover ${isAppScreenshot(resolved) ? "object-top" : "object-center"} ${className}`}
        />
    );
}

/** Image on top, name and description below; the rail sets the image height. */
export function AppTile({
    app,
    imageClassName,
    className,
    tabIndex,
}: {
    app: DirectoryApp;
    imageClassName: string;
    className?: string;
    tabIndex?: number;
}) {
    const cover = appCover(app.screenshot_url);

    return (
        <LinkCard
            href={appHref(app)}
            tabIndex={tabIndex}
            showIcon={false}
            className={className}
            surfaceClassName="overflow-hidden rounded-2xl p-0"
        >
            <AppCoverImage src={cover} className={imageClassName} />
            <div className="flex flex-col gap-1.5 px-5 py-4">
                <span className="font-body text-lg font-semibold text-theme-text-strong">
                    {app.name}
                </span>
                <p className="line-clamp-2 text-sm leading-relaxed text-theme-text-base">
                    {app.description}
                </p>
            </div>
        </LinkCard>
    );
}

export function SpotlightTile({
    app,
    action,
    direction = "forward",
}: {
    app: DirectoryApp;
    action?: ReactNode;
    direction?: "forward" | "back";
}) {
    const href = appHref(app);
    const cover = appCover(app.screenshot_url);
    const slideClassName = cn(
        "apps-spotlight-slide",
        direction === "back" && "apps-spotlight-slide-back",
    );
    const image = (
        <AppCoverImage src={cover} className="aspect-[16/7] sm:aspect-[18/7]" />
    );

    return (
        <article>
            {href ? (
                <a
                    key={`${app.name}-image`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${app.name}`}
                    className={cn(
                        "block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-theme-border-strong",
                        slideClassName,
                    )}
                >
                    {image}
                </a>
            ) : (
                image
            )}
            <div className="flex h-[8.5rem] items-start justify-between gap-3 px-5 py-4">
                <div
                    key={`${app.name}-copy`}
                    className={cn(
                        "flex min-w-0 flex-1 flex-col gap-1.5",
                        slideClassName,
                    )}
                >
                    {href ? (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate rounded-sm font-body text-lg font-semibold text-theme-text-strong hover:text-theme-text-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-border-strong"
                        >
                            {app.name}
                        </a>
                    ) : (
                        <span className="truncate font-body text-lg font-semibold text-theme-text-strong">
                            {app.name}
                        </span>
                    )}
                    <p className="line-clamp-3 text-sm leading-relaxed text-theme-text-base">
                        {app.description}
                    </p>
                </div>
                <div key="spotlight-controls" className="shrink-0">
                    {action}
                </div>
            </div>
        </article>
    );
}

/** Compact directory row: the screenshot sets the mood without dominating. */
export function AppRow({ app }: { app: DirectoryApp }) {
    const stars = formatStars(app.github_repository_stars);
    const profile = githubProfileUrl(app.github_username);
    const platform = platformsOf(app)[0];
    const href = appHref(app);
    const cover = appCover(app.screenshot_url);

    return (
        <article className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 border-theme-text-strong/10 border-b py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5 sm:py-4">
            {href && (
                <a
                    href={href}
                    aria-label={`Open ${app.name}`}
                    className="overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-border-strong"
                >
                    <AppCoverImage src={cover} className="aspect-[16/10]" />
                </a>
            )}
            <div className="flex min-h-full min-w-0 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                    {href ? (
                        <a
                            href={href}
                            className="rounded-sm font-body text-base font-semibold text-theme-text-strong hover:text-theme-text-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-border-strong sm:text-lg"
                        >
                            {app.name}
                        </a>
                    ) : (
                        <h3 className="font-body text-base font-semibold text-theme-text-strong sm:text-lg">
                            {app.name}
                        </h3>
                    )}
                    <AppSignals app={app} />
                </div>
                <p className="line-clamp-2 text-sm text-theme-text-base">
                    {app.description}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-theme-text-muted">
                    {profile && (
                        <a
                            href={profile}
                            className="inline-flex items-center gap-1 hover:text-theme-text-strong"
                        >
                            <GitHubIcon className="size-3.5 shrink-0" />
                            {app.github_username}
                        </a>
                    )}
                    {stars && (
                        <span className="inline-flex items-center gap-1">
                            <StarIcon className="size-3.5 fill-current" />
                            {stars}
                        </span>
                    )}
                    {platform && (
                        <Chip
                            size="sm"
                            className="h-auto px-1.5 py-0.5 font-pixel text-micro leading-none uppercase"
                        >
                            {platform}
                        </Chip>
                    )}
                    {href && (
                        <InlineLink href={href} className="ml-auto text-xs">
                            Open
                        </InlineLink>
                    )}
                </div>
            </div>
        </article>
    );
}
