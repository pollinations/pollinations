import {
    Button,
    ClockIcon,
    CopyField,
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

// An always-on sandbox runs about 720 hours a month.
const HOURS_PER_MONTH = 720;

const pollen = (amount: number) => `${Number(amount.toPrecision(2))} pollen`;
const gb = (mb: number) => Math.round(mb / 1024);
const hourly = (template: (typeof SANDBOX_TEMPLATES)[number]) =>
    perSecond(callerRates(template.provider), template) * 3600;
const shares = Object.values(SANDBOX_PROVIDERS).map(({ share }) => share);

// The launch promo's discount, from the provider that discounts least.
export const LAUNCH_DISCOUNT = Math.round((1 - Math.max(...shares)) * 100);
// The cheapest template's hourly price, for the page's footnote.
export const CHEAPEST_HOURLY = Math.min(...SANDBOX_TEMPLATES.map(hourly));

// Every sandbox template with its price; each Create starts a sandbox from
// it (or asks a signed-out visitor to sign in).
export const SandboxTemplateList: FC<{
    createLabel: string;
    disabled: boolean;
    onCreate: (template: string) => void;
}> = ({ createLabel, disabled, onCreate }) => (
    <div className="@container flex flex-col gap-3">
        {SANDBOX_TEMPLATES.map((template) => {
            const perHour = hourly(template);
            return (
                // Wide: Create beside the size, the command under both.
                // Narrow: size, price, command, then Create.
                <Surface
                    key={template.id}
                    className="grid gap-3 @md:grid-cols-[minmax(0,1fr)_auto]"
                >
                    <div className="flex min-w-0 flex-col gap-1">
                        {/* The size is the title: it is what people
                            compare, and it tells every template apart. */}
                        <span className="font-medium leading-tight text-theme-text-strong">
                            {template.cpuCount} vCPU ·{" "}
                            {template.memoryMB / 1024} GB memory ·{" "}
                            {gb(template.diskSizeMB)} GB disk
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-theme-text-muted">
                            <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>
                                <strong className="font-semibold text-theme-text-strong">
                                    {pollen(perHour)}
                                </strong>
                                /hour · {pollen(perHour * HOURS_PER_MONTH)}
                                /month always on
                            </span>
                        </span>
                    </div>
                    <CopyField
                        label={`Copy the command that creates a ${template.id} sandbox`}
                        value={`polli sandbox create ${template.id}`}
                        className="@md:col-span-2 @md:row-start-2"
                    />
                    <Button
                        type="button"
                        intent="commit"
                        icon={<TerminalIcon />}
                        aria-haspopup={disabled ? undefined : "dialog"}
                        disabled={disabled}
                        className="justify-self-start @md:col-start-2 @md:row-start-1"
                        onClick={() => onCreate(template.id)}
                    >
                        {createLabel}
                    </Button>
                </Surface>
            );
        })}
    </div>
);
