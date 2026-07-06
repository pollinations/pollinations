import {
    Alert,
    CardIcon,
    CheckIcon,
    ClipboardIcon,
    CopyButton,
    ExternalLinkIcon,
    IconButton,
    PencilIcon,
    Surface,
    TerminalIcon,
    TokensIcon,
    XIcon,
} from "@pollinations/ui";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
import type { ReactNode } from "react";
import { PriceBadge, type PriceBadgeConfig } from "../models/price-badge.tsx";
import type { PriceKind } from "../models/types.ts";
import { type CommunityEndpoint, pricePerTokenToPerMillion } from "./types.ts";

type CommunityEndpointCardProps = {
    endpoint: CommunityEndpoint;
    onEdit: () => void;
    onDelete: () => void;
};

export function CommunityEndpointCard({
    endpoint,
    onEdit,
    onDelete,
}: CommunityEndpointCardProps) {
    const priceGroups = communityPriceGroups(endpoint);

    return (
        <Surface
            className={`transition-colors hover:bg-surface-opaque/90 ${
                endpoint.disabled ? "opacity-60" : ""
            }`}
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold text-theme-text-strong">
                            {endpoint.name}
                        </h3>
                    </div>
                    {endpoint.description && (
                        <p className="mt-1 text-sm text-theme-text-muted">
                            {endpoint.description}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                        intent="info"
                        title="Edit model"
                        tooltip="Edit model"
                        tooltipAlign="center"
                        onClick={onEdit}
                    >
                        <PencilIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                        intent="danger"
                        title="Delete model"
                        tooltip="Delete model"
                        tooltipAlign="center"
                        onClick={onDelete}
                    >
                        <XIcon className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>

            {endpoint.disabled && (
                <Alert intent="danger" className="mt-3">
                    <div className="flex flex-col gap-1">
                        <span className="font-semibold">Model deactivated</span>
                        <span className="text-sm">
                            {endpoint.disabledReason ??
                                "Deactivated due to repeated failures."}
                        </span>
                        <span className="text-sm">
                            Edit, test, then save the model to reactivate it.
                        </span>
                    </div>
                </Alert>
            )}

            <div className="mt-4 grid gap-2">
                <CommunityDetailRow
                    icon={<TokensIcon className="h-3.5 w-3.5" />}
                    label="Model ID"
                    value={endpoint.modelId}
                    copyLabel="Copy model id"
                />
                <CommunityDetailRow
                    icon={<ExternalLinkIcon className="h-3.5 w-3.5" />}
                    label="Endpoint"
                    value={endpoint.baseUrl}
                    copyLabel="Copy endpoint"
                />
                <CommunityDetailRow
                    icon={<TerminalIcon className="h-3.5 w-3.5" />}
                    label="Upstream model"
                    value={endpoint.upstreamModel}
                />
                {priceGroups.map((group) => (
                    <CommunityDetailRow
                        key={group.key}
                        icon={<CardIcon className="h-3.5 w-3.5" />}
                        label={group.label}
                        value={<CommunityPriceBadges group={group} />}
                    />
                ))}
            </div>
        </Surface>
    );
}

type CommunityDetailRowProps = {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    copyLabel?: string;
};

function CommunityDetailRow({
    icon,
    label,
    value,
    copyLabel,
}: CommunityDetailRowProps) {
    const copyValue = typeof value === "string" ? value : null;

    return (
        <div className="grid min-w-0 gap-1 text-xs text-theme-text-muted sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center">
            <span className="inline-flex items-center gap-1.5 font-medium text-theme-text-muted">
                <span className="text-theme-text-muted">{icon}</span>
                {label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
                {typeof value === "string" ? (
                    <span className="min-w-0 truncate font-mono text-theme-text-strong">
                        {value}
                    </span>
                ) : (
                    value
                )}
                {copyLabel && copyValue && (
                    <CopyButton
                        value={copyValue}
                        tooltip={copyLabel}
                        copiedTooltip="Copied"
                        className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-theme-text-muted transition-colors hover:bg-theme-bg-active hover:text-theme-text-strong"
                    >
                        {(copied: boolean) =>
                            copied ? (
                                <CheckIcon className="h-3.5 w-3.5" />
                            ) : (
                                <ClipboardIcon className="h-3.5 w-3.5" />
                            )
                        }
                    </CopyButton>
                )}
            </span>
        </div>
    );
}

function CommunityPriceBadges({ group }: { group: CommunityPriceGroup }) {
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-1">
            {group.badges.map(({ badge }) => (
                <PriceBadge
                    key={`${group.key}-${badge.kind}-${badge.price}`}
                    {...badge}
                />
            ))}
        </span>
    );
}

type CommunityPriceGroup = {
    key: "input" | "output";
    label: string;
    badges: CommunityPriceBadge[];
};

type CommunityPriceBadge = {
    badge: PriceBadgeConfig;
};

function communityPriceGroups(
    endpoint: CommunityEndpoint,
): CommunityPriceGroup[] {
    const groups: Record<CommunityPriceGroup["key"], CommunityPriceBadge[]> = {
        input: [],
        output: [],
    };

    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
        const price = endpoint[field.key];
        if (price <= 0) continue;
        const groupKey = communityPriceGroupKey(field.usageType);
        if (!groupKey) continue;
        const kind = communityPriceKind(field.usageType);
        groups[groupKey].push({
            badge: {
                price: pricePerTokenToPerMillion(price),
                kind,
                subKinds: [kind],
                unit: "token",
            },
        });
    }

    const priceGroups: CommunityPriceGroup[] = [
        { key: "input", label: "Input price", badges: groups.input },
        { key: "output", label: "Output price", badges: groups.output },
    ];

    return priceGroups.filter((group) => group.badges.length > 0);
}

function communityPriceGroupKey(
    usageType: string,
): CommunityPriceGroup["key"] | null {
    if (usageType.startsWith("prompt")) return "input";
    if (usageType.startsWith("completion")) return "output";
    return null;
}

function communityPriceKind(usageType: string): PriceKind {
    if (usageType === "promptCachedTokens") return "cached";
    if (usageType === "promptCacheWriteTokens") return "cacheWrite";
    if (usageType === "completionReasoningTokens") return "reasoning";
    if (usageType === "promptAudioTokens") return "audioIn";
    if (usageType === "completionAudioTokens") return "audioOut";
    if (usageType === "promptImageTokens") return "image";
    return "text";
}
