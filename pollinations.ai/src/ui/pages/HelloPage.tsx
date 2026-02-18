import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { NewsSection } from "../components/NewsSection";
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

                {/* Section 2 — What Your App Gets */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.appGetsTitle}
                    </Heading>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <SubCard>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.appGetsCard1Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.appGetsCard1Body}
                            </Body>
                        </SubCard>
                        <SubCard>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.appGetsCard2Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.appGetsCard2Body}
                            </Body>
                        </SubCard>
                        <SubCard>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.appGetsCard3Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.appGetsCard3Body}
                            </Body>
                        </SubCard>
                    </div>
                    <Body
                        size="sm"
                        spacing="comfortable"
                        className="text-text-body-secondary"
                    >
                        {pageCopy.appGetsFooter}
                    </Body>
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

                <Divider />

                {/* Section 3 — How It Works */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.howItWorksTitle}
                    </Heading>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <SubCard size="compact">
                            <p className="font-headline text-3xl font-black text-text-highlight mb-2">
                                1
                            </p>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.howItWorksStep1Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.howItWorksStep1Body}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <p className="font-headline text-3xl font-black text-text-highlight mb-2">
                                2
                            </p>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.howItWorksStep2Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.howItWorksStep2Body}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <p className="font-headline text-3xl font-black text-text-highlight mb-2">
                                3
                            </p>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.howItWorksStep3Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.howItWorksStep3Body}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <p className="font-headline text-3xl font-black text-text-highlight mb-2">
                                4
                            </p>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.howItWorksStep4Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.howItWorksStep4Body}
                            </Body>
                        </SubCard>
                    </div>
                    <Body
                        size="sm"
                        spacing="none"
                        className="text-text-body-secondary"
                    >
                        {pageCopy.howItWorksFooter}
                    </Body>
                </div>

                <Divider />

                {/* Section 4 — Pollen */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.pollenTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.pollenBody}</Body>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <SubCard>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.buyCardTitle}
                            </Heading>
                            <Body size="sm" spacing="tight">
                                {pageCopy.buyCardBody}
                            </Body>
                            <p className="font-headline text-xs font-black text-text-highlight">
                                {pageCopy.buyCardPromo}
                            </p>
                        </SubCard>
                        <SubCard>
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.earnCardTitle}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.earnCardBody}
                            </Body>
                        </SubCard>
                    </div>
                    <Body
                        size="xs"
                        spacing="none"
                        className="text-text-body-tertiary"
                    >
                        {pageCopy.pollenFinePrint}
                    </Body>
                </div>

                <Divider />

                {/* Section 5 — Tiers */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.tiersTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.tiersIntro}</Body>

                    <div className="flex items-stretch gap-2 md:gap-3 mb-8 overflow-x-auto">
                        {[
                            {
                                emoji: "🍄",
                                title: pageCopy.tierSporeTitle,
                                desc: pageCopy.tierSporeDescription,
                                border: "border-border-subtle",
                            },
                            {
                                emoji: "🌱",
                                title: pageCopy.tierSeedTitle,
                                desc: pageCopy.tierSeedDescription,
                                border: "border-border-main",
                            },
                            {
                                emoji: "🌸",
                                title: pageCopy.tierFlowerTitle,
                                desc: pageCopy.tierFlowerDescription,
                                border: "border-border-brand",
                            },
                            {
                                emoji: "🍯",
                                title: pageCopy.tierNectarTitle,
                                desc: pageCopy.tierNectarDescription,
                                border: "border-border-highlight",
                            },
                        ].map((tier, i, arr) => (
                            <div key={tier.title} className="contents">
                                <div
                                    className={`flex-1 min-w-0 bg-surface-card border-t-2 ${tier.border} p-3 rounded-sub-card text-center`}
                                >
                                    <p className="text-2xl mb-1">
                                        {tier.emoji}
                                    </p>
                                    <p className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main mb-1">
                                        {tier.title}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary leading-snug">
                                        {tier.desc}
                                    </p>
                                </div>
                                {i < arr.length - 1 && (
                                    <span className="shrink-0 self-center text-text-body-tertiary font-mono text-lg">
                                        →
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Two paths */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3" spacing="tight">
                                {pageCopy.tiersPath1Label}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.tiersPath1Body}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <Heading variant="rose" as="h3" spacing="tight">
                                {pageCopy.tiersPath2Label}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.tiersPath2Body}
                            </Body>
                        </SubCard>
                    </div>

                    <Body
                        size="xs"
                        spacing="none"
                        className="text-text-body-tertiary"
                    >
                        {pageCopy.tiersBetaNote}
                    </Body>
                </div>

                <Divider />

                {/* Section 6 — BYOP Spotlight */}
                <div className="mb-12">
                    <SubCard className="border-l-4 border-border-highlight p-6 md:p-8">
                        <Heading variant="simple" as="h2" spacing="comfortable">
                            {pageCopy.byopTitle}
                        </Heading>
                        <Body spacing="comfortable">{pageCopy.byopBody}</Body>
                        <Button
                            as="a"
                            href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="default"
                        >
                            {pageCopy.byopDocsButton}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                    </SubCard>
                </div>

                <Divider />

                {/* Section 7 — What People Are Building */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.buildingTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.buildingBody}</Body>
                    <Button
                        as={Link}
                        to="/apps"
                        variant="secondary"
                        size="default"
                    >
                        {pageCopy.browseAppsButton}
                    </Button>
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
                        <NewsSection limit={5} compact />
                    </div>

                    {/* Shipping Soon */}
                    <div className="mb-8">
                        <Badge variant="highlight" className="mb-4">
                            {pageCopy.comingSoonLabel}
                        </Badge>
                        <div className="space-y-2">
                            <div className="bg-input-background border-l-2 border-border-highlight p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">🔐</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingSoonItem1Title}
                                    </span>
                                    {pageCopy.comingSoonItem1Description}
                                </p>
                            </div>
                            <div className="bg-input-background border-l-2 border-border-highlight p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">🔑</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingSoonItem2Title}
                                    </span>
                                    {pageCopy.comingSoonItem2Description}
                                </p>
                            </div>
                            <div className="bg-input-background border-l-2 border-border-highlight p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">🏠</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingSoonItem3Title}
                                    </span>
                                    {pageCopy.comingSoonItem3Description}
                                </p>
                            </div>
                            <div className="bg-input-background border-l-2 border-border-highlight p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">🧠</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingSoonItem4Title}
                                    </span>
                                    {pageCopy.comingSoonItem4Description}
                                </p>
                            </div>
                            <div className="bg-input-background border-l-2 border-border-highlight p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">🧩</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingSoonItem5Title}
                                    </span>
                                    {pageCopy.comingSoonItem5Description}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Later This Year */}
                    <div className="mb-6">
                        <Badge variant="muted" className="mb-4">
                            {pageCopy.comingLaterLabel}
                        </Badge>
                        <div className="space-y-2">
                            <div className="bg-input-background border-l-2 border-border-subtle p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">💸</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingLaterItem1Title}
                                    </span>
                                    {pageCopy.comingLaterItem1Description}
                                </p>
                            </div>
                            <div className="bg-input-background border-l-2 border-border-subtle p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">📢</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingLaterItem2Title}
                                    </span>
                                    {pageCopy.comingLaterItem2Description}
                                </p>
                            </div>
                            <div className="bg-input-background border-l-2 border-border-subtle p-3 rounded-sub-card">
                                <p className="font-body text-sm text-text-body-secondary leading-relaxed">
                                    <span className="mr-2">🗺️</span>
                                    <span className="font-headline font-black text-text-body-main mr-1">
                                        {pageCopy.comingLaterItem3Title}
                                    </span>
                                    {pageCopy.comingLaterItem3Description}
                                </p>
                            </div>
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
