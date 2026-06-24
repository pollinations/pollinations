import {
    Chip,
    ExternalLinkIcon,
    GitHubIcon,
    Markdown,
    Surface,
} from "@pollinations/ui";
import {
    type App,
    appBadges,
    formatStars,
    getGitHubProfileUrl,
    getGitHubUsername,
    getRepoName,
} from "../../lib/apps.ts";
import { APPS_COPY, PLATFORM_LABELS, type SignalFilterId } from "./copy.ts";

const BADGE_LABELS: Record<SignalFilterId, string> = {
    fresh: APPS_COPY.freshBadge,
    pollen: APPS_COPY.pollenBadge,
    buzz: APPS_COPY.buzzBadge,
};

const BADGE_INTENTS: Record<SignalFilterId, "alpha" | "success" | "warning"> = {
    fresh: "alpha",
    pollen: "warning",
    buzz: "success",
};

function appBadgeIds(app: App): SignalFilterId[] {
    return (["pollen", "buzz", "fresh"] as const).filter((id) =>
        appBadges[id](app),
    );
}

export function AppCard({ app }: { app: App }) {
    const repoName = getRepoName(app.repo);
    const githubUsername = getGitHubUsername(app.github);
    const githubProfileUrl = getGitHubProfileUrl(app.github);
    const stars = formatStars(app.stars);
    const badges = appBadgeIds(app);

    return (
        <Surface className="flex flex-col gap-3 transition-colors hover:bg-surface-opaque/90 md:grid md:grid-cols-[minmax(0,1fr)_minmax(11rem,auto)] md:items-center md:gap-4">
            <div className="flex min-w-0 gap-3">
                <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active text-xl"
                >
                    {app.emoji || app.name.slice(0, 1).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 font-subheading text-lg leading-tight text-theme-text-strong">
                            {app.url ? (
                                <a
                                    href={app.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex max-w-full items-center gap-1 underline decoration-theme-border decoration-2 underline-offset-3 hover:decoration-theme-text-soft"
                                >
                                    <span className="min-w-0 truncate">
                                        {app.name}
                                    </span>
                                    <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                </a>
                            ) : (
                                app.name
                            )}
                        </h3>
                        {badges.map((badge) => (
                            <Chip
                                key={badge}
                                intent={BADGE_INTENTS[badge]}
                                size="sm"
                            >
                                {BADGE_LABELS[badge]}
                            </Chip>
                        ))}
                    </div>

                    {app.description && (
                        <Markdown className="mt-1 text-sm leading-6 text-theme-text-base">
                            {app.description}
                        </Markdown>
                    )}

                    {app.platforms.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {app.platforms.map((platform) => (
                                <Chip key={platform} size="sm">
                                    {PLATFORM_LABELS[platform] ?? platform}
                                </Chip>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs md:justify-end">
                {repoName ? (
                    <a
                        href={app.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-surface-white px-2 py-1 font-mono font-medium text-theme-text-strong underline decoration-theme-border underline-offset-2 hover:decoration-theme-text-soft"
                        title={APPS_COPY.viewOnGithub}
                    >
                        <GitHubIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{repoName}</span>
                        {stars && (
                            <span className="shrink-0 text-theme-text-muted">
                                {stars}
                            </span>
                        )}
                    </a>
                ) : (
                    githubProfileUrl && (
                        <a
                            href={githubProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-surface-white px-2 py-1 font-mono font-medium text-theme-text-strong underline decoration-theme-border underline-offset-2 hover:decoration-theme-text-soft"
                        >
                            <span className="text-theme-text-muted">
                                {APPS_COPY.authorPrefix}
                            </span>
                            <span className="truncate">@{githubUsername}</span>
                            <GitHubIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        </a>
                    )
                )}
            </div>
        </Surface>
    );
}
