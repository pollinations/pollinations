import { Callout, ExternalLinkButton } from "@pollinations/ui";

/**
 * The closing CTA, at the normal section width. It does NOT break out to the
 * sheet edge — the dark money panel is the only element in the mockup that
 * does, which is what makes that one read as a moment.
 */
export function StartBuilding() {
    return (
        <Callout
            title="Start building"
            body="One API. Free Pollen from Quests to start, earnings when your app gets used."
        >
            <ExternalLinkButton
                href="https://enter.pollinations.ai/keys"
                appearance="raised"
                className="bg-brand-accent text-brand-dark"
            >
                Get an API key
            </ExternalLinkButton>
            <ExternalLinkButton
                href="https://discord.gg/pollinations-ai-885844321461485618"
                appearance="raised"
                className="bg-surface-opaque"
            >
                Join the Discord
            </ExternalLinkButton>
        </Callout>
    );
}
