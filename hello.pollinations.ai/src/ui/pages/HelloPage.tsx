import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { useTheme } from "../contexts/ThemeContext";

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
                    <Heading variant="section">
                        {pageCopy.pollenTitle.text}
                    </Heading>
                    <Body spacing="none">
                        {pageCopy.pollenDescription.text}
                    </Body>
                </div>

                <Divider />

                {/* How to Get Pollen */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.getPollenTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.getPollenIntro.text}
                    </Body>

                    {/* Two main paths: Buy and Earn */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {/* 1. Buy Pollen */}
                        <SubCard>
                            <Heading variant="lime" as="h3">
                                {pageCopy.buyCardTitle.text}
                            </Heading>
                            <Body size="sm" spacing="comfortable">
                                {pageCopy.buyCardDescription.text}
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
                            <Heading variant="rose" as="h3">
                                {pageCopy.earnCardTitle.text}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.earnCardDescription.text}
                            </Body>
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
                            <div className="space-y-3">
                                <SubCard size="compact">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                        {pageCopy.tierSporeTitle.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {pageCopy.tierSporeDescription.text}
                                    </p>
                                </SubCard>
                                <SubCard size="compact">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                        {pageCopy.tierSeedTitle.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {pageCopy.tierSeedDescription.text}
                                    </p>
                                </SubCard>
                                <SubCard size="compact">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                        {pageCopy.tierFlowerTitle.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {pageCopy.tierFlowerDescription.text}
                                    </p>
                                </SubCard>
                                <SubCard size="compact">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                        {pageCopy.tierNectarTitle.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {pageCopy.tierNectarDescription.text}
                                    </p>
                                </SubCard>
                            </div>
                        </div>

                        {/* Quests & One-Off Rewards */}
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <Heading
                                    variant="simple"
                                    as="h3"
                                    spacing="tight"
                                >
                                    {pageCopy.questsSubtitle.text}
                                </Heading>
                                <span className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider">
                                    {pageCopy.questsStatus.text}
                                </span>
                            </div>
                            <Body size="sm">
                                {pageCopy.questsDescription.text}
                            </Body>
                        </div>

                        {/* CTA */}
                        <div>
                            <Button
                                as="a"
                                href="mailto:hello@pollinations.ai?subject=Sponsorship Inquiry"
                                variant="secondary"
                                size="default"
                            >
                                {pageCopy.exploreTiersButton.text}
                                <ExternalLinkIcon className="w-3 h-3 text-text-body-main" />
                            </Button>
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
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.whyChooseFeature1.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.whyChooseFeature2.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.whyChooseFeature3.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.whyChooseFeature4.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.whyChooseFeature5.text}
                        </li>
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
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.buildFeature1.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.buildFeature2.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.buildFeature3.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.buildFeature4.text}
                        </li>
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
                    <div className="space-y-3">
                        <div className="pl-4 border-l-2 border-border-highlight">
                            <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                {pageCopy.roadmapItem1Title.text}
                            </p>
                            <p className="font-body text-xs text-text-body-secondary">
                                {pageCopy.roadmapItem1Description.text}
                            </p>
                        </div>
                        <div className="pl-4 border-l-2 border-border-highlight">
                            <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                {pageCopy.roadmapItem2Title.text}
                            </p>
                            <p className="font-body text-xs text-text-body-secondary">
                                {pageCopy.roadmapItem2Description.text}
                            </p>
                        </div>
                        <div className="pl-4 border-l-2 border-border-highlight">
                            <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                {pageCopy.roadmapItem3Title.text}
                            </p>
                            <p className="font-body text-xs text-text-body-secondary">
                                {pageCopy.roadmapItem3Description.text}
                            </p>
                        </div>
                        <div className="pl-4 border-l-2 border-border-highlight">
                            <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                {pageCopy.roadmapItem4Title.text}
                            </p>
                            <p className="font-body text-xs text-text-body-secondary">
                                {pageCopy.roadmapItem4Description.text}
                            </p>
                        </div>
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
