import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/util.ts";
import { ModalityButton } from "../api-keys/modality-button.tsx";
import { MODALITY_COLORS, type Modality } from "../api-keys/modality-ui.ts";
import { Button } from "../button.tsx";
import { type ThemeName, themes } from "../layout/dashboard-theme.ts";
import { Chip } from "../ui/chip.tsx";
import { IconButton } from "../ui/icon-button.tsx";
import { InfoTip } from "../ui/info-tip.tsx";
import { Input } from "../ui/input.tsx";
import { Surface } from "../ui/surface.tsx";
import { Switch, type SwitchStatus } from "../ui/switch.tsx";
import { TabButton } from "../ui/tab-button.tsx";
import { Tooltip } from "../ui/tooltip.tsx";
import { Chart } from "../usage-analytics/chart.tsx";
import { MultiSelect } from "../usage-analytics/multi-select.tsx";
import type { DataPoint } from "../usage-analytics/types.ts";

type Mode = "light" | "dark";

/**
 * /internal/design — dev-only design system showcase.
 *
 * Single source of truth for the design tokens (Colors section) and a
 * compact reference of each primitive. Use the header toggles to preview
 * any theme + mode combination — every section inherits from the page
 * `data-theme` cascade.
 *
 * Gated to DEV in `routes/internal.design.tsx`.
 */
export const DesignShowcase: FC = () => {
    const [mode, setMode] = useState<Mode>(() =>
        document.documentElement.dataset.mode === "dark" ? "dark" : "light",
    );
    const [themeOverride, setThemeOverride] = useState<ThemeName>("amber");

    useEffect(() => {
        document.documentElement.dataset.mode = mode;
    }, [mode]);

    useEffect(() => {
        document.documentElement.classList.add("dashboard-shell");
        document.body.classList.add("dashboard-shell");
        return () => {
            document.documentElement.classList.remove("dashboard-shell");
            document.body.classList.remove("dashboard-shell");
        };
    }, []);

    return (
        <div
            data-theme={themeOverride}
            className="h-dvh overflow-y-auto bg-theme-bg-subtle text-theme-text-base"
        >
            <Header
                mode={mode}
                onModeChange={setMode}
                themeOverride={themeOverride}
                onThemeOverrideChange={setThemeOverride}
            />
            <div className="mx-auto flex max-w-[960px] flex-col gap-10 px-6 pt-8 pb-10">
                <ColorsSection theme={themeOverride} />
                <TypographyDemo />
                <ChipsDemo />
                <ButtonsDemo />
                <SwitchesDemo />
                <SurfacesDemo />
                <TabsDemo />
                <InputsDemo />
                <IconButtonsDemo />
                <TooltipsDemo />
                <MultiSelectDemo theme={themeOverride} />
                <ChartDemo />
            </div>
        </div>
    );
};

// ─── Header ─────────────────────────────────────────────────

type HeaderProps = {
    mode: Mode;
    onModeChange: (mode: Mode) => void;
    themeOverride: ThemeName;
    onThemeOverrideChange: (theme: ThemeName) => void;
};

const Header: FC<HeaderProps> = ({
    mode,
    onModeChange,
    themeOverride,
    onThemeOverrideChange,
}) => (
    <header className="sticky top-0 z-10 border-b border-theme-border bg-theme-bg-subtle/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
                <h1 className="font-heading text-2xl text-theme-text-strong">
                    Design Showcase
                </h1>
                <p className="text-xs text-theme-text-soft">
                    Single reference. Flip mode + theme to preview every state.
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-6">
                <ToggleGroup
                    label="Mode"
                    value={mode}
                    options={["light", "dark"]}
                    onChange={onModeChange}
                />
                <ToggleGroup
                    label="Theme"
                    value={themeOverride}
                    options={themes}
                    onChange={onThemeOverrideChange}
                />
            </div>
        </div>
    </header>
);

type ToggleGroupProps<T extends string> = {
    label: string;
    value: T;
    options: readonly T[];
    onChange: (value: T) => void;
};

