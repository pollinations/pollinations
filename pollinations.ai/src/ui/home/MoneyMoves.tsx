import {
    ContentHeader,
    EarningsIcon,
    Heading,
    InlineLink,
    Surface,
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
        <section className="dark -mx-5 flex flex-col gap-10 overflow-hidden rounded-none bg-brand-dark px-5 py-14 sm:-mx-2 sm:rounded-3xl sm:px-8 md:-mx-12 md:px-14">
            <div className="grid items-center gap-8 lg:grid-cols-2">
                <ContentHeader
                    eyebrow="Pricing"
                    title="Prepaid credits, priced in dollars."
                    subtitle="Pollen is our API credit: 1 Pollen = $1. Pay only for what you use."
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
                    <InlineLink
                        href="https://enter.pollinations.ai/quests"
                        className="self-start text-brand-accent"
                    >
                        Explore Quests
                    </InlineLink>
                </Surface>

                <Surface variant="card" className="flex flex-col gap-3 p-5">
                    <CardTitle icon={EarningsIcon}>Earnings</CardTitle>
                    <Text size="sm">
                        Get a share of what others spend on your models and
                        apps.
                    </Text>
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
