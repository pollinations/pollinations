import {
    BeakerIcon,
    Chip,
    InlineLink,
    KeyIcon,
    McpIcon,
    Tooltip,
} from "@pollinations/ui";
import { getMcpPricingInfo, MCP_SERVERS } from "@shared/registry/mcp.ts";
import type { FC } from "react";
import { config, genDocsUrl } from "../../config.ts";
import { CatalogCard } from "../catalog-card.tsx";
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
        <div className="flex flex-col gap-4">
            {/* The shared catalog card, as on the Sandboxes page. */}
            <div className="@container flex flex-col gap-3 [--catalog-price-width:24rem]">
                {servers.map((server) => {
                    const pricing = getMcpPricingInfo(server);
                    return (
                        <CatalogCard
                            key={server.id}
                            split="wide"
                            logo={
                                <McpIcon className="h-8 w-8 shrink-0 text-ink-900 opacity-55" />
                            }
                            price={
                                <div className="grid grid-cols-[6rem_11ch_3rem] gap-x-2">
                                    {pricing.rates.length > 0 && (
                                        <UsagePriceRows
                                            adjustments={pricing.rates}
                                            align="left"
                                        />
                                    )}
                                    {pricing.description && (
                                        <div className="col-span-full grid grid-cols-subgrid items-center py-0.5">
                                            <span className="grid min-w-0 grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-1.5 text-xs text-theme-text-muted">
                                                <BeakerIcon className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate whitespace-nowrap">
                                                    Generation
                                                </span>
                                            </span>
                                            {/* Right-aligned like the prices,
                                                so every value ends on the
                                                same edge. */}
                                            <span className="whitespace-nowrap pr-2 text-right">
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
                                    )}
                                </div>
                            }
                            copy={{
                                value: `${config.genBaseUrl}/mcp/${server.id}`,
                                label: `Copy ${server.name} MCP endpoint`,
                            }}
                            title={
                                <span className="flex flex-wrap items-center gap-2 font-medium leading-tight text-theme-text-soft">
                                    {server.name} MCP
                                    {server.alpha && (
                                        <Chip intent="alpha" size="sm">
                                            Alpha
                                        </Chip>
                                    )}
                                </span>
                            }
                        >
                            <p className="text-sm text-theme-text-muted">
                                {server.description}{" "}
                                {"accountPath" in server && (
                                    <InlineLink
                                        href={`${config.baseUrl}${server.accountPath}`}
                                    >
                                        Connect apps
                                    </InlineLink>
                                )}
                            </p>
                        </CatalogCard>
                    );
                })}
            </div>
            <p className="flex items-start gap-1.5 px-1 text-[13px] leading-snug text-theme-text-muted">
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
