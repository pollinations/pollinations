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
        title: "Each generation pays for itself",
        body: "Usage is paid from the caller's balance, with spending caps and access staying in their hands.",
        icon: UsageIcon,
    },
    {
        title: "Value flows back to builders",
        body: "Every request can reward the app developer, model publisher, and agent publisher behind it.",
        icon: EarningsIcon,
        earnings: [
            {
                text: "Model · 75% of price",
                icon: BeakerIcon,
                href: "https://gen.pollinations.ai/docs#tag/publish-a-model",
                docsLabel: "Model publishing documentation",
            },
            {
                text: "App · 20% of model price",
                icon: AppIcon,
                href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
                docsLabel: "App wallet integration documentation",
            },
            {
                text: "Agent · 20% of price",
                icon: RobotIcon,
                href: "https://gen.pollinations.ai/docs#tag/publish-an-agent",
                docsLabel: "Agent publishing documentation",
            },
        ],
        note: "App and agent earnings come from a 25% markup over the base price.",
    },
];

export function MoneyMoves() {
    return (
        <section className="dark -mx-4 grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-12 rounded-none bg-brand-dark px-8 py-14 sm:-mx-2 sm:rounded-3xl md:-mx-12 md:px-14">
            <div className="flex flex-col gap-5">
                <ContentHeader
                    eyebrow="How the money moves"
                    title="Users fund the usage. Builders share the value."
                    subtitle="Every generation is paid with the caller’s Pollen—bought or earned through Quests. The cost doesn’t fall on the app developer, while eligible usage can reward the app, model, and agent behind it."
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
                                                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-theme-text-strong"
                                                >
                                                    <span className="flex min-w-0 items-center gap-2.5">
                                                        <EarningsTypeIcon
                                                            aria-hidden="true"
                                                            className="size-4.5 shrink-0"
                                                        />
                                                        <span>
                                                            {earning.text}
                                                        </span>
                                                    </span>
                                                    <InlineLink
                                                        href={earning.href}
                                                        aria-label={
                                                            earning.docsLabel
                                                        }
                                                        title={
                                                            earning.docsLabel
                                                        }
                                                        className="shrink-0 text-brand-accent"
                                                    >
                                                        <BookIcon
                                                            aria-hidden="true"
                                                            className="size-3.5"
                                                        />
                                                    </InlineLink>
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
