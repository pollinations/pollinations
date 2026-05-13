import { type FC, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import {
    type IntentName,
    intents,
    type ThemeName,
    themes,
} from "../layout/dashboard-theme.ts";
import { Chip } from "../ui/chip.tsx";
import { IconButton } from "../ui/icon-button.tsx";
import { Input } from "../ui/input.tsx";
import { Surface } from "../ui/surface.tsx";
import { Switch, type SwitchStatus } from "../ui/switch.tsx";
import { TabButton } from "../ui/tab-button.tsx";

const switchStatuses: readonly SwitchStatus[] = [
    "off",
    "on",
    "draft",
    "ready",
] as const;

type Mode = "light" | "dark";

/**
 * /internal/design — dev-only design system showcase.
 *
 * Validates the Phase 0 CSS-var cascade (Layers 1, 2, 2b, 3) and
 * placeholders the future component sections (Phases 1+).
 *
 * Gated to DEV in `routes/internal.design.tsx`.
 */
export const DesignShowcase: FC = () => {
    const [mode, setMode] = useState<Mode>(() =>
        document.documentElement.dataset.mode === "dark" ? "dark" : "light",
    );
    const [themeOverride, setThemeOverride] = useState<ThemeName>("amber");

    // Reflect mode toggle to <html data-mode>. The query param is a
    // dev-only convenience; the toggle here is the real lever.
    useEffect(() => {
        document.documentElement.dataset.mode = mode;
    }, [mode]);

    return (
        <div
            data-theme={themeOverride}
            className="min-h-dvh bg-theme-bg-subtle text-theme-text-base px-6 py-10"
        >
            <div className="mx-auto flex max-w-[960px] flex-col gap-10">
                <Header
                    mode={mode}
                    onModeChange={setMode}
                    themeOverride={themeOverride}
                    onThemeOverrideChange={setThemeOverride}
                />
                <ThemesStrip />
                <TypographyDemo />
                <CascadeDemo />
                <IntentDemo />
                <ChipsDemo />
                <ButtonsDemo />
                <SwitchesDemo />
                <SurfacesDemo />
                <TabsDemo />
                <InputsDemo />
                <IconButtonsDemo />
                <Placeholder title="InfoTip" phase="Phase 9" />
                <MoneyColorsDemo />
            </div>
        </div>
    );
};

// ─── Header (mode + theme override) ─────────────────────────

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
    <header className="flex flex-col gap-4 border-b border-theme-border-soft pb-6">
        <div>
            <h1 className="font-heading text-4xl text-theme-text-strong">
                Design Showcase
            </h1>
            <p className="text-sm text-theme-text-muted">
                Phase 0 cascade validation. Dev-only — gated in production.
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
                label="Theme override"
                value={themeOverride}
                options={themes}
                onChange={onThemeOverrideChange}
            />
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
            <span className="text-xs uppercase tracking-wide text-theme-text-label">
                {label}
            </span>
            <div className="flex flex-wrap gap-1 rounded-full border border-theme-border-soft bg-theme-bg-tinted p-1">
                {options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                            value === option
                                ? "bg-theme-button-strong-bg text-theme-button-strong-text"
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

// ─── Themes strip ───────────────────────────────────────────

const ThemesStrip: FC = () => (
    <Section
        title="Themes"
        caption="Six chrome hues. Each renders the same set of role tokens."
    >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {themes.map((theme) => (
                <div
                    key={theme}
                    data-theme={theme}
                    className="flex flex-col gap-2 rounded-xl border border-theme-border bg-theme-bg-idle p-4"
                >
                    <span className="text-xs uppercase tracking-wide text-theme-text-label">
                        {theme}
                    </span>
                    <div className="flex h-8 rounded-md bg-theme-chip-bg" />
                    <div className="flex h-8 rounded-md bg-theme-button-strong-bg" />
                    <div className="flex h-2 rounded-full bg-theme-bg-active" />
                </div>
            ))}
        </div>
    </Section>
);

// ─── Typography (headings + size scale) ────────────────────

type SizeRow = {
    utility: string;
    px: string;
    note?: string;
};

const sizeScale: readonly SizeRow[] = [
    { utility: "text-3xs", px: "10px", note: "off-scale fine print" },
    { utility: "text-2xs", px: "11px", note: "off-scale fine print" },
    { utility: "text-xs", px: "12px" },
    { utility: "text-sm", px: "14px" },
    { utility: "text-md", px: "15px", note: "off-scale dashboard nav" },
    { utility: "text-base", px: "16px", note: "body default" },
    { utility: "text-lg", px: "18px" },
    { utility: "text-xl", px: "20px" },
    { utility: "text-2xl", px: "24px" },
    { utility: "text-3xl", px: "30px" },
    { utility: "text-4xl", px: "36px" },
    { utility: "text-5xl", px: "48px" },
] as const;

const TypographyDemo: FC = () => (
    <Section
        title="Typography"
        caption={
            "Headings cascade from `style.css @layer base`. h1 uses LCT Mogi (font-heading), " +
            "h2-h3 use Fraunces (font-subheading), h4-h6 use Uncut Sans (font-body)."
        }
    >
        <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-theme-border-soft bg-theme-bg-subtle p-6">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-theme-text-label">
                    Heading scale
                </div>
                <div className="flex flex-col gap-3">
                    <HeadingRow tag="h1" utility="text-5xl font-heading">
                        <h1>The quick brown fox</h1>
                    </HeadingRow>
                    <HeadingRow
                        tag="h2"
                        utility="text-3xl font-subheading tracking-tight"
                    >
                        <h2>The quick brown fox</h2>
                    </HeadingRow>
                    <HeadingRow
                        tag="h3"
                        utility="text-2xl font-subheading tracking-tight"
                    >
                        <h3>The quick brown fox</h3>
                    </HeadingRow>
                    <HeadingRow
                        tag="h4"
                        utility="text-lg font-body font-semibold"
                    >
                        <h4>The quick brown fox</h4>
                    </HeadingRow>
                    <HeadingRow
                        tag="h5"
                        utility="text-base font-body font-semibold"
                    >
                        <h5>The quick brown fox</h5>
                    </HeadingRow>
                    <HeadingRow
                        tag="h6"
                        utility="text-sm font-body font-semibold"
                    >
                        <h6>The quick brown fox</h6>
                    </HeadingRow>
                    <HeadingRow tag="p" utility="text-base (body default)">
                        <p>The quick brown fox jumps over the lazy dog.</p>
                    </HeadingRow>
                </div>
            </div>

            <div className="rounded-xl border border-theme-border-soft bg-theme-bg-subtle p-6">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-theme-text-label">
                    Size scale (Uncut Sans)
                </div>
                <div className="flex flex-col gap-2">
                    {sizeScale.map((row) => (
                        <div
                            key={row.utility}
                            className="flex items-baseline gap-4 border-b border-theme-border-subtle pb-2 last:border-b-0 last:pb-0"
                        >
                            <span
                                className={`${row.utility} text-theme-text-strong w-64 truncate`}
                            >
                                The quick brown fox
                            </span>
                            <code className="text-xs font-mono text-theme-text-strong w-24">
                                {row.utility}
                            </code>
                            <span className="text-xs font-mono text-theme-text-muted w-12">
                                {row.px}
                            </span>
                            {row.note && (
                                <span className="text-xs text-theme-text-softer">
                                    {row.note}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </Section>
);

const HeadingRow: FC<{
    tag: string;
    utility: string;
    children: ReactNode;
}> = ({ tag, utility, children }) => (
    <div className="flex items-baseline gap-4">
        <code className="w-8 shrink-0 text-xs font-mono text-theme-text-muted">
            {tag}
        </code>
        <div className="min-w-0 flex-1 text-theme-text-strong">{children}</div>
        <code className="hidden shrink-0 text-xs font-mono text-theme-text-softer sm:block">
            {utility}
        </code>
    </div>
);

// ─── Cascade demo (single component, all 6 themes) ──────────

const CascadeDemo: FC = () => (
    <Section
        title="Cascade demo"
        caption={
            "Same chip markup (`bg-theme-chip-bg text-theme-chip-text`) under " +
            "each theme. The cascade picks the right hue."
        }
    >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {themes.map((theme) => (
                <div
                    key={theme}
                    data-theme={theme}
                    className="flex flex-col items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-tinted p-4"
                >
                    <span className="rounded-full bg-theme-chip-bg px-3 py-1 text-xs font-medium text-theme-chip-text">
                        {theme} chip
                    </span>
                    <span className="text-2xs text-theme-text-softer">
                        text-theme-text-softer
                    </span>
                </div>
            ))}
        </div>
    </Section>
);

// ─── Intent demo ────────────────────────────────────────────

const IntentDemo: FC = () => (
    <Section
        title="Intent demo"
        caption={
            'Intents are theme-independent. `intent="danger"` shows red on every theme.'
        }
    >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {themes.map((theme) => (
                <div
                    key={theme}
                    data-theme={theme}
                    className="flex flex-col gap-3 rounded-xl border border-theme-border bg-theme-bg-idle p-4"
                >
                    <span className="text-xs uppercase tracking-wide text-theme-text-label">
                        {theme}
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {intents.map((intent) => (
                            <IntentChip key={intent} intent={intent} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </Section>
);

const IntentChip: FC<{ intent: IntentName }> = ({ intent }) => {
    // Raw classes per intent — Phase 0 lives in CSS, not in primitives yet.
    const className =
        intent === "danger"
            ? "bg-intent-danger-bg-strong text-intent-danger-text-on-bg"
            : intent === "success"
              ? "bg-intent-success-bg-strong text-intent-success-text-on-bg"
              : intent === "paid"
                ? "bg-intent-paid text-white"
                : "bg-intent-alpha-bg text-intent-alpha-text";
    return (
        <span
            className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize",
                className,
            )}
        >
            {intent}
        </span>
    );
};

// ─── Chips ──────────────────────────────────────────────────

const ChipsDemo: FC = () => (
    <Section
        title="Chips"
        caption="<Chip> reads the cascade. Theme chips show one per [data-theme]; intent chips are theme-independent."
    >
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
                {themes.map((theme) => (
                    <Chip key={theme} theme={theme} className="capitalize">
                        {theme}
                    </Chip>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <Chip intent="danger">danger</Chip>
                <Chip intent="success">success</Chip>
                <Chip intent="paid">paid</Chip>
                <Chip intent="alpha">alpha</Chip>
            </div>
        </div>
    </Section>
);

// ─── Buttons ────────────────────────────────────────────────

const buttonWeights = ["light", "strong"] as const;

const ButtonsDemo: FC = () => (
    <Section
        title="Buttons"
        caption="<Button> reads the cascade for theme; intent overrides for semantic CTAs. Pill-only, two weights."
    >
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-3 px-3 text-xs uppercase tracking-wide text-theme-text-label">
                <span />
                <span>light</span>
                <span>strong</span>
                <span>light · disabled</span>
                <span>strong · disabled</span>
            </div>
            {themes.map((theme) => (
                <div
                    key={theme}
                    data-theme={theme}
                    className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-tinted p-3"
                >
                    <span className="text-xs uppercase tracking-wide text-theme-text-label">
                        {theme}
                    </span>
                    {buttonWeights.map((weight) => (
                        <Button key={weight} weight={weight}>
                            {weight}
                        </Button>
                    ))}
                    {buttonWeights.map((weight) => (
                        <Button key={`${weight}-d`} weight={weight} disabled>
                            {weight}
                        </Button>
                    ))}
                </div>
            ))}
            <div className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-3 rounded-xl border border-theme-border-soft bg-theme-bg-subtle p-3">
                <span className="text-xs uppercase tracking-wide text-theme-text-label">
                    danger
                </span>
                <Button intent="danger" weight="light">
                    light
                </Button>
                <Button intent="danger" weight="strong">
                    strong
                </Button>
                <Button intent="danger" weight="light" disabled>
                    light
                </Button>
                <Button intent="danger" weight="strong" disabled>
                    strong
                </Button>
            </div>
            <div className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-3 rounded-xl border border-theme-border-soft bg-theme-bg-subtle p-3">
                <span className="text-xs uppercase tracking-wide text-theme-text-label">
                    success
                </span>
                <Button intent="success" weight="light">
                    light
                </Button>
                <Button intent="success" weight="strong">
                    strong
                </Button>
                <Button intent="success" weight="light" disabled>
                    light
                </Button>
                <Button intent="success" weight="strong" disabled>
                    strong
                </Button>
            </div>
        </div>
    </Section>
);

// ─── Switches ───────────────────────────────────────────────

const SwitchesDemo: FC = () => {
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const isChecked = (key: string, status: SwitchStatus): boolean => {
        const stored = checked[key];
        if (stored !== undefined) return stored;
        return status === "on" || status === "ready";
    };
    return (
        <Section
            title="Switches"
            caption="<Switch> reads the cascade for off/on; intent vars for draft (red) and ready (green). Click to toggle."
        >
            <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-2 px-3 text-xs uppercase tracking-wide text-theme-text-label">
                    <span />
                    {switchStatuses.map((status) => (
                        <span key={status}>{status}</span>
                    ))}
                </div>
                {themes.map((theme) => (
                    <div
                        key={theme}
                        data-theme={theme}
                        className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-2 rounded-xl border border-theme-border bg-theme-bg-tinted p-3"
                    >
                        <span className="text-xs uppercase tracking-wide text-theme-text-label">
                            {theme}
                        </span>
                        {switchStatuses.map((status) => {
                            const key = `${theme}:${status}`;
                            const value = isChecked(key, status);
                            return (
                                <Switch
                                    key={status}
                                    checked={value}
                                    status={status}
                                    onChange={(next) =>
                                        setChecked((prev) => ({
                                            ...prev,
                                            [key]: next,
                                        }))
                                    }
                                    ariaLabel={`${theme} ${status}`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </Section>
    );
};

// ─── Surfaces ───────────────────────────────────────────────

const SurfacesDemo: FC = () => (
    <Section
        title="Surfaces"
        caption="<Surface> is the unified primitive for Card (rounded-xl, p-4) and Panel (rounded-2xl, p-6). Two tones: white (mode-aware) and tinted (cascade). Intent overrides theme + tone."
    >
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-3 px-3 text-xs uppercase tracking-wide text-theme-text-label">
                <span />
                <span>card · white</span>
                <span>card · tinted</span>
                <span>panel · white</span>
                <span>panel · tinted</span>
            </div>
            {themes.map((theme) => (
                <div
                    key={theme}
                    data-theme={theme}
                    className="grid grid-cols-[6rem_repeat(4,minmax(0,1fr))] items-center gap-3 rounded-xl border border-theme-border-soft bg-theme-bg-subtle p-3"
                >
                    <span className="text-xs uppercase tracking-wide text-theme-text-label">
                        {theme}
                    </span>
                    <Surface size="card" tone="white">
                        <p className="text-xs text-theme-text-soft">
                            card · white
                        </p>
                    </Surface>
                    <Surface size="card" tone="tinted">
                        <p className="text-xs text-theme-text-soft">
                            card · tinted
                        </p>
                    </Surface>
                    <Surface size="panel" tone="white">
                        <p className="text-xs text-theme-text-soft">
                            panel · white
                        </p>
                    </Surface>
                    <Surface size="panel" tone="tinted">
                        <p className="text-xs text-theme-text-soft">
                            panel · tinted
                        </p>
                    </Surface>
                </div>
            ))}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {intents.map((intent) => (
                    <Surface key={intent} intent={intent} size="card">
                        <p className="text-xs font-medium capitalize">
                            intent: {intent}
                        </p>
                    </Surface>
                ))}
            </div>
        </div>
    </Section>
);

// ─── Tabs ───────────────────────────────────────────────────

const TabsDemo: FC = () => {
    const [active, setActive] = useState<string>("requests");
    const options = ["requests", "pollen", "errors"] as const;
    return (
        <Section
            title="Tabs"
            caption="<TabButton> active state reads `bg-theme-chip-bg`; inactive reads `bg-theme-bg-subtle`. One strip per theme."
        >
            <div className="flex flex-col gap-3">
                {themes.map((theme) => (
                    <div
                        key={theme}
                        data-theme={theme}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-tinted p-3"
                    >
                        <span className="w-16 text-xs uppercase tracking-wide text-theme-text-label">
                            {theme}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {options.map((option) => (
                                <TabButton
                                    key={option}
                                    active={active === option}
                                    onClick={() => setActive(option)}
                                >
                                    {option}
                                </TabButton>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Section>
    );
};

// ─── Money colors ───────────────────────────────────────────

type MoneySwatch = {
    utility: string;
    sample: "bg" | "text";
    note: string;
};

const moneySwatches: readonly MoneySwatch[] = [
    { utility: "bg-paid", sample: "bg", note: "Paid headline / dot" },
    { utility: "bg-paid-hover", sample: "bg", note: "Paid hover state" },
    { utility: "text-paid-deep", sample: "text", note: "Paid number text" },
    { utility: "bg-tier", sample: "bg", note: "Tier headline / dot" },
    { utility: "bg-tier-hover", sample: "bg", note: "Tier hover state" },
    { utility: "text-tier-deep", sample: "text", note: "Tier number text" },
] as const;

const MoneyColorsDemo: FC = () => (
    <Section
        title="Money colors"
        caption={
            "Direct utilities for paid (orange) and tier (yellow) money UI. " +
            "Use `bg-paid` / `text-paid-deep` etc. instead of inline hex."
        }
    >
        <div className="flex flex-col divide-y divide-theme-divide rounded-xl border border-theme-border-soft bg-theme-bg-tinted">
            {moneySwatches.map((swatch) => (
                <div
                    key={swatch.utility}
                    className="flex items-center gap-4 px-4 py-3"
                >
                    <div
                        className={cn(
                            "flex h-10 w-16 shrink-0 items-center justify-center rounded-md",
                            swatch.sample === "bg"
                                ? swatch.utility
                                : "bg-theme-bg-subtle",
                        )}
                    >
                        {swatch.sample === "text" && (
                            <span
                                className={cn(
                                    "font-bold text-xl tabular-nums",
                                    swatch.utility,
                                )}
                            >
                                Aa
                            </span>
                        )}
                    </div>
                    <code className="text-sm font-mono text-theme-text-strong">
                        {swatch.utility}
                    </code>
                    <span className="ml-auto text-xs text-theme-text-muted">
                        {swatch.note}
                    </span>
                </div>
            ))}
        </div>
    </Section>
);

// ─── Inputs ─────────────────────────────────────────────────

const InputsDemo: FC = () => (
    <Section
        title="Inputs"
        caption={
            "<Input> uses the universal `--color-focus-ring` for focus chrome — " +
            "neutral on every page theme. Focus inside to see the ring."
        }
    >
        <div className="flex flex-col gap-3 rounded-xl border border-theme-border-soft bg-theme-bg-tinted p-4 sm:flex-row sm:items-start">
            <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-theme-text-label">
                    default
                </span>
                <Input placeholder="Default" />
            </div>
            <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-theme-text-label">
                    error
                </span>
                <Input placeholder="Error" error />
            </div>
            <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-theme-text-label">
                    disabled
                </span>
                <Input placeholder="Disabled" disabled />
            </div>
        </div>
    </Section>
);

// ─── IconButtons ────────────────────────────────────────────

const IconButtonsDemo: FC = () => (
    <Section
        title="IconButtons"
        caption={
            "<IconButton> is utility chrome (delete/copy/edit). Default reads the " +
            "cascade; `intent` overrides for semantic actions."
        }
    >
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[6rem_repeat(3,minmax(0,1fr))] items-center gap-3 px-3 text-xs uppercase tracking-wide text-theme-text-label">
                <span />
                <span>default</span>
                <span>danger</span>
                <span>success</span>
            </div>
            {themes.map((theme) => (
                <div
                    key={theme}
                    data-theme={theme}
                    className="grid grid-cols-[6rem_repeat(3,minmax(0,1fr))] items-center gap-3 rounded-xl border border-theme-border bg-theme-bg-tinted p-3"
                >
                    <span className="text-xs uppercase tracking-wide text-theme-text-label">
                        {theme}
                    </span>
                    <IconButton title="Default" onClick={() => {}}>
                        ✎
                    </IconButton>
                    <IconButton
                        intent="danger"
                        title="Delete"
                        onClick={() => {}}
                        className="text-lg"
                    >
                        ×
                    </IconButton>
                    <IconButton
                        intent="success"
                        title="Confirm"
                        onClick={() => {}}
                    >
                        ✓
                    </IconButton>
                </div>
            ))}
        </div>
    </Section>
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
                <p className="text-sm text-theme-text-muted">{caption}</p>
            )}
        </div>
        {children}
    </section>
);

const Placeholder: FC<{ title: string; phase: string }> = ({
    title,
    phase,
}) => (
    <Section title={title}>
        <div className="rounded-xl border border-dashed border-theme-border-soft bg-theme-bg-subtle p-6 text-sm text-theme-text-muted">
            {phase} will populate this — see DESIGN_REFACTOR_PLAN.md
        </div>
    </Section>
);
