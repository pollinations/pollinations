import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { FlywheelRing } from "../components/FlywheelRing";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { Body, Heading, Title } from "../components/ui/typography";

function HelloPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(HELLO_PAGE);

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
                    >
                        {pageCopy.startBuildingButton}
                        <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                    </Button>
                    <Button
                        as="a"
                        href={SOCIAL_LINKS.discord.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                    >
                        {pageCopy.joinDiscordButton}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                    </Button>
                </div>
                <p className="font-body text-base text-text-body-tertiary mb-4">
                    <span className="font-headline text-xs font-black text-text-body-secondary">
                        {pageCopy.heroStat1}
                    </span>{" "}
                    {pageCopy.heroStat1Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-xs font-black text-text-body-secondary">
                        {pageCopy.heroStat2}
                    </span>{" "}
                    {pageCopy.heroStat2Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline text-xs font-black text-text-body-secondary">
                        {pageCopy.heroStat3}
                    </span>{" "}
                    {pageCopy.heroStat3Label}
                </p>

                <Divider />

                {/* Section — Flywheel & Tiers */}
                <div className="mb-12">
                    {/* Row 1: Flywheel (left) + explanation (right) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-items-center mb-16">
                        <FlywheelRing pageCopy={pageCopy} />
                        <div className="max-w-xs">
                            <p className="font-body text-base text-text-body-secondary leading-relaxed">
                                <span className="font-bold text-text-brand">{pageCopy.flywheelBodyHighlight1}</span>
                                {pageCopy.flywheelBodyMid}
                                <span className="font-bold text-text-highlight">{pageCopy.flywheelBodyHighlight2}</span>
                            </p>
                        </div>
                    </div>

                    {/* Row 2: Tier details (left) + Tier cards (right) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-items-center">
                        {/* Tier explanation */}
                        <div className="max-w-sm">
                            <div className="mb-4">
                                <p className="font-headline text-xs font-black text-text-highlight">
                                    {pageCopy.tierHowText}
                                </p>
                                <a
                                    href={LINKS.enterTiersFaq}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-sm font-black hover:underline inline-block mt-1"
                                    style={{ color: "rgb(var(--indicator-video))" }}
                                >
                                    {pageCopy.tierHowLink}
                                </a>
                            </div>
                            <div className="bg-surface-page border-2 border-border-strong border-r-4 border-b-4 p-4 inline-block text-left">
                                <span className="font-headline text-sm font-black text-text-brand">
                                    {pageCopy.usersTitle}
                                </span>
                                <Body
                                    size="sm"
                                    spacing="tight"
                                    className="mt-2 text-text-body-secondary"
                                >
                                    {pageCopy.usersBody}
                                </Body>
                                <a
                                    href={LINKS.byopDocs}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-xs font-black text-text-accent hover:underline mt-2 inline-block"
                                >
                                    {pageCopy.usersPaymentsLink}
                                </a>
                            </div>
                            <span className="font-body text-xs text-text-body-tertiary italic mt-3 inline-block">
                                {pageCopy.tiersBetaNote}
                            </span>
                        </div>

                        {/* Tier ladder: Nectar (top) → Flower → Seed (bottom) */}
                        <div className="relative flex flex-col gap-4 pr-8 max-w-[300px]">
                            {/* 8-bit pixel arrow pointing up (right side) — green→pink→honey */}
                            <svg
                                className="absolute right-0 top-0 bottom-0 w-4"
                                viewBox="0 0 5 24"
                                preserveAspectRatio="none"
                                style={{ height: "100%", imageRendering: "pixelated" }}
                                aria-hidden="true"
                            >
                                <defs>
                                    <linearGradient id="arrow-grad" x1="0" y1="1" x2="0" y2="0">
                                        <stop offset="0%" stopColor="#7eb87e" />
                                        <stop offset="45%" stopColor="#d4849e" />
                                        <stop offset="100%" stopColor="#d4a854" />
                                    </linearGradient>
                                </defs>
                                <rect x="1" y="0" width="3" height="24" fill="url(#arrow-grad)" />
                            </svg>
                            {[
                                {
                                    emoji: pageCopy.tierNectarEmoji,
                                    title: pageCopy.tierNectarTitle,
                                    desc: pageCopy.tierNectarDescription,
                                    grant: pageCopy.tierNectarGrant,
                                    tint: "#f5e6c8", // warm honey
                                    borderColor: "#d4a854",
                                },
                                {
                                    emoji: pageCopy.tierFlowerEmoji,
                                    title: pageCopy.tierFlowerTitle,
                                    desc: pageCopy.tierFlowerDescription,
                                    grant: pageCopy.tierFlowerGrant,
                                    tint: "#f5dce8", // soft pink
                                    borderColor: "#d4849e",
                                },
                                {
                                    emoji: pageCopy.tierSeedEmoji,
                                    title: pageCopy.tierSeedTitle,
                                    desc: pageCopy.tierSeedDescription,
                                    grant: pageCopy.tierSeedGrant,
                                    tint: "#d8ecd8", // soft green
                                    borderColor: "#7eb87e",
                                },
                            ].map((tier) => (
                                <div
                                    key={tier.title}
                                    className="flex flex-col gap-1.5"
                                >
                                    {/* Emoji + title + grant — floating, no background */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">
                                            {tier.emoji}
                                        </span>
                                        <span className="font-headline text-xs font-black text-text-highlight">
                                            {tier.title}
                                        </span>
                                        <span className="ml-auto font-headline text-xs font-black text-text-body-secondary">
                                            {tier.grant}
                                        </span>
                                    </div>
                                    {/* Description — emoji-tinted callout */}
                                    <div
                                        className="border-2 border-r-4 border-b-4 px-3 py-2"
                                        style={{
                                            backgroundColor: tier.tint,
                                            borderColor: tier.borderColor,
                                        }}
                                    >
                                        <Body
                                            size="sm"
                                            spacing="none"
                                            className="text-text-body-secondary"
                                        >
                                            {tier.desc}
                                        </Body>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Section 8 — We Build in the Open */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.openTitle}
                    </Heading>

                    <div className="space-y-6">
                        {/* What's New */}
                        <div
                            className="bg-surface-page border-2 border-border-strong border-r-4 border-b-4 p-5"
                            style={{ boxShadow: "3px 3px 0px rgba(17, 5, 24, 0.12)" }}
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
                                            <p className="font-mono font-black text-xs" style={{ color: "rgb(var(--indicator-video))" }}>
                                                {item.date}
                                                <span className="ml-2">{item.emoji}</span>
                                                <span className="font-headline text-[10px] font-black text-text-body-main ml-1">
                                                    {item.title}
                                                </span>
                                            </p>
                                            <p className="font-body text-sm text-text-body-secondary leading-relaxed mt-0.5">
                                                {item.description}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>

                        {/* What's Next */}
                        <div
                            className="bg-surface-page border-2 border-border-strong border-r-4 border-b-4 p-5"
                            style={{ boxShadow: "3px 3px 0px rgba(17, 5, 24, 0.12)" }}
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
                                            <p className="font-headline text-[10px] font-black text-text-body-main">
                                                <span className="mr-2">{item.emoji}</span>
                                                {item.title}
                                            </p>
                                            <p className="font-body text-sm text-text-body-secondary leading-relaxed mt-0.5">
                                                {item.description}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="text-center mt-10 font-headline text-xs leading-loose" style={{ color: "rgb(var(--indicator-image))" }}>
                        <p>{pageCopy.comingFooterEmoji} <span className="font-black">The platform gives you runway.</span></p>
                        <p>We're shaping the rest <span className="font-black">together, in the open.</span></p>
                    </div>
                </div>

                <Divider />

                {/* Section 9 — CTA */}
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
                        >
                            {pageCopy.startBuildingButton}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                        <Button
                            as={Link}
                            to="/apps"
                            variant="secondary"
                            size="default"
                        >
                            {pageCopy.browseAppsLink}
                        </Button>
                        <Button
                            as={Link}
                            to="/community"
                            variant="secondary"
                            size="default"
                        >
                            {pageCopy.communityLink}
                        </Button>
                        <Button
                            as="a"
                            href={LINKS.enterDocs}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="secondary"
                            size="default"
                        >
                            {pageCopy.readTheDocsButton}
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
