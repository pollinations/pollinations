import { Button, ClockIcon, TerminalIcon, WalletIcon } from "@pollinations/ui";
import {
    SANDBOX_PROVIDERS,
    SANDBOX_TEMPLATES,
    type SandboxProvider,
} from "@shared/registry/sandbox.ts";
import type { FC, ReactNode } from "react";
import { CatalogCard } from "./catalog-card.tsx";
import { BalanceAccessChip } from "./models/model-status-chips.tsx";

// Two significant digits, as the prices are shown.
export const amount = (value: number) => String(Number(value.toPrecision(2)));
const gb = (mb: number) => Math.round(mb / 1024);
const shares = Object.values(SANDBOX_PROVIDERS).map(({ share }) => share);

// The launch promo's discount, from the provider that discounts least.
export const LAUNCH_DISCOUNT = Math.round((1 - Math.max(...shares)) * 100);

// Brand logos from /brand-logos, drawn in the text colour as on the Models
// list. E2B's is the "E" mark from its own dashboard (Apache-2.0).
const PROVIDER_LOGOS: Record<SandboxProvider, string> = {
    e2b: "/brand-logos/e2b.svg",
    azure: "/brand-logos/microsoft.svg",
};

const ProviderLogo: FC<{ provider: SandboxProvider }> = ({ provider }) => {
    const logo = PROVIDER_LOGOS[provider];
    const className = "h-8 w-8 shrink-0 text-ink-900 opacity-55";
    return (
        <span title={SANDBOX_PROVIDERS[provider].name} className="flex">
            <span className="sr-only">{SANDBOX_PROVIDERS[provider].name}</span>
            <span
                aria-hidden="true"
                className={`${className} bg-current`}
                style={{
                    maskImage: `url(${logo})`,
                    WebkitMaskImage: `url(${logo})`,
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskPosition: "center",
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                }}
            />
        </span>
    );
};

// A size as three figures: cores, memory and, when known, disk.
const SizeStats: FC<{
    cpuCount: number;
    memoryMB: number;
    diskSizeMB?: number;
}> = ({ cpuCount, memoryMB, diskSizeMB }) => (
    <dl className="flex gap-6">
        {[
            [String(cpuCount), "vCPU"],
            [`${memoryMB / 1024} GB`, "memory"],
            ...(diskSizeMB ? [[`${gb(diskSizeMB)} GB`, "disk"]] : []),
        ].map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse gap-0.5">
                <dt className="text-xs text-theme-text-muted">{label}</dt>
                <dd className="text-lg font-semibold leading-none text-theme-text-soft">
                    {value}
                </dd>
            </div>
        ))}
    </dl>
);

// One price row, laid out like the Models list's ledger: label, value, unit.
const LedgerRow: FC<{
    Icon: FC<{ className?: string }>;
    label: string;
    children: ReactNode;
}> = ({ Icon, label, children }) => (
    <div className="col-span-full grid grid-cols-subgrid items-center py-0.5">
        <span className="grid grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-1.5 text-xs text-theme-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate whitespace-nowrap">{label}</span>
        </span>
        {children}
    </div>
);

// Every sandbox template with its price, on the shared catalog card: the
// provider and the size, the price, then the polli command and Create.
export const SandboxTemplateList: FC<{
    /** Gen's hourly price per template it can start; the registry adds the
     * details. */
    prices: Record<string, number>;
    /** Signed out there is none: the cards are just the price list. */
    create?: {
        label: string;
        disabled: boolean;
        onCreate: (template: string) => void;
    };
}> = ({ prices, create }) => (
    <div className="@container flex flex-col gap-3 [--catalog-price-width:12rem]">
        {SANDBOX_TEMPLATES.filter(({ id }) => id in prices).map((template) => (
            <CatalogCard
                key={template.id}
                logo={<ProviderLogo provider={template.provider} />}
                price={
                    <div className="grid grid-cols-[4.5rem_3.5rem_3.5rem] gap-x-1">
                        <LedgerRow Icon={WalletIcon} label="Pollen">
                            <div className="col-span-2 flex">
                                <BalanceAccessChip access="quest" />
                            </div>
                        </LedgerRow>
                        {/* As on the Models list, the price in $ (1 pollen is
                            about $1). */}
                        <LedgerRow Icon={ClockIcon} label="Price">
                            <span className="text-right text-sm font-semibold tabular-nums text-theme-text-strong">
                                ${amount(prices[template.id])}
                            </span>
                            <span className="text-xs text-theme-text-muted">
                                /hour
                            </span>
                        </LedgerRow>
                    </div>
                }
                copy={
                    create && {
                        value: `polli sandbox create ${template.id}`,
                        label: `Copy the command that creates a ${template.id} sandbox`,
                    }
                }
                action={
                    create && (
                        <Button
                            type="button"
                            intent="commit"
                            icon={<TerminalIcon />}
                            className="@2xl:w-full"
                            aria-haspopup={
                                create.disabled ? undefined : "dialog"
                            }
                            disabled={create.disabled}
                            onClick={() => create.onCreate(template.id)}
                        >
                            {create.label}
                        </Button>
                    )
                }
            >
                <SizeStats {...template} />
            </CatalogCard>
        ))}
    </div>
);
