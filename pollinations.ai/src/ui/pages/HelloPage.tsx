import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { useHighlights } from "../../hooks/useHighlights";
import { usePageCopy } from "../../hooks/usePageCopy";
import { useTranslate } from "../../hooks/useTranslate";
import { useTranslateAndPrettify } from "../../hooks/useTranslateAndPrettify";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
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

    const quietLinkClass =
        "font-headline text-[10px] font-bold text-subtle/70 hover:text-subtle hover:underline inline-flex items-center gap-1";
    const quietMarkdownLinkClass =
        "font-headline text-[10px] font-bold text-subtle/70 hover:text-subtle hover:underline";

    const { translated: translatedWhatYouGet } = useTranslate(
        HELLO_PAGE.whatYouGetItems,
        "desc",
    );
    const { translated: translatedRoadmap } = useTranslate(
        HELLO_PAGE.roadmapItems,
        "description",
    );

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

                {/* Section 2 — Toolbox */}
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
                                    lead?: string;
                                    desc: string;
                                    linkText?: string;
                                    linkUrl?: string;
                                    fullWidth?: boolean;
                                },
                                i: number,
                            ) => {
                                const accents = [
                                    {
                                        card: "border-primary-strong shadow-[1px_1px_0_rgb(var(--primary-strong)_/_0.3)]",
                                        title: "bg-primary-strong border-primary-strong",
                                    },
                                    {
                                        card: "border-secondary-strong shadow-[1px_1px_0_rgb(var(--secondary-strong)_/_0.3)]",
                                        title: "bg-secondary-strong border-secondary-strong",
                                    },
                                    {
                                        card: "border-tertiary-strong shadow-[1px_1px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                                        title: "bg-tertiary-strong border-tertiary-strong",
                                    },
                                    {
                                        card: "border-accent-strong shadow-[1px_1px_0_rgb(var(--accent-strong)_/_0.3)]",
                                        title: "bg-accent-strong border-accent-strong",
                                    },
                                ];
                                const accent = accents[i % accents.length];
                                return (
                                    <div
                                        key={item.title}
                                        className={
                                            item.fullWidth
                                                ? "md:col-span-2 flex flex-col"
                                                : "flex flex-col"
                                        }
                                    >
                                        <div className="flex items-center mb-2 px-1">
                                            <h3
                                                className={`font-headline text-base font-black text-dark border rounded px-2 py-1 ${accent.title}`}
                                            >
                                                {item.title}
                                            </h3>
                                        </div>
                                        <div
                                            className={`bg-white/60 p-4 rounded-sub-card border-r-2 border-b-2 flex flex-col flex-1 ${accent.card}`}
                                        >
                                            {item.lead && (
                                                <p className="font-body text-sm font-bold text-dark leading-relaxed">
                                                    {item.lead}
                                                </p>
                                            )}
                                            <p className="font-body text-sm font-medium text-dark leading-relaxed mt-2 whitespace-pre-line">
                                                {item.desc}
                                            </p>
                                            {item.linkText && (
                                                <div className="mt-auto pt-3 flex justify-end">
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
                                                        className={
                                                            quietLinkClass
                                                        }
                                                    >
                                                        <span
                                                            className="text-xs"
                                                            aria-hidden="true"
                                                        >
                                                            {item.emoji}
                                                        </span>
                                                        {item.linkText}
                                                        <ExternalLinkIcon
                                                            className="w-2.5 h-2.5"
                                                            strokeWidth="3"
                                                        />
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            },
                        )}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 mt-6 text-right">
                        <span className="font-body text-sm text-muted">
                            {pageCopy.whatYouGetFooter}
                        </span>
                        <Button
                            as="a"
                            href={
                                LINKS[
                                    pageCopy.whatYouGetFooterUrl as keyof typeof LINKS
                                ]
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="iconText"
                            size={null}
                            className="h-7 bg-[rgb(var(--tertiary-strong))] text-dark hover:!bg-[rgb(var(--tertiary-strong)/0.8)] hover:!text-dark hover:[&>*]:!text-dark"
                        >
                            <span className="font-headline text-[10px] font-black uppercase tracking-wider">
                                {pageCopy.whatYouGetFooterLink}
                            </span>
                            <ExternalLinkIcon
                                className="w-3 h-3"
                                strokeWidth="4"
                            />
                        </Button>
                    </div>
                </div>

                <Divider />

                {/* Section 5 — Last Updates */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.openTitle}
                    </Heading>
                    <div className="bg-secondary-light border-r-2 border-b-2 border-dark p-5">
                        <div className="md:columns-2 md:gap-6 space-y-2">
                            {translatedHighlights.map((item) => (
                                <div
                                    key={`${item.date}-${item.title}`}
                                    className="py-1 break-inside-avoid"
                                >
                                    <p className="font-mono font-black text-xs text-dark">
                                        <span className="bg-white px-1.5 py-0.5">
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
                                                        className={
                                                            quietMarkdownLinkClass
                                                        }
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
                                                ul: ({ node, ...props }) => (
                                                    <ul
                                                        {...props}
                                                        className="list-disc list-inside mt-1 space-y-0.5"
                                                    />
                                                ),
                                                li: ({ node, ...props }) => (
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
                                href={
                                    LINKS[
                                        pageCopy.recentUpdatesMoreUrl as keyof typeof LINKS
                                    ]
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className={quietLinkClass}
                            >
                                {pageCopy.recentUpdatesMoreText}
                                <ExternalLinkIcon
                                    className="w-2.5 h-2.5"
                                    strokeWidth="3"
                                />
                            </a>
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Section 6 — Next */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.roadmapTitle}
                    </Heading>
                    <div className="bg-tertiary-light border-r-2 border-b-2 border-dark p-5">
                        <div className="md:columns-2 md:gap-6 space-y-2">
                            {translatedRoadmap.map(
                                (item: {
                                    title: string;
                                    description: string;
                                }) => (
                                    <div
                                        key={item.title}
                                        className="py-1 break-inside-avoid"
                                    >
                                        <p className="font-headline text-[10px] font-black text-dark">
                                            <span className="bg-white px-1.5 py-0.5">
                                                {item.title}
                                            </span>
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

                <Divider />

                {/* Section 7 — CTA */}
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
