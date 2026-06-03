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
import { APPS_COPY, type BadgeFilterId, PLATFORM_LABELS } from "./copy.ts";

const BADGE_LABELS: Record<BadgeFilterId, string> = {
    new: APPS_COPY.newBadge,
    pollen: APPS_COPY.pollenBadge,
    buzz: APPS_COPY.buzzBadge,
};

const BADGE_INTENTS: Record<BadgeFilterId, "alpha" | "success" | "warning"> = {
    new: "alpha",
    pollen: "warning",
    buzz: "success",
};

function appBadgeIds(app: App): BadgeFilterId[] {
    return (["pollen", "buzz", "new"] as const).filter((id) =>
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
        <Surface
            theme="blue"
            variant="card-themed"
            className="flex h-full flex-col gap-4 bg-theme-bg-subtle p-5"
        >
            <div className="flex min-w-0 flex-col gap-3">
                <div className="min-w-0 pr-1">
                    <h3 className="font-subheading text-lg text-theme-text-strong">
                        {app.url ? (
                            <a
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex max-w-full items-center gap-1 underline decoration-theme-border decoration-2 underline-offset-3 hover:decoration-theme-text-soft"
                            >
                                <span className="min-w-0 truncate">
                                    {app.emoji && (
                                        <span aria-hidden className="mr-1.5">
                                            {app.emoji}
                                        </span>
                                    )}
                                    {app.name}
                                </span>
                                <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            </a>
                        ) : (
                            <>
                                {app.emoji && (
                                    <span aria-hidden className="mr-1.5">
                                        {app.emoji}
                                    </span>
                                )}
                                {app.name}
                            </>
                        )}
                    </h3>
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

                {badges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
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
                )}
            </div>

            {app.description && (
                <Markdown className="text-sm text-theme-text-base">
                    {app.description}
                </Markdown>
            )}

            <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-1 text-xs">
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
