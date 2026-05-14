import { type FC, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/util.ts";
import { Chart } from "../activity/chart.tsx";
import { MultiSelect } from "../activity/multi-select.tsx";
import type { DataPoint } from "../activity/types.ts";
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

type Mode = "light" | "dark";

/**
 * /internal/design — dev-only design system showcase.
 *
 * Each section documents one primitive in context. Every theme token is
 * surfaced through its primitive — there is no separate token catalog.
 * Use the header toggles to preview any theme + mode combination.
 *
 * Gated to DEV in `routes/internal.design.tsx`.
 */
export const DesignShowcase: FC = () => {
    const [mode, setMode] = useState<Mode>(() =>
        document.documentElement.dataset.mode === "dark" ? "dark" : "light",
    );
    const [themeOverride, setThemeOverride] = useState<ThemeName>("amber");

    // Capture the mode that was on <html> before this page mounted, then
    // restore it on unmount — otherwise navigating away leaves the rest of
    // the app stuck in whatever mode the showcase toggle was last set to.
    useEffect(() => {
        const prev = document.documentElement.dataset.mode;
        return () => {
            if (prev === undefined) {
                document.documentElement.removeAttribute("data-mode");
            } else {
                document.documentElement.dataset.mode = prev;
            }
        };
    }, []);

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
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => (
                    <TabButton
                        key={option}
                        active={value === option}
                        onClick={() => onChange(option)}
                    >
                        <span className="capitalize">{option}</span>
                    </TabButton>
                ))}
            </div>
        </div>
    );
}

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

type TextColorRow = {
    name: string;
    cls: string;
    purpose: string;
    /** When true, this color is theme-independent (fixed semantic color). */
    semantic?: boolean;
};

const textColorRows: readonly TextColorRow[] = [
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
    {
        name: "text-green-700",
        cls: "text-green-700",
        purpose: "Earnings delta (wallet + drawer · positive)",
        semantic: true,
    },
];

type FontRow = {
    utility: string;
    family: string;
    purpose: string;
};

const fontRows: readonly FontRow[] = [
    { utility: "font-heading", family: "LCT Mogi", purpose: "h1 only" },
    {
        utility: "font-subheading",
        family: "Fraunces",
        purpose: "h2 · h3 (tracking-tight)",
    },
    {
        utility: "font-body",
        family: "Uncut Sans",
        purpose: "h4–h6 · body · all UI",
    },
];

