import {
    Alert,
    BeakerIcon,
    BotIcon,
    CardIcon,
    CheckIcon,
    Chip,
    ClipboardIcon,
    CopyButton,
    currentPeriod,
    ExternalLinkIcon,
    EyeIcon,
    EyeOffIcon,
    GitHubIcon,
    GlobeIcon,
    IconButton,
    LockIcon,
    PencilIcon,
    Surface,
    TerminalIcon,
    TokensIcon,
    XIcon,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_CHANGE_DELAY_MS,
    communityEndpointPriceFieldsForModality,
} from "@shared/community-endpoints.ts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { OpenWebUiLink } from "../models/open-webui-link.tsx";
import { PriceBadge, type PriceBadgeConfig } from "../models/price-badge.tsx";
import type { PriceKind } from "../models/types.ts";
import { ResourceCardHeader } from "../resource-card-header.tsx";
import {
    type CommunityEndpoint,
    type ManagedAgent,
    openWebUiTestableModelId,
    type ProxyCommunityEndpoint,
    storedPriceToFormValue,
    VISIBILITY_LABELS,
} from "./types.ts";

type CommunityEndpointCardProps = {
    endpoint: CommunityEndpoint;
    agent?: ManagedAgent;
    isToggling: boolean;
    onToggle: () => void;
    onEdit?: () => void;
    onDelete: () => void;
};

