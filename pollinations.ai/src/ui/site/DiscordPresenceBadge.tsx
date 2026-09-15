import { Chip, cn } from "@pollinations/ui";
import type { CSSProperties } from "react";
import { compact } from "../../data/publicStats";

export const DISCORD_BLURPLE_STYLE = {
    backgroundColor: "#5865F2",
    color: "#FFFFFF",
} satisfies CSSProperties;

export function DiscordPresenceBadge({
    online,
    glow = true,
    className,
}: {
    online: number | null;
    glow?: boolean;
    className?: string;
}) {
    if (online === null) return null;

    return (
        <Chip
            size="sm"
            style={DISCORD_BLURPLE_STYLE}
            className={cn(
                "gap-1.5 px-1.5",
                glow && "drop-shadow-[0_0_0.3rem_#5865F2]",
                className,
            )}
        >
            {compact(online)} online
        </Chip>
    );
}
