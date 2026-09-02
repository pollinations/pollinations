import {
    BeakerIcon,
    CopyButton,
    cn,
    InlineLink,
    KeyIcon,
    McpIcon,
    Tooltip,
} from "@pollinations/ui";
import { getMcpPricingInfo, MCP_SERVERS } from "@shared/registry/mcp.ts";
import type { FC } from "react";
import { config, genDocsUrl } from "../../config.ts";
import { UsagePriceRows } from "./price-badge.tsx";

export const McpServerList: FC<{ query: string }> = ({ query }) => {
    const normalizedQuery = query.trim().toLowerCase();
    const servers = MCP_SERVERS.filter((server) => {
        const pricing = getMcpPricingInfo(server);
        return [
            server.id,
            server.name,
            server.description,
            pricing.description ?? "",
            ...pricing.rates.map(({ label }) => label),
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });

    if (servers.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-theme-text-muted">
                No MCP servers match “{query.trim()}”.
            </p>
        );
    }

    return (
        <div>
            <div className="@container flex flex-col gap-2 pb-1">
                {servers.map((server) => {
                    const endpoint = `${config.genBaseUrl}/mcp/${server.id}`;
                    const pricing = getMcpPricingInfo(server);
                    return (
                        <div
                            key={server.id}
                            className="rounded-xl bg-surface-opaque shadow-sm [--mcp-card-gap:0.625rem] [--mcp-icon-width:2rem] @2xl:flex @2xl:items-center @2xl:shadow-well"
                        >
                            <div className="flex items-center gap-[var(--mcp-card-gap)] p-4 @2xl:min-w-0 @2xl:flex-1">
                                <McpIcon className="h-8 w-[var(--mcp-icon-width)] shrink-0 text-ink-900 opacity-55" />
                                <span
                                    aria-hidden="true"
                                    className="h-10 w-px shrink-0 bg-divider"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <span className="text-sm font-medium leading-tight text-theme-text-strong @2xl:text-base">
                                        {server.name} MCP
                                    </span>
                                    <p className="text-sm text-theme-text-muted">
                                        {server.description}
                                    </p>
                                    <CopyButton
                                        value={endpoint}
                                        tooltip={
                                            <span className="font-sans text-xs font-semibold text-theme-text-strong">
                                                Click to copy
                                            </span>
                                        }
                                        copiedTooltip={
                                            <span className="font-sans text-xs font-semibold text-intent-success-text">
                                                Copied
                                            </span>
                                        }
                                        aria-label={`Copy ${server.name} MCP endpoint`}
                                        tooltipAlign="start"
                                        tooltipMaxWidth={520}
                                        tooltipClassName="min-w-0 max-w-full"
                                        className={(copied) =>
                                            cn(
                                                "pointer-events-auto flex min-w-0 max-w-full cursor-pointer text-left font-mono text-xs font-medium transition-colors",
                                                copied
                                                    ? "text-intent-success-text"
                                                    : "text-theme-text-muted hover:text-theme-text-soft",
                                            )
                                        }
                                    >
                                        {() => (
                                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                                <span className="min-w-0 truncate">
                                                    {endpoint}
                                                </span>
                                            </span>
                                        )}
                                    </CopyButton>
                                </div>
                            </div>
                            <div className="flex px-4 pb-4 pt-0 @2xl:w-[clamp(312px,calc(32%_-_8px),352px)] @2xl:shrink-0 @2xl:py-3 @2xl:pl-3 @2xl:pr-1">
                                <span
                                    aria-hidden="true"
                                    className="hidden w-[calc(var(--mcp-icon-width)+1px+var(--mcp-card-gap)+var(--mcp-card-gap))] shrink-0 min-[480px]:block @2xl:hidden"
                                />
                                <div className="min-w-0 flex-1">
                                    {pricing.rates.length > 0 && (
                                        <div className="grid w-full min-w-0 max-w-full grid-cols-[6rem_12ch_minmax(0,1fr)] gap-x-2">
                                            <UsagePriceRows
                                                adjustments={pricing.rates}
                                                align="left"
                                                fractionDigits={8}
                                            />
                                        </div>
                                    )}
                                    {pricing.description && (
                                        <div className="grid w-full min-w-0 max-w-full grid-cols-[6rem_12ch_minmax(0,1fr)] gap-x-2">
                                            <div className="grid col-span-full grid-cols-subgrid items-center py-0.5">
                                                <span className="grid min-w-0 grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-1.5 text-xs text-theme-text-muted">
                                                    <BeakerIcon className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate whitespace-nowrap">
                                                        Generation
                                                    </span>
                                                </span>
                                                <span className="col-span-2 whitespace-nowrap">
                                                    <Tooltip
                                                        triggerAs="span"
                                                        content={
                                                            pricing.description
                                                        }
                                                        ariaLabel={`Generation pricing. ${pricing.description}`}
                                                        tapEnabled
                                                        displayContents
                                                    >
                                                        <span className="text-sm font-semibold text-theme-text-strong">
                                                            Usage-based
                                                        </span>
                                                    </Tooltip>
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-4 flex items-start gap-1.5 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                <KeyIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Connect with your Pollinations API key. See the{" "}
                    <InlineLink href={genDocsUrl("#tag/mcp-servers")}>
                        MCP docs
                    </InlineLink>
                </span>
            </p>
        </div>
    );
};
