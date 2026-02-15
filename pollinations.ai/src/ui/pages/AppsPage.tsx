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
    byopTooltip: string;
    byopBadge: string;
    trendingBadge: string;
    trendingTooltipSuffix: string;
    authorPrefix: string;
}

function isTrending(requests: number): boolean {
    return requests >= 1000;
}

function AppCard({
    app,
    byopTooltip,
    byopBadge,
    trendingBadge,
    trendingTooltipSuffix,
    authorPrefix,
}: AppCardProps) {
    const githubUsername = getGitHubUsername(app.github);
    const repoName = app.repo?.includes("github.com")
        ? getRepoName(app.repo)
        : null;

    const trending = isTrending(app.requests24h);
    const hasStatusBadges = app.byop || trending;

    // Card border accent: trending = brand (priority), BYOP = highlight, default = subtle
    const cardBorder = trending
        ? "border border-border-brand shadow-shadow-brand-sm"
        : app.byop
          ? "border border-border-highlight shadow-shadow-highlight-sm"
          : "border border-border-subtle";

    return (
        <div
            className={`flex flex-col h-full rounded-sub-card overflow-hidden ${cardBorder}`}
        >
            {/* Title header — full-width, links to app */}
            <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3 bg-input-background hover:brightness-110 transition-all"
            >
                <span className="font-headline text-base font-black uppercase text-text-body-main">
                    {app.emoji && `${app.emoji} `}
                    {app.name}
                </span>
                <ExternalLinkIcon className="w-4 h-4 text-text-body-main opacity-60 flex-shrink-0" />
            </a>

            {/* Card body */}
            <div className="flex flex-col flex-1 px-4 py-3">
                <div className="flex-1">
                    {app.description && (
                        <Body
                            className="text-sm text-text-body-secondary mb-3"
                            spacing="none"
                        >
                            {app.description}
                        </Body>
                    )}

                    {/* Status badges */}
                    {hasStatusBadges && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {app.byop && (
                                <span className="relative group/byop cursor-help">
                                    <Badge variant="highlight">
                                        {byopBadge}
                                    </Badge>
                                    <span className="hidden group-hover/byop:block absolute z-10 bottom-full left-0 mb-1 px-2 py-1 text-xs font-mono text-text-body-main bg-surface-card border border-border-main rounded shadow-shadow-dark-md whitespace-nowrap">
                                        {byopTooltip}
                                    </span>
                                </span>
                            )}
                            {trending && (
                                <span className="relative group/fire cursor-help">
                                    <Badge variant="brand">
                                        {"\uD83D\uDD25"} {trendingBadge}
                                    </Badge>
                                    <span className="hidden group-hover/fire:block absolute z-10 bottom-full left-0 mb-1 px-2 py-1 text-xs font-mono text-text-body-main bg-surface-card border border-border-main rounded shadow-shadow-dark-md whitespace-nowrap">
                                        {app.requests24h.toLocaleString()}{" "}
                                        {trendingTooltipSuffix}
                                    </span>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                    {/* Author (only shown when no repo) */}
                    {!repoName && githubUsername && (
                        <a
                            href={`https://github.com/${githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                            title={`View ${app.github} on GitHub`}
                        >
                            <span className="text-text-body-secondary">
                                {authorPrefix}
                            </span>
                            <span className="truncate text-text-body-main">
                                {app.github}
                            </span>
                            <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        </a>
                    )}
                    {!repoName && !githubUsername && app.github && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background border border-border-faint max-w-[200px]">
                            <span className="text-text-body-secondary">
                                {authorPrefix}
                            </span>
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
    const [byopFilter, setByopFilter] = useState(false);
    const [newFilter, setNewFilter] = useState(false);

    // Fetch apps from GitHub
    const { apps: allApps } = useApps(COPY_CONSTANTS.appsFilePath);

    // Get translated copy
    const { copy: pageCopy, isTranslating } = usePageCopy(APPS_PAGE);

    // Translate category labels
    const { translated: translatedCategories } = useTranslate(
        CATEGORIES,
        "label",
    );

    // Filter and sort apps by category (+ optional BYOP/New filters)
    const filteredApps = useMemo(() => {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        return allApps
            .filter((app: App) => {
                if (newFilter) {
                    if (!app.approvedDate) return false;
                    return new Date(app.approvedDate) >= fifteenDaysAgo;
                }
                if (byopFilter) return app.byop;
                return app.category === selectedCategory;
            })
            .sort((a, b) => {
                // 1. Trending first (by request volume)
                const aTrending = isTrending(a.requests24h);
                const bTrending = isTrending(b.requests24h);
                if (aTrending !== bTrending) return bTrending ? 1 : -1;
                // 2. BYOP second
                if (a.byop !== b.byop) return a.byop ? -1 : 1;
                // 3. GitHub stars descending
                if ((b.stars || 0) !== (a.stars || 0))
                    return (b.stars || 0) - (a.stars || 0);
                // 4. Approved date descending (newest first)
                return (b.approvedDate || "").localeCompare(
                    a.approvedDate || "",
                );
            });
    }, [allApps, selectedCategory, byopFilter, newFilter]);

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                    <div className="flex items-center gap-4 p-4 bg-surface-card rounded-sub-card border-l-4 border-border-brand">
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
                    <div className="flex items-center gap-4 p-4 bg-surface-card rounded-sub-card border-l-4 border-border-highlight">
                        <div className="flex-1">
                            <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                {pageCopy.byopCtaTitle}
                            </p>
                            <p className="font-body text-xs text-text-body-secondary">
                                {pageCopy.byopCtaDescription}
                            </p>
                        </div>
                        <Button
                            as="a"
                            href={LINKS.byopDocs}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="default"
                        >
                            {pageCopy.byopCtaButton}
                            <ExternalLinkIcon className="w-3 h-3 stroke-text-highlight" />
                        </Button>
                    </div>
                </div>

                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {translatedCategories.map((cat) => (
                        <Button
                            key={cat.id}
                            variant="toggle"
                            data-active={
                                !byopFilter &&
                                !newFilter &&
                                selectedCategory === cat.id
                            }
                            onClick={() => {
                                setByopFilter(false);
                                setNewFilter(false);
                                setSelectedCategory(cat.id);
                            }}
                            className="px-4 py-2 text-sm"
                        >
                            {cat.label}
                        </Button>
                    ))}
                    <Button
                        variant="toggle"
                        data-active={byopFilter}
                        onClick={() => {
                            setNewFilter(false);
                            setByopFilter(!byopFilter);
                        }}
                        className="px-4 py-2 text-sm"
                    >
                        {pageCopy.byopFilterLabel}
                    </Button>
                    <Button
                        variant="toggle"
                        data-active={newFilter}
                        onClick={() => {
                            setByopFilter(false);
                            setNewFilter(!newFilter);
                        }}
                        className="px-4 py-2 text-sm"
                    >
                        {pageCopy.newFilterLabel}
                    </Button>
                </div>

                {/* App Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {displayApps.map((app, index) => (
                        <AppCard
                            key={`${app.name}-${index}`}
                            app={app}
                            byopTooltip={pageCopy.byopTooltip}
                            byopBadge={pageCopy.byopBadge}
                            trendingBadge={pageCopy.trendingBadge}
                            trendingTooltipSuffix={
                                pageCopy.trendingTooltipSuffix
                            }
                            authorPrefix={pageCopy.authorPrefix}
                        />
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
