import {
    Button,
    CheckIcon,
    Chip,
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
import type { PriceKind } from "../models/model-icons.tsx";
import { PriceBadge, type PriceBadgeConfig } from "../models/price-badge.tsx";
import { CommunityEndpointUsageCounts } from "./community-endpoint-usage.tsx";
import {
    type ActionState,
    type CommunityEndpoint,
    idleAction,
    pricePerTokenToPerMillion,
} from "./types.ts";

type CommunityEndpointCardProps = {
    endpoint: CommunityEndpoint;
    testState?: ActionState;
    onTest: () => void;
    onEdit: () => void;
    onDelete: () => void;
};

export function CommunityEndpointCard({
    endpoint,
    testState = idleAction,
    onTest,
    onEdit,
    onDelete,
}: CommunityEndpointCardProps) {
    const priceBadges = communityPriceBadges(endpoint);

    return (
        <Surface className="transition-colors hover:bg-surface-opaque/90">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold text-theme-text-strong">
                            {endpoint.name}
                        </h3>
                        <TestStateChip status={testState.status} />
                    </div>
                    {endpoint.description && (
                        <p className="mt-1 text-sm text-theme-text-muted">
                            {endpoint.description}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        type="button"
                        size="sm"
                        intent="info"
                        onClick={onTest}
                        disabled={testState.status === "loading"}
                    >
                        Test
                    </Button>
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
            </div>

            {priceBadges.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {priceBadges.map(({ label, badge }) => (
                        <span
                            key={`${label}-${badge.kind}-${badge.prices[0]}`}
                            className="inline-flex items-center gap-1"
                        >
                            <span className="text-xs text-theme-text-muted">
                                {label}
                            </span>
                            <PriceBadge {...badge} />
                        </span>
                    ))}
                </div>
            )}

            {testState.status === "error" && testState.message && (
                <p className="mt-3 text-sm text-intent-danger-text">
                    {testState.message}
                </p>
            )}

            {testState.status === "success" && (
                <div className="mt-3 rounded-md border border-divider bg-surface-opaque/50 p-2">
                    <CommunityEndpointUsageCounts
                        usage={testState.usage}
                        billableUsage={testState.billableUsage}
                    />
                </div>
            )}
        </Surface>
    );
}

function TestStateChip({ status }: { status: ActionState["status"] }) {
    if (status === "success") {
        return (
            <Chip size="sm" intent="success">
                Tested
            </Chip>
        );
    }
    if (status === "loading") {
        return (
            <Chip size="sm" intent="warning">
                Testing
            </Chip>
        );
    }
    if (status === "error") {
        return (
            <Chip size="sm" intent="danger">
                Test failed
            </Chip>
        );
    }
    return null;
}

type CommunityDetailRowProps = {
    icon: ReactNode;
    label: string;
    value: string;
    copyLabel?: string;
};

function CommunityDetailRow({
    icon,
    label,
    value,
    copyLabel,
}: CommunityDetailRowProps) {
    return (
        <div className="grid min-w-0 gap-1 text-xs text-theme-text-muted sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center">
            <span className="inline-flex items-center gap-1.5 font-medium text-theme-text-muted">
                <span className="text-theme-text-muted">{icon}</span>
                {label}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate font-mono text-theme-text-strong">
                    {value}
                </span>
                {copyLabel && (
                    <CopyButton
                        value={value}
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

type CommunityPriceBadge = {
    label: string;
    badge: PriceBadgeConfig;
};

function communityPriceBadges(
    endpoint: CommunityEndpoint,
): CommunityPriceBadge[] {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.flatMap((field) => {
        const price = endpoint[field.key];
        if (price <= 0) return [];
        const kind = communityPriceKind(field.usageType);
        return [
            {
                label: communityPriceLabel(field.usageType),
                badge: {
                    prices: [pricePerTokenToPerMillion(price)],
                    kind,
                    subKinds: [kind],
                    perToken: true,
                },
            },
        ];
    });
}

function communityPriceLabel(usageType: string): string {
    if (usageType === "promptTextTokens") return "Input";
    if (usageType === "promptCachedTokens") return "Cached";
    if (usageType === "promptCacheWriteTokens") return "Cache write";
    if (usageType === "completionTextTokens") return "Output";
    if (usageType === "completionReasoningTokens") return "Reasoning";
    if (usageType === "promptAudioTokens") return "Audio input";
    if (usageType === "completionAudioTokens") return "Audio output";
    if (usageType === "promptImageTokens") return "Image input";
    return "Price";
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
