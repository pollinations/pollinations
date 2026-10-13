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
            body="Your first API key earns a small Quest reward. Make a call, then publish when you’re ready."
        >
            <ExternalLinkButton
                href="https://enter.pollinations.ai/keys"
                intent="brand"
                size="lg"
            >
                Get an API key
            </ExternalLinkButton>
            <ExternalLinkButton
                href="https://discord.gg/pollinations-ai-885844321461485618"
                intent="neutral"
                size="lg"
            >
                Join the Discord
            </ExternalLinkButton>
        </Callout>
    );
}
