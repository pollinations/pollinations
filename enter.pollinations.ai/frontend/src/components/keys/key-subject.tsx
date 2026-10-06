import { KeyChip, Surface, Text } from "@pollinations/ui";
import type { ReactNode } from "react";
import { parseAppUrl } from "../../lib/return-to-app.tsx";
import { AppAttribution } from "../auth/app-attribution.tsx";
import { getKeyAccessContext } from "./key-type.ts";
import type { ApiKey } from "./types.ts";

/**
 * The key a standalone page acts on. A key a connected app received shows the
 * app the way the consent screen did; any other key shows its name and prefix.
 */
export function KeySubject({
    apiKey,
    children,
}: {
    apiKey: ApiKey;
    children?: ReactNode;
}) {
    if (getKeyAccessContext(apiKey) === "app") {
        const origin = parseAppUrl(apiKey.metadata?.redirectOrigin);
        return (
            <AppAttribution
                attribution={{ appName: apiKey.name ?? undefined }}
                redirectUrl={origin ? new URL(origin) : null}
            >
                {children}
            </AppAttribution>
        );
    }
    return (
        <Surface>
            <Text size="sm" weight="semibold" tone="strong">
                {apiKey.name ?? apiKey.id}
            </Text>
            {apiKey.start && (
                <div className="mt-1.5">
                    <KeyChip prefix={apiKey.start} />
                </div>
            )}
            {children && <div className="mt-2">{children}</div>}
        </Surface>
    );
}
