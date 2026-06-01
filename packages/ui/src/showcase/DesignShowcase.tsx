import {
    type ComponentType,
    type FC,
    type ReactNode,
    useEffect,
    useState,
} from "react";
import { currentPeriod, type PeriodSelection } from "../lib/period.ts";
import { AuthInfoCard, ErrorBanner } from "../modules/auth/index.ts";
import { ModalityButton } from "../modules/modality/index.ts";
import {
    formatPollen,
    PaidChip,
    TierChip,
    WalletBalanceCard,
    WalletDot,
} from "../modules/wallet/index.ts";
import { Button } from "../primitives/Button.tsx";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Chip } from "../primitives/Chip.tsx";
import { Collapsible } from "../primitives/Collapsible.tsx";
import { CopyButton } from "../primitives/CopyButton.tsx";
import { Dialog, DialogTitle } from "../primitives/Dialog.tsx";
import { Dropdown } from "../primitives/Dropdown.tsx";
import { ExternalLinkButton } from "../primitives/ExternalLinkButton.tsx";
import { Field as ArkField } from "../primitives/Field.tsx";
import { IconButton } from "../primitives/IconButton.tsx";
import { InfoTip } from "../primitives/InfoTip.tsx";
import { Input } from "../primitives/Input.tsx";
import {
    AppIcon,
    BeakerIcon,
    BookIcon,
    CheckIcon,
    ClipboardIcon,
    ClockIcon,
    DiscordIcon,
    DownloadIcon,
    ExternalLinkIcon,
    GenApiIcon,
    GitHubIcon,
    type IconProps,
    ImageIcon,
    LockIcon,
    MailIcon,
    McpIcon,
    MenuIcon,
    TerminalIcon,
    TokensIcon,
    TrendUpIcon,
    WalletIcon,
    XIcon,
} from "../primitives/icons/index.tsx";
import { MultiSelect } from "../primitives/MultiSelect.tsx";
import { PeriodPicker } from "../primitives/PeriodPicker.tsx";
import { ScrollArea } from "../primitives/ScrollArea.tsx";
import { Section as PrimitiveSection } from "../primitives/Section.tsx";
import { Slider } from "../primitives/Slider.tsx";
import { StatCard } from "../primitives/StatCard.tsx";
import { Surface } from "../primitives/Surface.tsx";
import { Switch, type SwitchStatus } from "../primitives/Switch.tsx";
import { TabButton } from "../primitives/TabButton.tsx";
import { Tooltip } from "../primitives/Tooltip.tsx";
import { type ThemeName, themes } from "../theme.ts";

/**
 * Package-owned design primitive showcase.
 *
 * This component renders package primitives, tokens, and domain recipes only.
 * App-specific charts, model recipes, routes, and copy belong in host apps.
 */
export type DesignShowcaseProps = {
    headerSlot?: ReactNode;
    hideHeader?: boolean;
    hideThemeTabs?: boolean;
    theme?: ThemeName;
    onThemeChange?: (theme: ThemeName) => void;
};

