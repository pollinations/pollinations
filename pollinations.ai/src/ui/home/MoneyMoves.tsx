import {
    AppIcon,
    BeakerIcon,
    BookIcon,
    ContentHeader,
    EarningsIcon,
    ExternalLinkButton,
    Heading,
    InlineLink,
    RobotIcon,
    Surface,
    TargetIcon,
    Text,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { artFor } from "../../art";

/** The only place on Home with the revenue-share rates. */
const EARNINGS = [
    {
        text: "Model · 75% of its price",
        icon: BeakerIcon,
        href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
        docsLabel: "Model publishing documentation",
    },
    {
        text: "App · 25% markup",
        icon: AppIcon,
        href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        docsLabel: "App payments documentation",
    },
    {
        text: "Agent · Coming soon",
        icon: RobotIcon,
        href: "https://gen.pollinations.ai/docs#tag/publish-an-agent",
        docsLabel: "Agent publishing documentation",
    },
];

/** Pricing, free Quest credits and earnings in one panel. */
export function MoneyMoves() {
    // The panel is always dark, so it always gets the night scene.
    const scene = artFor("home", "quests", "night");

    return (
        <section className="dark -mx-5 flex flex-col gap-10 overflow-hidden rounded-none bg-brand-dark px-5 py-14 sm:-mx-2 sm:rounded-3xl sm:px-8 md:-mx-12 md:px-14">
            <div className="grid items-center gap-8 lg:grid-cols-2">
                <ContentHeader
                    eyebrow="Pricing"
                    title="Prepaid credits, priced in dollars."
                    subtitle="Pollen is our prepaid API credit: 1 Pollen = $1, bought by card through Stripe, with a service fee added at checkout. It is not a cryptocurrency and can’t be traded."
                />
                {/* Bleeds to the panel's edges: full width on phones, the
                    top-right corner on wide screens. */}
                <div className="-mx-5 sm:-mx-8 md:-mx-14 lg:-mt-14 lg:ml-0 lg:self-start">
                    <img
                        src={scene.src}
                        srcSet={scene.srcSet}
                        sizes="(min-width: 1024px) 480px, 100vw"
                        alt=""
                        aria-hidden="true"
                        width={2048}
                        height={1024}
                        loading="lazy"
                        decoding="async"
                        className="pricing-scene pointer-events-none h-auto w-full select-none"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Surface variant="card" className="flex flex-col gap-3 p-5">
                    <CardTitle icon={TargetIcon}>Free credits</CardTitle>
                    <Text size="sm">
                        Get free Quest Pollen for solving GitHub Quests, trying
                        models, or building an app or agent.
                    </Text>
                    <ExternalLinkButton
                        href="https://enter.pollinations.ai/quests"
                        intent="brand"
                        className="mt-auto self-start whitespace-nowrap"
                    >
                        Explore Quests
                    </ExternalLinkButton>
                </Surface>

                <Surface variant="card" className="flex flex-col gap-3 p-5">
                    <CardTitle icon={EarningsIcon}>Earnings</CardTitle>
                    <Text size="sm">
                        Get a share of what others spend on your models and
                        apps.
                    </Text>
                    <ul className="flex flex-col gap-2 pt-1">
                        {EARNINGS.map((earning) => {
                            const EarningsTypeIcon = earning.icon;

                            return (
                                <Text
                                    as="li"
                                    key={earning.text}
                                    size="sm"
                                    weight="medium"
                                    className="flex items-start gap-2.5 text-theme-text-strong"
                                >
                                    <EarningsTypeIcon
                                        aria-hidden="true"
                                        className="mt-0.5 size-4.5 shrink-0"
                                    />
                                    <span className="flex min-w-0 items-start gap-1">
                                        <span className="min-w-0">
                                            {earning.text}
                                        </span>
                                        <InlineLink
                                            href={earning.href}
                                            aria-label={earning.docsLabel}
                                            title={earning.docsLabel}
                                            className="inline-flex min-h-6 shrink-0 items-center gap-1 text-brand-accent"
                                        >
                                            <BookIcon
                                                aria-hidden="true"
                                                className="size-3.5"
                                            />
                                        </InlineLink>
                                    </span>
                                </Text>
                            );
                        })}
                    </ul>
                </Surface>
            </div>
        </section>
    );
}

function CardTitle({
    icon: Icon,
    children,
}: {
    icon: ComponentType<{ className?: string }>;
    children: ReactNode;
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active text-brand-accent">
                <Icon className="size-5" />
            </div>
            <Heading as="h3" size="card" className="text-brand-accent">
                {children}
            </Heading>
        </div>
    );
}
