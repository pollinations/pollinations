import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { COPY_CONSTANTS } from "../../copy/constants";
import {
    APPS_PAGE,
    BADGE_FILTERS,
    badges,
    GENRE_FILTERS,
} from "../../copy/content/apps";
import { LINKS } from "../../copy/content/socialLinks";
import { type App, useApps } from "../../hooks/useApps";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { usePageCopy } from "../../hooks/usePageCopy";
import { usePrettify } from "../../hooks/usePrettify";
import { useTranslate } from "../../hooks/useTranslate";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { GithubIcon } from "../assets/SocialIcons";
import { BackToTop } from "../components/ui/back-to-top";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { LazyMarkdownGfm } from "../components/ui/lazy-markdown";
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

// Map from platform id to copy key in APPS_PAGE
const PLATFORM_COPY_KEY: Record<string, keyof typeof APPS_PAGE> = {
    web: "platformWeb",
    android: "platformAndroid",
    ios: "platformIos",
    windows: "platformWindows",
    macos: "platformMacos",
    desktop: "platformDesktop",
    cli: "platformCli",
    discord: "platformDiscord",
    telegram: "platformTelegram",
    whatsapp: "platformWhatsapp",
    library: "platformLibrary",
    "browser-ext": "platformBrowserExt",
    roblox: "platformRoblox",
    wordpress: "platformWordpress",
    api: "platformApi",
};

// --- App Card ---