export const DesignShowcase: FC<DesignShowcaseProps> = ({
    headerSlot,
    hideHeader = false,
    hideThemeTabs = false,
    theme: controlledTheme,
    onThemeChange,
}) => {
    const [internalTheme, setInternalTheme] = useState<ThemeName>("amber");
    const theme = controlledTheme ?? internalTheme;
    const setTheme = onThemeChange ?? setInternalTheme;

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
            className={`polli:w-full polli:overflow-x-hidden polli:bg-emerald-100 polli:text-theme-text-base ${
                hideHeader ? "polli:min-h-0 polli:flex-1" : "polli:h-dvh"
            }`}
        >
            {hideHeader && (headerSlot || !hideThemeTabs) ? (
                <div className="polli:mx-auto polli:flex polli:w-full polli:max-w-[1220px] polli:flex-col polli:gap-4 polli:px-5 polli:pt-8">
                    {headerSlot ? headerSlot : null}
                    {!hideThemeTabs ? (
                        <ThemeTabs
                            value={theme}
                            options={themes}
                            onChange={setTheme}
                        />
                    ) : null}
                </div>
            ) : !hideHeader ? (
                <Header
                    theme={theme}
                    onThemeChange={setTheme}
                    headerSlot={headerSlot}
                />
            ) : null}
            <div className="polli:mx-auto polli:flex polli:w-full polli:max-w-[1220px] polli:flex-col polli:gap-8 polli:px-5 polli:pt-8 polli:pb-10">
                <main className="polli:flex polli:min-w-0 polli:flex-col polli:gap-10">
                    <CoverageDemo />
                    <TypographyDemo />
                    <ThemeDemo theme={theme} onThemeChange={setTheme} />
                    <TokensDemo />
                    <IconsDemo />
                    <ButtonsDemo theme={theme} />
                    <InputsDemo />
                    <SelectionDemo theme={theme} />
                    <OverlaysDemo theme={theme} />
                    <LayoutDemo theme={theme} />
                    <FeedbackDemo />
                    <ModuleRecipesDemo />
                </main>
            </div>
        </ScrollArea>
    );
};

type HeaderProps = {
    theme: ThemeName;
    onThemeChange: (theme: ThemeName) => void;
    headerSlot?: ReactNode;
};

const Header: FC<HeaderProps> = ({ theme, onThemeChange, headerSlot }) => (
    <header className="polli:sticky polli:top-0 polli:z-20 polli:border-b polli:border-green-950/10 polli:bg-emerald-100 polli:px-5 polli:py-4 polli:backdrop-blur">
        <div className="polli:mx-auto polli:flex polli:w-full polli:max-w-[1220px] polli:min-w-0 polli:flex-col polli:items-start polli:gap-4">
            <div className="polli:flex polli:w-full polli:min-w-0 polli:flex-col polli:gap-3 polli:md:flex-row polli:md:items-start polli:md:justify-between">
                <div className="polli:min-w-0">
                    <h1 className="polli:font-serif polli:text-2xl polli:font-black polli:text-theme-text-strong">
                        Design Showcase
                    </h1>
                    <p className="polli:max-w-3xl polli:text-sm polli:leading-6 polli:text-theme-text-soft">
                        Package primitives, icons, tokens, and SDK-free recipes.
                    </p>
                </div>
                {headerSlot ? (
                    <div className="polli:w-full polli:md:w-auto">
                        {headerSlot}
                    </div>
                ) : null}
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
    <div className="polli:flex polli:min-w-0 polli:max-w-full polli:flex-col polli:items-start polli:gap-2">
        <span className="polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
            Theme
        </span>
        <div className="polli:flex polli:w-full polli:max-w-full polli:flex-wrap polli:gap-1.5">
            {options.map((option) => (
                <TabButton
                    key={option}
                    active={value === option}
                    onClick={() => onChange(option)}
                    theme={option}
                    size="small"
                >
                    <span className="polli:capitalize">{option}</span>
                </TabButton>
            ))}
        </div>
    </div>
);

type ShowcaseSectionProps = {
    id: string;
    title: string;
    caption: string;
    children: ReactNode;
};

