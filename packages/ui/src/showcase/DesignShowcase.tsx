import { type FC, type ReactNode, useEffect, useState } from "react";
import { formatPollen } from "../lib/format-pollen.ts";
import { currentPeriod, type PeriodSelection } from "../lib/period.ts";
import { Button } from "../primitives/Button.tsx";
import { Chip } from "../primitives/Chip.tsx";
import { Collapsible } from "../primitives/Collapsible.tsx";
import { ExternalLinkButton } from "../primitives/ExternalLinkButton.tsx";
import { IconButton } from "../primitives/IconButton.tsx";
import { InfoTip } from "../primitives/InfoTip.tsx";
import { Input } from "../primitives/Input.tsx";
import { MultiSelect } from "../primitives/MultiSelect.tsx";
import { PeriodPicker } from "../primitives/PeriodPicker.tsx";
import { RangeSlider } from "../primitives/RangeSlider.tsx";
import { ScrollArea } from "../primitives/ScrollArea.tsx";
import { Section as PrimitiveSection } from "../primitives/Section.tsx";
import { Surface } from "../primitives/Surface.tsx";
import { Switch, type SwitchStatus } from "../primitives/Switch.tsx";
import { TabButton } from "../primitives/TabButton.tsx";
import { Tooltip } from "../primitives/Tooltip.tsx";
import { type ThemeName, themes } from "../theme.ts";

/**
 * Package-owned design primitive showcase.
 *
 * This component is intentionally generic: it renders package primitives and
 * package tokens only. App-specific charts, model recipes, routes, and copy
 * belong in host apps.
 */
export const DesignShowcase: FC = () => {
    const [theme, setTheme] = useState<ThemeName>("amber");

    useEffect(() => {
        document.documentElement.classList.add("polli-ui-root");
        document.documentElement.classList.add("polli-ui-shell");
        document.body.classList.add("polli-ui-shell");
        return () => {
            document.documentElement.classList.remove("polli-ui-root");
            document.documentElement.classList.remove("polli-ui-shell");
            document.body.classList.remove("polli-ui-shell");
        };
    }, []);

    return (
        <ScrollArea
            theme={theme}
            data-theme={theme}
            className="polli:h-dvh polli:w-full polli:overflow-x-hidden polli:bg-theme-bg-subtle polli:text-theme-text-base"
        >
            <Header theme={theme} onThemeChange={setTheme} />
            <main className="polli:mx-auto polli:flex polli:w-full polli:max-w-[980px] polli:min-w-0 polli:flex-col polli:gap-10 polli:overflow-x-hidden polli:px-6 polli:pt-8 polli:pb-10">
                <TypographyDemo />
                <ThemeDemo theme={theme} onThemeChange={setTheme} />
                <ButtonsDemo theme={theme} />
                <ChipsDemo />
                <SurfacesDemo />
                <SectionDemo theme={theme} />
                <InputsDemo />
                <SelectionDemo theme={theme} />
                <DisclosureDemo />
                <ScrollAreaDemo />
                <FeedbackDemo />
            </main>
        </ScrollArea>
    );
};

type HeaderProps = {
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
};

const Header: FC<HeaderProps> = ({ theme, onThemeChange }) => (
    <header className="polli:sticky polli:top-0 polli:z-10 polli:border-b polli:border-theme-border polli:bg-theme-bg-subtle/90 polli:px-6 polli:py-4 polli:backdrop-blur">
        <div className="polli:mx-auto polli:flex polli:w-full polli:max-w-[980px] polli:min-w-0 polli:flex-col polli:items-start polli:gap-4">
            <div>
                <h1 className="polli:font-heading polli:text-2xl polli:text-theme-text-strong">
                    Design Showcase
                </h1>
                <p className="polli:text-xs polli:text-theme-text-soft">
                    Package primitives, tokens, and generic recipes.
                </p>
            </div>
            <ThemeTabs
                value={theme}
                options={themes}
                onChange={onThemeChange}
            />
        </div>
    </header>
);

type ThemeTabsProps = {
    value: ThemeName;
    options: readonly ThemeName[];
    onChange: (value: ThemeName) => void;
};

