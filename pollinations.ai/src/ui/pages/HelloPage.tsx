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
                <Title>{pageCopy.heroTitle}</Title>
                <div className="mb-12">
                    <Body>{pageCopy.heroIntro}</Body>
                    <Body spacing="none">{pageCopy.heroTagline}</Body>
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
                        {pageCopy.startCreatingButton}
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
                        {pageCopy.getApiKeyButton}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                    </Button>
                </div>

                <Divider />

                {/* What's New - Compact news feed */}
                <NewsSection limit={5} compact title={pageCopy.whatsNewTitle} />

                <Divider />

                {/* What Pollinations Is */}
                <div className="mb-12">
                    <Heading variant="section">{pageCopy.whatIsTitle}</Heading>
                    <Body spacing="comfortable">
                        {pageCopy.whatIsDescription}
                    </Body>
                    <Body size="sm" spacing="none">
                        {pageCopy.whatIsTagline}
                    </Body>
                </div>

                <Divider />

                {/* Pollen */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.pollenTitle}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.pollenDescription}
                    </Body>

                    {/* Two main paths: Buy and Earn */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {/* 1. Buy Pollen */}
                        <SubCard>
                            <Heading variant="lime" as="h3">
                                {pageCopy.buyCardTitle}
                            </Heading>
                            <Body size="sm" spacing="tight">
                                {pageCopy.buyCardDescription}
                            </Body>
                            <Body
                                size="xs"
                                spacing="comfortable"
                                className="text-text-highlight font-bold"
                            >
                                {pageCopy.buyCardPromo}
                            </Body>
                            <Button
                                as="a"
                                href="https://enter.pollinations.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                                size="sm"
                            >
                                {pageCopy.viewPricingButton}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
                        </SubCard>

                        {/* 2. Earn Pollen */}
                        <SubCard>
                            <div className="flex items-baseline gap-2 mb-2">
                                <Heading variant="rose" as="h3" spacing="tight">
                                    {pageCopy.earnCardTitle}
                                </Heading>
                                <Badge variant="highlight">
                                    {pageCopy.newBadge}
                                </Badge>
                            </div>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.earnCardDescription}
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
                                {pageCopy.tiersSubtitle}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.tiersDescription}
                            </Body>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <TierCard
                                    tier="spore"
                                    emoji="🦠"
                                    title={pageCopy.tierSporeTitle}
                                    description={pageCopy.tierSporeDescription}
                                />
                                <TierCard
                                    tier="seed"
                                    emoji="🌱"
                                    title={pageCopy.tierSeedTitle}
                                    description={pageCopy.tierSeedDescription}
                                />
                                <TierCard
                                    tier="flower"
                                    emoji="🌸"
                                    title={pageCopy.tierFlowerTitle}
                                    description={pageCopy.tierFlowerDescription}
                                />
                                <TierCard
                                    tier="nectar"
                                    emoji="🍯"
                                    title={pageCopy.tierNectarTitle}
                                    description={pageCopy.tierNectarDescription}
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
                                    {pageCopy.exploreTiersButton}
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
                        {pageCopy.whyChooseTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.whyChooseIntro}</Body>
                    <ul className="space-y-3">
                        <FeatureItem variant="brand" icon="✨">
                            {pageCopy.whyChooseFeature1}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="🔗">
                            {pageCopy.whyChooseFeature2}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="💰">
                            {pageCopy.whyChooseFeature3}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="👥">
                            {pageCopy.whyChooseFeature4}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="📖">
                            {pageCopy.whyChooseFeature5}
                        </FeatureItem>
                    </ul>
                </div>

                <Divider />

                {/* What You Can Build */}
                <div className="mb-12">
                    <Heading variant="section">{pageCopy.buildTitle}</Heading>
                    <Body spacing="comfortable">{pageCopy.buildIntro}</Body>
                    <ul className="space-y-3">
                        <FeatureItem variant="highlight" icon="🤖">
                            {pageCopy.buildFeature1}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎨">
                            {pageCopy.buildFeature2}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="⚡">
                            {pageCopy.buildFeature3}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎬">
                            {pageCopy.buildFeature4}
                        </FeatureItem>
                    </ul>
                    <div className="mt-6">
                        <Button
                            as="a"
                            href="/apps"
                            variant="secondary"
                            size="default"
                        >
                            {pageCopy.seeAppsButton}
                        </Button>
                    </div>
                </div>

                <Divider />

                {/* Built With Community */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.communityTitle}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.communityDescription}
                    </Body>
                    <Button
                        as="a"
                        href="/community"
                        variant="secondary"
                        size="default"
                    >
                        {pageCopy.joinCommunityButton}
                    </Button>
                </div>

                <Divider />

                {/* Roadmap */}
                <div className="mb-12">
                    <Heading variant="section">{pageCopy.roadmapTitle}</Heading>
                    <Body spacing="comfortable">{pageCopy.roadmapIntro}</Body>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <RoadmapItem
                            icon="🔐"
                            title={pageCopy.roadmapItem1Title}
                            description={pageCopy.roadmapItem1Description}
                        />
                        <RoadmapItem
                            icon="💳"
                            title={pageCopy.roadmapItem2Title}
                            description={pageCopy.roadmapItem2Description}
                        />
                        <RoadmapItem
                            icon="🚀"
                            title={pageCopy.roadmapItem3Title}
                            description={pageCopy.roadmapItem3Description}
                        />
                        <RoadmapItem
                            icon="🎬"
                            title={pageCopy.roadmapItem4Title}
                            description={pageCopy.roadmapItem4Description}
                        />
                    </div>
                </div>

                <Divider />

                {/* Final CTA */}
                <div>
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.ctaTitle}
                    </Heading>
                    <Body spacing="comfortable">{pageCopy.ctaDescription}</Body>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            as="a"
                            href="https://enter.pollinations.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="primary"
                            size="lg"
                        >
                            {pageCopy.getApiKeyButton}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                        <Button
                            as="a"
                            href="/docs"
                            variant="secondary"
                            size="lg"
                        >
                            {pageCopy.readTheDocsButton}
                            <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