const ShowcaseSection: FC<ShowcaseSectionProps> = ({
    id,
    title,
    caption,
    children,
}) => (
    <section
        id={id}
        className="polli:flex polli:w-full polli:min-w-0 polli:scroll-mt-24 polli:flex-col polli:gap-3"
    >
        <div className="polli:flex polli:flex-col polli:gap-1">
            <h2 className="polli:font-serif polli:text-2xl polli:font-black polli:text-theme-text-strong">
                {title}
            </h2>
            <p className="polli:max-w-3xl polli:break-words polli:text-sm polli:leading-6 polli:text-theme-text-soft polli:[overflow-wrap:anywhere]">
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

const ControlGroup: FC<{ label: string; children: ReactNode }> = ({
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

const primitiveNames = [
    "Button",
    "ChevronIcon",
    "Chip",
    "Collapsible",
    "CopyButton",
    "Dialog",
    "DialogTitle",
    "Dropdown",
    "ExternalLinkButton",
    "Field",
    "IconButton",
    "InfoTip",
    "Input",
    "MultiSelect",
    "PeriodPicker",
    "ScrollArea",
    "Section",
    "Slider",
    "StatCard",
    "Surface",
    "Switch",
    "TabButton",
    "Tooltip",
] as const;

const moduleNames = [
    "AuthInfoCard",
    "ErrorBanner",
    "ModalityButton",
    "PaidChip",
    "TierChip",
    "WalletBalanceCard",
    "WalletDot",
    "formatPollen",
] as const;

const CoverageDemo: FC = () => (
    <ShowcaseSection
        id="coverage"
        title="Coverage"
        caption="Every SDK-free primitive exported from the package appears below, plus the icon set and reusable module recipes."
    >
        <Surface
            variant="panel"
            className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] polli:gap-3"
        >
            <StatCard
                label="Primitives"
                value={primitiveNames.length}
                detail="Buttons, inputs, overlays, layout, and feedback."
                className="polli:rounded-xl polli:bg-surface-white polli:p-4"
            />
            <StatCard
                label="Icons"
                value={iconItems.length + 1}
                detail="All exported icons plus the canonical chevron."
                className="polli:rounded-xl polli:bg-surface-white polli:p-4"
            />
            <StatCard
                label="Recipes"
                value={moduleNames.length}
                detail="Auth, wallet, and modality pieces without SDK state."
                className="polli:rounded-xl polli:bg-surface-white polli:p-4"
            />
            <Surface className="polli:col-span-full polli:flex polli:flex-wrap polli:gap-2">
                {primitiveNames.map((name) => (
                    <Chip key={name} size="sm">
                        {name}
                    </Chip>
                ))}
            </Surface>
        </Surface>
    </ShowcaseSection>
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
        label: "Pixel",
        className: "polli:font-pixel polli:text-base",
        sample: "API 200 OK",
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
    ["muted", "polli:text-theme-text-muted"],
] as const;

const TypographyDemo: FC = () => (
    <ShowcaseSection
        id="type"
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
                        className={`polli:w-80 polli:shrink-0 polli:text-theme-text-strong ${row.className}`}
                    >
                        {row.sample}
                    </span>
                    <code className="polli:w-36 polli:shrink-0 polli:font-mono polli:text-xs polli:text-theme-text-strong">
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
        id="themes"
        title="Themes"
        caption="The theme cascade is driven by data-theme on any ancestor or by component theme props."
    >
        <Surface
            variant="panel"
            className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] polli:gap-3"
        >
            {themes.map((item) => (
                <button
                    key={item}
                    type="button"
                    data-theme={item}
                    aria-pressed={theme === item}
                    onClick={() => onThemeChange(item)}
                    className="polli:flex polli:min-w-0 polli:flex-col polli:gap-2 polli:rounded-xl polli:border polli:border-theme-border polli:bg-theme-bg-subtle polli:p-3 polli:text-left polli:transition-colors polli:hover:bg-theme-bg-pale"
                >
                    <span className="polli:text-sm polli:font-bold polli:capitalize polli:text-theme-text-strong">
                        {item}
                    </span>
                    <span className="polli:flex polli:h-8 polli:overflow-hidden polli:rounded-lg">
                        <span className="polli:flex-1 polli:bg-theme-bg-subtle" />
                        <span className="polli:flex-1 polli:bg-theme-bg-active" />
                        <span className="polli:flex-1 polli:bg-theme-bg-hover" />
                        <span className="polli:flex-1 polli:bg-theme-bg-pale" />
                    </span>
                    <span className="polli:text-xs polli:text-theme-text-soft">
                        {theme === item ? "Selected" : "Preview"}
                    </span>
                </button>
            ))}
        </Surface>
    </ShowcaseSection>
);

const tokenRows = [
    ["text-base", "var(--polli-color-text-base)", "polli:bg-theme-text-base"],
    [
        "text-strong",
        "var(--polli-color-text-strong)",
        "polli:bg-theme-text-strong",
    ],
    ["text-soft", "var(--polli-color-text-soft)", "polli:bg-theme-text-soft"],
    [
        "text-muted",
        "var(--polli-color-text-muted)",
        "polli:bg-theme-text-muted",
    ],
    ["border", "var(--polli-color-border)", "polli:bg-theme-border"],
    ["bg-subtle", "var(--polli-color-bg-subtle)", "polli:bg-theme-bg-subtle"],
    ["bg-active", "var(--polli-color-bg-active)", "polli:bg-theme-bg-active"],
    ["bg-hover", "var(--polli-color-bg-hover)", "polli:bg-theme-bg-hover"],
    ["bg-pale", "var(--polli-color-bg-pale)", "polli:bg-theme-bg-pale"],
] as const;

const TokensDemo: FC = () => (
    <ShowcaseSection
        id="tokens"
        title="Tokens"
        caption="Public CSS variables and utility bridges used by the primitives."
    >
        <Surface
            variant="panel"
            className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(230px,1fr))] polli:gap-3"
        >
            {tokenRows.map(([name, variable, swatchClass]) => (
                <Surface
                    key={name}
                    className="polli:flex polli:items-center polli:gap-3"
                >
                    <span
                        className={`polli:h-10 polli:w-10 polli:shrink-0 polli:rounded-lg polli:border polli:border-theme-border ${swatchClass}`}
                    />
                    <span className="polli:min-w-0">
                        <span className="polli:block polli:text-sm polli:font-bold polli:text-theme-text-strong">
                            {name}
                        </span>
                        <code className="polli:block polli:truncate polli:text-xs polli:text-theme-text-soft">
                            {variable}
                        </code>
                    </span>
                </Surface>
            ))}
        </Surface>
    </ShowcaseSection>
);

