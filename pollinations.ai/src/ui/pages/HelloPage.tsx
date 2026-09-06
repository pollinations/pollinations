import {
    AppWindow,
    AudioLines,
    Bot,
    Cable,
    Images,
    Terminal,
    Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { COPY_CONSTANTS } from "../../copy/constants";
import { HELLO_PAGE } from "../../copy/content/hello";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useApps } from "../../hooks/useApps";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { useHighlights } from "../../hooks/useHighlights";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { useTranslateAndPrettify } from "../../hooks/useTranslateAndPrettify";
import { LazyMarkdown } from "../components/ui/lazy-markdown";

const featureIcons = {
    models: AudioLines,
    agents: Bot,
    wallet: Wallet,
    media: Images,
    cli: Terminal,
    tools: Cable,
    app: AppWindow,
};

function FeatureCards({ items }: { items: typeof HELLO_PAGE.buildFeatures }) {
    const { translated } = useTranslate(items, "description");
    return (
        <div className="home-grid">
            {translated.map((item) => {
                const Icon =
                    featureIcons[item.icon as keyof typeof featureIcons];
                return (
                    <article key={item.title} className="home-card">
                        <Icon size={24} aria-hidden="true" />
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <a
                            className="site-button"
                            href={LINKS[item.link as keyof typeof LINKS]}
                        >
                            {item.linkText} ↗
                        </a>
                    </article>
                );
            })}
        </div>
    );
}

