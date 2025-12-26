import { getText } from "../../copy";
import { HELLO_PAGE } from "../../copy/content/hello";
import { LINKS } from "../../copy/content/socialLinks";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { NewsSection } from "../components/NewsSection";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { FeatureItem } from "../components/ui/feature-item";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { RoadmapItem } from "../components/ui/roadmap-item";
import { SubCard } from "../components/ui/sub-card";
import { TierCard } from "../components/ui/tier-card";
import { Body, Heading, Title } from "../components/ui/typography";
import { useCopy } from "../contexts/CopyContext";

function HelloPage() {
    const { processedCopy } = useCopy();
    // Use processed copy if available, fall back to static
    const pageCopy = (
        processedCopy?.heroTitle ? processedCopy : HELLO_PAGE
    ) as typeof HELLO_PAGE;

    return (
        <PageContainer>
            <PageCard>
                {/* Hero */}
                <Title>{getText(pageCopy.heroTitle)}</Title>
                <div className="mb-12">
                    <Body>{getText(pageCopy.heroIntro)}</Body>
                    <Body spacing="none">{getText(pageCopy.heroTagline)}</Body>
                </div>

                {/* CTAs */}
                <div className="flex flex-wrap gap-3 mb-12">
                    <Button
                        as="a"
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        size="lg"
                    >
                        {getText(pageCopy.startCreatingButton)}
                        <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                    </Button>
                    <Button
                        as="a"
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        size="lg"
                    >
                        {getText(pageCopy.getApiKeyButton)}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                    </Button>
                </div>

                <Divider />

                {/* What's New - Compact news feed */}
                <NewsSection
                    limit={5}
                    compact
                    title={getText(pageCopy.whatsNewTitle)}
                />

                <Divider />

                {/* What Pollinations Is */}
                <div className="mb-12">
                    <Heading variant="section">
                        {getText(pageCopy.whatIsTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.whatIsDescription)}
                    </Body>
                    <Body size="sm" spacing="none">
                        {getText(pageCopy.whatIsTagline)}
                    </Body>
                </div>

                <Divider />

                {/* Pollen */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {getText(pageCopy.pollenTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.pollenDescription)}
                    </Body>

                    {/* Two main paths: Buy and Earn */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {/* 1. Buy Pollen */}
                        <SubCard>
                            <Heading variant="lime" as="h3">
                                {getText(pageCopy.buyCardTitle)}
                            </Heading>
                            <Body size="sm" spacing="tight">
                                {getText(pageCopy.buyCardDescription)}
                            </Body>
                            <Body
                                size="xs"
                                spacing="comfortable"
                                className="text-text-highlight font-bold"
                            >
                                {getText(pageCopy.buyCardPromo)}
                            </Body>
                            <Button
                                as="a"
                                href="https://enter.pollinations.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                                size="sm"
                            >
                                {getText(pageCopy.viewPricingButton)}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
                        </SubCard>

                        {/* 2. Earn Pollen */}
                        <SubCard>
                            <div className="flex items-baseline gap-2 mb-2">
                                <Heading variant="rose" as="h3" spacing="tight">
                                    {getText(pageCopy.earnCardTitle)}
                                </Heading>
                                <Badge variant="highlight">
                                    {getText(pageCopy.newBadge)}
                                </Badge>
                            </div>
                            <Body size="sm" spacing="comfortable">
                                {getText(pageCopy.earnCardDescription)}
                            </Body>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    as="a"
                                    href="https://github.com/pollinations/pollinations"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="secondary"
                                    size="sm"
                                >
                                    Contribute on GitHub
                                    <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                                </Button>
                                <Button
                                    as="a"
                                    href={LINKS.githubSubmitApp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="secondary"
                                    size="sm"
                                >
                                    Submit Your App
                                    <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                                </Button>
                            </div>
                        </SubCard>
                    </div>

                    {/* Earn Pollen Details: Tiers + Quests */}
                    <div className="space-y-6">
                        {/* Sponsorship Tiers */}
                        <div>
                            <Heading
                                variant="simple"
                                as="h3"
                                spacing="comfortable"
                            >
                                {getText(pageCopy.tiersSubtitle)}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {getText(pageCopy.tiersDescription)}
                            </Body>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <TierCard
                                    tier="spore"
                                    emoji="🦠"
                                    title={getText(pageCopy.tierSporeTitle)}
                                    description={getText(
                                        pageCopy.tierSporeDescription,
                                    )}
                                />
                                <TierCard
                                    tier="seed"
                                    emoji="🌱"
                                    title={getText(pageCopy.tierSeedTitle)}
                                    description={getText(
                                        pageCopy.tierSeedDescription,
                                    )}
                                />
                                <TierCard
                                    tier="flower"
                                    emoji="🌸"
                                    title={getText(pageCopy.tierFlowerTitle)}
                                    description={getText(
                                        pageCopy.tierFlowerDescription,
                                    )}
                                />
                                <TierCard
                                    tier="nectar"
                                    emoji="🍯"
                                    title={getText(pageCopy.tierNectarTitle)}
                                    description={getText(
                                        pageCopy.tierNectarDescription,
                                    )}
                                />
                            </div>
                            {/* Tiers CTA */}
                            <div className="mt-4">
                                <Button
                                    as="a"
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="secondary"
                                    size="default"
                                >
                                    {getText(pageCopy.exploreTiersButton)}
                                    <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <Divider />

                {/* Why Developers Choose Pollinations */}
                <div className="mb-12">
                    <Heading variant="section">
                        {getText(pageCopy.whyChooseTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.whyChooseIntro)}
                    </Body>
                    <ul className="space-y-3">
                        <FeatureItem variant="brand" icon="✨">
                            {getText(pageCopy.whyChooseFeature1)}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="🔗">
                            {getText(pageCopy.whyChooseFeature2)}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="💰">
                            {getText(pageCopy.whyChooseFeature3)}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="👥">
                            {getText(pageCopy.whyChooseFeature4)}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="📖">
                            {getText(pageCopy.whyChooseFeature5)}
                        </FeatureItem>
                    </ul>
                </div>

                <Divider />

                {/* What You Can Build */}
                <div className="mb-12">
                    <Heading variant="section">
                        {getText(pageCopy.buildTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.buildIntro)}
                    </Body>
                    <ul className="space-y-3">
                        <FeatureItem variant="highlight" icon="🤖">
                            {getText(pageCopy.buildFeature1)}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎨">
                            {getText(pageCopy.buildFeature2)}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="⚡">
                            {getText(pageCopy.buildFeature3)}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎬">
                            {getText(pageCopy.buildFeature4)}
                        </FeatureItem>
                    </ul>
                    <div className="mt-6">
                        <Button
                            as="a"
                            href="/apps"
                            variant="secondary"
                            size="default"
                        >
                            {getText(pageCopy.seeAppsButton)}
                        </Button>
                    </div>
                </div>

                <Divider />

                {/* Built With Community */}
                <div className="mb-12">
                    <Heading variant="section">
                        {getText(pageCopy.communityTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.communityDescription)}
                    </Body>
                    <Button
                        as="a"
                        href="/community"
                        variant="secondary"
                        size="default"
                    >
                        {getText(pageCopy.joinCommunityButton)}
                    </Button>
                </div>

                <Divider />

                {/* Roadmap */}
                <div className="mb-12">
                    <Heading variant="section">
                        {getText(pageCopy.roadmapTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.roadmapIntro)}
                    </Body>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <RoadmapItem
                            icon="🔐"
                            title={getText(pageCopy.roadmapItem1Title)}
                            description={getText(
                                pageCopy.roadmapItem1Description,
                            )}
                        />
                        <RoadmapItem
                            icon="💳"
                            title={getText(pageCopy.roadmapItem2Title)}
                            description={getText(
                                pageCopy.roadmapItem2Description,
                            )}
                        />
                        <RoadmapItem
                            icon="🚀"
                            title={getText(pageCopy.roadmapItem3Title)}
                            description={getText(
                                pageCopy.roadmapItem3Description,
                            )}
                        />
                        <RoadmapItem
                            icon="🎬"
                            title={getText(pageCopy.roadmapItem4Title)}
                            description={getText(
                                pageCopy.roadmapItem4Description,
                            )}
                        />
                    </div>
                </div>

                <Divider />

                {/* Final CTA */}
                <div>
                    <Heading variant="section" spacing="comfortable">
                        {getText(pageCopy.ctaTitle)}
                    </Heading>
                    <Body spacing="comfortable">
                        {getText(pageCopy.ctaDescription)}
                    </Body>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                        >
                            {getText(pageCopy.getApiKeyButton)}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                        <Button
                            as="a"
                            href="/docs"
                            variant="secondary"
                            size="lg"
                        >
                            {getText(pageCopy.readTheDocsButton)}
                            <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
