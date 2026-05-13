import { type FC, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/util.ts";
import {
    type IntentName,
    intents,
    type ThemeName,
    themes,
} from "../layout/dashboard-theme.ts";
import { Chip } from "../ui/chip.tsx";
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
                <Placeholder title="Typography" phase="Phase 7" />
                <CascadeDemo />
                <IntentDemo />
                <ChipsDemo />
                <Placeholder title="Buttons" phase="Phase 4" />
                <SwitchesDemo />
                <Placeholder title="Surfaces" phase="Phase 3" />
                <TabsDemo />
                <Placeholder title="Inputs" phase="Phase 8" />
                <Placeholder title="IconButtons" phase="Phase 8" />
                <Placeholder title="InfoTip" phase="Phase 9" />
                <Placeholder title="Money colors" phase="Phase 6" />
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
                    <span className="text-[11px] text-theme-text-softer">
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
