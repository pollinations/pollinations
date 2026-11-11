import {
    Button,
    ClockIcon,
    CopyField,
    Surface,
    TerminalIcon,
    WalletIcon,
} from "@pollinations/ui";
import {
    callerRates,
    perSecond,
    SANDBOX_PROVIDERS,
    SANDBOX_TEMPLATES,
    type SandboxProvider,
} from "@shared/registry/sandbox.ts";
import type { FC, ReactNode } from "react";
import { BalanceAccessChip } from "./models/model-status-chips.tsx";

// An always-on sandbox runs about 720 hours a month.
const HOURS_PER_MONTH = 720;

// The ledger's "Pollen" row names the unit, so values are bare numbers.
const amount = (value: number) => String(Number(value.toPrecision(2)));
const gb = (mb: number) => Math.round(mb / 1024);
const hourly = (template: (typeof SANDBOX_TEMPLATES)[number]) =>
    perSecond(callerRates(template.provider), template) * 3600;
const shares = Object.values(SANDBOX_PROVIDERS).map(({ share }) => share);

// The launch promo's discount, from the provider that discounts least.
export const LAUNCH_DISCOUNT = Math.round((1 - Math.max(...shares)) * 100);
// The cheapest template's hourly price, for the page's footnote.
export const CHEAPEST_HOURLY = Math.min(...SANDBOX_TEMPLATES.map(hourly));

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

// Every sandbox template with its price; each Create starts a sandbox from
// it (or asks a signed-out visitor to sign in). Like a Models list card: the
// provider and the size on the left, the price ledger on the right, then the
// two ways to start one, the polli command and Create.
export const SandboxTemplateList: FC<{
    createLabel: string;
    disabled: boolean;
    onCreate: (template: string) => void;
}> = ({ createLabel, disabled, onCreate }) => (
    <div className="@container flex flex-col gap-3">
        {SANDBOX_TEMPLATES.map((template) => {
            const perHour = hourly(template);
            return (
                <Surface key={template.id} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <ProviderLogo provider={template.provider} />
                            <span
                                aria-hidden="true"
                                className="h-10 w-px shrink-0 bg-divider"
                            />
                            <dl className="flex gap-6">
                                {[
                                    [String(template.cpuCount), "vCPU"],
                                    [
                                        `${template.memoryMB / 1024} GB`,
                                        "memory",
                                    ],
                                    [`${gb(template.diskSizeMB)} GB`, "disk"],
                                ].map(([value, label]) => (
                                    <div
                                        key={label}
                                        className="flex flex-col-reverse gap-0.5"
                                    >
                                        <dt className="text-xs text-theme-text-muted">
                                            {label}
                                        </dt>
                                        <dd className="text-lg font-semibold leading-none text-theme-text-strong">
                                            {value}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                        <div className="grid grid-cols-[6.5rem_auto_auto] gap-x-1 self-start @xl:ml-auto @xl:self-center">
                            <LedgerRow Icon={WalletIcon} label="Pollen">
                                <div className="col-span-2 flex">
                                    <BalanceAccessChip access="quest" />
                                </div>
                            </LedgerRow>
                            <LedgerRow Icon={ClockIcon} label="Per hour">
                                <span className="text-right text-sm font-semibold tabular-nums text-theme-text-strong">
                                    {amount(perHour)}
                                </span>
                                <span className="text-xs text-theme-text-muted">
                                    /hour
                                </span>
                            </LedgerRow>
                            <LedgerRow Icon={ClockIcon} label="Per month">
                                <span className="text-right text-xs tabular-nums text-theme-text-muted">
                                    {amount(perHour * HOURS_PER_MONTH)}
                                </span>
                                <span className="text-xs text-theme-text-muted">
                                    /month
                                </span>
                            </LedgerRow>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 @md:flex-row @md:items-center">
                        <CopyField
                            label={`Copy the command that creates a ${template.id} sandbox`}
                            value={`polli sandbox create ${template.id}`}
                            className="min-w-0 @md:flex-1"
                        />
                        <Button
                            type="button"
                            intent="commit"
                            icon={<TerminalIcon />}
                            aria-haspopup={disabled ? undefined : "dialog"}
                            disabled={disabled}
                            className="shrink-0 self-start @md:self-auto"
                            onClick={() => onCreate(template.id)}
                        >
                            {createLabel}
                        </Button>
                    </div>
                </Surface>
            );
        })}
    </div>
);