type IconItem = {
    name: string;
    Icon: ComponentType<IconProps>;
};

const iconItems: readonly IconItem[] = [
    { name: "AppIcon", Icon: AppIcon },
    { name: "BeakerIcon", Icon: BeakerIcon },
    { name: "BookIcon", Icon: BookIcon },
    { name: "CheckIcon", Icon: CheckIcon },
    { name: "ClipboardIcon", Icon: ClipboardIcon },
    { name: "ClockIcon", Icon: ClockIcon },
    { name: "DiscordIcon", Icon: DiscordIcon },
    { name: "DownloadIcon", Icon: DownloadIcon },
    { name: "ExternalLinkIcon", Icon: ExternalLinkIcon },
    { name: "GenApiIcon", Icon: GenApiIcon },
    { name: "GitHubIcon", Icon: GitHubIcon },
    { name: "ImageIcon", Icon: ImageIcon },
    { name: "LockIcon", Icon: LockIcon },
    { name: "MailIcon", Icon: MailIcon },
    { name: "McpIcon", Icon: McpIcon },
    { name: "MenuIcon", Icon: MenuIcon },
    { name: "TerminalIcon", Icon: TerminalIcon },
    { name: "TokensIcon", Icon: TokensIcon },
    { name: "TrendUpIcon", Icon: TrendUpIcon },
    { name: "WalletIcon", Icon: WalletIcon },
    { name: "XIcon", Icon: XIcon },
];