function ToggleGroup<T extends string>({
    label,
    value,
    options,
    onChange,
}: ToggleGroupProps<T>): ReactNode {
    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-theme-text-strong">
                {label}
            </span>
            <div className="flex flex-wrap gap-1 rounded-full border border-theme-border bg-theme-bg-tinted p-1">
                {options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                            value === option
                                ? "bg-theme-chip-bg text-theme-chip-text"
                                : "text-theme-text-soft hover:bg-theme-bg-hover",
                        )}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Colors (the one source of truth) ───────────────────────

type ColorRow = {
    name: string;
    /** Either a Tailwind utility class for bg, or a raw `var(--name)` CSS expression. */
    swatch: string;
    /** Optional foreground utility — used when the swatch displays sample text. */
    fg?: string;
};

const themeBackgroundRows: readonly ColorRow[] = [
    { name: "bg-idle", swatch: "bg-theme-bg-idle" },
    { name: "bg-subtle", swatch: "bg-theme-bg-subtle" },
    { name: "bg-tinted", swatch: "bg-theme-bg-tinted" },
    { name: "bg-pale", swatch: "bg-theme-bg-pale" },
    { name: "bg-surface", swatch: "bg-theme-bg-surface" },
    { name: "bg-active", swatch: "bg-theme-bg-active" },
    { name: "bg-hover", swatch: "bg-theme-bg-hover" },
    { name: "bg-hover-soft", swatch: "bg-theme-bg-hover-soft" },
    { name: "bg-hover-faint", swatch: "bg-theme-bg-hover-faint" },
];

const themeBorderRows: readonly ColorRow[] = [
    { name: "border", swatch: "bg-theme-border" },
];

const themeIdentityRows: readonly ColorRow[] = [
    { name: "chip-bg", swatch: "bg-theme-chip-bg" },
    { name: "accent", swatch: "bg-theme-accent" },
    { name: "ring-focus", swatch: "bg-theme-ring-focus" },
];

const themeButtonRows: readonly ColorRow[] = [
    { name: "button-light-bg", swatch: "bg-theme-button-light-bg" },
    { name: "button-light-text", swatch: "bg-theme-button-light-text" },
    { name: "button-light-hover", swatch: "bg-theme-button-light-hover" },
];

const walletRows: readonly ColorRow[] = [
    { name: "paid-pale", swatch: "bg-paid-pale" },
    { name: "paid-soft", swatch: "bg-paid-soft" },
    { name: "paid-deep", swatch: "bg-paid-deep" },
    { name: "tier-pale", swatch: "bg-tier-pale" },
    { name: "tier-soft", swatch: "bg-tier-soft" },
    { name: "tier-deep", swatch: "bg-tier-deep" },
];

const universalRows: readonly ColorRow[] = [
    { name: "surface-white", swatch: "bg-surface-white" },
];

const ColorsSection: FC<{ theme: ThemeName }> = ({ theme }) => (
    <Section
        title="Colors"
        caption={`Every theme token in the system, grouped by role. Active theme: ${theme}. Text colors live in the Typography section.`}
    >
        <div className="flex flex-col gap-6">
            <ColorGroup label="Backgrounds" rows={themeBackgroundRows} />
            <ColorGroup label="Borders" rows={themeBorderRows} />
            <ColorGroup
                label="Identity (chip / accent / focus)"
                rows={themeIdentityRows}
            />
            <ColorGroup label="Button (light variant)" rows={themeButtonRows} />
            <ColorGroup label="Wallet" rows={walletRows} />
            <ColorGroup label="Universal" rows={universalRows} />
        </div>
    </Section>
);

const ColorGroup: FC<{ label: string; rows: readonly ColorRow[] }> = ({
    label,
    rows,
}) => (
    <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-theme-text-strong">
            {label}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((row) => (
                <Swatch key={row.name} row={row} />
            ))}
        </div>
    </div>
);

const Swatch: FC<{ row: ColorRow }> = ({ row }) => (
    <div className="flex items-center gap-2">
        <span
            className={cn(
                "h-5 w-5 shrink-0 rounded border border-theme-border",
                row.swatch,
            )}
        />
        <div className="flex min-w-0 flex-col">
            <code className="truncate text-xs font-mono text-theme-text-strong">
                {row.name}
            </code>
            <Computed cls={row.swatch} />
        </div>
    </div>
);

/**
 * Reads the computed background-color of a 1×1 hidden span carrying the
 * given Tailwind class, then prints the resolved value (oklch / rgb).
 * Falls back to a dash if the class doesn't resolve.
 */