const TypographyDemo: FC = () => (
    <Section
        title="Typography"
        caption="Three font families + three text colors + ten sizes. Sizes and colors react to the active theme; fonts are global."
    >
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-6">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                    Fonts
                </div>
                <div className="flex flex-col gap-2">
                    {fontRows.map((row) => (
                        <div
                            key={row.utility}
                            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-theme-border pb-2 last:border-b-0 last:pb-0"
                        >
                            <span
                                className={cn(
                                    "w-48 shrink-0 truncate text-2xl text-theme-text-strong",
                                    row.utility,
                                    row.utility === "font-subheading" &&
                                        "tracking-tight",
                                )}
                            >
                                The quick brown fox
                            </span>
                            <code className="w-32 shrink-0 text-xs font-mono text-theme-text-strong">
                                {row.utility}
                            </code>
                            <span className="w-28 shrink-0 text-xs text-theme-text-soft">
                                {row.family}
                            </span>
                            <span className="min-w-0 flex-1 text-xs text-theme-text-soft/60">
                                {row.purpose}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
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
                            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-theme-border pb-2 last:border-b-0 last:pb-0"
                        >
                            <span
                                className={cn(
                                    "w-32 shrink-0 truncate font-body text-lg",
                                    row.cls,
                                    row.semantic && "font-bold tabular-nums",
                                )}
                            >
                                {row.semantic
                                    ? "+1842.7"
                                    : "The quick brown fox"}
                            </span>
                            <code className="w-32 shrink-0 text-xs font-mono text-theme-text-strong">
                                {row.name}
                            </code>
                            <span className="min-w-0 flex-1 text-xs text-theme-text-soft/60">
                                {row.purpose}
                            </span>
                            {row.semantic && (
                                <span className="shrink-0 rounded-md bg-theme-bg-subtle px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-theme-text-soft">
                                    semantic
                                </span>
                            )}
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
                            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-theme-border pb-2 last:border-b-0 last:pb-0"
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
                                <span className="shrink-0 rounded-md bg-theme-bg-subtle px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wide text-theme-text-soft">
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
        caption="Default chip inherits the active page theme (bg-active + text-strong). Five intent chips: news/alpha tag models (uppercase); paid/tier tag pollen balances (also drive activity/usage identity chips, with emoji prefix); neutral is a bordered gray container for emoji icons (modalities + capabilities on pricing rows). Status pattern: theme=green for permissive/on, theme=amber for partial/restricted, gray override for off. Theme overrides also drive count badges (e.g. +1 redirect)."
    >
        <div className="flex flex-col gap-3">
            <ChipRow label="Default · bg-active + text-strong">
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
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-subtle p-3">
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
        caption="Soft tile + deep text. Default uses bg-active + text-base (same shade family as chips); hover: bg-hover. Inherits the active theme; intent='danger' overrides destructive actions. Modality buttons (interactive model picker) share the same rounded-full shape, with per-modality hues for identity."
    >
        <div className="flex flex-col gap-3">
            <ChipRow label="Default · bg-active + text-base">
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
            <div className="flex flex-wrap items-center gap-6 rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
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
        caption="Every theme + wallet surface token, shown in its actual use. Theme surfaces (panel, card-themed) recolor with the page theme; surface-white and the wallet/tier surfaces are intentionally fixed."
    >
        <div className="flex flex-col gap-4">
            <Surface variant="panel">
                <p className="mb-3 text-xs font-mono uppercase tracking-wide text-theme-text-soft/60">
                    outer · panel ·{" "}
                    <span className="text-theme-text-strong">
                        bg-theme-bg-subtle + border-theme-border
                    </span>
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Surface>
                        <p className="text-xs font-mono uppercase tracking-wide text-theme-text-strong">
                            inner · card · surface-white
                        </p>
                        <p className="mt-1 text-sm text-theme-text-soft">
                            White inner block. Mode-aware (light/dark).
                        </p>
                    </Surface>
                    <Surface variant="card-themed">
                        <p className="text-xs font-mono uppercase tracking-wide text-theme-text-strong">
                            inner · card-themed · bg-theme-bg-pale
                        </p>
                        <p className="mt-1 text-sm text-theme-text-strong">
                            Theme-tinted callout. Pinned news + earnings
                            highlights use this.
                        </p>
                    </Surface>
                </div>
            </Surface>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-paid-pale/60 p-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-paid-deep/70">
                        wallet · paid · bg-paid-pale/60
                    </p>
                    <p className="mt-1 text-sm text-paid-deep">
                        Paid wallet card — paid-pale softened to /60. Text uses{" "}
                        <code className="font-mono">text-paid-deep</code>.
                    </p>
                </div>
                <div className="rounded-xl bg-tier-pale/60 p-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-tier-deep/70">
                        wallet · tier · bg-tier-pale/60
                    </p>
                    <p className="mt-1 text-sm text-tier-deep">
                        Tier wallet card — tier-pale softened to /60. Text uses{" "}
                        <code className="font-mono">text-tier-deep</code>.
                    </p>
                </div>
                <div className="rounded-xl bg-tier-pale p-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-tier-deep/70">
                        tier explainer · active · bg-tier-pale
                    </p>
                    <p className="mt-1 text-sm text-tier-deep">
                        Active tier card (full strength); inactive tiers use{" "}
                        <code className="font-mono">bg-tier-pale/40</code>.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
                <span className="text-xs font-mono uppercase tracking-wide text-theme-text-strong">
                    wallet markers
                </span>
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-paid-soft" />
                    <code className="text-xs font-mono text-theme-text-strong">
                        bg-paid-soft
                    </code>
                    <span className="text-xs text-theme-text-soft/60">
                        drawer dot · chart bar
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-tier-soft" />
                    <code className="text-xs font-mono text-theme-text-strong">
                        bg-tier-soft
                    </code>
                    <span className="text-xs text-theme-text-soft/60">
                        drawer dot · chart bar
                    </span>
                </div>
            </div>
        </div>
    </Section>
);

// ─── Tabs ───────────────────────────────────────────────────

const modelOptions = ["image", "video", "audio", "text", "embedding"];

const TabsDemo: FC = () => {
    const [pill, setPill] = useState("image");
    return (
        <Section
            title="Tabs"
            caption="Pill tabs. Each button is independent, wraps naturally when the row runs out of room."
        >
            <div className="flex flex-col gap-4 rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
                <Field label="pills · model selector">
                    <div className="flex flex-wrap gap-1.5">
                        {modelOptions.map((option) => (
                            <TabButton
                                key={option}
                                active={pill === option}
                                onClick={() => setPill(option)}
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
        caption="Three states: default (gray border), error (red border), disabled (lower opacity). No theme focus ring — the ring was deliberately removed; the browser's default focus outline takes over for keyboard a11y."
    >
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-theme-border bg-theme-bg-subtle p-4 sm:grid-cols-3">
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
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
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
 *  - Theme-cascade popup: `bg-theme-bg-pale text-theme-text-strong border border-theme-border text-xs px-2 py-1 rounded-md`
 *  - Reads as part of the page (recolors with the theme), not system chrome
 *  - `cursor-help` (the "?" cursor) on every trigger
 *
 * Two trigger components share that recipe:
 *  - <InfoTip>: visible "i" badge (the badge follows the page theme)
 *  - <Tooltip>: invisible wrapper around any child
 *
 * Hover any row below to verify the cursor swaps and the popup is the
 * same pale theme-tinted card.
 */
const TooltipsDemo: FC = () => (
    <Section
        title="Tooltips"
        caption="One recipe everywhere. Pale theme-tinted popup with a soft border, cursor-help on every trigger. Two trigger types (info badge + mouseover wrapper) cover every hoverable info element in the app."
    >
        <div className="flex flex-col gap-4 rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
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
                    triggerAs="span"
                >
                    <Button>Buy</Button>
                </Tooltip>
                <span className="text-xs text-theme-text-soft">
                    Wrapping a clickable: use{" "}
                    <code className="font-mono">triggerAs="span"</code> so the
                    Button keeps its own &lt;button&gt; (no nested buttons).
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
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
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
    // UTC throughout so the rendered "May 1" label matches the fullDate
    // ("2026-05-01") in every timezone — local-time + toISOString() would
    // shift the date in westward zones.
    const baseUtc = Date.UTC(2026, 4, 1);
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
        const ts = new Date(baseUtc + i * 24 * 60 * 60 * 1000);
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
        caption="Stacked bar chart used by the Activity page. Bar fills come from PAID_COLOR + TIER_COLOR in lib/balance-colors.ts — currently the same oklch values as bg-paid-pale + bg-tier-pale, so the wallet card and chart bar share one visual identity."
    >
        <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
            <Chart
                data={buildSampleChartData()}
                metric="pollen"
                showModelBreakdown={false}
            />
        </div>
    </Section>
);