const IconsDemo: FC = () => (
    <ShowcaseSection
        id="icons"
        title="Icons"
        caption="Every exported SVG icon appears here with the same currentColor contract used by buttons and links."
    >
        <Surface
            variant="panel"
            className="polli:grid polli:gap-3"
            style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            }}
        >
            {iconItems.map(({ name, Icon }) => (
                <Surface
                    key={name}
                    className="polli:flex polli:items-center polli:gap-3"
                >
                    <span className="polli:flex polli:h-10 polli:w-10 polli:shrink-0 polli:items-center polli:justify-center polli:rounded-lg polli:bg-theme-bg-pale polli:text-theme-text-strong">
                        <Icon className="polli:h-5 polli:w-5" />
                    </span>
                    <code className="polli:min-w-0 polli:whitespace-nowrap polli:text-xs polli:text-theme-text-strong">
                        {name}
                    </code>
                </Surface>
            ))}
            <Surface className="polli:flex polli:items-center polli:gap-3">
                <span className="polli:flex polli:h-10 polli:w-10 polli:shrink-0 polli:items-center polli:justify-center polli:rounded-lg polli:bg-theme-bg-pale polli:text-theme-text-strong">
                    <ChevronIcon className="polli:h-4 polli:w-4" />
                </span>
                <span className="polli:min-w-0">
                    <code className="polli:block polli:whitespace-nowrap polli:text-xs polli:text-theme-text-strong">
                        ChevronIcon
                    </code>
                    <span className="polli:mt-1 polli:flex polli:gap-2 polli:text-theme-text-soft">
                        <ChevronIcon />
                        <ChevronIcon expanded />
                    </span>
                </span>
            </Surface>
        </Surface>
    </ShowcaseSection>
);