const ThemeTabs: FC<ThemeTabsProps> = ({ value, options, onChange }) => (
    <div className="polli:flex polli:w-full polli:min-w-0 polli:flex-col polli:gap-2">
        <span className="polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
            Theme
        </span>
        <div className="polli:grid polli:max-w-full polli:grid-cols-[repeat(auto-fit,minmax(100px,1fr))] polli:gap-1.5">
            {options.map((option) => (
                <TabButton
                    key={option}
                    active={value === option}
                    onClick={() => onChange(option)}
                    className="polli:w-full polli:px-3"
                >
                    <span className="polli:capitalize">{option}</span>
                </TabButton>
            ))}
        </div>
    </div>
);

type ShowcaseSectionProps = {
    title: string;
    caption: string;
    children: ReactNode;
};

const ShowcaseSection: FC<ShowcaseSectionProps> = ({
    title,
    caption,
    children,
}) => (
    <section className="polli:flex polli:w-full polli:min-w-0 polli:flex-col polli:gap-3">
        <div>
            <h2 className="polli:font-subheading polli:text-2xl polli:text-theme-text-strong">
                {title}
            </h2>
            <p className="polli:max-w-full polli:break-words polli:text-sm polli:text-theme-text-soft polli:[overflow-wrap:anywhere]">
                {caption}
            </p>
        </div>
        {children}
    </section>
);

const Row: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Surface
        variant="card-themed"
        className="polli:flex polli:flex-wrap polli:items-center polli:gap-3"
    >
        <span className="polli:w-44 polli:shrink-0 polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
            {label}
        </span>
        <div className="polli:flex polli:min-w-0 polli:flex-1 polli:flex-wrap polli:items-center polli:gap-2">
            {children}
        </div>
    </Surface>
);

const Field: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <div className="polli:flex polli:min-w-0 polli:flex-col polli:gap-1">
        <span className="polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
            {label}
        </span>
        {children}
    </div>
);

const typographyRows = [
    {
        label: "Heading",
        className: "polli:font-heading polli:text-4xl",
        sample: "Pollinations",
    },
    {
        label: "Subheading",
        className: "polli:font-subheading polli:text-3xl",
        sample: "Reusable UI",
    },
    {
        label: "Body",
        className: "polli:font-body polli:text-base",
        sample: "Clear defaults for product surfaces.",
    },
    {
        label: "Micro",
        className: "polli:font-body polli:text-micro polli:uppercase",
        sample: "Status label",
    },
] as const;

const textRows = [
    ["strong", "polli:text-theme-text-strong"],
    ["base", "polli:text-theme-text-base"],
    ["soft", "polli:text-theme-text-soft"],
] as const;

const TypographyDemo: FC = () => (
    <ShowcaseSection
        title="Typography"
        caption="Font, size, and semantic text color utilities backed by package tokens."
    >
        <Surface
            variant="panel"
            className="polli:flex polli:flex-col polli:gap-3"
        >
            {typographyRows.map((row) => (
                <div
                    key={row.label}
                    className="polli:flex polli:flex-wrap polli:items-baseline polli:gap-x-4 polli:gap-y-1 polli:border-b polli:border-theme-border polli:pb-3 polli:last:border-b-0 polli:last:pb-0"
                >
                    <span
                        className={`polli:w-44 polli:shrink-0 polli:text-theme-text-strong ${row.className}`}
                    >
                        {row.sample}
                    </span>
                    <code className="polli:w-44 polli:shrink-0 polli:font-mono polli:text-xs polli:text-theme-text-strong">
                        {row.label}
                    </code>
                    <span className="polli:min-w-0 polli:flex-1 polli:text-xs polli:text-theme-text-soft">
                        {row.className.replaceAll("polli:", "")}
                    </span>
                </div>
            ))}
            <div className="polli:flex polli:flex-wrap polli:gap-2 polli:pt-1">
                {textRows.map(([label, className]) => (
                    <span
                        key={label}
                        className={`polli:rounded-lg polli:bg-theme-bg-pale polli:px-3 polli:py-1 polli:text-sm ${className}`}
                    >
                        text-{label}
                    </span>
                ))}
            </div>
        </Surface>
    </ShowcaseSection>
);

