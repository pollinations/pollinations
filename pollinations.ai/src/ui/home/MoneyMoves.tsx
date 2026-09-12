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
    UsageIcon,
    WalletIcon,
} from "@pollinations/ui";

const MONEY_FLOW = [
    {
        title: "Users bring their Pollen",
        body: "They buy Pollen or earn it through Quests, then use it across apps, models and agents.",
        icon: WalletIcon,
    },
    {
        title: "Users control their spending",
        body: "Connected apps use the budget and permissions each user approves.",
        icon: UsageIcon,
    },
    {
        title: "Value flows back to builders",
        body: "Earn Pollen when others use your published model or your app with developer earnings enabled.",
        icon: EarningsIcon,
        earnings: [
            {
                text: "Model · 75% of its listed price",
                icon: BeakerIcon,
                href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
                docsLabel: "Model publishing documentation",
            },
            {
                text: "App · 20% of the marked-up request price",
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
        note: "App earnings add 25% to base usage: 1 Pollen becomes 1.25, with 0.25 credited to the app. These are separate calculations, not shares of one total. Cashouts are coming later.",
    },
];

export function MoneyMoves() {
    return (
        <section className="dark -mx-4 grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-12 rounded-none bg-brand-dark px-8 py-14 sm:-mx-2 sm:rounded-3xl md:-mx-12 md:px-14">
            <div className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow="How the money moves"
                    title="Users fund the usage. Builders share the value."
                    subtitle="With connected wallets, users pay for model usage from their own Pollen balance. App developers can add a markup, and community model publishers receive a share of their model’s usage."
                />
            </div>

            <ul className="flex flex-col gap-3">
                {MONEY_FLOW.map((item) => {
                    const Icon = item.icon;

                    return (
                        <li key={item.title}>
                            <Surface
                                variant="card-themed"
                                className="flex flex-col gap-3 rounded-2xl p-5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active text-brand-accent">
                                        <Icon className="size-5" />
                                    </div>
                                    <Heading
                                        as="h3"
                                        size="card"
                                        className="text-brand-accent"
                                    >
                                        {item.title}
                                    </Heading>
                                </div>
                                <Text size="sm">{item.body}</Text>
                                {item.earnings ? (
                                    <ul className="flex flex-col gap-2 pt-1">
                                        {item.earnings.map((earning) => {
                                            const EarningsTypeIcon =
                                                earning.icon;

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
                                                    <span className="min-w-0">
                                                        {earning.text}{" "}
                                                        <InlineLink
                                                            href={earning.href}
                                                            aria-label={
                                                                earning.docsLabel
                                                            }
                                                            title={
                                                                earning.docsLabel
                                                            }
                                                            className="align-middle text-brand-accent"
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
                                ) : null}
                                {item.note ? (
                                    <Text size="xs" tone="muted">
                                        {item.note}
                                    </Text>
                                ) : null}
                            </Surface>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