const ButtonsDemo: FC<{ theme: ThemeName }> = ({ theme }) => (
    <ShowcaseSection
        id="buttons"
        title="Buttons"
        caption="Button, link, icon, copy, chip, and tab affordances in their supported states."
    >
        <div className="polli:flex polli:flex-col polli:gap-3">
            <Row label="Button">
                <Button>Default</Button>
                <Button size="small">Small</Button>
                <Button size="large">Large</Button>
                <Button theme="blue">Theme prop</Button>
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
                <ExternalLinkButton
                    theme={theme}
                    href="https://pollinations.ai"
                    size="small"
                >
                    Small link
                </ExternalLinkButton>
            </Row>
            <Row label="Icon button">
                <IconButton title="Copy" onClick={noop}>
                    <ClipboardIcon className="polli:h-3.5 polli:w-3.5" />
                </IconButton>
                <IconButton title="Open" onClick={noop}>
                    <ExternalLinkIcon className="polli:h-3.5 polli:w-3.5" />
                </IconButton>
                <IconButton title="Delete" intent="danger" onClick={noop}>
                    <XIcon className="polli:h-3.5 polli:w-3.5" />
                </IconButton>
            </Row>
            <Row label="Copy button">
                <CopyButton
                    value="pk_showcase_123"
                    className={(copied) =>
                        `polli:inline-flex polli:h-8 polli:items-center polli:gap-2 polli:rounded-full polli:px-3 polli:text-sm polli:font-medium polli:transition-colors ${
                            copied
                                ? "polli:bg-green-100 polli:text-green-800"
                                : "polli:bg-theme-bg-active polli:text-theme-text-strong"
                        }`
                    }
                >
                    {(copied) => (
                        <>
                            {copied ? (
                                <CheckIcon className="polli:h-4 polli:w-4" />
                            ) : (
                                <ClipboardIcon className="polli:h-4 polli:w-4" />
                            )}
                            {copied ? "Copied" : "Copy key"}
                        </>
                    )}
                </CopyButton>
            </Row>
            <Row label="Tab button">
                <TabButton active onClick={noop}>
                    Active
                </TabButton>
                <TabButton active={false} onClick={noop}>
                    Inactive
                </TabButton>
                <TabButton active={false} disabled onClick={noop}>
                    Disabled
                </TabButton>
            </Row>
            <Row label="Chip">
                <Chip>Default</Chip>
                <Chip size="sm">Small</Chip>
                <Chip size="lg">Large</Chip>
                <Chip intent="news">NEW</Chip>
                <Chip intent="alpha">ALPHA</Chip>
                <Chip intent="neutral">Neutral</Chip>
                {themes.map((theme) => (
                    <Chip key={theme} theme={theme}>
                        {theme}
                    </Chip>
                ))}
            </Row>
        </div>
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
            id="inputs"
            title="Inputs"
            caption="Text, number, field composition, range, and binary toggle primitives."
        >
            <Surface
                variant="panel"
                className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] polli:gap-4"
            >
                <ControlGroup label="Input">
                    <Input placeholder="Name" />
                </ControlGroup>
                <ControlGroup label="Number">
                    <Input type="number" placeholder="100" hideNumberSteppers />
                </ControlGroup>
                <ControlGroup label="Error">
                    <Input placeholder="Invalid" error />
                </ControlGroup>
                <ControlGroup label="Disabled">
                    <Input placeholder="Disabled" disabled />
                </ControlGroup>
                <div className="polli:col-span-full">
                    <ArkField.Root
                        invalid
                        className="polli:flex polli:max-w-xl polli:flex-col polli:gap-1"
                    >
                        <ArkField.Label className="polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
                            Field
                            <ArkField.RequiredIndicator className="polli:ml-1 polli:text-intent-danger-text" />
                        </ArkField.Label>
                        <ArkField.Input
                            placeholder="email@example.com"
                            className="polli:rounded-lg polli:border polli:border-intent-danger-border polli:bg-white polli:px-3 polli:py-2 polli:text-sm"
                        />
                        <ArkField.HelperText className="polli:text-xs polli:text-theme-text-soft">
                            Exported Ark field namespace with package styling.
                        </ArkField.HelperText>
                        <ArkField.ErrorText className="polli:text-xs polli:font-medium polli:text-intent-danger-text">
                            Enter a valid email address.
                        </ArkField.ErrorText>
                    </ArkField.Root>
                </div>
                <div className="polli:col-span-full">
                    <ControlGroup label={`Slider ${sliderValue}`}>
                        <Slider
                            min={0}
                            max={100}
                            value={sliderValue}
                            aria-label="Slider"
                            onChange={(event) =>
                                setSliderValue(
                                    Number(event.currentTarget.value),
                                )
                            }
                        />
                    </ControlGroup>
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
                    <div className="polli:flex polli:flex-col polli:gap-1">
                        <span className="polli:text-xs polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-strong">
                            disabled
                        </span>
                        <Switch
                            checked
                            disabled
                            status="on"
                            ariaLabel="Disabled switch"
                            onChange={noopSwitch}
                        />
                    </div>
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
    const [selected, setSelected] = useState<string[]>(["images", "text"]);
    const [period, setPeriod] = useState<PeriodSelection>(() =>
        currentPeriod(),
    );

    return (
        <ShowcaseSection
            id="selection"
            title="Selection"
            caption="Mutually exclusive tabs, multiple selection, dropdowns, and period selection."
        >
            <Surface
                variant="panel"
                className="polli:flex polli:flex-col polli:gap-4"
            >
                <ControlGroup label="TabButton">
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
                </ControlGroup>
                <ControlGroup label="Dropdown">
                    <Dropdown
                        theme={theme}
                        align="start"
                        className="polli:w-56 polli:p-2"
                        trigger={(open) => (
                            <button
                                type="button"
                                className="polli:inline-flex polli:min-h-8 polli:items-center polli:gap-2 polli:rounded-full polli:border polli:border-theme-border polli:bg-theme-bg-subtle polli:px-3 polli:text-sm polli:font-medium polli:text-theme-text-base polli:hover:bg-theme-bg-pale"
                            >
                                Menu
                                <ChevronIcon expanded={open} />
                            </button>
                        )}
                    >
                        {(close) => (
                            <div className="polli:flex polli:flex-col">
                                {["Account", "Usage", "Settings"].map(
                                    (item) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={close}
                                            className="polli:rounded-md polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:text-theme-text-base polli:hover:bg-theme-bg-subtle"
                                        >
                                            {item}
                                        </button>
                                    ),
                                )}
                            </div>
                        )}
                    </Dropdown>
                </ControlGroup>
                <ControlGroup label="MultiSelect">
                    <div className="polli:flex polli:flex-wrap polli:gap-3">
                        <MultiSelect
                            options={[...selectionOptions]}
                            selected={selected}
                            onChange={setSelected}
                            placeholder="All"
                            align="start"
                            label="Types"
                            theme={theme}
                        />
                        <MultiSelect
                            options={[]}
                            selected={[]}
                            onChange={noopSelected}
                            placeholder="All"
                            disabled
                            disabledText="Unavailable"
                            label="Disabled"
                            theme={theme}
                        />
                    </div>
                </ControlGroup>
                <ControlGroup label="PeriodPicker">
                    <PeriodPicker
                        value={period}
                        onChange={setPeriod}
                        theme={theme}
                    />
                </ControlGroup>
            </Surface>
        </ShowcaseSection>
    );
};

