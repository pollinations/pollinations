import { useMemo, useState } from "react";
import { getText } from "../../copy";
import { APPS_PAGE, appsFilePath, CATEGORIES } from "../../copy/content/apps";
import { LINKS } from "../../copy/content/socialLinks";
import { type App, useApps } from "../../hooks/useApps";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { GithubIcon } from "../assets/SocialIcons";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { Body, Title } from "../components/ui/typography";
import { useCopy } from "../contexts/CopyContext";

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

// App Card Component
function AppCard({ app }: AppCardProps) {
    const githubUsername = getGitHubUsername(app.github);
    // Extract repo from URL if it's a GitHub URL
    const repoName = app.url?.includes("github.com")
        ? getRepoName(app.url)
        : null;

    return (
        <SubCard className="flex flex-col h-full bg-transparent">
            <div className="flex-1">
                {/* App name as button */}
                <Button
                    as="a"
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                    size="sm"
                    className="self-start mb-3 w-full relative pr-10 shadow-none hover:shadow-none text-left justify-start bg-input-background hover:bg-input-background"
                >
                    <span className="font-headline text-base font-black uppercase text-left block text-text-body-main">
                        {app.name}
                    </span>
                    <ExternalLinkIcon className="w-4 h-4 absolute top-3 right-3 text-text-body-main" />
                </Button>

                {app.description && (
                    <Body className="text-sm text-text-body-secondary line-clamp-6 mb-4">
                        {app.description}
                    </Body>
                )}
            </div>
            <div className="flex flex-wrap gap-2 mt-auto">
                {/* Author Badge */}
                {githubUsername && (
                    <a
                        href={`https://github.com/${githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                        title={`View ${app.github} on GitHub`}
                    >
                        <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        <span className="truncate text-text-body-main">
                            {app.github}
                        </span>
                    </a>
                )}
                {!githubUsername && app.github && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background border border-border-faint max-w-[200px]">
                        <span className="truncate text-text-body-main">
                            {app.github}
                        </span>
                    </div>
                )}

                {/* Repo Badge */}
                {repoName && (
                    <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main transition-all max-w-[200px]"
                        title={`View ${repoName} on GitHub`}
                    >
                        <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        <span className="truncate flex-1 min-w-0 text-text-body-main">
                            {repoName}
                        </span>
                        {(app.stars || 0) > 0 && (
                            <span className="text-text-body-secondary flex-shrink-0">
                                ⭐ {app.stars}
                            </span>
                        )}
                    </a>
                )}
            </div>
        </SubCard>
    );
}

export default function AppsPage() {
    const [selectedCategory, setSelectedCategory] = useState("creative");

    // Fetch apps from GitHub
    const { apps: allApps } = useApps(appsFilePath);

    // Use processed copy if available, fall back to static
    const { processedCopy } = useCopy();
    const pageCopy = (
        processedCopy?.subtitle ? processedCopy : APPS_PAGE
    ) as typeof APPS_PAGE;

    // Translate category labels
    const { translated: translatedCategories } = useTranslate(
        CATEGORIES,
        "label",
    );

    // Filter apps by category
    const filteredApps = useMemo(() => {
        return allApps.filter((app: App) => app.category === selectedCategory);
    }, [allApps, selectedCategory]);

    // Translate app descriptions
    const { translated: displayApps } = useTranslate(
        filteredApps,
        "description",
    );

    return (
        <PageContainer>
            <PageCard>
                <Title>{getText(pageCopy.title)}</Title>
                <Body spacing="comfortable">{getText(pageCopy.subtitle)}</Body>
                <div className="flex items-center gap-4 p-4 mb-10 bg-surface-card rounded-sub-card border-l-4 border-border-highlight">
                    <div className="flex-1">
                        <p className="font-headline text-sm font-black text-text-body-main mb-1">
                            {getText(pageCopy.submitCtaTitle)}
                        </p>
                        <p className="font-body text-xs text-text-body-secondary">
                            {getText(pageCopy.submitCtaDescription)}
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
                        {getText(pageCopy.submitCtaButton)}
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
                            {getText(pageCopy.noAppsMessage)}
                        </Body>
                    </div>
                )}
            </PageCard>
        </PageContainer>
    );
}
