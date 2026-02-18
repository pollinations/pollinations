import { Link } from "react-router-dom";
import { HELLO_PAGE } from "../../copy/content/hello";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { NewsSection } from "../components/NewsSection";
import { Button } from "../components/ui/button";
import { Divider } from "../components/ui/divider";
import { FeatureItem } from "../components/ui/feature-item";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { RoadmapItem } from "../components/ui/roadmap-item";
import { SubCard } from "../components/ui/sub-card";
import { Body, Heading, Title } from "../components/ui/typography";

function HelloPage() {
    const { copy: pageCopy, isTranslating } = usePageCopy(HELLO_PAGE);

    return (
        <PageContainer>
            <PageCard isTranslating={isTranslating}>
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

                    <p className="inline-block text-xs text-text-body-secondary bg-surface-card border border-border-subtle rounded-full px-4 py-1.5 mb-8">
                        {pageCopy.tiersBetaNote}
                    </p>

                    {/* Tier Ladder */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
                        <div className="flex flex-col items-center text-center px-4 py-4 rounded-lg bg-surface-card border border-border-subtle min-w-[100px]">
                            <span className="text-3xl mb-2">🍄</span>
                            <p className="text-sm font-semibold text-text-body-main">
                                {pageCopy.tierSporeTitle}
                            </p>
                            <p className="text-xs text-text-body-secondary mt-1">
                                {pageCopy.tierSporePollen}/day
                            </p>
                        </div>
                        <span className="text-xl text-text-body-tertiary">
                            →
                        </span>
                        <div className="flex flex-col items-center text-center px-4 py-4 rounded-lg bg-surface-card border border-border-subtle min-w-[100px]">
                            <span className="text-3xl mb-2">🌱</span>
                            <p className="text-sm font-semibold text-text-body-main">
                                {pageCopy.tierSeedTitle}
                            </p>
                            <p className="text-xs text-text-body-secondary mt-1">
                                {pageCopy.tierSeedPollen}/day
                            </p>
                        </div>
                        <span className="text-xl text-text-body-tertiary">
                            →
                        </span>
                        <div className="flex flex-col items-center text-center px-4 py-4 rounded-lg bg-surface-card border border-border-subtle min-w-[100px]">
                            <span className="text-3xl mb-2">🌸</span>
                            <p className="text-sm font-semibold text-text-body-main">
                                {pageCopy.tierFlowerTitle}
                            </p>
                            <p className="text-xs text-text-body-secondary mt-1">
                                {pageCopy.tierFlowerPollen}/day
                            </p>
                        </div>
                        <span className="text-xl text-text-body-tertiary">
                            →
                        </span>
                        <div className="flex flex-col items-center text-center px-4 py-4 rounded-lg bg-surface-card border border-border-subtle min-w-[100px]">
                            <span className="text-3xl mb-2">🍯</span>
                            <p className="text-sm font-semibold text-text-body-main">
                                {pageCopy.tierNectarTitle}
                            </p>
                            <p className="text-xs text-text-body-secondary mt-1">
                                {pageCopy.tierNectarPollen}/day
                            </p>
                        </div>
                    </div>

                    {/* Flywheel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3">
                                {pageCopy.flywheelStep1Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.flywheelStep1Description}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3">
                                {pageCopy.flywheelStep2Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.flywheelStep2Description}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3">
                                {pageCopy.flywheelStep3Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.flywheelStep3Description}
                            </Body>
                        </SubCard>
                        <SubCard size="compact">
                            <Heading variant="lime" as="h3">
                                {pageCopy.flywheelStep4Title}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.flywheelStep4Description}
                            </Body>
                        </SubCard>
                    </div>

                    {/* How You Level Up */}
                    <Heading variant="simple" as="h3" spacing="comfortable">
                        {pageCopy.pointSystemTitle}
                    </Heading>
                    <Body size="sm" spacing="comfortable">
                        {pageCopy.pointSystemDescription}
                    </Body>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
                        <FeatureItem variant="highlight" icon="👤">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span>{pageCopy.pointActivity1}</span>
                                <a
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-highlight hover:underline"
                                >
                                    Enter
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                            </div>
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🔗">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span>{pageCopy.pointActivity2}</span>
                                <a
                                    href="https://github.com/pollinations/pollinations"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-highlight hover:underline"
                                >
                                    GitHub
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                            </div>
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🛠️">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span>{pageCopy.pointActivity3}</span>
                                <a
                                    href="https://github.com/pollinations/pollinations"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-highlight hover:underline"
                                >
                                    GitHub
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                            </div>
                        </FeatureItem>
                        <FeatureItem variant="highlight" icon="🎯">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span>{pageCopy.pointActivity4}</span>
                                <Link
                                    to="/apps"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-highlight hover:underline"
                                >
                                    Apps
                                </Link>
                            </div>
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="💰">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-text-body-main">
                                    {pageCopy.buyCardTitle}
                                </span>
                                <a
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-highlight hover:underline"
                                >
                                    {pageCopy.viewPricingButton}
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                            </div>
                            <p className="mt-1">
                                {pageCopy.buyCardDescription}
                            </p>
                            <p className="text-xs text-text-highlight font-bold mt-1">
                                {pageCopy.buyCardPromo}
                            </p>
                        </FeatureItem>
                        <FeatureItem variant="brand" icon="🐝">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-text-body-main">
                                    {pageCopy.sellCardTitle}
                                </span>
                                <a
                                    href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-brand hover:underline"
                                >
                                    {pageCopy.byopLearnMore}
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                            </div>
                            <p className="mt-1">
                                {pageCopy.sellCardDescription}
                            </p>
                        </FeatureItem>
                    </ul>
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
                            as={Link}
                            to="/apps"
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
                        as={Link}
                        to="/community"
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
                            icon="💸"
                            title={pageCopy.roadmapItem1Title}
                            description={pageCopy.roadmapItem1Description}
                        />
                        <RoadmapItem
                            icon="🏆"
                            title={pageCopy.roadmapItem2Title}
                            description={pageCopy.roadmapItem2Description}
                        />
                        <RoadmapItem
                            icon="🗺️"
                            title={pageCopy.roadmapItem3Title}
                            description={pageCopy.roadmapItem3Description}
                        />
                        <RoadmapItem
                            icon="🤖"
                            title={pageCopy.roadmapItem4Title}
                            description={pageCopy.roadmapItem4Description}
                        />
                        <RoadmapItem
                            icon="🧩"
                            title={pageCopy.roadmapItem5Title}
                            description={pageCopy.roadmapItem5Description}
                        />
                        <RoadmapItem
                            icon="💎"
                            title={pageCopy.roadmapItem6Title}
                            description={pageCopy.roadmapItem6Description}
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
