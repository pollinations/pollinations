import {
    CardIcon,
    Chip,
    ContentHeader,
    EarningsIcon,
    Heading,
    IconTile,
    type IconTileProps,
    InlineLink,
    SproutIcon,
    Surface,
    Text,
} from "@pollinations/ui";
import type { ReactNode } from "react";
import { useArt } from "../../art";
import { useQuestLeaderboard } from "../../data/community";

/** What Pollen is: pay as you go, free Quest credits, and earnings. */
export function MoneyMoves() {
    const scene = useArt("home", "quests");
    const { data: quests } = useQuestLeaderboard();

    return (
        <Surface
            variant="card"
            className="relative flex flex-col overflow-hidden p-5 sm:p-8 lg:min-h-[30rem] lg:justify-center"
        >
            <div className="relative z-10 flex flex-col gap-10 lg:max-w-[46%]">
                <ContentHeader
                    eyebrow={null}
                    title="One credit for every model, agent and tool."
                />
                <ul className="flex flex-col gap-6">
                    {/* Paid gold and Quest green, as on the wallet; earnings
                        land in both, so that row takes the info blue. */}
                    <Item
                        icon={CardIcon}
                        tone="paid"
                        title="Pay as you go"
                        badge={
                            <Chip
                                size="lg"
                                className="bg-brand-accent font-semibold text-brand-dark"
                            >
                                1 pollen = $1
                            </Chip>
                        }
                    >
                        Top up any time and pay only for what you use.
                    </Item>
                    <Item icon={SproutIcon} tone="tier" title="Free credits">
                        Get free Quest pollen for solving GitHub Quests, trying
                        models, or building an app or agent.{" "}
                        {quests ? (
                            <>
                                {quests.totals.contributors.toLocaleString()}{" "}
                                builders have earned{" "}
                                {Math.floor(
                                    quests.totals.totalPollen,
                                ).toLocaleString()}{" "}
                                pollen from GitHub Quests so far.{" "}
                            </>
                        ) : null}
                        <InlineLink href="https://enter.pollinations.ai/quests">
                            Explore Quests
                        </InlineLink>
                    </Item>
                    <Item icon={EarningsIcon} tone="info" title="Earnings">
                        Get a share of what others spend on your{" "}
                        <InlineLink href="https://gen.pollinations.ai/docs#tag/publish-a-model">
                            models
                        </InlineLink>{" "}
                        and{" "}
                        {/* Keep the link's arrow and the full stop on its line. */}
                        <span className="whitespace-nowrap">
                            <InlineLink href="https://gen.pollinations.ai/docs#tag/connect-user-wallets">
                                apps
                            </InlineLink>
                            .
                        </span>
                    </Item>
                </ul>
            </div>
            {/* Under the copy on phones, reaching the card's edges; the right
                side of the card on wide screens. */}
            <img
                src={scene.src}
                srcSet={scene.srcSet}
                sizes="(min-width: 1024px) 640px, 100vw"
                alt=""
                aria-hidden="true"
                width={2048}
                height={1024}
                loading="lazy"
                decoding="async"
                className="first-call-scene pointer-events-none -mx-5 -mb-5 mt-8 h-auto w-[calc(100%+2.5rem)] max-w-none select-none sm:-mx-8 sm:-mb-8 sm:w-[calc(100%+4rem)] lg:absolute lg:right-0 lg:bottom-0 lg:m-0 lg:w-[58%]"
            />
        </Surface>
    );
}

function Item({
    icon,
    tone,
    title,
    badge,
    children,
}: {
    icon: IconTileProps["icon"];
    tone?: IconTileProps["tone"];
    title: string;
    badge?: ReactNode;
    children: ReactNode;
}) {
    return (
        <li className="flex gap-4">
            <IconTile icon={icon} tone={tone} />
            <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Heading as="h3" size="card">
                        {title}
                    </Heading>
                    {badge}
                </div>
                <Text size="sm">{children}</Text>
            </div>
        </li>
    );
}