function HelloPage() {
    const { copy, isTranslating } = usePageCopy(HELLO_PAGE);
    const { highlights } = useHighlights();
    const { processed: translatedHighlights } = useTranslateAndPrettify(
        highlights,
        "description",
    );
    const { translated: moneySteps } = useTranslate(
        HELLO_PAGE.moneySteps,
        "description",
    );
    const { translated: roadmap } = useTranslate(
        HELLO_PAGE.roadmapItems,
        "description",
    );
    const { apps, loading } = useApps(COPY_CONSTANTS.appsFilePath);
    const featuredApps = apps
        .filter((app) => app.url)
        .sort((a, b) => b.requests24h - a.requests24h)
        .slice(0, 3);
    useDocumentMeta(copy.pageTitle, copy.pageDescription);

    return (
        <article className="site-home site-width" aria-busy={isTranslating}>
            <div className="home-page">
                <section className="home-hero">
                    <img
                        className="home-hero-art"
                        src="/heroes/home.webp"
                        srcSet="/heroes/home-1024.webp 1024w, /heroes/home.webp 2048w"
                        sizes="(max-width: 1240px) 100vw, 1240px"
                        width={2048}
                        height={854}
                        alt=""
                        fetchPriority="high"
                    />
                    <div className="home-hero-copy">
                        <p className="home-eyebrow">{copy.heroEyebrow}</p>
                        <h1>{copy.heroTitle}</h1>
                        <p className="home-intro">{copy.heroBody}</p>
                        <div className="site-actions">
                            <a
                                className="site-button site-button-primary"
                                href={LINKS.enterQuests}
                            >
                                {copy.startBuildingButton} ↗
                            </a>
                            <a className="site-button" href={LINKS.enterDocs}>
                                {copy.readTheDocsButton} ↗
                            </a>
                        </div>
                    </div>
                </section>

                <div className="home-sections">
                    <section className="home-first-call home-card">
                        <p className="home-eyebrow">{copy.firstCallEyebrow}</p>
                        <h2>{copy.firstCallTitle}</h2>
                        <div className="home-first-call-content">
                            <div>
                                <h3>{copy.questsTitle}</h3>
                                <p>{copy.questsBody}</p>
                            </div>
                            <div className="site-actions">
                                <a
                                    className="site-button"
                                    href={LINKS.enterQuests}
                                >
                                    {copy.questsButton} ↗
                                </a>
                                <a
                                    className="site-button"
                                    href={LINKS.enterKeys}
                                >
                                    {copy.keysButton} ↗
                                </a>
                            </div>
                        </div>
                        <img
                            src="/tool-scenes/earn-pollen-magic-day.webp"
                            srcSet="/tool-scenes/earn-pollen-magic-day-1024.webp 1024w, /tool-scenes/earn-pollen-magic-day.webp 2048w"
                            sizes="(max-width: 1240px) 100vw, 1100px"
                            width={2048}
                            height={1024}
                            alt=""
                            loading="lazy"
                            decoding="async"
                        />
                    </section>

                    <section>
                        <p className="home-eyebrow">{copy.buildEyebrow}</p>
                        <h2>{copy.buildTitle}</h2>
                        <p className="home-section-intro">{copy.buildBody}</p>
                        <FeatureCards items={HELLO_PAGE.buildFeatures} />
                    </section>

                    <section>
                        <p className="home-eyebrow">{copy.publishEyebrow}</p>
                        <h2>{copy.publishTitle}</h2>
                        <p className="home-section-intro">{copy.publishBody}</p>
                        <FeatureCards items={HELLO_PAGE.publishFeatures} />
                    </section>

                    <section className="home-money">
                        <div>
                            <p className="home-eyebrow">{copy.moneyEyebrow}</p>
                            <h2>{copy.moneyTitle}</h2>
                            <p>{copy.moneyBody}</p>
                        </div>
                        <div>
                            <ol>
                                {moneySteps.map((item) => (
                                    <li key={item.title}>
                                        <h3>{item.title}</h3>
                                        <p>{item.description}</p>
                                    </li>
                                ))}
                            </ol>
                            <a href={LINKS.byopDocs}>{copy.moneyDocs} ↗</a>
                        </div>
                    </section>

                    <section>
                        <p className="home-eyebrow">{copy.appsEyebrow}</p>
                        <div className="home-section-heading">
                            <h2>{copy.appsTitle}</h2>
                            <Link className="site-button" to="/apps">
                                {copy.browseAppsLink} →
                            </Link>
                        </div>
                        {loading ? (
                            <output>{copy.appsLoading}</output>
                        ) : featuredApps.length === 0 ? (
                            <p>{copy.appsUnavailable}</p>
                        ) : (
                            <div className="home-grid">
                                {featuredApps.map((app) => (
                                    <a
                                        className="home-card home-app"
                                        key={app.name}
                                        href={app.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <span
                                            className="home-app-art"
                                            aria-hidden="true"
                                        >
                                            {app.emoji}
                                        </span>
                                        <h3>{app.name} ↗</h3>
                                        <p>{app.description}</p>
                                    </a>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <div className="home-section-heading">
                            <h2>{copy.openTitle}</h2>
                            <a href={LINKS.highlightsSource}>
                                {copy.recentUpdatesMoreText} ↗
                            </a>
                        </div>
                        <div className="home-updates">
                            {translatedHighlights.map((item) => (
                                <article key={item.date + item.title}>
                                    <time dateTime={item.date}>
                                        {item.date}
                                    </time>
                                    <h3>
                                        {item.emoji} {item.title}
                                    </h3>
                                    <LazyMarkdown>
                                        {item.description}
                                    </LazyMarkdown>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section>
                        <p className="home-eyebrow">{copy.roadmapEyebrow}</p>
                        <h2>{copy.roadmapTitle}</h2>
                        <div className="home-grid home-roadmap">
                            {roadmap.map((item) => (
                                <article key={item.title} className="home-card">
                                    <h3>{item.title}</h3>
                                    <p>{item.description}</p>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="home-cta home-card">
                        <h2>{copy.ctaTitle}</h2>
                        <p>{copy.ctaBody}</p>
                        <div className="site-actions">
                            <a
                                className="site-button site-button-primary"
                                href={LINKS.enterKeys}
                            >
                                {copy.getKeyButton} ↗
                            </a>
                            <a
                                className="site-button"
                                href={SOCIAL_LINKS.discord.url}
                            >
                                {copy.joinDiscordButton} ↗
                            </a>
                        </div>
                    </section>
                </div>
                <img
                    className="home-bottom-art"
                    src="/heroes/home-bottom-day.webp"
                    srcSet="/heroes/home-bottom-day-1024.webp 1024w, /heroes/home-bottom-day.webp 2048w"
                    sizes="(max-width: 1240px) 100vw, 1240px"
                    width={2048}
                    height={854}
                    alt=""
                    loading="lazy"
                    decoding="async"
                />
            </div>
        </article>
    );
}

export default HelloPage;