export function CommunityEndpointCard({
    endpoint,
    agent,
    isToggling,
    onToggle,
    onEdit,
    onDelete,
}: CommunityEndpointCardProps) {
    const isPublic = endpoint.visibility === "public";
    const isAgent = endpoint.type !== "proxy";
    const relistAt =
        isPublic && endpoint.hiddenAt
            ? new Date(endpoint.hiddenAt).getTime() +
              COMMUNITY_ENDPOINT_CHANGE_DELAY_MS
            : 0;
    const relistIsDelayed = Date.now() < relistAt;
    const visibilityTooltip = relistIsDelayed
        ? `Relist available at ${new Date(relistAt).toLocaleTimeString([], { timeStyle: "short" })}`
        : isToggling
          ? "Saving visibility"
          : `${endpoint.hidden ? "Relist" : "Unlist"} ${isAgent ? "agent" : "model"}`;
    const hasUpstreamEndpoint =
        endpoint.type === "proxy" || endpoint.type === "endpoint_agent";
    const priceGroups =
        endpoint.type === "proxy" ? communityPriceGroups(endpoint) : [];
    const testableModelId = openWebUiTestableModelId(endpoint);

    return (
        <Surface className="transition-colors hover:bg-surface-opaque/90">
            <ResourceCardHeader
                icon={
                    isAgent ? (
                        <BotIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                        <BeakerIcon className="h-4 w-4" aria-hidden="true" />
                    )
                }
                title={
                    testableModelId ? (
                        <OpenWebUiLink
                            modelId={testableModelId}
                            title={endpoint.title}
                        />
                    ) : (
                        endpoint.title
                    )
                }
                description={endpoint.description}
                badges={
                    <>
                        <Chip intent={isPublic ? "news" : "neutral"} size="sm">
                            {isPublic ? (
                                <GlobeIcon className="h-3 w-3" />
                            ) : (
                                <LockIcon className="h-3 w-3" />
                            )}
                            {VISIBILITY_LABELS[endpoint.visibility]}
                        </Chip>
                        {endpoint.hidden && (
                            <Chip intent="danger" size="sm">
                                Unlisted
                            </Chip>
                        )}
                        <Link
                            data-size="footer"
                            data-tone="quiet"
                            to="/activity"
                            search={{
                                usageGranularity: "day",
                                usagePeriod: currentPeriod().period,
                                usageBucket: undefined,
                                usageAnchor: undefined,
                                earningsGranularity: "day",
                                earningsPeriod: currentPeriod().period,
                                earningsBucket: undefined,
                                earningsAnchor: undefined,
                                earningsModels: [endpoint.modelId],
                                usageMetric: undefined,
                                usageKeys: undefined,
                                usageModels: undefined,
                                earningsMetric: undefined,
                                earningsApps: undefined,
                            }}
                            className="polli-link"
                        >
                            Activity
                        </Link>
                    </>
                }
                actions={
                    <>
                        <IconButton
                            title={visibilityTooltip}
                            disabled={isToggling || relistIsDelayed}
                            onClick={onToggle}
                        >
                            {endpoint.hidden ? (
                                <EyeIcon className="h-4 w-4" />
                            ) : (
                                <EyeOffIcon className="h-4 w-4" />
                            )}
                        </IconButton>
                        {onEdit && (
                            <IconButton
                                intent="info"
                                title={isAgent ? "Edit agent" : "Edit model"}
                                onClick={onEdit}
                            >
                                <PencilIcon className="h-4 w-4" />
                            </IconButton>
                        )}
                        <IconButton
                            intent="danger"
                            title={isAgent ? "Delete agent" : "Delete model"}
                            onClick={onDelete}
                        >
                            <XIcon className="h-4 w-4" />
                        </IconButton>
                    </>
                }
            />

            <PendingChangeNotice endpoint={endpoint} />

            <div className="mt-5 grid gap-2 px-2">
                <CommunityDetailRow
                    icon={<TokensIcon className="h-3.5 w-3.5" />}
                    label="Model ID"
                    value={endpoint.modelId}
                    copyLabel="Copy model id"
                />
                {agent?.type === "code_agent" && (
                    <CommunityDetailRow
                        icon={<GitHubIcon className="h-3.5 w-3.5" />}
                        label="Source"
                        value={`${agent.repository}/agent.ts @ ${agent.deployedCommitSha.slice(0, 7)}`}
                        copyLabel="Copy source"
                    />
                )}
                {hasUpstreamEndpoint && (
                    <CommunityDetailRow
                        icon={<ExternalLinkIcon className="h-3.5 w-3.5" />}
                        label="Endpoint"
                        value={
                            endpoint.type === "endpoint_agent" ||
                            endpoint.modality === "text"
                                ? endpoint.url
                                : endpoint.baseUrl
                        }
                        copyLabel="Copy endpoint"
                    />
                )}
                {hasUpstreamEndpoint && (
                    <>
                        {endpoint.type === "proxy" && (
                            <CommunityDetailRow
                                icon={<TerminalIcon className="h-3.5 w-3.5" />}
                                label="Modality"
                                value={endpoint.modality}
                            />
                        )}
                        {(endpoint.type !== "proxy" ||
                            endpoint.modality !== "video") && (
                            <CommunityDetailRow
                                icon={<TerminalIcon className="h-3.5 w-3.5" />}
                                label="Upstream model"
                                value={endpoint.upstreamModel}
                            />
                        )}
                        {endpoint.perUserRpm !== null && (
                            <CommunityDetailRow
                                icon={<TerminalIcon className="h-3.5 w-3.5" />}
                                label="Per-user limit"
                                value={`${endpoint.perUserRpm} RPM/user`}
                            />
                        )}
                    </>
                )}
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

function PendingChangeNotice({ endpoint }: { endpoint: CommunityEndpoint }) {
    const pending = endpoint.pending;
    if (!pending) return null;

    const visibility = pending.visibility ?? endpoint.visibility;
    const pendingProxy =
        endpoint.type === "proxy"
            ? ({
                  ...endpoint,
                  ...pending,
                  visibility,
                  paidOnly: pending.paidOnly ?? endpoint.paidOnly,
                  imagePricing: pending.imagePricing ?? endpoint.imagePricing,
              } satisfies ProxyCommunityEndpoint)
            : null;
    const priceGroups = pendingProxy ? communityPriceGroups(pendingProxy) : [];

    return (
        <Alert intent="info" className="mt-3" title="Changes queued">
            <div className="flex flex-col gap-1 text-sm">
                <span>
                    Effective {new Date(pending.effectiveAt).toLocaleString()}
                </span>
                <span>
                    Visibility: {VISIBILITY_LABELS[visibility]}
                    {pendingProxy &&
                        ` · ${pendingProxy.paidOnly ? "Paid Pollen only" : "Quest and Paid Pollen"}`}
                </span>
                {pendingProxy && (
                    <span className="flex flex-wrap items-center gap-1.5">
                        <span>Pricing:</span>
                        {priceGroups.length > 0 ? (
                            priceGroups.map((group) => (
                                <span
                                    key={group.key}
                                    className="inline-flex items-center gap-1"
                                >
                                    {group.label}
                                    <CommunityPriceBadges group={group} />
                                </span>
                            ))
                        ) : (
                            <span>Free</span>
                        )}
                    </span>
                )}
            </div>
        </Alert>
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
    endpoint: ProxyCommunityEndpoint,
): CommunityPriceGroup[] {
    const groups: Record<CommunityPriceGroup["key"], CommunityPriceBadge[]> = {
        input: [],
        output: [],
    };

    for (const field of communityEndpointPriceFieldsForModality(
        endpoint.modality,
        endpoint.imagePricing,
    )) {
        const price = endpoint[field.key];
        if (price <= 0) continue;
        const groupKey = communityPriceGroupKey(field.usageType);
        if (!groupKey) continue;
        const kind = communityPriceKind(field.usageType);
        groups[groupKey].push({
            badge: {
                price: storedPriceToFormValue(price, field.priceUnit),
                kind,
                subKinds: [kind],
                unit:
                    field.priceUnit === "million"
                        ? "token"
                        : field.priceUnit === "second" ||
                            field.priceUnit === "video_second"
                          ? "second"
                          : "request",
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
    if (usageType.includes("Image")) return "image";
    if (usageType.includes("Video")) return "video";
    return "text";
}
