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
                {/* Title */}
                <Title>{pageCopy.heroTitle.text}</Title>
                {/* Intro Section */}
                <div className="mb-12">
                    <Body>{pageCopy.heroIntro.text}</Body>
                    <Body spacing="none">{pageCopy.heroTagline.text}</Body>
                </div>

                {/* Divider */}
                <Divider />

                {/* Pollen Section */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.pollenTitle.text}
                    </Heading>
                    <Body spacing="none">
                        {pageCopy.pollenDescription.text}
                    </Body>
                </div>

                {/* Divider */}
                <Divider />

                {/* Get Pollen Section */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        {pageCopy.getPollenTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.getPollenIntro.text}
                    </Body>

                    {/* Two Column Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Buy Pollen Card */}
                        <SubCard>
                            <Heading variant="lime" as="h3">
                                {pageCopy.buyCardTitle.text}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.buyCardDescription.text}
                            </Body>
                        </SubCard>

                        {/* Sponsorship Card */}
                        <SubCard>
                            <Heading variant="rose" as="h3">
                                {pageCopy.sponsorshipCardTitle.text}
                            </Heading>
                            <Body size="sm" spacing="none">
                                {pageCopy.sponsorshipCardDescription.text}
                            </Body>
                        </SubCard>
                    </div>
                </div>

                {/* Divider */}
                <Divider />

                {/* Sponsorship Tiers */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.sponsorshipTiersTitle.text}
                    </Heading>
                    <Body spacing="none">
                        {pageCopy.sponsorshipTiersDescription.text}
                    </Body>
                </div>

                {/* Divider */}
                <Divider />

                {/* Creative Launchpad */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.creativeLaunchpadTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.creativeLaunchpadIntro.text}
                    </Body>
                    <ul className="space-y-3">
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.creativeLaunchpadFeature1.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.creativeLaunchpadFeature2.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.creativeLaunchpadFeature3.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            {pageCopy.creativeLaunchpadFeature4.text}
                        </li>
                    </ul>
                </div>

                {/* Divider */}
                <Divider />

                {/* The Difference */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.differenceTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.differenceIntro.text}
                    </Body>
                    <ul className="space-y-3">
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.differenceFeature1.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.differenceFeature2.text}
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            {pageCopy.differenceFeature3.text}
                        </li>
                    </ul>
                </div>

                {/* Divider */}
                <Divider />

                {/* Roadmap */}
                <div className="mb-12">
                    <Heading variant="section">
                        {pageCopy.roadmapTitle.text}
                    </Heading>
                    <Body spacing="comfortable">
                        {pageCopy.roadmapIntro.text}
                    </Body>
                    <div className="space-y-4">
                        <SubCard size="compact">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider md:w-32">
                                    {pageCopy.roadmapComingSoonLabel.text}
                                </div>
                                <div className="flex-1">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-2">
                                        {pageCopy.roadmapComingSoonTitle.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {
                                            pageCopy
                                                .roadmapComingSoonDescription
                                                .text
                                        }
                                    </p>
                                </div>
                            </div>
                        </SubCard>
                        <SubCard size="compact">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider md:w-32">
                                    {pageCopy.roadmapQ1Label.text}
                                </div>
                                <div className="flex-1">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-2">
                                        {pageCopy.roadmapQ1Title.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {pageCopy.roadmapQ1Description.text}
                                    </p>
                                </div>
                            </div>
                        </SubCard>
                        <SubCard size="compact">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider md:w-32">
                                    {pageCopy.roadmapOngoingLabel.text}
                                </div>
                                <div className="flex-1">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-2">
                                        {pageCopy.roadmapOngoingTitle.text}
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        {
                                            pageCopy.roadmapOngoingDescription
                                                .text
                                        }
                                    </p>
                                </div>
                            </div>
                        </SubCard>
                    </div>
                </div>

                {/* Divider */}
                <Divider />

                {/* CTA */}
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
                            href="mailto:hello@pollinations.ai?subject=Sponsorship Inquiry"
                            variant="secondary"
                            size="lg"
                        >
                            {pageCopy.learnSponsorshipButton.text}
                            <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
