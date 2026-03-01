import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { COPY_CONSTANTS } from "../../copy/constants";
import {
    ALL_FILTERS,
    APPS_PAGE,
    BADGE_FILTERS,
    badges,
    GENRE_FILTERS,
} from "../../copy/content/apps";
import { LINKS } from "../../copy/content/socialLinks";
import { type App, useApps } from "../../hooks/useApps";
import { useAuth } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";
import { usePrettify } from "../../hooks/usePrettify";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { GithubIcon } from "../assets/SocialIcons";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Title } from "../components/ui/typography";

function getGitHubUsername(s: string) {
    return s ? s.replace(/^@/, "") : null;
}

function getRepoName(url: string) {
    const m = url?.match(/github\.com\/([^/]+\/[^/]+)/);
    return m ? m[1] : null;
}

// --- Platform badge ---

const PLATFORM_DISPLAY: Record<string, string> = {
    web: "🌐 Web",
    android: "📱 Android",
    ios: "🍎 iOS",
    windows: "🖥️ Windows",
    macos: "🖥️ macOS",
    desktop: "💻 Desktop",
    cli: "⌨️ CLI",
    discord: "💬 Discord",
    telegram: "✈️ Telegram",
    whatsapp: "💬 WhatsApp",
    library: "📦 Library",
    "browser-ext": "🧩 Extension",
    roblox: "🎮 Roblox",
    wordpress: "📝 WordPress",
    api: "⚙️ API",
};

// --- App Card ---

