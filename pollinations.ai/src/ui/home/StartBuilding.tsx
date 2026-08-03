import { ActionButton, CalloutPanel } from "../site/kit";

/**
 * The closing CTA, at the normal section width. It does NOT break out to the
 * sheet edge — the dark money panel is the only element in the mockup that
 * does, which is what makes that one read as a moment.
 */
export function StartBuilding() {
    return (
        <CalloutPanel
            title="Start building"
            body="One API. Free Pollen from Quests to start, earnings when your app gets used."
        >
            <ActionButton href="https://enter.pollinations.ai/keys" tone="dark">
                Get an API key
            </ActionButton>
            <ActionButton
                href="https://discord.gg/pollinations-ai-885844321461485618"
                tone="plain"
            >
                Join the Discord
            </ActionButton>
        </CalloutPanel>
    );
}