const ThemeDemo: FC<HeaderProps> = ({ theme, onThemeChange }) => (
    <ShowcaseSection
        title="Themes"
        caption="The theme cascade is driven by data-theme on any ancestor or by component theme props."
    >
        <Surface
            variant="panel"
            className="polli:flex polli:flex-wrap polli:gap-3"
        >
            {themes.map((item) => (
                <button
                    key={item}
                    type="button"
                    data-theme={item}
                    aria-pressed={theme === item}
                    onClick={() => onThemeChange(item)}
                    className="polli:flex polli:min-w-36 polli:flex-col polli:gap-2 polli:rounded-xl polli:border polli:border-theme-border polli:bg-theme-bg-subtle polli:p-3 polli:text-left polli:transition-colors polli:hover:bg-theme-bg-pale"
                >
                    <span className="polli:text-sm polli:font-bold polli:capitalize polli:text-theme-text-strong">
                        {item}
                    </span>
                    <span className="polli:h-7 polli:rounded-lg polli:bg-theme-bg-active" />
                    <span className="polli:text-xs polli:text-theme-text-soft">
                        {theme === item ? "Selected" : "Preview"}
                    </span>
                </button>
            ))}
        </Surface>
    </ShowcaseSection>
);

const ButtonsDemo: FC<{ theme: ThemeName }> = ({ theme }) => (
    <ShowcaseSection
        title="Buttons"
        caption="Button shapes and actions stay generic. Semantic labels use chips, destructive actions use the danger intent."
    >
        <div className="polli:flex polli:flex-col polli:gap-3">
            <Row label="Button">
                <Button>Default</Button>
                <Button size="small">Small</Button>
                <Button size="large">Large</Button>
                <Button disabled>Disabled</Button>
                <Button intent="danger">Delete</Button>
            </Row>
            <Row label="External link">
                <ExternalLinkButton
                    theme={theme}
                    href="https://pollinations.ai"
                >
                    Pollinations
                </ExternalLinkButton>
            </Row>
            <Row label="Icon button">
                <IconButton title="Edit" onClick={noop}>
                    E
                </IconButton>
                <IconButton title="Delete" intent="danger" onClick={noop}>
                    X
                </IconButton>
            </Row>
        </div>
    </ShowcaseSection>
);

const ChipsDemo: FC = () => (
    <ShowcaseSection
        title="Chips"
        caption="Compact metadata and state labels. Intent chips are theme-independent; default chips inherit the active theme."
    >
        <div className="polli:flex polli:flex-col polli:gap-3">
            <Row label="Theme">
                <Chip>Default</Chip>
                <Chip size="sm">Small</Chip>
                <Chip size="lg">Large</Chip>
            </Row>
            <Row label="Intent">
                <Chip intent="news">NEW</Chip>
                <Chip intent="alpha">ALPHA</Chip>
                <Chip intent="paid">Paid</Chip>
                <Chip intent="tier">Tier</Chip>
                <Chip intent="neutral">Neutral</Chip>
            </Row>
            <Row label="Theme override">
                {themes.map((theme) => (
                    <Chip key={theme} theme={theme}>
                        {theme}
                    </Chip>
                ))}
            </Row>
        </div>
    </ShowcaseSection>
);

const SurfacesDemo: FC = () => (
    <ShowcaseSection
        title="Surfaces"
        caption="Panel, white card, and themed card primitives for composing page structure without app-specific containers."
    >
        <Surface variant="panel">
            <div className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] polli:gap-3">
                <Surface>
                    <h3 className="polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                        Card
                    </h3>
                    <p className="polli:mt-1 polli:text-sm polli:text-theme-text-soft">
                        A neutral inner surface for dense content.
                    </p>
                </Surface>
                <Surface variant="card-themed">
                    <h3 className="polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                        Card themed
                    </h3>
                    <p className="polli:mt-1 polli:text-sm polli:text-theme-text-soft">
                        A light themed wash for highlights and grouped state.
                    </p>
                </Surface>
                <div className="polli:rounded-xl polli:bg-paid-pale/60 polli:p-4 polli:text-paid-deep">
                    <h3 className="polli:font-subheading polli:text-xl">
                        Static token
                    </h3>
                    <p className="polli:mt-1 polli:text-sm">
                        Wallet colors stay stable across themes.
                    </p>
                </div>
            </div>
        </Surface>
    </ShowcaseSection>
);

