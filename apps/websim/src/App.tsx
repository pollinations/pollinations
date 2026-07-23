import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import {
    AppIcon,
    Button,
    ButtonGroup,
    ColorModeToggle,
    DownloadIcon,
    ExternalLinkIcon,
    FieldStack,
    Heading,
    MediaPlaceholder,
    Surface,
    TabButton,
    TerminalIcon,
    Text,
    Textarea,
    Tooltip,
} from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_MODEL, WEB_SIM_MODELS, type WebsimModelId } from "./config";

const INITIAL_PROMPT =
    "A tiny interactive museum for impossible plants, with a collection wall, specimen cards, and a night mode.";

function stripHtml(value: string) {
    const document = new DOMParser().parseFromString(value, "text/html");
    return (
        document.body.textContent ||
        document.documentElement.textContent ||
        ""
    )
        .replace(/\s+/g, " ")
        .trim();
}

function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error || "Generation failed");
}

type FundingAction = "key_budget" | "account_balance";

class GenerationError extends Error {
    readonly fundingAction: FundingAction | null;

    constructor(message: string, fundingAction: FundingAction | null = null) {
        super(message);
        this.name = "GenerationError";
        this.fundingAction = fundingAction;
    }
}

async function generationErrorFromResponse(response: Response) {
    if (response.headers.get("content-type")?.includes("application/json")) {
        const body = (await response.json()) as {
            error?: {
                message?: string;
                details?: { reason?: unknown };
            };
        };
        const reason = body.error?.details?.reason;
        const fundingAction =
            reason === "key_budget" || reason === "account_balance"
                ? reason
                : null;
        return new GenerationError(
            body.error?.message || `Generation failed with ${response.status}`,
            fundingAction,
        );
    }

    const body = stripHtml(await response.text());
    return new GenerationError(
        body || `Generation failed with ${response.status}`,
    );
}