function AppCard({ app, copy }: { app: App; copy: typeof APPS_PAGE }) {
    const githubUsername = getGitHubUsername(app.github);
    const repoName = app.repo?.includes("github.com")
        ? getRepoName(app.repo)
        : null;

    const cardBorder = badges.buzz(app)
        ? "border border-badge-buzz/40 shadow-[0_0_4px] shadow-badge-buzz/20"
        : badges.pollen(app)
          ? "border border-badge-pollen/40 shadow-[0_0_4px] shadow-badge-pollen/20"
          : "border border-border-subtle";

    return (
        <div className={`flex flex-col h-full overflow-visible ${cardBorder}`}>
            <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3 bg-input-background hover:brightness-110 transition-all"
            >
                <span className="font-headline text-lg font-black uppercase text-text-body-main">
                    {app.emoji && `${app.emoji} `}
                    {app.name}
                </span>
                <ExternalLinkIcon className="w-4 h-4 text-text-body-main opacity-60 flex-shrink-0" />
            </a>

            <div className="flex flex-col flex-1 px-4 py-3">
                <div className="flex-1">
                    {app.description && (
                        <div className="text-sm text-text-body-secondary mb-3 font-body leading-relaxed">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    p: ({ node, ...props }) => (
                                        <p
                                            {...props}
                                            className="mb-1 last:mb-0"
                                        />
                                    ),
                                    ul: ({ node, ...props }) => (
                                        <ul
                                            {...props}
                                            className="mt-1 space-y-0.5 list-disc list-inside"
                                        />
                                    ),
                                    li: ({ node, ...props }) => (
                                        <li
                                            {...props}
                                            className="text-text-body-secondary"
                                        />
                                    ),
                                    strong: ({ node, ...props }) => (
                                        <strong
                                            {...props}
                                            className="text-text-body-main font-black"
                                        />
                                    ),
                                    em: ({ node, ...props }) => (
                                        <em
                                            {...props}
                                            className="text-text-brand not-italic font-medium"
                                        />
                                    ),
                                    code: ({ node, ...props }) => (
                                        <code
                                            {...props}
                                            className="bg-input-background text-text-highlight px-1.5 py-0.5 rounded text-xs font-mono"
                                        />
                                    ),
                                    a: ({ node, ...props }) => (
                                        <a
                                            {...props}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-text-highlight hover:underline"
                                        />
                                    ),
                                    del: ({ node, ...props }) => (
                                        <del
                                            {...props}
                                            className="text-text-body-secondary/50"
                                        />
                                    ),
                                }}
                            >
                                {app.description}
                            </ReactMarkdown>
                        </div>
                    )}

                    {(badges.pollen(app) ||
                        badges.buzz(app) ||
                        badges.new(app)) && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {badges.pollen(app) && (
                                <span className="relative group/byop">
                                    <Badge variant="pollen">
                                        {copy.pollenBadge}
                                    </Badge>
                                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-input-background text-text-body-main text-xs rounded-tag shadow-lg border border-border-main opacity-0 group-hover/byop:opacity-100 transition-opacity pointer-events-none w-max max-w-[280px] text-center z-50">
                                        {copy.pollenTooltip}
                                        <div className="absolute top-full left-4 border-4 border-transparent border-t-input-background" />
                                    </div>
                                </span>
                            )}
                            {badges.buzz(app) && (
                                <span className="relative group/buzz">
                                    <Badge variant="buzz">
                                        {copy.buzzBadge}
                                    </Badge>
                                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-input-background text-text-body-main text-xs rounded-tag shadow-lg border border-border-main opacity-0 group-hover/buzz:opacity-100 transition-opacity pointer-events-none w-max max-w-[280px] text-center z-50">
                                        {copy.buzzTooltip}
                                        <div className="absolute top-full left-4 border-4 border-transparent border-t-input-background" />
                                    </div>
                                </span>
                            )}
                            {badges.new(app) && (
                                <span className="relative group/new">
                                    <Badge variant="fresh">
                                        {copy.newBadge}
                                    </Badge>
                                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-input-background text-text-body-main text-xs rounded-tag shadow-lg border border-border-main opacity-0 group-hover/new:opacity-100 transition-opacity pointer-events-none w-max max-w-[280px] text-center z-50">
                                        {copy.newTooltip}
                                        <div className="absolute top-full left-4 border-4 border-transparent border-t-input-background" />
                                    </div>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2 mt-auto items-center">
                    {!repoName && githubUsername && (
                        <a
                            href={`https://github.com/${githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main rounded-tag transition-all max-w-[200px]"
                            title={`View ${app.github} on GitHub`}
                        >
                            <span className="text-text-body-secondary">
                                {copy.authorPrefix}
                            </span>
                            <span className="truncate text-text-body-main">
                                {app.github}
                            </span>
                            <GithubIcon className="w-3 h-3 text-text-body-main opacity-60 flex-shrink-0" />
                        </a>
                    )}
                    {!repoName && !githubUsername && app.github && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-input-background border border-border-faint rounded-tag max-w-[200px]">
                            <span className="text-text-body-secondary">
                                {copy.authorPrefix}
                            </span>
                            <span className="truncate text-text-body-main">
                                {app.github}
                            </span>
                        </div>
                    )}
                    {repoName && (
                        <a
                            href={app.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-col gap-1 px-2.5 py-1 text-xs font-mono font-medium bg-input-background hover:bg-input-background border border-border-faint hover:border-border-main rounded-tag transition-all max-w-[200px]"
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
                    {app.platform && PLATFORM_DISPLAY[app.platform] && (
                        <Badge variant="muted" className="ml-auto">
                            {PLATFORM_DISPLAY[app.platform]}
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Sort: buzz → pollen → stars → newest ---

const sortApps = (a: App, b: App) => {
    const t = +badges.buzz(b) - +badges.buzz(a);
    if (t) return t;
    if (a.byop !== b.byop) return a.byop ? -1 : 1;
    const s = (b.stars || 0) - (a.stars || 0);
    if (s) return s;
    return (b.approvedDate || "").localeCompare(a.approvedDate || "");
};

// --- Page ---

export default function AppsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const filter = searchParams.get("filter") || "new";
    const setFilter = (f: string) => setSearchParams({ filter: f });
    const { apiKey } = useAuth();

    const { apps: allApps } = useApps(COPY_CONSTANTS.appsFilePath);
    const { copy: pageCopy, isTranslating } = usePageCopy(APPS_PAGE);
    const { translated: translatedGenre } = useTranslate(
        GENRE_FILTERS,
        "label",
    );
    const { translated: translatedBadge } = useTranslate(
        BADGE_FILTERS,
        "label",
    );

    const filteredApps = useMemo(() => {
        const f = ALL_FILTERS.find((x) => x.id === filter);
        if (!f) return [];
        return allApps.filter(f.match).sort(sortApps);
    }, [allApps, filter]);

    const { prettified } = usePrettify(
        filteredApps,
        "description",
        apiKey,
        "name",
    );

    const { translated: displayApps } = useTranslate(prettified, "description");

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                <Title>{pageCopy.title}</Title>
                <Body spacing="comfortable">{pageCopy.subtitle}</Body>

                {/* CTAs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                    <div className="flex items-center gap-4 p-4 bg-surface-card">
                        <div className="flex-1">
                            <p className="font-headline text-base font-black text-text-body-main mb-1">
                                {pageCopy.submitCtaTitle}
                            </p>
                            <p className="font-body text-sm text-text-body-secondary">
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
                    <div className="flex items-center gap-4 p-4 bg-surface-card">
                        <div className="flex-1">
                            <p className="font-headline text-base font-black text-text-body-main mb-1">
                                {pageCopy.pollenCtaTitle}
                            </p>
                            <p className="font-body text-sm text-text-body-secondary">
                                {pageCopy.pollenCtaDescription}
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
                            {pageCopy.pollenCtaButton}
                            <ExternalLinkIcon className="w-3 h-3 stroke-text-highlight" />
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {translatedGenre.map((f) => (
                        <Button
                            key={f.id}
                            variant="toggle"
                            data-active={filter === f.id}
                            onClick={() => setFilter(f.id)}
                            className="px-4 py-2 text-base"
                        >
                            {f.label}
                        </Button>
                    ))}
                    {translatedBadge.map((f) => (
                        <Button
                            key={f.id}
                            variant="toggle-glow"
                            data-active={filter === f.id}
                            onClick={() => setFilter(f.id)}
                            className="px-4 py-2 text-base"
                            style={{ "--glow": f.glow } as React.CSSProperties}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>

                {/* Legend */}
                <div className="flex flex-col items-end gap-0.5 mb-4 text-xs text-text-body-secondary">
                    <span>
                        <span className="text-text-body-main font-bold">
                            {pageCopy.pollenBadge}
                        </span>{" "}
                        = {pageCopy.pollenLegendDesc}
                        {" · "}
                        <a
                            href={LINKS.byopDocs}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-highlight hover:underline"
                        >
                            {pageCopy.pollenDocsLink}
                        </a>
                    </span>
                    <span>
                        <span className="text-text-body-main font-bold">
                            {pageCopy.buzzBadge}
                        </span>{" "}
                        = {pageCopy.buzzLegendDesc}
                    </span>
                    <span>
                        <span className="text-text-body-main font-bold">
                            {pageCopy.newBadge}
                        </span>{" "}
                        = {pageCopy.newLegendDesc}
                    </span>
                </div>

                {/* App Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                    {displayApps.map((app, i) => (
                        <AppCard
                            key={`${app.name}-${i}`}
                            app={app}
                            copy={pageCopy}
                        />
                    ))}
                </div>

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
