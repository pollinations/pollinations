import { Button } from "../components/ui/button";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Title, Heading, Body } from "../components/ui/typography";
import { Divider } from "../components/ui/divider";
import { PageCard } from "../components/ui/page-card";
import { PageContainer } from "../components/ui/page-container";
import { SubCard } from "../components/ui/sub-card";
import { TextGenerator } from "../components/TextGenerator";
import { HELLO_PAGE } from "../../content";

function HelloPage() {
    return (
        <PageContainer>
            <PageCard>
                {/* Title */}
                <Title>
                    <TextGenerator content={HELLO_PAGE.heroTitle} />
                </Title>
                {/* Intro Section */}
                <div className="mb-12">
                    <Body>
                        <TextGenerator content={HELLO_PAGE.heroIntro} />
                    </Body>
                    <Body spacing="none">
                        <TextGenerator content={HELLO_PAGE.heroTagline} />
                    </Body>
                </div>

                {/* Divider */}
                <Divider />

                {/* Pollen Section */}
                <div className="mb-12">
                    <Heading variant="section">
                        <TextGenerator content={HELLO_PAGE.pollenTitle} />
                    </Heading>
                    <Body spacing="none">
                        <TextGenerator content={HELLO_PAGE.pollenDescription} />
                    </Body>
                </div>

                {/* Divider */}
                <Divider />

                {/* Get Pollen Section */}
                <div className="mb-12">
                    <Heading variant="section" spacing="comfortable">
                        <TextGenerator content={HELLO_PAGE.getPollenTitle} />
                    </Heading>
                    <Body spacing="comfortable">
                        <TextGenerator content={HELLO_PAGE.getPollenIntro} />
                    </Body>

                    {/* Two Column Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Buy Pollen Card */}
                        <SubCard>
                            <Heading variant="lime" as="h3">
                                <TextGenerator
                                    content={HELLO_PAGE.buyCardTitle}
                                />
                            </Heading>
                            <Body size="sm" spacing="none">
                                <TextGenerator
                                    content={HELLO_PAGE.buyCardDescription}
                                />
                            </Body>
                        </SubCard>

                        {/* Sponsorship Card */}
                        <SubCard>
                            <Heading variant="rose" as="h3">
                                <TextGenerator
                                    content={HELLO_PAGE.sponsorshipCardTitle}
                                />
                            </Heading>
                            <Body size="sm" spacing="none">
                                <TextGenerator
                                    content={
                                        HELLO_PAGE.sponsorshipCardDescription
                                    }
                                />
                            </Body>
                        </SubCard>
                    </div>
                </div>

                {/* Divider */}
                <Divider />

                {/* Sponsorship Tiers */}
                <div className="mb-12">
                    <Heading variant="section">
                        <TextGenerator
                            content={HELLO_PAGE.sponsorshipTiersTitle}
                        />
                    </Heading>
                    <Body spacing="none">
                        <TextGenerator
                            content={HELLO_PAGE.sponsorshipTiersDescription}
                        />
                    </Body>
                </div>

                {/* Divider */}
                <Divider />

                {/* Creative Launchpad */}
                <div className="mb-12">
                    <Heading variant="section">
                        <TextGenerator
                            content={HELLO_PAGE.creativeLaunchpadTitle}
                        />
                    </Heading>
                    <Body spacing="comfortable">
                        <TextGenerator
                            content={HELLO_PAGE.creativeLaunchpadIntro}
                        />
                    </Body>
                    <ul className="space-y-3">
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            <TextGenerator
                                content={HELLO_PAGE.creativeLaunchpadFeature1}
                            />
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            <TextGenerator
                                content={HELLO_PAGE.creativeLaunchpadFeature2}
                            />
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            <TextGenerator
                                content={HELLO_PAGE.creativeLaunchpadFeature3}
                            />
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-highlight">
                            <TextGenerator
                                content={HELLO_PAGE.creativeLaunchpadFeature4}
                            />
                        </li>
                    </ul>
                </div>

                {/* Divider */}
                <Divider />

                {/* The Difference */}
                <div className="mb-12">
                    <Heading variant="section">
                        <TextGenerator content={HELLO_PAGE.differenceTitle} />
                    </Heading>
                    <Body spacing="comfortable">
                        <TextGenerator content={HELLO_PAGE.differenceIntro} />
                    </Body>
                    <ul className="space-y-3">
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            <TextGenerator
                                content={HELLO_PAGE.differenceFeature1}
                            />
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            <TextGenerator
                                content={HELLO_PAGE.differenceFeature2}
                            />
                        </li>
                        <li className="font-body text-sm text-text-body-secondary leading-relaxed pl-4 border-l-2 border-border-brand">
                            <TextGenerator
                                content={HELLO_PAGE.differenceFeature3}
                            />
                        </li>
                    </ul>
                </div>

                {/* Divider */}
                <Divider />

                {/* Roadmap */}
                <div className="mb-12">
                    <Heading variant="section">
                        <TextGenerator content={HELLO_PAGE.roadmapTitle} />
                    </Heading>
                    <Body spacing="comfortable">
                        <TextGenerator content={HELLO_PAGE.roadmapIntro} />
                    </Body>
                    <div className="space-y-4">
                        <SubCard size="compact">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider md:w-32">
                                    <TextGenerator
                                        content={
                                            HELLO_PAGE.roadmapComingSoonLabel
                                        }
                                    />
                                </div>
                                <div className="flex-1">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-2">
                                        <TextGenerator
                                            content={
                                                HELLO_PAGE.roadmapComingSoonTitle
                                            }
                                        />
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        <TextGenerator
                                            content={
                                                HELLO_PAGE.roadmapComingSoonDescription
                                            }
                                        />
                                    </p>
                                </div>
                            </div>
                        </SubCard>
                        <SubCard size="compact">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider md:w-32">
                                    <TextGenerator
                                        content={HELLO_PAGE.roadmapQ1Label}
                                    />
                                </div>
                                <div className="flex-1">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-2">
                                        <TextGenerator
                                            content={HELLO_PAGE.roadmapQ1Title}
                                        />
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        <TextGenerator
                                            content={
                                                HELLO_PAGE.roadmapQ1Description
                                            }
                                        />
                                    </p>
                                </div>
                            </div>
                        </SubCard>
                        <SubCard size="compact">
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="font-headline text-xs font-black text-text-highlight uppercase tracking-wider md:w-32">
                                    <TextGenerator
                                        content={HELLO_PAGE.roadmapOngoingLabel}
                                    />
                                </div>
                                <div className="flex-1">
                                    <p className="font-headline text-sm font-black text-text-body-main mb-2">
                                        <TextGenerator
                                            content={
                                                HELLO_PAGE.roadmapOngoingTitle
                                            }
                                        />
                                    </p>
                                    <p className="font-body text-xs text-text-body-secondary">
                                        <TextGenerator
                                            content={
                                                HELLO_PAGE.roadmapOngoingDescription
                                            }
                                        />
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
                        <TextGenerator content={HELLO_PAGE.ctaTitle} />
                    </Heading>
                    <Body spacing="comfortable">
                        <TextGenerator content={HELLO_PAGE.ctaDescription} />
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
                            <TextGenerator
                                content={HELLO_PAGE.getApiKeyButton}
                            />
                            <ExternalLinkIcon className="w-4 h-4 stroke-text-highlight" />
                        </Button>
                        <Button
                            as="a"
                            href="mailto:hello@pollinations.ai?subject=Sponsorship Inquiry"
                            variant="secondary"
                            size="lg"
                        >
                            <TextGenerator
                                content={HELLO_PAGE.learnSponsorshipButton}
                            />
                            <ExternalLinkIcon className="w-4 h-4 text-text-body-main" />
                        </Button>
                    </div>
                </div>
            </PageCard>
        </PageContainer>
    );
}

export default HelloPage;