const SectionDemo: FC<{ theme: ThemeName }> = ({ theme }) => (
    <ShowcaseSection
        title="Section"
        caption="A generic page section primitive with optional framing and action slot."
    >
        <PrimitiveSection
            title="Primitive section"
            theme={theme}
            framed
            action={<Button size="small">Action</Button>}
        >
            <p className="polli:text-sm polli:text-theme-text-soft">
                Section owns heading layout and optional framing. The app owns
                the content inside it.
            </p>
        </PrimitiveSection>
    </ShowcaseSection>
);

const InputsDemo: FC = () => {
    const [sliderValue, setSliderValue] = useState(35);
    const [switches, setSwitches] = useState<Record<SwitchStatus, boolean>>({
        off: false,
        on: true,
        invalid: true,
    });

    return (
        <ShowcaseSection
            title="Inputs"
            caption="Text, number, range, and binary toggle primitives."
        >
            <Surface
                variant="panel"
                className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] polli:gap-4"
            >
                <Field label="Default">
                    <Input placeholder="Name" />
                </Field>
                <Field label="Number">
                    <Input type="number" placeholder="100" hideNumberSteppers />
                </Field>
                <Field label="Error">
                    <Input placeholder="Invalid" error />
                </Field>
                <Field label="Disabled">
                    <Input placeholder="Disabled" disabled />
                </Field>
                <div className="polli:col-span-full">
                    <Field label={`Range ${sliderValue}`}>
                        <RangeSlider
                            min={0}
                            max={100}
                            value={sliderValue}
                            aria-label="Range slider"
                            onChange={(event) =>
                                setSliderValue(
                                    Number(event.currentTarget.value),
                                )
                            }
                        />
                    </Field>
                </div>
                <div className="polli:col-span-full polli:flex polli:flex-wrap polli:gap-5">
                    {switchStatuses.map((status) => (
                        <div
                            key={status}
                            className="polli:flex polli:flex-col polli:gap-1"
                        >
                            <span className="polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
                                {status}
                            </span>
                            <Switch
                                checked={switches[status]}
                                status={status}
                                ariaLabel={`${status} switch`}
                                onChange={(checked) =>
                                    setSwitches((current) => ({
                                        ...current,
                                        [status]: checked,
                                    }))
                                }
                            />
                        </div>
                    ))}
                </div>
            </Surface>
        </ShowcaseSection>
    );
};

const switchStatuses: readonly SwitchStatus[] = ["off", "on", "invalid"];

const selectionOptions = [
    { value: "images", label: "Images" },
    { value: "text", label: "Text" },
    { value: "audio", label: "Audio" },
    { value: "video", label: "Video" },
    { value: "embeddings", label: "Embeddings" },
    { value: "tools", label: "Tools" },
    { value: "agents", label: "Agents" },
    { value: "apps", label: "Apps" },
] as const;

const tabOptions = ["Request", "Pollen", "Usage"] as const;

const SelectionDemo: FC<{ theme: ThemeName }> = ({ theme }) => {
    const [activeTab, setActiveTab] =
        useState<(typeof tabOptions)[number]>("Request");
    const [selected, setSelected] = useState<string[]>([]);
    const [period, setPeriod] = useState<PeriodSelection>(() =>
        currentPeriod(),
    );

    return (
        <ShowcaseSection
            title="Selection"
            caption="Mutually exclusive tabs, multiple selection, and period selection."
        >
            <Surface
                variant="panel"
                className="polli:flex polli:flex-col polli:gap-4"
            >
                <Field label="TabButton">
                    <div className="polli:flex polli:flex-wrap polli:gap-1.5">
                        {tabOptions.map((option) => (
                            <TabButton
                                key={option}
                                active={activeTab === option}
                                onClick={() => setActiveTab(option)}
                            >
                                {option}
                            </TabButton>
                        ))}
                    </div>
                </Field>
                <Field label="MultiSelect">
                    <MultiSelect
                        options={[...selectionOptions]}
                        selected={selected}
                        onChange={setSelected}
                        placeholder="All"
                        align="start"
                        label="Types"
                        theme={theme}
                    />
                </Field>
                <Field label="PeriodPicker">
                    <PeriodPicker
                        value={period}
                        onChange={setPeriod}
                        theme={theme}
                    />
                </Field>
            </Surface>
        </ShowcaseSection>
    );
};

