import {
    ClockIcon,
    GitHubIcon,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
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
import { ArrowLink, Card, PixelBadge } from "../site/kit";
import { appCover, isAppScreenshot, MISSING_SCREENSHOT } from "./cover";

/**
 * The three shapes an app takes on this site. They live together because
 * Hello's shelf and the Apps spotlight are the same card at two sizes — when
 * they were written separately they drifted immediately.
 */

function AppSignals({ app }: { app: DirectoryApp }) {
    if (!isBuzz(app) && !isPollen(app) && !isFresh(app)) return null;

    return (
        <span className="flex shrink-0 items-center gap-1.5 text-theme-text-muted">
            {isFresh(app) ? (
                <span role="img" title="Fresh" aria-label="Fresh">
                    <ClockIcon className="size-4" />
                </span>
            ) : null}
            {isBuzz(app) ? (
                <span role="img" title="Buzz" aria-label="Buzz">
                    <TrendUpIcon className="size-4" />
                </span>
            ) : null}
            {isPollen(app) ? (
                <span role="img" title="Pollen" aria-label="Pollen">
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

/**
 * Image on top, name and description below. The mockup runs it at two heights:
 * 150px on Hello's three-up shelf, 120px in the Apps spotlight strip.
 */
export function AppTile({
    app,
    imageClassName = "h-[150px]",
    className,
    tabIndex,
}: {
    app: DirectoryApp;
    imageClassName?: string;
    className?: string;
    tabIndex?: number;
}) {
    const cover = appCover(app.name, app.screenshot_url);

    return (
        <Card
            as="a"
            href={appHref(app)}
            tabIndex={tabIndex}
            className={`overflow-hidden rounded-2xl p-0 ${className ?? ""}`}
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
        </Card>
    );
}

/**
 * The big one: a complete 2:1 cover on mobile, a 240px image on larger screens,
 * a badge beside the name, and a footer that says where the link goes.
 */
export function AppHero({
    href,
    title,
    badge,
    badgeTone = "pale",
    description,
    meta,
    image,
    action,
}: {
    href: string;
    title: string;
    badge: string;
    badgeTone?: "pale" | "accent";
    description: string;
    meta: string;
    image: string | null;
    action: ReactNode;
}) {
    return (
        <Card
            as="a"
            href={href}
            className="overflow-hidden rounded-[18px] p-0 hover:shadow-[5px_5px_0_var(--polli-color-bg-active)]"
        >
            <AppCoverImage
                src={image}
                className="aspect-[2/1] sm:h-60 sm:aspect-auto"
            />
            <div className="flex flex-1 flex-col gap-2 px-6.5 py-5.5">
                <div className="flex items-center gap-2.5">
                    <span className="font-body text-2xl font-semibold text-theme-text-strong">
                        {title}
                    </span>
                    <PixelBadge tone={badgeTone}>{badge}</PixelBadge>
                </div>
                <p className="text-[15px] leading-relaxed text-theme-text-base">
                    {description}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-1.5">
                    <span className="text-[13px] text-theme-text-muted">
                        {meta}
                    </span>
                    {action}
                </div>
            </div>
        </Card>
    );
}

/** Compact directory row: the screenshot sets the mood without dominating. */
export function AppRow({ app }: { app: DirectoryApp }) {
    const stars = formatStars(app.github_repository_stars);
    const profile = githubProfileUrl(app.github_username);
    const platform = platformsOf(app)[0];
    const href = appHref(app);
    const cover = appCover(app.name, app.screenshot_url);

    return (
        <article className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 border-theme-border/70 border-b py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5 sm:py-4">
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
                <Markdown className="line-clamp-2 text-sm text-theme-text-base [&_p]:m-0">
                    {app.description}
                </Markdown>
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
                    {stars && <span>⭐ {stars}</span>}
                    {platform && (
                        <PixelBadge className="px-1.5 py-0.5 text-[9px] leading-none">
                            {platform}
                        </PixelBadge>
                    )}
                    {href && (
                        <ArrowLink href={href} className="ml-auto text-xs">
                            Open
                        </ArrowLink>
                    )}
                </div>
            </div>
        </article>
    );
}