const Computed: FC<{ cls: string | null | undefined }> = ({ cls }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const [value, setValue] = useState<string>("");

    useEffect(() => {
        if (!cls || !ref.current) return;
        const computed = getComputedStyle(ref.current).backgroundColor;
        setValue(computed || "");
    }, [cls]);

    if (!cls) return <span className="text-xs text-theme-text-soft/60">—</span>;
    return (
        <>
            <span
                ref={ref}
                aria-hidden
                className={cn("absolute h-px w-px opacity-0", cls)}
            />
            <code className="truncate text-xs font-mono text-theme-text-soft/60">
                {value || "…"}
            </code>
        </>
    );
};

// ─── Typography ─────────────────────────────────────────────

type TypeRow = {
    utility: string;
    px: string;
    /** Where this size is actually used in the app. Empty = step exists but no live callsite. */
    purpose: string;
    offScale?: boolean;
};

const typeRamp: readonly TypeRow[] = [
    {
        utility: "text-5xl",
        px: "48px",
        purpose: "Pollen balance (sm:) · error emoji",
    },
    {
        utility: "text-4xl",
        px: "36px",
        purpose: "Pollen balance · authorize emoji",
    },
    {
        utility: "text-3xl",
        px: "30px",
        purpose: "Tier card name · error h1 · pollen balance (sm:)",
    },
    {
        utility: "text-2xl",
        px: "24px",
        purpose: "Page h1 · big stat numbers (usage / earnings) · code input",
    },
    {
        utility: "text-xl",
        px: "20px",
        purpose: "Section heading (sm:) · dialog title",
    },
    {
        utility: "text-lg",
        px: "18px",
        purpose: "Section heading · FAQ h2",
    },
    { utility: "text-base", px: "16px", purpose: "Body default" },
    {
        utility: "text-sm",
        px: "14px",
        purpose: "UI text · controls · labels · dashboard nav",
    },
    {
        utility: "text-xs",
        px: "12px",
        purpose: "Meta · chip labels · captions · fine print",
    },
    {
        utility: "text-micro",
        px: "10px",
        purpose:
            "Stat labels · chart ticks · status pills · InfoTip badge · sidebar meta",
        offScale: true,
    },
] as const;

const textColorRows: readonly {
    name: string;
    cls: string;
    purpose: string;
}[] = [
    {
        name: "text-strong",
        cls: "text-theme-text-strong",
        purpose: "Headings · emphatic body · stat numbers",
    },
    {
        name: "text-base",
        cls: "text-theme-text-base",
        purpose: "Body default",
    },
    {
        name: "text-soft",
        cls: "text-theme-text-soft",
        purpose: "Secondary · captions · meta",
    },
];

