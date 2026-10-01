import {
    ContentHeader,
    EarningsIcon,
    Heading,
    InlineLink,
    TargetIcon,
    Text,
} from "@pollinations/ui";
import type { ComponentType, ReactNode } from "react";
import { artFor } from "../../art";

/** Pricing, free Quest credits and earnings in one panel. */
export function MoneyMoves() {
    // The panel is always dark, so it always gets the night scene.
    const scene = artFor("home", "quests", "night");

    return (
        <section className="dark relative -mx-5 flex flex-col overflow-hidden rounded-none bg-brand-dark px-5 pt-14 sm:-mx-2 sm:rounded-3xl sm:px-8 md:-mx-12 md:px-14 lg:min-h-[30rem] lg:justify-center lg:py-14">
            <div className="relative z-10 flex flex-col gap-10 lg:max-w-[46%]">
                <ContentHeader
                    eyebrow="Pricing"
                    title="Prepaid credits, priced in dollars."
                    subtitle="Pollen is our API credit: 1 Pollen = $1. Pay only for what you use."
                />
                <ul className="flex flex-col gap-6">
                    <Item icon={TargetIcon} title="Free credits">
                        Get free Quest Pollen for solving GitHub Quests, trying
                        models, or building an app or agent.{" "}
                        <InlineLink
                            href="https://enter.pollinations.ai/quests"
                            className="text-brand-accent"
                        >
                            Explore Quests
                        </InlineLink>
                    </Item>
                    <Item icon={EarningsIcon} title="Earnings">
                        Get a share of what others spend on your models and
                        apps.
                    </Item>
                </ul>
            </div>
            {/* Under the copy on phones, reaching the bottom edge; the right
                side of the panel on wide screens. */}
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
                className="pricing-scene pointer-events-none -mx-5 mt-8 h-auto w-[calc(100%+2.5rem)] max-w-none select-none sm:-mx-8 sm:w-[calc(100%+4rem)] md:-mx-14 md:w-[calc(100%+7rem)] lg:absolute lg:right-0 lg:bottom-0 lg:m-0 lg:w-[58%]"
            />
        </section>
    );
}

function Item({
    icon: Icon,
    title,
    children,
}: {
    icon: ComponentType<{ className?: string }>;
    title: string;
    children: ReactNode;
}) {
    return (
        <li className="flex gap-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active text-brand-accent">
                <Icon className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
                <Heading as="h3" size="card" className="text-brand-accent">
                    {title}
                </Heading>
                <Text size="sm">{children}</Text>
            </div>
        </li>
    );
}
