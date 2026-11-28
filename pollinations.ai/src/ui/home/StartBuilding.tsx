import { Callout, ExternalLinkButton } from "@pollinations/ui";

/**
 * The closing CTA, at the normal section width, on the same brand-dark band
 * that closes Community, so both pages end on one moment.
 */
export function StartBuilding() {
    return (
        <Callout
            tone="dark"
            title="Start with one piece."
            body="Create your first API key to earn credit in your Quest balance. Make a call, then publish when you’re ready."
        >
            <ExternalLinkButton
                href="https://enter.pollinations.ai/keys"
                intent="brand"
                size="lg"
            >
                Get an API key
            </ExternalLinkButton>
            <ExternalLinkButton
                href="https://discord.gg/k9F7SyTgqn"
                intent="neutral"
                size="lg"
            >
                Join the Discord
            </ExternalLinkButton>
        </Callout>
    );
}
