import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { FlywheelRing } from "../components/FlywheelRing";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
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
                        href="https://enter.pollinations.ai"
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
                        href="https://discord.gg/pollinations-ai-885844321461485618"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                    >
                        {pageCopy.joinDiscordButton}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                    </Button>
                </div>
                <p className="font-body text-sm text-text-body-tertiary mb-4">
                    <span className="font-headline font-black text-text-body-secondary">
                        {pageCopy.heroStat1}
                    </span>{" "}
                    {pageCopy.heroStat1Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline font-black text-text-body-secondary">
                        {pageCopy.heroStat2}
                    </span>{" "}
                    {pageCopy.heroStat2Label}
                    <span className="mx-2 text-border-subtle">·</span>
                    <span className="font-headline font-black text-text-body-secondary">
                        {pageCopy.heroStat3}
                    </span>{" "}
                    {pageCopy.heroStat3Label}
                </p>

                <Divider />

                {/* Section — For builders */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.buildersTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.buildersBody}</Body>

                    {/* Row 1: Flywheel (left) + explanation (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-16">
                        <FlywheelRing pageCopy={pageCopy} />
                        <div>
                            <Body spacing="comfortable">
                                {pageCopy.flywheelBody}
                            </Body>
                            <p className="font-body text-sm text-text-body-tertiary italic">
                                <span className="not-italic mr-1">🧪</span>
                                {pageCopy.tiersBetaNote}
                            </p>
                        </div>
                    </div>

                    {/* Row 2: Explanation (left) + Tier cards (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-8">
                        {/* Tier explanation */}
                        <div>
                            <Body spacing="comfortable">
                                {pageCopy.tierBody}
                            </Body>
                            <div className="bg-surface-card border-l-2 border-border-highlight p-4 rounded-sub-card mb-4">
                                <span className="font-headline text-sm font-black text-text-highlight">
                                    {pageCopy.usersTitle}
                                </span>
                                <Body
                                    size="sm"
                                    spacing="tight"
                                    className="mt-2"
                                >
                                    {pageCopy.usersBody}
                                </Body>
                                <a
                                    href="https://enter.pollinations.ai/docs#payments"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-sm font-black text-text-highlight hover:underline mt-2 inline-block"
                                >
                                    {pageCopy.usersPaymentsLink}
                                </a>
                            </div>
                            <div className="flex flex-col gap-1">
                                <a
                                    href="https://github.com/pollinations/pollinations/blob/main/POINTS_AND_TIERS.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-sm font-black text-text-highlight hover:underline"
                                >
                                    {pageCopy.tierScoringLink}
                                </a>
                                <a
                                    href="https://enter.pollinations.ai/docs#tiers"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-sm font-black text-text-highlight hover:underline"
                                >
                                    {pageCopy.tierHowLink}
                                </a>
                            </div>
                        </div>

                        {/* Tier ladder: Nectar (top) → Flower → Seed (bottom) */}
                        <div className="flex flex-col items-center gap-2">
                            {[
                                {
                                    emoji: pageCopy.tierNectarEmoji,
                                    title: pageCopy.tierNectarTitle,
                                    desc: pageCopy.tierNectarDescription,
                                    grant: pageCopy.tierNectarGrant,
                                    points: pageCopy.tierNectarPoints,
                                    border: "border-border-highlight",
                                    glow: "bg-border-highlight",
                                },
                                {
                                    emoji: pageCopy.tierFlowerEmoji,
                                    title: pageCopy.tierFlowerTitle,
                                    desc: pageCopy.tierFlowerDescription,
                                    grant: pageCopy.tierFlowerGrant,
                                    points: pageCopy.tierFlowerPoints,
                                    border: "border-border-brand",
                                    glow: "bg-border-brand",
                                },
                                {
                                    emoji: pageCopy.tierSeedEmoji,
                                    title: pageCopy.tierSeedTitle,
                                    desc: pageCopy.tierSeedDescription,
                                    grant: pageCopy.tierSeedGrant,
                                    points: pageCopy.tierSeedPoints,
                                    border: "border-border-main",
                                    glow: "bg-border-main",
                                },
                            ].map((tier, i) => (
                                <div
                                    key={tier.title}
                                    className="flex flex-col items-center gap-2 w-full max-w-[280px]"
                                >
                                    <SubCard
                                        size="compact"
                                        className={`relative overflow-hidden w-full border-t-2 ${tier.border}`}
                                    >
                                        <div
                                            className={`absolute top-0 left-0 right-0 h-[3px] ${tier.glow} opacity-60`}
                                        />
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-xl">
                                                {tier.emoji}
                                            </span>
                                            <span className="font-headline text-base font-black text-text-highlight">
                                                {tier.title}
                                            </span>
                                        </div>
                                        <Body size="sm" spacing="tight">
                                            {tier.desc}
                                        </Body>
                                        <div className="flex items-baseline gap-3 mt-1">
                                            <span className="font-headline text-sm font-black text-text-highlight">
                                                {tier.grant}
                                            </span>
                                            <Badge
                                                variant="muted"
                                                className="text-xs px-2 py-0.5"
                                            >
                                                {tier.points}
                                            </Badge>
                                        </div>
                                    </SubCard>
                                    {i < 2 && (
                                        <span className="text-border-highlight/40 text-xl font-bold">
                                            ↑
                                        </span>
                                    )}
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

                    {/* What's New */}
                    <div className="mb-8">
                        <Badge variant="brand" className="mb-4">
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
                                        className="bg-input-background border-l-2 border-border-brand p-3 rounded-sub-card"
                                    >
                                        <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                            <span className="shrink-0 bg-button-primary-bg text-text-on-color px-1.5 py-0.5 font-mono font-black text-[10px] rounded-tag mr-2">
                                                {item.date}
                                            </span>
                                            <span className="mr-2">
                                                {item.emoji}
                                            </span>
                                            <span className="font-headline font-black text-text-body-main mr-1">
                                                {item.title}
                                            </span>
                                            {item.description}
                                        </p>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    {/* What's Next */}
                    <div className="mb-6">
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
                                    <div
                                        key={item.title}
                                        className="bg-input-background border-l-2 border-border-highlight p-3 rounded-sub-card"
                                    >
                                        <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                            <span className="mr-2">
                                                {item.emoji}
                                            </span>
                                            <span className="font-headline font-black text-text-body-main mr-1">
                                                {item.title}
                                            </span>
                                            {item.description}
                                        </p>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    <Body
                        size="sm"
                        spacing="none"
                        className="text-text-body-secondary"
                    >
                        {pageCopy.comingFooter}
                    </Body>
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
                            href="https://enter.pollinations.ai"
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
                            href="https://enter.pollinations.ai/docs#api"
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
