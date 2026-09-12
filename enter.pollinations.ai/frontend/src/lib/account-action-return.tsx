import { Button } from "@pollinations/ui";

export function parseAccountReturn(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const url = new URL(value);
        if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password
        )
            return undefined;
        return url.href;
    } catch {
        return undefined;
    }
}

export function AccountReturn({ href }: { href?: string }) {
    return href ? (
        <Button as="a" href={href} data-theme="neutral">
            Back to app
        </Button>
    ) : null;
}
