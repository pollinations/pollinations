import {
    Chip,
    ExternalLinkIcon,
    GitHubIcon,
    Markdown,
    Surface,
    type ThemeName,
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

const CARD_THEMES: ThemeName[] = ["blue", "teal", "violet", "green", "pink"];

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

export function AppCard({ app, index }: { app: App; index: number }) {
    const theme = CARD_THEMES[index % CARD_THEMES.length];
    const repoName = getRepoName(app.repo);
    const githubUsername = getGitHubUsername(app.github);
    const githubProfileUrl = getGitHubProfileUrl(app.github);
    const stars = formatStars(app.stars);
    const badges = appBadgeIds(app);

    return (
        <Surface
            theme={theme}
            variant="card-themed"
            className="flex h-full flex-col gap-4 p-5"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-subheading text-lg text-theme-text-strong">
                        {app.url ? (
                            <a
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                            >
                                <span className="truncate">
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
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
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

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
                {repoName ? (
                    <a
                        href={app.repo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-surface-white px-2 py-1 font-mono font-medium text-theme-text-strong hover:underline"
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
                            className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-surface-white px-2 py-1 font-mono font-medium text-theme-text-strong hover:underline"
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
