import {
    ClockIcon,
    InlineLink,
    SparklesIcon,
    Surface,
    TerminalIcon,
} from "@pollinations/ui";
import {
    callerRates,
    perSecond,
    SANDBOX_PROVIDERS,
    SANDBOX_TEMPLATES,
} from "@shared/registry/sandbox.ts";
import type { FC } from "react";
import { genDocsUrl } from "../../config.ts";
import { CopyValue } from "./copy-value.tsx";

// An always-on sandbox runs about 720 hours a month.
const HOURS_PER_MONTH = 720;

const pollen = (amount: number) => `${Number(amount.toPrecision(2))} pollen`;
const gb = (mb: number) => Math.round(mb / 1024);
const shares = Object.values(SANDBOX_PROVIDERS).map(({ share }) => share);
// The launch promo's discount, from the provider that discounts least.
const launchDiscount = Math.round((1 - Math.max(...shares)) * 100);

export const SandboxTemplateList: FC<{ query: string }> = ({ query }) => {
    const normalizedQuery = query.trim().toLowerCase();
    const templates = SANDBOX_TEMPLATES.filter((template) =>
        [
            template.id,
            template.name,
            SANDBOX_PROVIDERS[template.provider].name,
        ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );

    if (templates.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-theme-text-muted">
                No sandbox templates match “{query.trim()}”.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="@container flex flex-col gap-3">
                {templates.map((template) => {
                    const hourly =
                        perSecond(callerRates(template.provider), template) *
                        3600;
                    const rows = [
                        ["Per hour", pollen(hourly)],
                        [
                            "Always on",
                            `${pollen(hourly * HOURS_PER_MONTH)}/month`,
                        ],
                    ];
                    return (
                        <Surface
                            key={template.id}
                            className="[--sandbox-card-gap:0.625rem] transition-colors hover:bg-surface-opaque/90 @2xl:flex @2xl:items-center"
                        >
                            <div className="flex items-center gap-[var(--sandbox-card-gap)] @2xl:min-w-0 @2xl:flex-1">
                                <TerminalIcon className="h-8 w-8 shrink-0 text-ink-900 opacity-55" />
                                <span
                                    aria-hidden="true"
                                    className="h-10 w-px shrink-0 bg-divider"
                                />
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <span className="text-sm font-medium leading-tight text-theme-text-strong @2xl:text-base">
                                        {template.name}{" "}
                                        <span className="font-normal text-theme-text-muted">
                                            on{" "}
                                            {
                                                SANDBOX_PROVIDERS[
                                                    template.provider
                                                ].name
                                            }
                                        </span>
                                    </span>
                                    <p className="text-sm text-theme-text-muted">
                                        {template.cpuCount} vCPU ·{" "}
                                        {template.memoryMB / 1024} GB memory ·{" "}
                                        {gb(template.diskSizeMB)} GB disk
                                    </p>
                                    <CopyValue
                                        value={`polli sandbox create ${template.id}`}
                                        label={`Copy the command that creates a ${template.id} sandbox`}
                                    />
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 @2xl:mt-0 @2xl:w-[clamp(240px,calc(28%_-_8px),300px)] @2xl:shrink-0 @2xl:pl-3">
                                {rows.map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="col-span-full grid grid-cols-subgrid items-center py-0.5"
                                    >
                                        <span className="grid grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-1.5 text-xs text-theme-text-muted">
                                            <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                                            <span className="truncate whitespace-nowrap">
                                                {label}
                                            </span>
                                        </span>
                                        <span className="whitespace-nowrap text-sm font-semibold text-theme-text-strong">
                                            {value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Surface>
                    );
                })}
            </div>
            <div className="space-y-2 px-1 text-[13px] leading-snug text-theme-text-muted">
                {launchDiscount > 0 && (
                    <p className="flex items-start gap-1.5">
                        <SparklesIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>Launch price: {launchDiscount}% off.</span>
                    </p>
                )}
                <p className="flex items-start gap-1.5">
                    <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                        Paid 10 minutes at a time while running; paused
                        sandboxes cost nothing. Create one on the{" "}
                        <InlineLink href="/sandboxes">
                            Sandboxes page
                        </InlineLink>{" "}
                        or with polli. See the{" "}
                        <InlineLink href={genDocsUrl("#tag/sandboxes")}>
                            Sandboxes docs
                        </InlineLink>
                    </span>
                </p>
            </div>
        </div>
    );
};
