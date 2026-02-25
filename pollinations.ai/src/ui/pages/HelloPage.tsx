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
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-10">
                        <FlywheelRing pageCopy={pageCopy} />
                        <div>
                            <Body spacing="comfortable">
                                {pageCopy.flywheelBody}
                            </Body>
                            <p className="font-body text-xs text-text-body-tertiary italic mt-2">
                                {pageCopy.tiersBetaNote}
                            </p>
                        </div>
                    </div>

                    {/* Row 2: Explanation (left) + Tier cards (right) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                        {/* Tier explanation */}
                        <div>
                            <Body spacing="comfortable">
                                {pageCopy.tierBody}
                            </Body>
                            <div className="bg-surface-card/60 border border-border-subtle p-4 rounded-sub-card mb-4">
                                <span className="font-headline text-sm font-black text-text-body-secondary">
                                    {pageCopy.usersTitle}
                                </span>
                                <Body
                                    size="sm"
                                    spacing="tight"
                                    className="mt-2 text-text-body-tertiary"
                                >
                                    {pageCopy.usersBody}
                                </Body>
                                <a
                                    href="https://enter.pollinations.ai/docs#payments"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-headline text-sm font-black text-text-body-secondary hover:underline mt-2 inline-block"
                                >
                                    {pageCopy.usersPaymentsLink}
                                </a>
                            </div>
                        </div>

                        {/* Tier ladder: Nectar (top) → Flower → Seed (bottom) */}
                        <div className="relative flex flex-col gap-4 pl-6 max-w-[300px] lg:mx-auto">
                            {/* Gradient progression line */}
                            <div
                                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                                style={{
                                    background: `linear-gradient(to bottom, rgb(var(--border-highlight)), rgb(var(--border-brand)), rgb(var(--border-main)))`,
                                }}
                            />
                            {[
                                {
                                    emoji: pageCopy.tierNectarEmoji,
                                    title: pageCopy.tierNectarTitle,
                                    desc: pageCopy.tierNectarDescription,
                                    grant: pageCopy.tierNectarGrant,
                                    points: pageCopy.tierNectarPoints,
                                    descBg: "bg-border-highlight/10",
                                    descBorder: "border-border-highlight/30",
                                },
                                {
                                    emoji: pageCopy.tierFlowerEmoji,
                                    title: pageCopy.tierFlowerTitle,
                                    desc: pageCopy.tierFlowerDescription,
                                    grant: pageCopy.tierFlowerGrant,
                                    points: pageCopy.tierFlowerPoints,
                                    descBg: "bg-border-brand/10",
                                    descBorder: "border-border-brand/30",
                                },
                                {
                                    emoji: pageCopy.tierSeedEmoji,
                                    title: pageCopy.tierSeedTitle,
                                    desc: pageCopy.tierSeedDescription,
                                    grant: pageCopy.tierSeedGrant,
                                    points: pageCopy.tierSeedPoints,
                                    descBg: "bg-border-main/10",
                                    descBorder: "border-border-main/30",
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
                                        <span className="font-headline text-base font-black text-text-highlight">
                                            {tier.title}
                                        </span>
                                        <span className="ml-auto font-headline text-sm font-black text-text-highlight">
                                            {tier.grant}
                                        </span>
                                    </div>
                                    {/* Description — highlighted callout */}
                                    <div
                                        className={`${tier.descBg} border ${tier.descBorder} rounded-sub-card px-3 py-2`}
                                    >
                                        <Body
                                            size="sm"
                                            spacing="none"
                                            className="text-text-body-secondary"
                                        >
                                            {tier.desc}
                                        </Body>
                                        <div className="flex justify-end mt-1">
                                            <Badge
                                                variant="muted"
                                                className="text-xs px-2 py-0.5"
                                            >
                                                {tier.points}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <a
                        href="https://enter.pollinations.ai#what-are-tiers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-sm font-black text-text-highlight hover:underline mt-4 inline-block"
                    >
                        {pageCopy.tierHowLink}
                    </a>
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
                                        className="py-1"
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
                                    <div key={item.title} className="py-1">
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

                    <div className="flex justify-center mt-16">
                        <span className="inline-flex items-start gap-2.5 bg-border-highlight/10 border border-border-highlight/20 rounded-sub-card px-4 py-3">
                            <span className="text-lg leading-none mt-0.5">
                                {pageCopy.comingFooterEmoji}
                            </span>
                            <Body
                                size="sm"
                                spacing="none"
                                className="text-text-highlight"
                            >
                                {pageCopy.comingFooter}
                            </Body>
                        </span>
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
