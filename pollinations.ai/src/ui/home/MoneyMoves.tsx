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
    title: "Value flows back to builders",
    body: "Earn Pollen when others use your published model or your app with developer earnings enabled.",
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
            docsLabel: "App wallet integration documentation",
        },
        {
            text: "Agent · Earnings coming soon",
            icon: RobotIcon,
            href: "https://gen.pollinations.ai/docs#tag/publish-an-agent",
            docsLabel: "Agent publishing documentation",
        },
    ],
    note: "With app earnings enabled, 1 Pollen of usage costs the user 1.25 Pollen. Your app earns 0.25 Pollen.",
};

export function MoneyMoves() {
    return (
        <section className="dark -mx-5 grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-12 rounded-none bg-brand-dark px-5 py-14 sm:-mx-2 sm:rounded-3xl sm:px-8 md:-mx-12 md:px-14">
            <div className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow="How the money moves"
                    title="Users spend Pollen. Builders earn a share."
                    subtitle="With connected wallets, users pay for model usage from their own Pollen balance. App developers can add a markup, and community model publishers receive a share of their model’s usage."
                />
            </div>

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
