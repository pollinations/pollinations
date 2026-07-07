import {
    Alert,
    BeakerIcon,
    Button,
    CodeBlock,
    Collapsible,
    CopyButton,
    currentPeriod,
    ExternalLinkButton,
    FileUpload,
    ImageIcon,
    InfoTip,
    LinkCard,
    LockIcon,
    Markdown,
    MediaPlaceholder,
    MultiSelect,
    NavItem,
    PeriodPicker,
    type PeriodSelection,
    Prose,
    Section,
    StatCard,
    Text,
    TrendUpIcon,
    WalletIcon,
} from "@pollinations/ui";
import { useState } from "react";
import { CONTROL_SIZES, PageIntro, PrimitiveExample } from "./reference-layout";

const NAV_ITEM_OPTIONS = ["Models", "Usage", "Keys", "Billing"] as const;
const NAV_ITEM_ICONS = {
    Models: BeakerIcon,
    Usage: TrendUpIcon,
    Keys: LockIcon,
    Billing: WalletIcon,
} as const;

export function CompositionsPage() {
    const [activeNavItem, setActiveNavItem] =
        useState<(typeof NAV_ITEM_OPTIONS)[number]>("Models");
    const [collapsibleOpen, setCollapsibleOpen] = useState(true);
    const [selectedModalities, setSelectedModalities] = useState([
        "text",
        "image",
    ]);
    const [period, setPeriod] = useState<PeriodSelection>(() =>
        currentPeriod(),
    );
    const [files, setFiles] = useState<File[]>([]);

    return (
        <>
            <PageIntro>
                Compositions combine primitives into reusable patterns with
                their own state and behavior — a copy button, a file uploader, a
                period picker.
            </PageIntro>

            <section>
                <div className="grid gap-3">
                    <PrimitiveExample
                        name="ExternalLinkButton"
                        description="Button-styled link for leaving the current app surface."
                    >
                        <div className="flex flex-wrap gap-2">
                            {CONTROL_SIZES.map((size) => (
                                <ExternalLinkButton
                                    key={size}
                                    href="https://pollinations.ai"
                                    size={size}
                                >
                                    {size}
                                </ExternalLinkButton>
                            ))}
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="CopyButton"
                        description="Clipboard helper with copied state and caller-owned visual styling."
                    >
                        <CopyButton
                            value="pollinations"
                            className="rounded-full bg-theme-bg-active px-3 py-1.5 text-sm font-medium text-theme-text-strong"
                        >
                            {(copied) => (copied ? "Copied" : "Copy value")}
                        </CopyButton>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="LinkCard"
                        description="Clickable card composition for grouped navigation targets."
                    >
                        <LinkCard href="https://pollinations.ai">
                            <p className="font-semibold">Documentation</p>
                            <p className="text-sm text-theme-text-soft">
                                Open the public docs.
                            </p>
                        </LinkCard>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="NavItem"
                        description="Themed pill for navigation and section lists."
                    >
                        <div className="flex flex-wrap gap-2">
                            {NAV_ITEM_OPTIONS.map((item) => (
                                <NavItem
                                    key={item}
                                    type="button"
                                    icon={NAV_ITEM_ICONS[item]}
                                    active={activeNavItem === item}
                                    onClick={() => setActiveNavItem(item)}
                                >
                                    {item}
                                </NavItem>
                            ))}
                        </div>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="MultiSelect"
                        description="Compact multi-choice control for tags and filters."
                    >
                        <MultiSelect
                            options={[
                                { value: "text", label: "Text" },
                                { value: "image", label: "Image" },
                                { value: "video", label: "Video" },
                                { value: "audio", label: "Audio" },
                            ]}
                            selected={selectedModalities}
                            onChange={setSelectedModalities}
                            label="Types"
                            placeholder="All"
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="PeriodPicker"
                        description="Preset time-window selector for dashboards and usage views."
                    >
                        <PeriodPicker value={period} onChange={setPeriod} />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Collapsible"
                        description="Inline disclosure for optional nested content."
                    >
                        <Collapsible
                            label={
                                <span className="font-semibold">
                                    Advanced settings
                                </span>
                            }
                            expanded={collapsibleOpen}
                            onToggle={() =>
                                setCollapsibleOpen((current) => !current)
                            }
                            wrapperClassName="border-theme-border bg-theme-bg-pale"
                        >
                            <p className="text-sm text-theme-text-soft">
                                Optional controls can live behind this row.
                            </p>
                        </Collapsible>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Alert"
                        description="Inline feedback for informational, warning, and error states."
                    >
                        <Alert title="Synced">Settings are up to date.</Alert>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="StatCard"
                        description="Labeled value display for dense metrics and facts."
                    >
                        <StatCard
                            label="Requests"
                            value="1,284"
                            detail="last 24 hours"
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Section"
                        description="Reusable page section wrapper with optional framed content and action slot."
                    >
                        <Section
                            title="Section title"
                            framed
                            intro="Intro copy belongs to the section API."
                            action={<Button size="sm">Action</Button>}
                        >
                            <Text size="sm" tone="soft">
                                Framed section content.
                            </Text>
                        </Section>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="InfoTip"
                        description="Small information badge backed by the tooltip primitive."
                    >
                        <p className="inline-flex items-center text-sm text-theme-text-soft">
                            Request cost
                            <InfoTip text="Costs vary by selected model." />
                        </p>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Markdown"
                        description="Compact markdown rendering for cards and snippets."
                    >
                        <Markdown className="text-sm text-theme-text-soft">
                            {
                                '**Generation note**\n\n- Use `model: "openai"` for text\n- Add **image input** when available\n- See [API docs](https://pollinations.ai)'
                            }
                        </Markdown>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="Prose"
                        description="Document-style markdown rendering for longer content."
                    >
                        <Prose className="text-sm">
                            {"### Heading\nParagraph text with **emphasis**."}
                        </Prose>
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="CodeBlock"
                        description="Themed code surface; copy actions stay separate."
                    >
                        <CodeBlock
                            code={
                                'await generateText("Hello", { model: "openai" });'
                            }
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="FileUpload"
                        description="File import recipe with validation, rejected file feedback, and remove actions."
                    >
                        <FileUpload
                            value={files}
                            onChange={setFiles}
                            maxFiles={2}
                        />
                    </PrimitiveExample>

                    <PrimitiveExample
                        name="MediaPlaceholder"
                        description="Empty output state for generated image, video, or audio surfaces."
                    >
                        <MediaPlaceholder
                            icon={<ImageIcon className="h-5 w-5" />}
                            label="Output preview"
                            detail="Generated media appears here."
                        />
                    </PrimitiveExample>
                </div>
            </section>
        </>
    );
}
