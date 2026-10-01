import {
    AppIcon,
    BeakerIcon,
    BookIcon,
    ContentHeader,
    EarningsIcon,
    Heading,
    InlineLink,
    RobotIcon,
    Surface,
    Text,
} from "@pollinations/ui";

/** Users' side is covered by the panel intro; the card holds the rates. */
const EARNINGS = {
    title: "Revenue share",
    body: "Publish a model, or turn on earnings for your app, and get a share of what others spend on it, paid in Pollen.",
    earnings: [
        {
            text: "Model · 75% of its listed price",
            icon: BeakerIcon,
            href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
            docsLabel: "Model publishing documentation",
        },
        {
            text: "App · 25% markup on usage",
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
    ],
    note: "Example: with app earnings on, $1.00 of usage costs your user $1.25, and your app gets $0.25 in Pollen.",
};

export function MoneyMoves() {
    return (
        <section className="dark -mx-5 grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-12 rounded-none bg-brand-dark px-5 py-14 sm:-mx-2 sm:rounded-3xl sm:px-8 md:-mx-12 md:px-14">
            <ContentHeader
                eyebrow="Pricing"
                title="Prepaid credits, priced in dollars."
                subtitle="Pollen is our prepaid API credit: 1 Pollen = $1, bought by card through Stripe, with a service fee added at checkout. It is not a cryptocurrency and can’t be traded."
            />

            <Surface variant="card" className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active text-brand-accent">
                        <EarningsIcon className="size-5" />
                    </div>
                    <Heading as="h3" size="card" className="text-brand-accent">
                        {EARNINGS.title}
                    </Heading>
                </div>
                <Text size="sm">{EARNINGS.body}</Text>
                <ul className="flex flex-col gap-2 pt-1">
                    {EARNINGS.earnings.map((earning) => {
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
                <Text size="xs" tone="muted">
                    {EARNINGS.note}
                </Text>
            </Surface>
        </section>
    );
}
