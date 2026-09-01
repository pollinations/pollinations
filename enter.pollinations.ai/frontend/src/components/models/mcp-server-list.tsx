import {
    CheckIcon,
    Chip,
    ClipboardIcon,
    CopyButton,
    InlineLink,
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
        <div className="space-y-4">
            <div className="flex flex-col gap-2">
                {servers.map((server) => {
                    const endpoint = `${config.genBaseUrl}/mcp/${server.id}`;
                    const pricing = getMcpPricingInfo(server);
                    return (
                        <div
                            key={server.id}
                            className="flex items-start gap-3 rounded-xl bg-surface-opaque p-4 shadow-sm"
                        >
                            <span
                                aria-hidden="true"
                                className="mt-0.5 h-7 w-7 shrink-0 bg-current text-ink-900 opacity-55"
                                style={{
                                    mask: "url(/brand-logos/pollinations.svg) center / contain no-repeat",
                                    WebkitMask:
                                        "url(/brand-logos/pollinations.svg) center / contain no-repeat",
                                }}
                            />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-theme-text-strong">
                                        {server.name} MCP
                                    </span>
                                    <Chip size="sm" intent="neutral">
                                        Built-in
                                    </Chip>
                                </div>
                                <p className="text-sm text-theme-text-muted">
                                    {server.description}
                                </p>
                                <div className="pt-1">
                                    <p className="mb-1 text-xs font-medium text-theme-text-strong">
                                        Billing
                                    </p>
                                    {pricing.rates.length > 0 && (
                                        <div className="grid w-full max-w-[19.5rem] grid-cols-[6.5rem_9ch_minmax(0,1fr)] gap-x-2 min-[480px]:grid-cols-[8rem_9ch_5.5rem]">
                                            <UsagePriceRows
                                                adjustments={pricing.rates}
                                                align="left"
                                            />
                                        </div>
                                    )}
                                    {pricing.description && (
                                        <p className="text-xs text-theme-text-muted">
                                            {pricing.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                                    <span className="min-w-0 truncate font-mono text-theme-text-muted">
                                        {endpoint}
                                    </span>
                                    <CopyButton
                                        value={endpoint}
                                        tooltip="Copy MCP endpoint"
                                        copiedTooltip="Copied"
                                        aria-label={`Copy ${server.name} MCP endpoint`}
                                        className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-theme-text-muted transition-colors hover:bg-theme-bg-active hover:text-theme-text-strong"
                                    >
                                        {(copied) =>
                                            copied ? (
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            ) : (
                                                <ClipboardIcon className="h-3.5 w-3.5" />
                                            )
                                        }
                                    </CopyButton>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="text-xs text-theme-text-muted">
                <span className="font-medium text-theme-text-strong">
                    Code quality:
                </span>{" "}
                Built-in MCPs favor stateless HTTP, thin proxy logic, clear
                Pollen billing, and focused tests.
            </p>
            <p className="text-xs text-theme-text-muted">
                Connect with your Pollinations API key. See the{" "}
                <InlineLink href={genDocsUrl("#tag/mcp-server")}>
                    MCP docs
                </InlineLink>
                .
            </p>
        </div>
    );
};
