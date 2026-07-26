import { ActionButton } from "../site/mockup";

/**
 * The closing CTA from the mockup: a solid amber panel, breaking out to the
 * sheet edge like the dark money panel does. Two coloured moments in the page
 * — one dark in the middle, one amber at the end — and cream everywhere else.
 */
export function StartBuilding() {
    return (
        <section className="-mx-2 flex flex-wrap items-center justify-between gap-10 rounded-3xl bg-theme-bg-active px-8 py-12 md:-mx-12 md:px-14">
            <div className="flex max-w-lg flex-col gap-2.5">
                <h2 className="font-heading text-4xl leading-tight text-theme-text-strong">
                    Start building
                </h2>
                <p className="leading-relaxed text-theme-text-strong/75">
                    One API. Free Pollen from Quests to start, earnings when
                    your app gets used.
                </p>
            </div>
            <div className="flex flex-wrap gap-3">
                <ActionButton href="https://enter.pollinations.ai" tone="dark">
                    Get an API key
                </ActionButton>
                <ActionButton
                    href="https://discord.gg/pollinations-ai-885844321461485618"
                    tone="plain"
                >
                    Join the Discord
                </ActionButton>
            </div>
        </section>
    );
}
