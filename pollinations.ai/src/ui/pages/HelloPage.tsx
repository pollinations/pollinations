import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { useHighlights } from "../../hooks/useHighlights";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { useTranslateAndPrettify } from "../../hooks/useTranslateAndPrettify";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { LazyMarkdown } from "../components/ui/lazy-markdown";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Heading, Title } from "../components/ui/typography";

function HelloPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(HELLO_PAGE);
    const { highlights } = useHighlights();
    const { processed: translatedHighlights } = useTranslateAndPrettify(
        highlights,
        "description",
    );
    useDocumentMeta(pageCopy.pageTitle, pageCopy.pageDescription);

    const { translated: translatedWhatYouGet } = useTranslate(
        HELLO_PAGE.whatYouGetItems,
        "desc",
    );
    const { translated: translatedRoadmap } = useTranslate(
        HELLO_PAGE.roadmapItems,
        "description",
    );

    const tiers = [
        {
            emoji: pageCopy.tierSeedEmoji,
            title: pageCopy.tierSeedTitle,
            desc: pageCopy.tierSeedDescription,
            grant: pageCopy.tierSeedGrant,
        },
        {
            emoji: pageCopy.tierFlowerEmoji,
            title: pageCopy.tierFlowerTitle,
            desc: pageCopy.tierFlowerDescription,
            grant: pageCopy.tierFlowerGrant,
        },
        {
            emoji: pageCopy.tierNectarEmoji,
            title: pageCopy.tierNectarTitle,
            desc: pageCopy.tierNectarDescription,
            grant: pageCopy.tierNectarGrant,
        },
    ];

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
                {/* Section 1 — Hero */}
                <Title>{pageCopy.heroTitle}</Title>
                <div className="mb-8">
                    <Body spacing="comfortable">
                        {pageCopy.heroBodyPrefix}{" "}
                        <strong>{pageCopy.heroBodyBold}</strong>
                        {pageCopy.heroBodySuffix}
                    </Body>
                </div>
                <div className="flex flex-wrap gap-3 mb-8">
                    <Button
                        as="a"
                        href={LINKS.enter}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        size="lg"
                        className="bg-[rgb(var(--primary-strong))] hover:bg-[rgb(var(--primary-strong)/0.8)] text-dark"
                    >
                        {pageCopy.startBuildingButton}
                        <ExternalLinkIcon className="w-4 h-4" />
                    </Button>
                    <Button
                        as="a"
                        href={SOCIAL_LINKS.discord.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                        className="bg-secondary-strong text-dark"
                    >
                        {pageCopy.joinDiscordButton}
                        <ExternalLinkIcon className="w-4 h-4 text-dark" />
                    </Button>
                    <Button
                        as="a"
                        href={LINKS.enterDocs}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                        className="bg-tertiary-strong text-dark"
                    >
                        {pageCopy.readTheDocsButton}
                        <ExternalLinkIcon className="w-4 h-4 text-dark" />
                    </Button>
                </div>
                <p className="font-body text-base text-subtle mb-4">
                    <span className="font-headline text-xs font-black text-muted">
                        {pageCopy.heroStat1}
                    </span>{" "}
                    {pageCopy.heroStat1Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-xs font-black text-muted">
                        {pageCopy.heroStat2}
                    </span>{" "}
                    {pageCopy.heroStat2Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-xs font-black text-muted">
                        {pageCopy.heroStat3}
                    </span>{" "}
                    {pageCopy.heroStat3Label}
                </p>

                <Divider />

                {/* Section 2 — How it works */}
                <div className="mb-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left: heading + bullets */}
                        <div className="flex flex-col">
                            <Heading variant="section" spacing="comfortable">
                                {pageCopy.howItWorksTitle}
                            </Heading>
                            <div className="flex flex-col gap-3 mb-6">
                                {pageCopy.startFreeLines.map(
                                    (line: {
                                        pre: string;
                                        bold: string;
                                        post: string;
                                        emoji: string;
                                        pillColor: string;
                                    }) => (
                                        <div
                                            key={line.emoji}
                                            className={`${line.pillColor} border border-border-subtle rounded-full px-4 py-2 flex items-center gap-3 w-fit`}
                                        >
                                            <span className="text-lg">
                                                {line.emoji}
                                            </span>
                                            <span className="font-body text-base text-dark leading-relaxed">
                                                {line.pre}
                                                {line.bold && (
                                                    <strong>{line.bold}</strong>
                                                )}
                                                {line.post}
                                            </span>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                        {/* Right: tier ladder */}
                        <div>
                            <div className="border-r-2 border-b-2 border-dark p-4 bg-accent-light flex flex-col">
                                <Badge
                                    variant="highlight"
                                    className="mb-4 w-fit"
                                >
                                    {pageCopy.computeTiersTitle}
                                </Badge>
                                {tiers.map((tier, i) => (
                                    <div key={tier.title}>
                                        {i > 0 && (
                                            <div className="flex items-start gap-3 py-1">
                                                <span className="text-lg w-[1.125rem] shrink-0" />
                                                <span className="text-base text-dark">
                                                    ↓
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-start gap-3 py-1.5">
                                            <span className="text-lg mt-0.5">
                                                {tier.emoji}
                                            </span>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-headline text-xs font-black text-dark">
                                                        {tier.title}
                                                    </span>
                                                    <span className="font-mono text-xs font-black text-dark ml-auto">
                                                        {tier.grant}
                                                    </span>
                                                </div>
                                                <Body
                                                    size="sm"
                                                    spacing="none"
                                                    className="text-muted mt-0.5 max-w-[240px]"
                                                >
                                                    {tier.desc}
                                                </Body>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <span className="font-body text-xs text-subtle italic mt-3 pt-3 border-t border-border-subtle">
                                    {pageCopy.tiersBetaNote}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-6 md:-mt-8">
                        <span className="font-body text-sm text-muted">
                            {pageCopy.tierHowText}
                        </span>
                        <div>
                            <a
                                href={LINKS.enterTiersFaq}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                            >
                                {pageCopy.tierHowLink}
                                <ExternalLinkIcon
                                    className="w-3 h-3"
                                    strokeWidth="4"
                                />
                            </a>
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Section — What you get */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.whatYouGetTitle}
                    </Heading>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        {translatedWhatYouGet.map(
                            (
                                item: {
                                    emoji: string;
                                    title: string;
                                    desc: string;
                                    linkText?: string;
                                    linkUrl?: string;
                                    fullWidth?: boolean;
                                },
                                i: number,
                            ) => {
                                const colors = [
                                    "border-primary-strong shadow-[1px_1px_0_rgb(var(--primary-strong)_/_0.3)]",
                                    "border-secondary-strong shadow-[1px_1px_0_rgb(var(--secondary-strong)_/_0.3)]",
                                    "border-tertiary-strong shadow-[1px_1px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                                    "border-accent-strong shadow-[1px_1px_0_rgb(var(--accent-strong)_/_0.3)]",
                                ];
                                return (
                                    <div
                                        key={item.title}
                                        className={`bg-white/60 p-4 rounded-sub-card border-r-2 border-b-2 ${colors[i % colors.length]}${item.fullWidth ? " md:col-span-2" : ""}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg mt-0.5 w-6 text-center shrink-0">
                                                {item.emoji}
                                            </span>
                                            <div className="flex-1">
                                                <span className="font-headline text-xs font-black text-dark">
                                                    {item.title}
                                                </span>
                                                <p className="font-body text-sm text-muted leading-relaxed mt-0.5 whitespace-pre-line">
                                                    {item.desc}
                                                </p>
                                                {item.linkText && (
                                                    <div
                                                        className={
                                                            item.linkUrl
                                                                ? "mt-2"
                                                                : ""
                                                        }
                                                    >
                                                        <a
                                                            href={
                                                                item.linkUrl
                                                                    ? LINKS[
                                                                          item.linkUrl as keyof typeof LINKS
                                                                      ]
                                                                    : LINKS.enterModels
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5 mt-1"
                                                        >
                                                            {item.linkText}
                                                            <ExternalLinkIcon
                                                                className="w-3 h-3"
                                                                strokeWidth="4"
                                                            />
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            },
                        )}
                    </div>
                    <div className="flex flex-col gap-1 mt-6">
                        <span className="font-body text-sm text-muted">
                            {pageCopy.whatYouGetFooter}
                        </span>
                        <div>
                            <a
                                href={
                                    LINKS[
                                        pageCopy.whatYouGetFooterUrl as keyof typeof LINKS
                                    ]
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                            >
                                {pageCopy.whatYouGetFooterLink}
                                <ExternalLinkIcon
                                    className="w-3 h-3"
                                    strokeWidth="4"
                                />
                            </a>
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Section 5 — We build in the open */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.openTitle}
                    </Heading>

                    <div className="flex flex-col gap-6">
                        {/* What's New — full-width, CSS columns for journal flow */}
                        <div className="bg-secondary-light border-r-2 border-b-2 border-dark p-5">
                            <Badge variant="highlight" className="mb-4">
                                {pageCopy.recentUpdatesTitle}
                            </Badge>
                            <div className="md:columns-2 md:gap-6 space-y-2">
                                {translatedHighlights.map((item) => (
                                    <div
                                        key={`${item.date}-${item.title}`}
                                        className="py-1 break-inside-avoid"
                                    >
                                        <p className="font-mono font-black text-xs text-dark">
                                            <span className="bg-primary-strong px-1.5 py-0.5">
                                                {item.date}
                                            </span>
                                            <span className="ml-2">
                                                {item.emoji}
                                            </span>
                                            <span className="font-headline text-[10px] font-black text-dark ml-1">
                                                {item.title}
                                            </span>
                                        </p>
                                        <div className="font-body text-sm text-muted leading-relaxed mt-0.5">
                                            <LazyMarkdown
                                                components={{
                                                    a: ({ node, ...props }) => (
                                                        <a
                                                            {...props}
                                                            className="bg-accent-strong px-1 text-dark hover:underline"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        />
                                                    ),
                                                    p: ({ node, ...props }) => (
                                                        <p
                                                            {...props}
                                                            className="mb-1"
                                                        />
                                                    ),
                                                    ul: ({
                                                        node,
                                                        ...props
                                                    }) => (
                                                        <ul
                                                            {...props}
                                                            className="list-disc list-inside mt-1 space-y-0.5"
                                                        />
                                                    ),
                                                    li: ({
                                                        node,
                                                        ...props
                                                    }) => (
                                                        <li
                                                            {...props}
                                                            className="text-sm text-muted leading-relaxed"
                                                        />
                                                    ),
                                                }}
                                            >
                                                {item.description}
                                            </LazyMarkdown>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <a
                                    href="https://github.com/pollinations/pollinations/blob/news/social/news/highlights.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                                >
                                    More
                                    <ExternalLinkIcon
                                        className="w-3 h-3"
                                        strokeWidth="4"
                                    />
                                </a>
                            </div>
                        </div>

                        {/* What's Next */}
                        <div className="bg-tertiary-light border-r-2 border-b-2 border-dark p-5">
                            <Badge variant="highlight" className="mb-4">
                                {pageCopy.roadmapLabel}
                            </Badge>
                            <div className="md:columns-2 md:gap-6 space-y-2">
                                {translatedRoadmap.map(
                                    (item: {
                                        emoji: string;
                                        title: string;
                                        description: string;
                                    }) => (
                                        <div
                                            key={item.title}
                                            className="py-1 break-inside-avoid"
                                        >
                                            <p className="font-headline text-[10px] font-black text-dark">
                                                <span className="mr-2">
                                                    {item.emoji}
                                                </span>
                                                {item.title}
                                            </p>
                                            <p className="font-body text-sm text-muted leading-relaxed mt-0.5">
                                                {item.description}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Section 6 — CTA */}
                <div>
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.ctaTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.ctaBody}</Body>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            as="a"
                            href={LINKS.enter}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                            className="bg-[rgb(var(--primary-strong))] hover:bg-[rgb(var(--primary-strong)/0.8)] text-dark"
                        >
                            {pageCopy.startBuildingButton}
                            <ExternalLinkIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            as={Link}
                            to="/apps"
                            variant="secondary"
                            size="lg"
                            className="bg-accent-light text-dark"
                        >
                            {pageCopy.browseAppsLink}
                        </Button>
                        <Button
                            as={Link}
                            to="/community"
                            variant="secondary"
                            size="lg"
                            className="bg-accent-light text-dark"
                        >
                            {pageCopy.communityLink}
                        </Button>
                        <Button
                            as="a"
                            href={LINKS.enterDocs}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="secondary"
                            size="lg"
                            className="bg-tertiary-strong text-dark"
                        >
                            {pageCopy.readTheDocsButton}
                            <ExternalLinkIcon className="w-4 h-4 text-dark" />
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