function AppCard({ app, copy }: { app: App; copy: typeof APPS_PAGE }) {
    const githubUsername = getGitHubUsername(app.github);
    const repoName = app.repo?.includes("github.com")
        ? getRepoName(app.repo)
        : null;

    const cardBorder = badges.buzz(app)
        ? "border-r-2 border-b-2 border-primary-strong shadow-[1px_1px_0_rgb(var(--primary-strong)_/_0.3)]"
        : badges.pollen(app)
          ? "border-r-2 border-b-2 border-accent-strong shadow-[1px_1px_0_rgb(var(--accent-strong)_/_0.3)]"
          : "border-r-2 border-b-2 border-tan shadow-[1px_1px_0_rgb(var(--tan)_/_0.3)]";

    return (
        <div
            className={`flex flex-col h-full overflow-visible transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${cardBorder}`}
        >
            <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-4 py-3 bg-white hover:brightness-110 transition"
            >
                <span className="font-headline text-xs font-black uppercase text-dark flex items-center">
                    {app.emoji && (
                        <span className="flex-shrink-0 mr-2 text-base leading-none">
                            {app.emoji}
                        </span>
                    )}
                    <span>{app.name}</span>
                </span>
            </a>

            <div className="flex flex-col flex-1 px-4 py-3 bg-white/60">
                <div className="flex-1">
                    {app.description && (
                        <div className="text-sm text-muted mb-3 font-body leading-relaxed">
                            <LazyMarkdownGfm
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
                                        <li {...props} className="text-muted" />
                                    ),
                                    strong: ({ node, ...props }) => (
                                        <strong
                                            {...props}
                                            className="text-dark font-black"
                                        />
                                    ),
                                    em: ({ node, ...props }) => (
                                        <em
                                            {...props}
                                            className="text-dark not-italic font-medium"
                                        />
                                    ),
                                    code: ({ node, ...props }) => (
                                        <code
                                            {...props}
                                            className="bg-white text-dark px-1.5 py-0.5 rounded text-xs font-mono"
                                        />
                                    ),
                                    a: ({ node, ...props }) => (
                                        <a
                                            {...props}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-dark hover:underline"
                                        />
                                    ),
                                    del: ({ node, ...props }) => (
                                        <del
                                            {...props}
                                            className="text-muted/50"
                                        />
                                    ),
                                }}
                            >
                                {app.description}
                            </LazyMarkdownGfm>
                        </div>
                    )}

                    {(badges.pollen(app) ||
                        badges.buzz(app) ||
                        badges.new(app)) && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {badges.pollen(app) && (
                                <Badge variant="pollen">
                                    {copy.pollenBadge}
                                </Badge>
                            )}
                            {badges.buzz(app) && (
                                <Badge variant="buzz">{copy.buzzBadge}</Badge>
                            )}
                            {badges.new(app) && (
                                <Badge variant="fresh">{copy.newBadge}</Badge>
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-white border border-cream hover:border-border rounded-tag transition max-w-[200px]"
                            title={copy.viewOnGithub.replace(
                                "{name}",
                                app.github,
                            )}
                        >
                            <span className="text-muted">
                                {copy.authorPrefix}
                            </span>
                            <span className="truncate text-dark">
                                {app.github}
                            </span>
                            <GithubIcon className="w-3 h-3 text-dark opacity-60 flex-shrink-0" />
                        </a>
                    )}
                    {!repoName && !githubUsername && app.github && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-white border border-cream rounded-tag max-w-[200px]">
                            <span className="text-muted">
                                {copy.authorPrefix}
                            </span>
                            <span className="truncate text-dark">
                                {app.github}
                            </span>
                        </div>
                    )}
                    {repoName && (
                        <a
                            href={app.repo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-col gap-1 px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-white border border-cream hover:border-border rounded-tag transition max-w-[200px]"
                            title={copy.viewOnGithub.replace(
                                "{name}",
                                repoName,
                            )}
                        >
                            <span className="inline-flex items-center gap-1.5 w-full">
                                <span className="truncate flex-1 min-w-0 text-dark">
                                    {repoName}
                                </span>
                                <GithubIcon className="w-3 h-3 text-dark opacity-60 flex-shrink-0" />
                            </span>
                            {(app.stars || 0) > 0 && (
                                <span className="text-muted">
                                    ⭐ {app.stars}
                                </span>
                            )}
                        </a>
                    )}
                    {app.platform && PLATFORM_COPY_KEY[app.platform] && (
                        <Badge variant="muted" className="ml-auto">
                            {copy[PLATFORM_COPY_KEY[app.platform]] as string}
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
    const filter = searchParams.get("filter") || "image";
    const sort = searchParams.get("sort") || "new";
    const setFilter = (f: string) =>
        setSearchParams({ filter: f, ...(sort ? { sort } : {}) });
    const setSort = (s: string) =>
        setSearchParams({ filter, sort: sort === s ? "" : s });
    const { apiKey } = useAuth();

    const { apps: allApps } = useApps(COPY_CONSTANTS.appsFilePath);
    const { copy: pageCopy, isTranslating } = usePageCopy(APPS_PAGE);
    useDocumentMeta(pageCopy.pageTitle, pageCopy.pageDescription);
    const { translated: translatedGenre } = useTranslate(
        GENRE_FILTERS,
        "label",
    );
    const { translated: translatedBadge } = useTranslate(
        BADGE_FILTERS,
        "label",
    );

    const filteredApps = useMemo(() => {
        const f = GENRE_FILTERS.find((x) => x.id === filter);
        if (!f) return allApps.slice().sort(sortApps);
        const filtered = allApps.filter(f.match).sort(sortApps);
        // If a badge sort is active, float matching apps to top
        const badgeFn = BADGE_FILTERS.find((x) => x.id === sort);
        if (!badgeFn) return filtered;
        const matching = filtered.filter(badgeFn.match);
        const rest = filtered.filter((a) => !badgeFn.match(a));
        return [...matching, ...rest];
    }, [allApps, filter, sort]);

    const { prettified } = usePrettify(
        filteredApps,
        "description",
        apiKey,
        "name",
        "emoji",
    );

    const { translated: displayApps } = useTranslate(prettified, "description");

    return (
        <>
            <PageContainer>
                <PageCard isTranslating={isTranslating}>
                    <Title>{pageCopy.title}</Title>
                    <Body spacing="comfortable">
                        {pageCopy.subtitlePrefix}
                        <strong>{pageCopy.subtitleBold}</strong>
                        {pageCopy.subtitleSuffix}
                    </Body>

                    {/* CTAs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                        <div className="flex items-center gap-4 p-4 bg-primary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4">
                            <div className="flex-1">
                                <p className="font-headline text-xs font-black text-dark mb-1">
                                    {pageCopy.submitCtaTitle}
                                </p>
                                <p className="font-body text-sm text-muted">
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
                                className="bg-secondary-strong text-dark hover:bg-secondary-strong/80 hover:text-dark"
                            >
                                {pageCopy.submitCtaButton}
                                <ExternalLinkIcon className="w-3 h-3 stroke-charcoal" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-4 p-4 bg-tertiary-light rounded-sub-card border-2 border-dark border-r-4 border-b-4">
                            <div className="flex-1">
                                <p className="font-headline text-xs font-black text-dark mb-1">
                                    {pageCopy.pollenCtaTitle}
                                </p>
                                <p className="font-body text-sm text-muted">
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
                                className="bg-secondary-strong text-dark hover:bg-secondary-strong/80 hover:text-dark"
                            >
                                {pageCopy.pollenCtaButton}
                                <ExternalLinkIcon className="w-3 h-3 stroke-charcoal" />
                            </Button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div id="filters" className="flex flex-wrap gap-2 mb-4">
                        {translatedGenre.map((f) => (
                            <Button
                                key={f.id}
                                variant="toggle-glow"
                                data-active={filter === f.id}
                                onClick={() => setFilter(f.id)}
                                className="px-2 py-1 text-sm md:px-4 md:py-2 md:text-base"
                                style={
                                    { "--glow": f.glow } as React.CSSProperties
                                }
                            >
                                {f.label}
                            </Button>
                        ))}
                    </div>

                    {/* Sort + Legend */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-8">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-headline text-xs font-black uppercase tracking-wider text-muted">
                                {pageCopy.sortLabel}
                            </span>
                            {translatedBadge.map((f) => (
                                <Button
                                    key={f.id}
                                    variant="toggle-glow"
                                    size={null}
                                    data-active={sort === f.id}
                                    onClick={() => setSort(f.id)}
                                    className="rounded-full px-3 py-1 text-xs"
                                    style={
                                        {
                                            "--glow": f.glow,
                                        } as React.CSSProperties
                                    }
                                >
                                    {f.label}
                                </Button>
                            ))}
                        </div>
                        <div className="flex flex-col items-start md:items-end gap-0.5 text-xs text-muted">
                            <span className="inline-flex items-center gap-1 flex-wrap md:flex-nowrap">
                                <span className="text-dark font-bold">
                                    {pageCopy.pollenBadge}
                                </span>
                                {" = "}
                                {pageCopy.pollenLegendDesc}
                                {" · "}
                                <a
                                    href={LINKS.byopDocs}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline font-black text-dark bg-accent-strong px-1.5 py-0.5 hover:underline inline-flex items-center gap-0.5"
                                >
                                    {pageCopy.pollenDocsLink}
                                    <ExternalLinkIcon
                                        className="w-2.5 h-2.5"
                                        strokeWidth="4"
                                    />
                                </a>
                            </span>
                            <span>
                                <span className="text-dark font-bold">
                                    {pageCopy.buzzBadge}
                                </span>
                                {" = "}
                                {pageCopy.buzzLegendDesc}
                            </span>
                            <span>
                                <span className="text-dark font-bold">
                                    {pageCopy.newBadge}
                                </span>
                                {" = "}
                                {pageCopy.newLegendDesc}
                            </span>
                        </div>
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
                            <Body className="text-dark">
                                {pageCopy.noAppsMessage}
                            </Body>
                        </div>
                    )}
                </PageCard>
            </PageContainer>
            <BackToTop targetId="filters" hideWhenId="filters" />
        </>
    );
}
