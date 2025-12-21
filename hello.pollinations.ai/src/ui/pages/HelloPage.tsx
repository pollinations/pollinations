import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { Badge } from "../components/ui/badge";
import { TierCard } from "../components/ui/tier-card";
import { FeatureItem } from "../components/ui/feature-item";
import { RoadmapItem } from "../components/ui/roadmap-item";
import { useTheme } from "../contexts/ThemeContext";
import { NewsSection } from "../components/NewsSection";

function HelloPage() {
    const { presetCopy } = useTheme();
    const pageCopy = presetCopy.HELLO_PAGE;

    return (
        <PageContainer>
            <PageCard>
                {/* Hero */}
                <Title>{pageCopy.heroTitle.text}</Title>
                <div className="mb-12">
                    <Body>{pageCopy.heroIntro.text}</Body>
                    <Body spacing="none">{pageCopy.heroTagline.text}</Body>
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
                        {pageCopy.startCreatingButton.text}
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
                        {pageCopy.getApiKeyButton.text}
                        <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                    </Button>
                </div>

                <Divider />

                {/* What's New - Compact news feed */}
                <NewsSection limit={5} compact title="What's New" />

                <Divider />

                {/* What Pollinations Is */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.whatIsTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.whatIsDescription.text}
                    </Body>
                    <Body size="sm" spacing="none">
                        {pageCopy.whatIsTagline.text}
                    </Body>
                </div>

                <Divider />

                {/* Pollen */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.pollenTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.pollenDescription.text}
                    </Body>

                    {/* Two main paths: Buy and Earn */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {/* 1. Buy Pollen */}
                        <SubCard>
                            <Heading variant="lime" as="h3">
                                {pageCopy.buyCardTitle.text}
                            </Heading>
                            <Body size="sm" spacing="tight">
                                {pageCopy.buyCardDescription.text}
                            </Body>
                            <Body
                                size="xs"
                                spacing="comfortable"
                                className="text-text-highlight font-bold"
                            >
                                🎁 Buy 1, get 1 free during beta!
                            </Body>
                            <Button
                                as="a"
                                href="https://enter.pollinations.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                                size="sm"
                            >
                                {pageCopy.viewPricingButton.text}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
                        </SubCard>

                        {/* 2. Earn Pollen */}
                        <SubCard>
                            <div className="flex items-baseline gap-2 mb-2">
                                <Heading variant="rose" as="h3" spacing="tight">
                                    {pageCopy.earnCardTitle.text}
                                </Heading>
                                <Badge variant="highlight">New</Badge>
                            </div>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.earnCardDescription.text}
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
                                    href="https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml"
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
                                {pageCopy.tiersSubtitle.text}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.tiersDescription.text}
                            </Body>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <TierCard
                                    tier="spore"
                                    emoji="🦠"
                                    title={pageCopy.tierSporeTitle.text}
                                    description={
                                        pageCopy.tierSporeDescription.text
                                    }
                                />
                                <TierCard
                                    tier="seed"
                                    emoji="🌱"
                                    title={pageCopy.tierSeedTitle.text}
                                    description={
                                        pageCopy.tierSeedDescription.text
                                    }
                                />
                                <TierCard
                                    tier="flower"
                                    emoji="🌸"
                                    title={pageCopy.tierFlowerTitle.text}
                                    description={
                                        pageCopy.tierFlowerDescription.text
                                    }
                                />
                                <TierCard
                                    tier="nectar"
                                    emoji="🍯"
                                    title={pageCopy.tierNectarTitle.text}
                                    description={
                                        pageCopy.tierNectarDescription.text
                                    }
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
                                    {pageCopy.exploreTiersButton.text}
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
                        {pageCopy.whyChooseTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.whyChooseIntro.text}
                    </Body>
                    <ul className="space-y-3">
                        <FeatureItem variant="brand" icon="✨">
                            {pageCopy.whyChooseFeature1.text}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="🔗">
                            {pageCopy.whyChooseFeature2.text}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="💰">
                            {pageCopy.whyChooseFeature3.text}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="👥">
                            {pageCopy.whyChooseFeature4.text}
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="📖">
                            {pageCopy.whyChooseFeature5.text}
                        </FeatureItem>
                    </ul>
                </div>

                <Divider />

                {/* What You Can Build */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.buildTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.buildIntro.text}
                    </Body>
                    <ul className="space-y-3">
                        <FeatureItem variant="highlight" icon="🤖">
                            {pageCopy.buildFeature1.text}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎨">
                            {pageCopy.buildFeature2.text}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="⚡">
                            {pageCopy.buildFeature3.text}
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎬">
                            {pageCopy.buildFeature4.text}
                        </FeatureItem>
                    </ul>
                    <div className="mt-6">
                        <Button
                            as="a"
                            href="/apps"
                            variant="secondary"
                            size="default"
                        >
                            {pageCopy.seeAppsButton.text}
                        </Button>
                    </div>
                </div>

                <Divider />

                {/* Built With Community */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.communityTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.communityDescription.text}
                    </Body>
                    <Button
                        as="a"
                        href="/community"
                        variant="secondary"
                        size="default"
                    >
                        {pageCopy.joinCommunityButton.text}
                    </Button>
                </div>

                <Divider />

                {/* Roadmap */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.roadmapTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.roadmapIntro.text}
                    </Body>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <RoadmapItem
                            icon="🔐"
                            title={pageCopy.roadmapItem1Title.text}
                            description={pageCopy.roadmapItem1Description.text}
                        />
                        <RoadmapItem
                            icon="💳"
                            title={pageCopy.roadmapItem2Title.text}
                            description={pageCopy.roadmapItem2Description.text}
                        />
                        <RoadmapItem
                            icon="🚀"
                            title={pageCopy.roadmapItem3Title.text}
                            description={pageCopy.roadmapItem3Description.text}
                        />
                        <RoadmapItem
                            icon="🎬"
                            title={pageCopy.roadmapItem4Title.text}
                            description={pageCopy.roadmapItem4Description.text}
                        />
                    </div>
                </div>

                <Divider />

                {/* Final CTA */}
                <div>
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.ctaTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.ctaDescription.text}
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
                            {pageCopy.getApiKeyButton.text}
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                        <Button
                            as="a"
                            href="/docs"
                            variant="secondary"
                            size="lg"
                        >
                            Read the Docs
                            <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
