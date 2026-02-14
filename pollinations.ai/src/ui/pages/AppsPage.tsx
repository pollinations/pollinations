import { useMemo, useState } from "react";
import { COPY_CONSTANTS } from "../../copy/constants";
import { APPS_PAGE, CATEGORIES } from "../../copy/content/apps";
import { LINKS } from "../../copy/content/socialLinks";
import { type App, useApps } from "../../hooks/useApps";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { GithubIcon } from "../assets/SocialIcons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";

// Helper to extract GitHub username from author field
function getGitHubUsername(author: string) {
    if (!author) return null;
    // Remove @ symbol if present
    return author.replace(/^@/, "");
}

// Helper to extract repo name from GitHub URL
function getRepoName(repoUrl: string) {
    if (!repoUrl) return null;
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : null;
}

interface AppCardProps {
    app: App;
}

function fireTier(requests: number): number {
    if (requests >= 10000) return 3;
    if (requests >= 1000) return 2;
    if (requests >= 100) return 1;
    return 0;
}

function fireEmojis(tier: number): string {
    if (tier >= 3) return "\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25";
    if (tier >= 2) return "\uD83D\uDD25\uD83D\uDD25";
    if (tier >= 1) return "\uD83D\uDD25";
    return "";
}

function AppCard({ app }: AppCardProps) {
    const githubUsername = getGitHubUsername(app.github);
    const repoName = app.repo?.includes("github.com")
        ? getRepoName(app.repo)
        : null;

    const isNew = (() => {
        if (!app.approvedDate) return false;
        const approved = new Date(app.approvedDate);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        return approved >= fourteenDaysAgo;
    })();

    const tier = fireTier(app.requests24h);
    const fires = fireEmojis(tier);
    const hasStatusBadges = app.byop || isNew || fires;

    // Card border accent: BYOP = highlight, hot = brand, default = subtle
    const cardBorder = app.byop
        ? "border border-border-highlight/40 shadow-shadow-highlight-sm"
        : tier >= 2
          ? "border border-border-brand/40 shadow-shadow-brand-sm"
          : "border border-border-faint";

    return (
        <div className={`flex flex-col h-full rounded-sub-card overflow-hidden ${cardBorder}`}>
            {/* Title header — full-width, links to app */}
            <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3 bg-input-background hover:brightness-110 transition-all"
            >
                <span className="font-headline text-base font-black uppercase text-text-body-main">
                    {app.emoji && `${app.emoji} `}{app.name}
                </span>
                <ExternalLinkIcon className="w-4 h-4 text-text-body-main opacity-60 flex-shrink-0" />
            </a>

            {/* Card body */}
            <div className="flex flex-col flex-1 px-4 py-3">
                <div className="flex-1">
                    {app.description && (
                        <Body className="text-sm text-text-body-secondary mb-3" spacing="none">
                            {app.description}
                        </Body>
                    )}

                    {/* Status badges */}
                    {hasStatusBadges && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {app.byop && <Badge variant="highlight">BYOP</Badge>}
                            {isNew && <Badge variant="brand">NEW</Badge>}
                            {fires && (
                                <span className="relative group/fire cursor-help">
                                    <Badge variant="muted">
                                        TRENDING {fires}
                                    </Badge>
                                    <span className="hidden group-hover/fire:block absolute z-10 bottom-full left-0 mb-1 px-2 py-1 text-xs font-mono text-text-body-main bg-surface-card border border-border-main rounded shadow-shadow-dark-md whitespace-nowrap">
                                        {app.requests24h.toLocaleString()} requests in 24h
                                    </span>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                    {/* Author */}
                    {githubUsername && (
                        <a
                            href={`https://github.com/${githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                            title={`View ${app.github} on GitHub`}
                        >
                            <span className="text-text-body-secondary">by</span>
                            <span className="truncate text-text-body-main">
                                {app.github}
                            </span>
                            <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        </a>
                    )}
                    {!githubUsername && app.github && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background border border-border-faint max-w-[200px]">
                            <span className="text-text-body-secondary">by</span>
                            <span className="truncate text-text-body-main">
                                {app.github}
                            </span>
                        </div>
                    )}

                    {/* Repo + Stars */}
                    {repoName && (
                        <a
                            href={app.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-col gap-1 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                            title={`View ${repoName} on GitHub`}
                        >
                            <span className="inline-flex items-center gap-1.5 w-full">
                                <span className="truncate flex-1 min-w-0 text-text-body-main">
                                    {repoName}
                                </span>
                                <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                            </span>
                            {(app.stars || 0) > 0 && (
                                <span className="text-text-body-secondary">
                                    ⭐ {app.stars}
                                </span>
                            )}
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AppsPage() {
    const [selectedCategory, setSelectedCategory] = useState("creative");

    // Fetch apps from GitHub
    const { apps: allApps } = useApps(COPY_CONSTANTS.appsFilePath);

    // Get translated copy
    const { copy: pageCopy, isTranslating } = usePageCopy(APPS_PAGE);

    // Translate category labels
    const { translated: translatedCategories } = useTranslate(
        CATEGORIES,
        "label",
    );

    // Filter and sort apps by category
    const filteredApps = useMemo(() => {
        return allApps
            .filter((app: App) => app.category === selectedCategory)
            .sort((a, b) => {
                // 1. BYOP first
                if (a.byop !== b.byop) return a.byop ? -1 : 1;
                // 2. Fire tier descending
                const fireDiff = fireTier(b.requests24h) - fireTier(a.requests24h);
                if (fireDiff !== 0) return fireDiff;
                // 3. GitHub stars descending
                if ((b.stars || 0) !== (a.stars || 0))
                    return (b.stars || 0) - (a.stars || 0);
                // 4. Approved date descending (newest first)
                return (b.approvedDate || "").localeCompare(
                    a.approvedDate || "",
                );
            });
    }, [allApps, selectedCategory]);

    // Translate app descriptions
    const { translated: displayApps } = useTranslate(
        filteredApps,
        "description",
    );

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                <Title>{pageCopy.title}</Title>
                <Body spacing="comfortable">{pageCopy.subtitle}</Body>
                <div className="flex items-center gap-4 p-4 mb-10 bg-surface-card rounded-sub-card border-l-4 border-border-highlight">
                    <div className="flex-1">
                        <p className="font-headline text-sm font-black text-text-body-main mb-1">
                            {pageCopy.submitCtaTitle}
                        </p>
                        <p className="font-body text-xs text-text-body-secondary">
                            {pageCopy.submitCtaDescription}
                        </p>
                    </div>
                    <Button
                        as="a"
                        href={LINKS.githubSubmitApp}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        size="default"
                    >
                        {pageCopy.submitCtaButton}
                        <ExternalLinkIcon className="w-3 h-3 stroke-text-highlight" />
                    </Button>
                </div>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {translatedCategories.map((cat) => (
                        <Button
                            key={cat.id}
                            variant="toggle"
                            data-active={selectedCategory === cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className="px-4 py-2 text-sm"
                        >
                            {cat.label}
                        </Button>
                    ))}
                </div>

                {/* App Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {displayApps.map((app, index) => (
                        <AppCard key={`${app.name}-${index}`} app={app} />
                    ))}
                </div>

                {/* No Results */}
                {displayApps.length === 0 && (
                    <div className="text-center py-12">
                        <Body className="text-text-body-main">
                            {pageCopy.noAppsMessage}
                        </Body>
                    </div>
                )}
            </PageCard>
        </PageContainer>
    );
}