const TypographyDemo: FC = () => (
    <Section
        title="Typography"
        caption="font-heading = LCT Mogi (h1) · font-subheading = Fraunces (h2-h3) · font-body = Uncut Sans (h4-h6 + body). Sizes and colors below both react to the active page theme — flip the toggle to preview."
    >
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-6">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                    Color (theme cascade)
                </div>
                <p className="mb-3 text-xs text-theme-text-soft/80">
                    Three semantic text colors. For finer tones use opacity
                    modifiers (e.g.{" "}
                    <code className="font-mono">text-theme-text-soft/60</code>).
                </p>
                <div className="flex flex-col gap-2">
                    {textColorRows.map((row) => (
                        <div
                            key={row.name}
                            className="flex items-baseline gap-4 border-b border-theme-border pb-2 last:border-b-0 last:pb-0"
                        >
                            <span
                                className={cn(
                                    "w-32 shrink-0 truncate font-body text-lg",
                                    row.cls,
                                )}
                            >
                                The quick brown fox
                            </span>
                            <code className="w-32 shrink-0 text-xs font-mono text-theme-text-strong">
                                {row.name}
                            </code>
                            <span className="min-w-0 flex-1 text-xs text-theme-text-soft/60">
                                {row.purpose}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-6">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                    Size ramp
                </div>
                <div className="flex flex-col gap-2">
                    {typeRamp.map((row) => (
                        <div
                            key={row.utility}
                            className="flex items-baseline gap-4 border-b border-theme-border pb-2 last:border-b-0 last:pb-0"
                        >
                            <span
                                className={cn(
                                    row.utility,
                                    "w-32 shrink-0 truncate font-body text-theme-text-strong",
                                )}
                            >
                                Aa
                            </span>
                            <code className="w-24 shrink-0 text-xs font-mono text-theme-text-strong">
                                {row.utility}
                            </code>
                            <span className="w-12 shrink-0 text-xs font-mono text-theme-text-soft">
                                {row.px}
                            </span>
                            <span className="min-w-0 flex-1 text-xs text-theme-text-soft/60">
                                {row.purpose}
                            </span>
                            {row.offScale && (
                                <span className="shrink-0 rounded-md bg-theme-bg-tinted px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-theme-text-soft">
                                    off-scale
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </Section>
);

// ─── Chips ──────────────────────────────────────────────────

const ChipsDemo: FC = () => (
    <Section
        title="Chips"
        caption="Default chip inherits the active page theme. Five intent chips: news/alpha tag models (uppercase); paid/tier tag pollen balances (also drive activity/usage identity chips, with emoji prefix); neutral is a bordered gray container for emoji icons (modalities + capabilities on pricing rows). Status pattern: theme=green for permissive/on, theme=amber for partial/restricted, gray override for off. Theme overrides also drive count badges (e.g. +1 redirect)."
    >
        <div className="flex flex-col gap-3">
            <ChipRow label="Default (theme)">
                <Chip>Theme</Chip>
            </ChipRow>
            <ChipRow label="Model labels">
                <Chip intent="news">NEW</Chip>
                <Chip intent="alpha">ALPHA</Chip>
                <Chip intent="paid">PAID</Chip>
            </ChipRow>
            <ChipRow label="Balance identity (activity / usage)">
                <Chip intent="paid">💳 Paid</Chip>
                <Chip intent="tier">🌱 Tier</Chip>
            </ChipRow>
            <ChipRow label="Neutral (icon container)">
                <Chip intent="neutral" size="sm">
                    💬👁️🎬
                </Chip>
                <Chip intent="neutral" size="sm">
                    🔧📎
                </Chip>
            </ChipRow>
            <ChipRow label="Status (permissive / partial / off)">
                <Chip theme="green" size="sm">
                    All
                </Chip>
                <Chip theme="amber" size="sm">
                    82
                </Chip>
                <Chip theme="green" size="sm">
                    Earnings on
                </Chip>
                <Chip size="sm" className="bg-gray-100 text-gray-500">
                    Earnings off
                </Chip>
                <Chip theme="blue" size="sm">
                    +1
                </Chip>
            </ChipRow>
            <ChipRow label="Modalities">
                {modalityList.map((m) => (
                    <Chip key={m} className={MODALITY_COLORS[m].filled}>
                        {m[0].toUpperCase() + m.slice(1)}
                    </Chip>
                ))}
            </ChipRow>
        </div>
    </Section>
);

const ChipRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-tinted p-3">
        <span className="w-40 text-xs uppercase tracking-wide text-theme-text-strong">
            {label}
        </span>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
);

const modalityList: readonly Modality[] = [
    "text",
    "image",
    "video",
    "audio",
    "embedding",
] as const;

// ─── Buttons ────────────────────────────────────────────────

const ButtonsDemo: FC = () => (
    <Section
        title="Buttons"
        caption="Soft tile + deep text. Inherits the active theme; intent='danger' overrides destructive actions. Modality buttons (interactive model picker) share the same rounded-full shape, with per-modality hues for identity."
    >
        <div className="flex flex-col gap-3">
            <ChipRow label="Theme + intent">
                <Button>Default</Button>
                <Button disabled>Disabled</Button>
                <Button intent="danger">Delete</Button>
            </ChipRow>
            <ChipRow label="Modalities (interactive)">
                {modalityList.map((m) => (
                    <ModalityButton key={m} category={m}>
                        {m[0].toUpperCase() + m.slice(1)}
                    </ModalityButton>
                ))}
            </ChipRow>
        </div>
    </Section>
);

// ─── Switch ─────────────────────────────────────────────────

const switchStatuses: readonly SwitchStatus[] = ["off", "on", "draft"] as const;

const SwitchesDemo: FC = () => {
    const [checked, setChecked] = useState<Record<SwitchStatus, boolean>>({
        off: false,
        on: true,
        draft: true,
    });
    return (
        <Section
            title="Switch"
            caption="Theme-independent. White-ish off, green on, red draft (for incomplete or failing state)."
        >
            <div className="flex flex-wrap items-center gap-6 rounded-xl border border-theme-border bg-theme-bg-tinted p-4">
                {switchStatuses.map((status) => (
                    <div
                        key={status}
                        className="flex flex-col items-start gap-1.5"
                    >
                        <span className="text-xs uppercase tracking-wide text-theme-text-strong">
                            {status}
                        </span>
                        <Switch
                            checked={checked[status]}
                            status={status}
                            onChange={(next) =>
                                setChecked((prev) => ({
                                    ...prev,
                                    [status]: next,
                                }))
                            }
                            ariaLabel={status}
                        />
                    </div>
                ))}
            </div>
        </Section>
    );
};

// ─── Surfaces ───────────────────────────────────────────────

const SurfacesDemo: FC = () => (
    <Section
        title="Surface"
        caption="Three theme-aware roles + wallet surfaces. Panel is the outer bordered container; card is the white inner block; card-themed is a borderless theme-tinted inner block (pinned news, earnings callout). Wallet surfaces use bg-paid-pale / bg-tier-pale for paid + tier identity (wallet cards, tier explanation)."
    >
        <div className="flex flex-col gap-4">
            <Surface variant="panel">
                <p className="mb-3 text-xs font-mono uppercase tracking-wide text-theme-text-soft/60">
                    outer · panel
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Surface>
                        <p className="text-xs font-mono uppercase tracking-wide text-theme-text-strong">
                            inner · card
                        </p>
                        <p className="mt-1 text-sm text-theme-text-soft">
                            Default. White, no border.
                        </p>
                    </Surface>
                    <Surface variant="card-themed">
                        <p className="text-xs font-mono uppercase tracking-wide text-theme-text-strong">
                            inner · card-themed
                        </p>
                        <p className="mt-1 text-sm text-theme-text-strong">
                            Theme-tinted callout.
                        </p>
                    </Surface>
                </div>
            </Surface>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-paid-pale p-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-paid-deep/70">
                        wallet · paid
                    </p>
                    <p className="mt-1 text-sm text-paid-deep">
                        bg-paid-pale — paid wallet card.
                    </p>
                </div>
                <div className="rounded-xl bg-tier-pale p-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-tier-deep/70">
                        wallet · tier
                    </p>
                    <p className="mt-1 text-sm text-tier-deep">
                        bg-tier-pale — tier wallet card + active tier explainer.
                    </p>
                </div>
                <div className="rounded-xl bg-tier-pale/40 p-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-tier-deep/70">
                        tier · other
                    </p>
                    <p className="mt-1 text-sm text-tier-deep">
                        bg-tier-pale/40 — non-current tiers in the explainer.
                    </p>
                </div>
            </div>
        </div>
    </Section>
);

// ─── Tabs ───────────────────────────────────────────────────

const TabsDemo: FC = () => {
    const [segmentActive, setSegmentActive] = useState("day");
    const [pillActive, setPillActive] = useState("image");
    const segmentOptions = ["day", "week", "month"] as const;
    const pillOptions = [
        "image",
        "video",
        "audio",
        "text",
        "embedding",
    ] as const;
    return (
        <Section
            title="Tabs"
            caption="Two tab styles. Segment = connected pill with internal dividers (date selector). Pills = separate bold pills (model selector)."
        >
            <div className="flex flex-col gap-4 rounded-xl border border-theme-border bg-theme-bg-tinted p-4">
                <Field label="segment · activity date selector">
                    <div className="flex items-stretch [&>button]:rounded-none [&>button]:border-l-0 [&>button:first-child]:rounded-l-full [&>button:first-child]:border-l [&>button:last-child]:rounded-r-full">
                        {segmentOptions.map((option) => (
                            <TabButton
                                key={option}
                                active={segmentActive === option}
                                onClick={() => setSegmentActive(option)}
                                className="px-4 pt-1.5 pb-2 text-base leading-normal min-h-0 capitalize"
                            >
                                {option}
                            </TabButton>
                        ))}
                    </div>
                </Field>
                <Field label="pills · model selector">
                    <div className="flex flex-wrap gap-1.5">
                        {pillOptions.map((option) => (
                            <TabButton
                                key={option}
                                active={pillActive === option}
                                onClick={() => setPillActive(option)}
                                className="px-4 pt-1.5 pb-2 text-base"
                            >
                                <span className="font-bold capitalize">
                                    {option}
                                </span>
                            </TabButton>
                        ))}
                    </div>
                </Field>
            </div>
        </Section>
    );
};

// ─── Inputs ─────────────────────────────────────────────────

const InputsDemo: FC = () => (
    <Section
        title="Input"
        caption="Focus ring inherits the active theme. Click into a field to see it."
    >
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-theme-border bg-theme-bg-tinted p-4 sm:grid-cols-3">
            <Field label="default">
                <Input placeholder="Default" />
            </Field>
            <Field label="error">
                <Input placeholder="Error" error />
            </Field>
            <Field label="disabled">
                <Input placeholder="Disabled" disabled />
            </Field>
        </div>
    </Section>
);

const Field: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-theme-text-strong">
            {label}
        </span>
        {children}
    </div>
);

// ─── IconButtons ────────────────────────────────────────────

const IconButtonsDemo: FC = () => (
    <Section
        title="IconButton"
        caption="Two real-world variants. Edit follows the page theme; delete is always danger-red."
    >
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-theme-border bg-theme-bg-tinted p-4">
            <Field label="edit · theme">
                <IconButton title="Edit" onClick={() => {}}>
                    ✎
                </IconButton>
            </Field>
            <Field label="delete · danger">
                <IconButton
                    intent="danger"
                    title="Delete"
                    onClick={() => {}}
                    className="text-lg"
                >
                    ×
                </IconButton>
            </Field>
        </div>
    </Section>
);

// ─── Tooltips ───────────────────────────────────────────────

/**
 * One tooltip recipe across the whole app:
 *  - Thin dark pill: `bg-gray-900 text-white text-xs px-2 py-1 rounded-md`
 *  - No white background, no border
 *  - `cursor-help` (the "?" cursor) on every trigger
 *
 * Two trigger components share that recipe:
 *  - <InfoTip>: visible "i" badge (the badge follows the page theme)
 *  - <Tooltip>: invisible wrapper around any child
 *
 * Hover any row below to verify the cursor swaps and the popup is
 * always the same dark pill.
 */
const TooltipsDemo: FC = () => (
    <Section
        title="Tooltips"
        caption="One recipe everywhere. Thin dark popup, cursor-help on every trigger. Two trigger types (info badge + mouseover wrapper) cover every hoverable info element in the app."
    >
        <div className="flex flex-col gap-4 rounded-xl border border-theme-border bg-theme-bg-tinted p-4">
            <TooltipRow label="Info badge">
                <span className="inline-flex items-center text-sm text-theme-text-strong">
                    Paid balance
                    <InfoTip content="Pollen you bought + earnings from paid-side spend. Used for paid-only models." />
                </span>
                <span className="text-xs text-theme-text-soft">
                    &lt;InfoTip&gt; — visible "i" bubble. Theme-cascade badge.
                </span>
            </TooltipRow>

            <TooltipRow label="Mouseover · chip">
                <Tooltip content="3,420 requests" displayContents>
                    <Chip intent="paid" size="lg" className="font-semibold">
                        💳 12,304
                    </Chip>
                </Tooltip>
                <span className="text-xs text-theme-text-soft">
                    &lt;Tooltip&gt; wrapping a chip. Hover the chip to reveal.
                </span>
            </TooltipRow>

            <TooltipRow label="Mouseover · button">
                <Tooltip
                    content="Open the Stripe checkout to buy $20"
                    displayContents
                >
                    <Button>Buy</Button>
                </Tooltip>
                <span className="text-xs text-theme-text-soft">
                    Wrapping any clickable. Click works through.
                </span>
            </TooltipRow>

            <TooltipRow label="Mouseover · inline text">
                <span className="text-sm text-theme-text-strong">
                    Includes{" "}
                    <Tooltip
                        content="7+ developer points = published apps, contributions, or community standing"
                        triggerAs="span"
                    >
                        <span className="underline decoration-dotted">
                            7+ dev points
                        </span>
                    </Tooltip>{" "}
                    to qualify.
                </span>
                <span className="text-xs text-theme-text-soft">
                    Inline trigger with dotted underline + cursor-help.
                </span>
            </TooltipRow>

            <TooltipRow label="Mouseover · click action">
                <Tooltip
                    content="Click to copy"
                    onClick={() => {}}
                    displayContents
                >
                    <Chip size="lg" className="font-mono">
                        sk_test_abc...123
                    </Chip>
                </Tooltip>
                <span className="text-xs text-theme-text-soft">
                    Same recipe, plus `onClick` for copy-to-clipboard patterns.
                </span>
            </TooltipRow>
        </div>
    </Section>
);

const TooltipRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-subtle p-3">
        <span className="w-44 shrink-0 text-xs uppercase tracking-wide text-theme-text-strong">
            {label}
        </span>
        <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
);

// ─── Helpers ────────────────────────────────────────────────

type SectionProps = {
    title: string;
    caption?: string;
    children: ReactNode;
};

const Section: FC<SectionProps> = ({ title, caption, children }) => (
    <section className="flex flex-col gap-3">
        <div>
            <h2 className="font-subheading text-2xl text-theme-text-strong">
                {title}
            </h2>
            {caption && (
                <p className="text-sm text-theme-text-soft">{caption}</p>
            )}
        </div>
        {children}
    </section>
);

// ─── MultiSelect (dropdown for picking models / apps) ──────

// Long enough to overflow the dropdown's max height and show the
// scrollbar — that's what we want documented here.
const sampleModels: readonly { value: string; label: string }[] = [
    { value: "flux", label: "Flux" },
    { value: "klein", label: "Klein" },
    { value: "sana", label: "Sana" },
    { value: "z-image", label: "Z-Image" },
    { value: "seedance", label: "Seedance" },
    { value: "ltx-2", label: "LTX-2" },
    { value: "wan", label: "Wan" },
    { value: "veo", label: "Veo" },
    { value: "openai", label: "OpenAI" },
    { value: "openai-large", label: "OpenAI Large" },
    { value: "claude", label: "Claude" },
    { value: "deepseek", label: "DeepSeek" },
    { value: "mistral", label: "Mistral" },
    { value: "gemini", label: "Gemini" },
    { value: "perplexity", label: "Perplexity" },
    { value: "nomnom", label: "Nomnom" },
    { value: "elevenlabs", label: "ElevenLabs" },
    { value: "embedding-3", label: "Embedding 3" },
] as const;

const MultiSelectDemo: FC<{ theme: ThemeName }> = ({ theme }) => {
    const [selected, setSelected] = useState<string[]>([]);
    return (
        <Section
            title="MultiSelect"
            caption="Dropdown menu for picking multiple models or apps (used by the Activity page filters). Open it to see the scroll behaviour with many options."
        >
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-tinted p-4">
                <MultiSelect
                    options={[...sampleModels]}
                    selected={selected}
                    onChange={setSelected}
                    placeholder="All"
                    align="start"
                    label="Models"
                    theme={theme}
                />
            </div>
        </Section>
    );
};

// ─── Chart (stacked paid + tier bars) ───────────────────────

function buildSampleChartData(): DataPoint[] {
    const baseDate = new Date(2026, 4, 1);
    const tiers = [120, 210, 80, 340, 290, 410, 180];
    const paids = [40, 80, 30, 160, 120, 220, 90];
    const labels = [
        "May 1",
        "May 2",
        "May 3",
        "May 4",
        "May 5",
        "May 6",
        "May 7",
    ];
    return labels.map((label, i) => {
        const ts = new Date(baseDate);
        ts.setDate(baseDate.getDate() + i);
        return {
            label,
            value: tiers[i] + paids[i],
            tierValue: tiers[i],
            paidValue: paids[i],
            timestamp: ts,
            fullDate: ts.toISOString().slice(0, 10),
        };
    });
}

const ChartDemo: FC = () => (
    <Section
        title="Chart"
        caption="Stacked bar chart used by the Activity page. Bars render in the paid-soft + tier-soft chip colors so the chart and chips read as the same identity."
    >
        <div className="rounded-xl border border-theme-border bg-theme-bg-tinted p-4">
            <Chart
                data={buildSampleChartData()}
                metric="pollen"
                showModelBreakdown={false}
            />
        </div>
    </Section>
);
