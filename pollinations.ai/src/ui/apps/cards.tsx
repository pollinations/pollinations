import type { ReactNode } from "react";
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
import { appCover } from "./cover";

/**
 * The three shapes an app takes on this site. They live together because
 * Hello's shelf and the Apps spotlight are the same card at two sizes — when
 * they were written separately they drifted immediately.
 */

function badgesFor(app: DirectoryApp): string {
    return [isBuzz(app) && "🐝", isPollen(app) && "🏵️", isFresh(app) && "🫧"]
        .filter(Boolean)
        .join(" ");
}

const appHref = (app: DirectoryApp) => app.web_url || app.github_repository_url;

/**
 * Image on top, name and description below. The mockup runs it at two heights:
 * 150px on Hello's three-up shelf, 120px in the Apps spotlight strip.
 */
export function AppTile({
    app,
    imageClassName = "h-[150px]",
    className,
}: {
    app: DirectoryApp;
    imageClassName?: string;
    className?: string;
}) {
    const cover = appCover(app.name);

    return (
        <Card
            as="a"
            href={appHref(app)}
            className={`overflow-hidden rounded-2xl p-0 ${className ?? ""}`}
        >
            {/* No cover means no picture, not a borrowed one — the block keeps
                the card the same height as its neighbours. */}
            {cover ? (
                <img
                    src={cover}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    width={1200}
                    height={600}
                    className={`block w-full bg-theme-bg-subtle object-cover ${imageClassName}`}
                />
            ) : (
                <div
                    aria-hidden="true"
                    className={`w-full bg-theme-bg-subtle ${imageClassName}`}
                />
            )}
            <div className="flex flex-col gap-1.5 px-5 py-4">
                <span className="font-subheading text-lg text-theme-text-strong">
                    {app.emoji} {app.name}
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
            {image ? (
                <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    width={1200}
                    height={600}
                    className="block aspect-[2/1] w-full bg-theme-bg-subtle object-cover sm:h-60 sm:aspect-auto"
                />
            ) : (
                <div
                    aria-hidden="true"
                    className="aspect-[2/1] w-full bg-theme-bg-subtle sm:h-60 sm:aspect-auto"
                />
            )}
            <div className="flex flex-1 flex-col gap-2 px-6.5 py-5.5">
                <div className="flex items-center gap-2.5">
                    <span className="font-subheading text-2xl text-theme-text-strong">
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

/** The text card in the Browse all grid. No image — 800 of them would be a lot. */
export function AppCard({ app }: { app: DirectoryApp }) {
    const stars = formatStars(app.github_repository_stars);
    const profile = githubProfileUrl(app.github_username);
    const platform = platformsOf(app)[0];
    const href = appHref(app);

    return (
        <Card className="min-h-35 gap-2 p-5">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-subheading text-lg text-theme-text-strong">
                    {app.emoji} {app.name}
                </h3>
                <span className="shrink-0 text-sm">{badgesFor(app)}</span>
            </div>
            <p className="text-sm leading-relaxed text-theme-text-base">
                {app.description}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1.5 text-xs text-theme-text-muted">
                {profile && (
                    <a href={profile} className="hover:text-theme-text-strong">
                        {app.github_username}
                    </a>
                )}
                {stars && <span>⭐ {stars}</span>}
                {platform && <span>· {platform}</span>}
                {href && (
                    <ArrowLink href={href} className="ml-auto text-xs">
                        Open
                    </ArrowLink>
                )}
            </div>
        </Card>
    );
}
