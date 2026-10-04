import { KeyChip, Surface, Text } from "@pollinations/ui";
import type { ApiKey } from "./types.ts";

/** The key a standalone page acts on. Keys from a connected app carry the app's name. */
export function KeySubject({ apiKey }: { apiKey: ApiKey }) {
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
        </Surface>
    );
}
