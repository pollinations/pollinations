import { Callout, ExternalLinkButton } from "@pollinations/ui";

/**
 * The closing CTA, at the normal section width. It does NOT break out to the
 * sheet edge — the dark money panel is the only element in the mockup that
 * does, which is what makes that one read as a moment.
 */
export function StartBuilding() {
    return (
        <Callout
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