const OverlaysDemo: FC<{ theme: ThemeName }> = ({ theme }) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [firstOpen, setFirstOpen] = useState(false);
    const [secondOpen, setSecondOpen] = useState(true);

    return (
        <ShowcaseSection
            id="overlays"
            title="Overlays and Disclosure"
            caption="Dialog, DialogTitle, Dropdown, Collapsible, and ScrollArea share the package interaction language."
        >
            <Surface
                variant="panel"
                className="polli:flex polli:flex-col polli:gap-4"
            >
                <Row label="Dialog">
                    <Button onClick={() => setDialogOpen(true)}>
                        Open dialog
                    </Button>
                    <Dialog
                        open={dialogOpen}
                        onOpenChange={setDialogOpen}
                        labelledBy="showcase-dialog-title"
                        theme={theme}
                        size="sm"
                    >
                        <div className="polli:p-6">
                            <DialogTitle
                                id="showcase-dialog-title"
                                className="polli:font-subheading polli:text-xl polli:text-theme-text-strong"
                            >
                                DialogTitle export
                            </DialogTitle>
                            <p className="polli:mt-2 polli:text-sm polli:text-theme-text-base">
                                The dialog is controlled by the host and uses
                                the same themed surface tokens.
                            </p>
                            <div className="polli:mt-5 polli:flex polli:justify-end polli:gap-2">
                                <Button
                                    size="small"
                                    onClick={() => setDialogOpen(false)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Row>
                <Surface className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] polli:gap-3">
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
                        <div className="polli:flex polli:flex-col polli:gap-2">
                            <p className="polli:text-sm polli:text-theme-text-base">
                                The same primitive works inside compact panels.
                            </p>
                            <Button size="small">Nested action</Button>
                        </div>
                    </Collapsible>
                    <Collapsible
                        expanded={false}
                        onToggle={noop}
                        disabled
                        wrapperClassName="polli:border-theme-border polli:bg-theme-bg-pale"
                        label={
                            <span className="polli:text-sm polli:font-medium polli:text-theme-text-strong">
                                Disabled row
                            </span>
                        }
                    >
                        Disabled content
                    </Collapsible>
                </Surface>
            </Surface>
        </ShowcaseSection>
    );
};

const LayoutDemo: FC<{ theme: ThemeName }> = ({ theme }) => (
    <ShowcaseSection
        id="layout"
        title="Layout"
        caption="Surface, Section, StatCard, and ScrollArea primitives for dense product screens."
    >
        <Surface
            variant="panel"
            className="polli:flex polli:flex-col polli:gap-4"
        >
            <div className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(210px,1fr))] polli:gap-3">
                <Surface>
                    <h3 className="polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                        Surface card
                    </h3>
                    <p className="polli:mt-1 polli:text-sm polli:text-theme-text-soft">
                        Neutral inner surface for dense content.
                    </p>
                </Surface>
                <Surface variant="card-themed">
                    <h3 className="polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                        Surface themed
                    </h3>
                    <p className="polli:mt-1 polli:text-sm polli:text-theme-text-soft">
                        Themed wash for highlights and grouped state.
                    </p>
                </Surface>
                <StatCard
                    label="StatCard"
                    value={formatPollen(1234.5678)}
                    detail="Tabular value with optional detail."
                    className="polli:rounded-xl polli:bg-surface-white polli:p-4"
                />
            </div>
            <PrimitiveSection
                title="Primitive section"
                theme={theme}
                framed
                action={<Button size="small">Action</Button>}
            >
                <p className="polli:text-sm polli:text-theme-text-soft">
                    Section owns heading layout and optional framing. The app
                    owns the content inside it.
                </p>
            </PrimitiveSection>
            <div className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] polli:gap-4">
                <Surface>
                    <p className="polli:mb-2 polli:font-mono polli:text-xs polli:uppercase polli:tracking-wide polli:text-theme-text-soft">
                        ScrollArea vertical
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
                        ScrollArea horizontal
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
            </div>
        </Surface>
    </ShowcaseSection>
);