function saveHtml(html: string) {
    const blobUrl = URL.createObjectURL(
        new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = "websim.html";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
}

function openHtml(html: string) {
    const blobUrl = URL.createObjectURL(
        new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

function PreviewPanel({
    html,
    isGenerating,
}: {
    html: string;
    isGenerating: boolean;
}) {
    return (
        <Surface
            variant="panel"
            className="websim-output-panel flex flex-col gap-4 p-4"
        >
            <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                    <AppIcon className="h-5 w-5 text-theme-text-soft" />
                    <Text as="h2" size="sm" tone="strong" weight="semibold">
                        Preview
                    </Text>
                </span>
                {html ? (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => saveHtml(html)}
                            className="gap-1.5"
                        >
                            <DownloadIcon className="h-4 w-4" />
                            Save
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => openHtml(html)}
                            className="gap-1.5"
                        >
                            <ExternalLinkIcon className="h-4 w-4" />
                            Open
                        </Button>
                    </div>
                ) : null}
            </div>

            <div className="websim-preview-shell min-h-0 flex-1 overflow-hidden rounded-lg border border-theme-border bg-surface-white">
                {html ? (
                    <iframe
                        title="Generated Websim page"
                        srcDoc={html}
                        sandbox="allow-forms allow-modals allow-popups allow-scripts"
                        className="websim-preview-frame h-full w-full border-0 bg-white"
                    />
                ) : (
                    <MediaPlaceholder
                        icon={<TerminalIcon className="h-5 w-5" />}
                        label={isGenerating ? "Generating..." : "Preview"}
                        detail={
                            isGenerating
                                ? "The page will appear in this frame."
                                : "Generated HTML appears here."
                        }
                        className="websim-preview-frame websim-preview-placeholder h-full w-full rounded-none border-0"
                    />
                )}
            </div>
        </Surface>
    );
}

export function App() {
    const { apiKey, isHydrated } = useAuthState();
    const { login, topUp } = useAuthActions();
    const [prompt, setPrompt] = useState(INITIAL_PROMPT);
    const [model, setModel] = useState<WebsimModelId>(DEFAULT_MODEL);
    const [html, setHtml] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [fundingAction, setFundingAction] = useState<FundingAction | null>(
        null,
    );
    const [isGenerating, setIsGenerating] = useState(false);
    const [isBuyingPollen, setIsBuyingPollen] = useState(false);
    const activeRequest = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => activeRequest.current?.abort();
    }, []);

    async function generate() {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) return;
        if (!apiKey) {
            login();
            return;
        }

        activeRequest.current?.abort();
        const controller = new AbortController();
        activeRequest.current = controller;
        setHtml("");
        setError(null);
        setFundingAction(null);
        setIsGenerating(true);

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({ prompt: trimmedPrompt, model }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw await generationErrorFromResponse(response);
            }

            setHtml(await response.text());
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                return;
            }
            setFundingAction(
                err instanceof GenerationError ? err.fundingAction : null,
            );
            setError(errorMessage(err));
        } finally {
            if (activeRequest.current === controller) {
                activeRequest.current = null;
                setIsGenerating(false);
            }
        }
    }

    function stopGenerating() {
        activeRequest.current?.abort();
        activeRequest.current = null;
        setIsGenerating(false);
    }

    async function buyPollen() {
        if (isBuyingPollen) return;
        setIsBuyingPollen(true);
        setError(null);
        try {
            await topUp({ packKey: "p5" });
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setIsBuyingPollen(false);
        }
    }

    const generateButton = (
        <Button
            type={apiKey ? "submit" : "button"}
            size="lg"
            disabled={!prompt.trim() || !isHydrated}
            onClick={apiKey ? undefined : () => login()}
        >
            Generate
        </Button>
    );

    return (
        <div
            data-theme="accent"
            className="relative flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base"
        >
            <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
                <ColorModeToggle />
                <AppUserMenu />
            </div>

            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pt-16 pb-5 sm:px-6">
                <section className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-theme-bg-active text-theme-text-strong">
                            <AppIcon className="h-6 w-6" />
                        </span>
                        <Heading
                            as="h1"
                            size="title"
                            className="websim-title m-0 text-theme-text-strong"
                        >
                            Websim
                        </Heading>
                    </div>
                    <Text as="p" className="m-0 max-w-3xl">
                        Generate shareable single-file web pages with
                        Pollinations.
                    </Text>
                </section>

                <section className="websim-main-grid grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] lg:items-stretch">
                    <Surface
                        variant="panel"
                        className="websim-control-panel flex flex-col gap-5 p-4 sm:p-6"
                    >
                        <form
                            className="flex min-h-0 flex-1 flex-col gap-5"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void generate();
                            }}
                        >
                            <FieldStack label="Prompt" className="flex-1">
                                <Textarea
                                    value={prompt}
                                    onChange={(event) =>
                                        setPrompt(event.currentTarget.value)
                                    }
                                    rows={9}
                                    disabled={isGenerating}
                                    className="websim-prompt-input"
                                />
                            </FieldStack>

                            <FieldStack label="Generation style">
                                <ButtonGroup
                                    aria-label="Generation style"
                                    className="websim-model-options flex-wrap"
                                >
                                    {WEB_SIM_MODELS.map((item) => (
                                        <TabButton
                                            key={item.id}
                                            size="sm"
                                            active={item.id === model}
                                            onClick={() => setModel(item.id)}
                                            disabled={isGenerating}
                                            ariaLabel={`${item.label}: ${item.detail}`}
                                            className="websim-model-option flex-col gap-0.5 px-4"
                                        >
                                            <span>{item.label}</span>
                                            <span className="text-xs font-normal opacity-75">
                                                {item.detail}
                                            </span>
                                        </TabButton>
                                    ))}
                                </ButtonGroup>
                            </FieldStack>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div
                                    role={error ? "alert" : "status"}
                                    aria-live={error ? "assertive" : "polite"}
                                    className="flex min-h-6 flex-wrap items-center gap-2"
                                >
                                    {error ? (
                                        <Text
                                            size="sm"
                                            tone="strong"
                                            className="text-intent-danger-text"
                                        >
                                            {error}
                                        </Text>
                                    ) : null}
                                    {fundingAction === "key_budget" ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => login({ budget: 5 })}
                                        >
                                            Renew app allowance
                                        </Button>
                                    ) : null}
                                    {fundingAction === "account_balance" ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={isBuyingPollen}
                                            aria-busy={isBuyingPollen}
                                            onClick={() => void buyPollen()}
                                        >
                                            {isBuyingPollen
                                                ? "Opening checkout…"
                                                : "Buy 5 Pollen"}
                                        </Button>
                                    ) : null}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {isGenerating ? (
                                        <Button
                                            type="button"
                                            size="lg"
                                            intent="danger"
                                            onClick={stopGenerating}
                                        >
                                            Stop
                                        </Button>
                                    ) : apiKey ? (
                                        generateButton
                                    ) : (
                                        <Tooltip
                                            triggerAs="span"
                                            align="center"
                                            content="Authorize Websim to generate."
                                        >
                                            {generateButton}
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                        </form>
                    </Surface>

                    <PreviewPanel html={html} isGenerating={isGenerating} />
                </section>
            </main>
        </div>
    );
}
