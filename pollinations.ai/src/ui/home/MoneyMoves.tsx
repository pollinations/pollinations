import {
    CardIcon,
    Chip,
    ContentHeader,
    EarningsIcon,
    Heading,
    InlineLink,
    Surface,
    TargetIcon,
    Text,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { useArt } from "../../art";

/** What Pollen is: pay as you go, free Quest credits, and earnings. */
export function MoneyMoves() {
    const scene = useArt("home", "quests");

    return (
        <Surface
            variant="card"
            className="relative flex flex-col overflow-hidden p-5 sm:p-8 lg:min-h-[30rem] lg:justify-center"
        >
            <div className="relative z-10 flex flex-col gap-10 lg:max-w-[46%]">
                <ContentHeader
                    eyebrow="Pollen"
                    title="One credit for every model, agent and tool."
                />
                <ul className="flex flex-col gap-6">
                    <Item
                        icon={CardIcon}
                        title="Pay as you go"
                        badge={
                            <Chip
                                size="lg"
                                className="bg-brand-accent font-semibold text-brand-dark"
                            >
                                1 Pollen = $1
                            </Chip>
                        }
                    >
                        Top up any time and pay only for what you use.
                    </Item>
                    <Item icon={TargetIcon} title="Free credits">
                        Get free Quest Pollen for solving GitHub Quests, trying
                        models, or building an app or agent.{" "}
                        <InlineLink href="https://enter.pollinations.ai/quests">
                            Explore Quests
                        </InlineLink>
                    </Item>
                    <Item icon={EarningsIcon} title="Earnings">
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
    icon: Icon,
    title,
    badge,
    children,
}: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    badge?: ReactNode;
    children: ReactNode;
}) {
    return (
        <li className="flex gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme-bg-subtle text-theme-text-strong">
                <Icon className="size-6" />
            </div>
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
