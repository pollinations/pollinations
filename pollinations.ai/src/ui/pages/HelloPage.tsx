import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Heading, Title } from "../components/ui/typography";

function HelloPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(HELLO_PAGE);

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
                    <Body spacing="comfortable">{pageCopy.heroBody}</Body>
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
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.howItWorksTitle}
                    </Heading>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                        {/* Left: bullets + flywheel */}
                        <div className="flex flex-col">
                            <div className="flex flex-col gap-1.5 mb-6">
                                {pageCopy.startFreeLines.map(
                                    (line: {
                                        pre: string;
                                        bold: string;
                                        post: string;
                                    }) => (
                                        <p
                                            key={line.pre}
                                            className="font-body text-base text-muted leading-relaxed"
                                        >
                                            {line.pre}
                                            {line.bold && (
                                                <strong className="text-dark">
                                                    {line.bold}
                                                </strong>
                                            )}
                                            {line.post}
                                        </p>
                                    ),
                                )}
                            </div>
                            {/* Flywheel diagram */}
                            <div className="border-2 border-primary-strong border-r-4 border-b-4 p-3 bg-dark flex flex-row items-center justify-between mb-6">
                                {[
                                    {
                                        emoji: pageCopy.loopBuildEmoji,
                                        label: pageCopy.loopBuild,
                                        color: "text-primary-strong",
                                    },
                                    {
                                        emoji: pageCopy.loopShipEmoji,
                                        label: pageCopy.loopShip,
                                        color: "text-secondary-strong",
                                    },
                                    {
                                        emoji: pageCopy.loopGrowEmoji,
                                        label: pageCopy.loopGrow,
                                        color: "text-tertiary-strong",
                                    },
                                    {
                                        emoji: pageCopy.loopEarnEmoji,
                                        label: pageCopy.loopEarn,
                                        color: "text-accent-strong",
                                    },
                                ].map((step, i) => (
                                    <div
                                        key={step.label}
                                        className="flex flex-row items-center"
                                    >
                                        <div className="flex flex-col items-center">
                                            <span className="text-2xl md:text-4xl mb-1">
                                                {step.emoji}
                                            </span>
                                            <span
                                                className={`font-headline text-[10px] md:text-sm font-black uppercase tracking-wide ${step.color}`}
                                            >
                                                {step.label}
                                            </span>
                                        </div>
                                        {i < 3 && (
                                            <span className="text-white font-mono text-sm md:text-xl font-black px-1.5 md:px-3 self-end mb-0.5">
                                                →
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col gap-1">
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
                        {/* Right: tier ladder */}
                        <div className="md:max-w-[280px]">
                            <div className="border-2 border-dark border-r-4 border-b-4 p-4 bg-accent-light flex flex-col">
                                <Heading
                                    variant="subsection"
                                    spacing="comfortable"
                                >
                                    {pageCopy.computeTiersTitle}
                                </Heading>
                                {tiers.map((tier, i) => (
                                    <div key={tier.title}>
                                        {i > 0 && (
                                            <div className="flex justify-start pl-7 py-0.5 text-subtle font-mono text-xs">
                                                ▼
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
                                                    className="text-muted mt-0.5"
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
                </div>

                {/* Section 3 — Users pay */}
                <div className="flex flex-col gap-6 mb-12">
                    <div className="border-2 border-dark border-r-4 border-b-4 p-5 bg-tertiary-light md:max-w-[75%]">
                        <Heading variant="subsection" spacing="comfortable">
                            {pageCopy.usersTitle}
                        </Heading>
                        <Body spacing="comfortable" className="text-muted">
                            {pageCopy.usersBody}
                        </Body>
                        <a
                            href={LINKS.byopDocs}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-headline text-xs font-black text-dark bg-accent-strong px-2 py-0.5 hover:underline inline-flex items-center gap-1"
                        >
                            {pageCopy.usersPaymentsLink}
                            <ExternalLinkIcon
                                className="w-3 h-3"
                                strokeWidth="4"
                            />
                        </a>
                    </div>
                </div>

                <Divider />

                {/* Section 5 — We build in the open */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.openTitle}
                    </Heading>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* What's New — 2/3 width */}
                        <div
                            className="md:col-span-2 bg-secondary-light border-2 border-dark border-r-4 border-b-4 p-5"
                            style={{
                                boxShadow: "3px 3px 0px rgba(17, 5, 24, 0.12)",
                            }}
                        >
                            <Badge variant="highlight" className="mb-4">
                                {pageCopy.recentUpdatesTitle}
                            </Badge>
                            <div className="space-y-2">
                                {pageCopy.newsItems.map(
                                    (item: {
                                        date: string;
                                        emoji: string;
                                        title: string;
                                        description: string;
                                    }) => (
                                        <div
                                            key={`${item.date}-${item.title}`}
                                            className="py-1"
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
                                            <p className="font-body text-sm text-muted leading-relaxed mt-0.5">
                                                {item.description}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>

                        {/* What's Next — 1/3 width */}
                        <div
                            className="md:col-span-1 bg-tertiary-light border-2 border-dark border-r-4 border-b-4 p-5"
                            style={{
                                boxShadow: "3px 3px 0px rgba(17, 5, 24, 0.12)",
                            }}
                        >
                            <Badge variant="highlight" className="mb-4">
                                {pageCopy.roadmapLabel}
                            </Badge>
                            <div className="space-y-2">
                                {pageCopy.roadmapItems.map(
                                    (item: {
                                        emoji: string;
                                        title: string;
                                        description: string;
                                    }) => (
                                        <div key={item.title} className="py-1">
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

                    <div className="flex items-center gap-3 mt-10">
                        <span className="text-3xl">
                            {pageCopy.comingFooterEmoji}
                        </span>
                        <p className="font-headline text-xs leading-loose text-dark">
                            {pageCopy.comingFooterLine1}
                            <br />
                            {pageCopy.comingFooterLine2}
                        </p>
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