const scrollRows = Array.from({ length: 28 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
);

const FeedbackDemo: FC = () => (
    <ShowcaseSection
        id="feedback"
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
                    <PaidChip size="lg">
                        {formatPollen(1234.5678)} Pollen
                    </PaidChip>
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

const modalities = [
    "text",
    "image",
    "video",
    "audio",
    "realtime",
    "embedding",
] as const;

const ModuleRecipesDemo: FC = () => {
    return (
        <ShowcaseSection
            id="modules"
            title="Shared Modules"
            caption="Package-owned pieces used by product screens; host apps provide the data and flows."
        >
            <Surface
                variant="panel"
                className="polli:flex polli:flex-col polli:gap-4"
            >
                <Row label="Wallet markers">
                    <PaidChip>Paid</PaidChip>
                    <TierChip>Tier</TierChip>
                    <span className="polli:inline-flex polli:items-center polli:gap-2 polli:text-sm polli:text-theme-text-strong">
                        <WalletDot kind="paid" />
                        paid balance
                    </span>
                    <span className="polli:inline-flex polli:items-center polli:gap-2 polli:text-sm polli:text-theme-text-strong">
                        <WalletDot kind="tier" />
                        tier balance
                    </span>
                </Row>
                <div className="polli:grid polli:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] polli:gap-3">
                    <WalletBalanceCard
                        kind="paid"
                        label="Paid"
                        value={formatPollen(24.812)}
                        footer={
                            <>
                                +{formatPollen(2.1)}{" "}
                                <span className="polli:font-medium polli:text-amber-800/70">
                                    / 7d
                                </span>
                            </>
                        }
                        info={<InfoTip content="Paid wallet balance." />}
                    />
                    <WalletBalanceCard
                        kind="tier"
                        label="Tier"
                        value={formatPollen(183.4)}
                        footer={
                            <>
                                +{formatPollen(8)}{" "}
                                <span className="polli:font-medium polli:text-amber-800/70">
                                    / 7d
                                </span>
                            </>
                        }
                        info={<InfoTip content="Tier allowance balance." />}
                    />
                </div>
                <Row label="ModalityButton">
                    {modalities.map((modality) => (
                        <ModalityButton key={modality} category={modality}>
                            {modality}
                        </ModalityButton>
                    ))}
                    <ModalityButton category="unknown" selected={false}>
                        unknown
                    </ModalityButton>
                    <ModalityButton category="text" disabled>
                        disabled
                    </ModalityButton>
                </Row>
                <Surface className="polli:flex polli:flex-col polli:gap-3">
                    <h3 className="polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                        Auth feedback
                    </h3>
                    <AuthInfoCard title="Authorize">
                        <p className="polli:text-sm polli:text-theme-text-base">
                            Sign in to approve this request and return to the
                            app.
                        </p>
                    </AuthInfoCard>
                    <ErrorBanner>Authorization failed. Try again.</ErrorBanner>
                </Surface>
            </Surface>
        </ShowcaseSection>
    );
};

const noop = () => undefined;
const noopSwitch = (_checked: boolean) => undefined;
const noopSelected = (_selected: string[]) => undefined;
