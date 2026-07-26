import { ActionButton } from "../site/mockup";

/**
 * The closing CTA: a solid amber panel at the normal section width.
 *
 * It does NOT break out to the sheet edge — the dark money panel is the only
 * element in the mockup that does, which is what makes that one read as a
 * moment. Two things breaking out would make neither of them special.
 */
export function StartBuilding() {
    return (
        <section className="flex flex-wrap items-center justify-between gap-10 rounded-3xl bg-theme-bg-active px-10 py-12">
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
