import { cn } from "@pollinations/ui";
import type { Usage } from "@shared/registry/registry.ts";
import {
    billableUsageCountEntries,
    type CommunityEndpointUsage,
} from "./types.ts";

type CommunityEndpointUsageCountsProps = {
    usage?: CommunityEndpointUsage;
    billableUsage?: Usage;
    className?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function CommunityEndpointUsageCounts({
    usage,
    billableUsage,
    className,
}: CommunityEndpointUsageCountsProps) {
    const counts = billableUsageCountEntries(usage, billableUsage);
    if (counts.length === 0) return null;

    return (
        <dl
            className={cn(
                "grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]",
                className,
            )}
        >
            {counts.map(({ label, value }) => (
                <div key={label} className="contents">
                    <dt className="min-w-0 truncate font-mono text-theme-text-muted">
                        {label}
                    </dt>
                    <dd className="font-mono text-theme-text-strong">
                        {numberFormatter.format(value)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