const DisclosureDemo: FC = () => {
    const [firstOpen, setFirstOpen] = useState(false);
    const [secondOpen, setSecondOpen] = useState(true);

    return (
        <ShowcaseSection
            title="Collapsible"
            caption="A generic disclosure row for optional settings, grouped controls, and nested detail."
        >
            <Surface
                variant="panel"
                className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] polli:gap-3"
            >
                <Collapsible
                    expanded={firstOpen}
                    onToggle={() => setFirstOpen((open) => !open)}
                    wrapperClassName="polli:border-theme-border polli:bg-theme-bg-pale"
                    label={
                        <span className="polli:text-sm polli:font-medium polli:text-theme-text-strong">
                            Advanced settings
                        </span>
                    }
                >
                    <p className="polli:text-sm polli:text-theme-text-base">
                        Body content is fully controlled by the caller.
                    </p>
                </Collapsible>
                <Collapsible
                    expanded={secondOpen}
                    onToggle={() => setSecondOpen((open) => !open)}
                    wrapperClassName="polli:border-theme-border polli:bg-theme-bg-pale"
                    label={
                        <span className="polli:text-sm polli:font-medium polli:text-theme-text-strong">
                            Nested details
                        </span>
                    }
                >
                    <p className="polli:text-sm polli:text-theme-text-base">
                        The same primitive works inside compact panels.
                    </p>
                </Collapsible>
            </Surface>
        </ShowcaseSection>
    );
};

const ScrollAreaDemo: FC = () => (
    <ShowcaseSection
        title="ScrollArea"
        caption="Themed auto-hide scrollbars for vertical and horizontal overflow."
    >
        <Surface
            variant="panel"
            className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] polli:gap-4"
        >
            <Surface>
                <p className="polli:mb-2 polli:font-mono polli:text-xs polli:uppercase polli:tracking-wide polli:text-theme-text-soft">
                    vertical
                </p>
                <ScrollArea className="polli:h-44 polli:rounded-lg polli:bg-theme-bg-subtle polli:p-3">
                    {scrollRows.map((row) => (
                        <p
                            key={row}
                            className="polli:py-1 polli:text-sm polli:text-theme-text-base"
                        >
                            Row {row}
                        </p>
                    ))}
                </ScrollArea>
            </Surface>
            <Surface>
                <p className="polli:mb-2 polli:font-mono polli:text-xs polli:uppercase polli:tracking-wide polli:text-theme-text-soft">
                    horizontal
                </p>
                <ScrollArea
                    axis="x"
                    theme="violet"
                    className="polli:rounded-lg polli:bg-theme-bg-subtle polli:p-3"
                >
                    <div className="polli:flex polli:w-max polli:gap-2">
                        {scrollRows.slice(0, 16).map((row) => (
                            <Chip key={row} theme="violet">
                                item {row}
                            </Chip>
                        ))}
                    </div>
                </ScrollArea>
            </Surface>
        </Surface>
    </ShowcaseSection>
);

const scrollRows = Array.from({ length: 28 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
);

const FeedbackDemo: FC = () => (
    <ShowcaseSection
        title="Feedback"
        caption="Tooltip, InfoTip, and formatted value examples for compact product UI."
    >
        <Surface
            variant="panel"
            className="polli:flex polli:flex-col polli:gap-3"
        >
            <Row label="InfoTip">
                <span className="polli:inline-flex polli:items-center polli:text-sm polli:text-theme-text-strong">
                    Pollen balance
                    <InfoTip content="A compact inline information trigger." />
                </span>
            </Row>
            <Row label="Tooltip">
                <Tooltip
                    content="Formatted with formatPollen()"
                    displayContents
                >
                    <Chip intent="paid" size="lg">
                        {formatPollen(1234.5678)} Pollen
                    </Chip>
                </Tooltip>
                <Tooltip
                    content="Use triggerAs='span' around inline text."
                    triggerAs="span"
                >
                    <span className="polli:cursor-help polli:text-sm polli:text-theme-text-strong polli:underline polli:decoration-dotted">
                        inline help
                    </span>
                </Tooltip>
            </Row>
        </Surface>
    </ShowcaseSection>
);

const noop = () => undefined;
