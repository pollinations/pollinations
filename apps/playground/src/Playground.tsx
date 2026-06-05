import {
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCategory,
    Pollinations,
} from "@pollinations/sdk/client";
import { useAuthState } from "@pollinations/sdk/react";
import {
    Alert,
    Button,
    ButtonGroup,
    cn,
    Field,
    FileUpload,
    Input,
    Surface,
    TabButton,
    Textarea,
    type ThemeName,
} from "@pollinations/ui";
import {
    categoryLabel,
    ModelSelector,
    modalityTheme,
} from "@pollinations/ui/gen";
import { useEffect, useMemo, useState } from "react";

const EMPTY_CATALOG: ModelCatalog = {
    models: [],
    allowedModelIds: new Set(),
};

const CATEGORY_ORDER: ModelCategory[] = ["image", "video", "text", "audio"];

type PlaygroundResult =
    | {
          type: "image" | "video" | "audio";
          url: string;
          contentType: string;
      }
    | {
          type: "text";
          text: string;
      };

export type PlaygroundProps = {
    title?: string;
    subtitle?: string;
    theme?: ThemeName;
    className?: string;
};

function usePlaygroundCatalog(apiKey: string | null) {
    const [catalog, setCatalog] = useState<ModelCatalog>(EMPTY_CATALOG);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setIsLoading(true);
        setError(null);

        fetchModelCatalog({ apiKey, signal: controller.signal })
            .then((nextCatalog) => {
                setCatalog(nextCatalog);
                setIsLoading(false);
            })
            .catch((err) => {
                if (err instanceof DOMException && err.name === "AbortError") {
                    return;
                }
                setError(err instanceof Error ? err : new Error(String(err)));
                setCatalog(EMPTY_CATALOG);
                setIsLoading(false);
            });

        return () => controller.abort();
    }, [apiKey]);

    return { catalog, isLoading, error };
}

function promptPlaceholder(category: ModelCategory): string {
    if (category === "image")
        return "A luminous greenhouse full of tiny AI tools";
    if (category === "video")
        return "A slow cinematic orbit around a glass workshop";
    if (category === "audio")
        return "A calm voice introducing a new creative tool";
    return "Explain how to build a tiny AI app with Pollinations";
}

function getResultExtension(result: PlaygroundResult): string {
    if (result.type === "image") return "png";
    if (result.type === "video") return "mp4";
    if (result.type === "audio") return "mp3";
    return "txt";
}

function bytesToObjectUrl(buffer: ArrayBuffer, contentType: string): string {
    return URL.createObjectURL(new Blob([buffer], { type: contentType }));
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || "Something went wrong");
}

function ModalityTabs({
    activeCategory,
    onCategoryChange,
}: {
    activeCategory: ModelCategory;
    onCategoryChange: (category: ModelCategory) => void;
}) {
    return (
        <ButtonGroup aria-label="Modality">
            {CATEGORY_ORDER.map((category) => (
                <TabButton
                    key={category}
                    active={activeCategory === category}
                    theme={modalityTheme(category)}
                    size="sm"
                    onClick={() => onCategoryChange(category)}
                >
                    {categoryLabel(category)}
                </TabButton>
            ))}
        </ButtonGroup>
    );
}

function ResultPanel({
    result,
    isLoading,
    activeCategory,
    className,
}: {
    result: PlaygroundResult | null;
    isLoading: boolean;
    activeCategory: ModelCategory;
    className?: string;
}) {
    return (
        <Surface
            theme={modalityTheme(activeCategory)}
            variant="panel"
            className={cn(
                "polli:flex polli:min-h-[360px] polli:flex-col polli:gap-4 polli:p-4",
                className,
            )}
        >
            <div className="polli:flex polli:items-center polli:justify-between polli:gap-3">
                <h2 className="polli:m-0 polli:text-sm polli:font-semibold polli:text-gray-950">
                    Output
                </h2>
                {result && result.type !== "text" && (
                    <Button
                        as="a"
                        href={result.url}
                        download={`pollinations-playground.${getResultExtension(
                            result,
                        )}`}
                        theme={modalityTheme(activeCategory)}
                        size="sm"
                    >
                        Save
                    </Button>
                )}
            </div>

            <div className="polli:flex polli:min-h-0 polli:flex-1 polli:items-center polli:justify-center polli:overflow-hidden polli:rounded-xl polli:bg-surface-white polli:p-3 polli:text-gray-950">
                {isLoading && (
                    <p className="polli:m-0 polli:text-gray-700">
                        Generating...
                    </p>
                )}

                {!isLoading && !result && (
                    <p className="polli:m-0 polli:text-gray-700">
                        Generated results appear here.
                    </p>
                )}

                {!isLoading && result?.type === "image" && (
                    <img
                        src={result.url}
                        alt="Generated"
                        className="polli:max-h-full polli:w-full polli:rounded-lg polli:object-contain"
                    />
                )}

                {!isLoading && result?.type === "video" && (
                    <video
                        src={result.url}
                        controls
                        autoPlay
                        loop
                        muted
                        className="polli:max-h-full polli:w-full polli:rounded-lg"
                    >
                        <track kind="captions" />
                    </video>
                )}

                {!isLoading && result?.type === "audio" && (
                    <audio
                        src={result.url}
                        controls
                        autoPlay
                        className="polli:w-full"
                    >
                        <track kind="captions" />
                    </audio>
                )}

                {!isLoading && result?.type === "text" && (
                    <p className="polli:m-0 polli:w-full polli:whitespace-pre-wrap polli:text-sm polli:leading-6 polli:text-gray-950">
                        {result.text}
                    </p>
                )}
            </div>
        </Surface>
    );
}

async function uploadReferenceImages(
    client: Pollinations,
    files: File[],
): Promise<string[]> {
    const uploads = await Promise.all(
        files.map((file) =>
            client.upload(file, {
                name: file.name,
                contentType: file.type || undefined,
            }),
        ),
    );
    return uploads.map((upload) => upload.url);
}

export function Playground({
    title = "Playground",
    subtitle = "Create and refine images, text, audio, and video from one focused workspace.",
    theme = "violet",
    className,
}: PlaygroundProps) {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const {
        catalog,
        isLoading,
        error: catalogError,
    } = usePlaygroundCatalog(apiKey);
    const [activeCategory, setActiveCategory] =
        useState<ModelCategory>("image");
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [seed, setSeed] = useState(0);
    const [referenceImages, setReferenceImages] = useState<File[]>([]);
    const [selectedVoice, setSelectedVoice] = useState("");
    const [result, setResult] = useState<PlaygroundResult | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentModel = useMemo(
        () => catalog.models.find((model) => model.id === selectedModel),
        [catalog.models, selectedModel],
    );

    useEffect(() => {
        if (catalog.models.length === 0) return;
        if (catalog.models.some((model) => model.id === selectedModel)) return;
        const fallback =
            catalog.models.find((model) => model.id === "flux") ??
            catalog.models.find((model) => model.category === "image") ??
            catalog.models[0];
        if (fallback) {
            setSelectedModel(fallback.id);
            setActiveCategory(fallback.category);
        }
    }, [catalog.models, selectedModel]);

    useEffect(() => {
        if (!currentModel) return;
        const [firstVoice] = currentModel.voices;
        if (!firstVoice) {
            if (selectedVoice) setSelectedVoice("");
            return;
        }
        if (!currentModel.voices.includes(selectedVoice)) {
            setSelectedVoice(firstVoice);
        }
    }, [currentModel, selectedVoice]);

    useEffect(() => {
        return () => {
            if (result && result.type !== "text") {
                URL.revokeObjectURL(result.url);
            }
        };
    }, [result]);

    const supportsReferenceImages =
        currentModel?.inputModalities.includes("image") ?? false;
    const selectedModelAllowed =
        !!currentModel &&
        isLoggedIn &&
        catalog.allowedModelIds.has(currentModel.id);
    const activeTheme = currentModel
        ? modalityTheme(currentModel.category)
        : modalityTheme(activeCategory);

    function selectCategory(category: ModelCategory) {
        setActiveCategory(category);
        if (currentModel?.category === category) return;

        const fallback =
            catalog.models.find(
                (model) =>
                    model.category === category &&
                    (!isLoggedIn || catalog.allowedModelIds.has(model.id)),
            ) ?? catalog.models.find((model) => model.category === category);

        if (fallback) setSelectedModel(fallback.id);
    }

    async function generate() {
        if (!apiKey) {
            setError("Authorize the app before generating.");
            return;
        }
        if (!currentModel) {
            setError("Select a model first.");
            return;
        }
        if (!selectedModelAllowed) {
            setError("This key cannot use the selected model.");
            return;
        }
        if (!prompt.trim()) {
            setError("Enter a prompt first.");
            return;
        }

        setIsGenerating(true);
        setError(null);
        setResult(null);

        try {
            const client = new Pollinations({ apiKey });
            const referenceUrls = supportsReferenceImages
                ? await uploadReferenceImages(client, referenceImages)
                : [];

            if (
                currentModel.category === "image" ||
                currentModel.category === "video"
            ) {
                const response = await client.image(prompt.trim(), {
                    model: currentModel.id,
                    width,
                    height,
                    seed,
                    referenceImage:
                        referenceUrls.length > 0 ? referenceUrls : undefined,
                });
                const contentType = response.contentType;
                const type =
                    currentModel.category === "video" ||
                    contentType.startsWith("video/")
                        ? "video"
                        : "image";
                setResult({
                    type,
                    url: bytesToObjectUrl(response.buffer, contentType),
                    contentType,
                });
                return;
            }

            if (currentModel.category === "audio") {
                const response = await client.audio(prompt.trim(), {
                    model: currentModel.id,
                    voice: selectedVoice || undefined,
                });
                setResult({
                    type: "audio",
                    url: bytesToObjectUrl(
                        response.buffer,
                        response.contentType,
                    ),
                    contentType: response.contentType,
                });
                return;
            }

            const content =
                referenceUrls.length > 0
                    ? [
                          { type: "text" as const, text: prompt.trim() },
                          ...referenceUrls.map((url) => ({
                              type: "image_url" as const,
                              image_url: { url },
                          })),
                      ]
                    : prompt.trim();
            const response = await client.chat([{ role: "user", content }], {
                model: currentModel.id,
            });
            setResult({
                type: "text",
                text: response.choices[0]?.message.content || "No response",
            });
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setIsGenerating(false);
        }
    }

    return (
        <div
            data-theme={theme}
            className={cn(
                "polli:flex polli:w-full polli:flex-col polli:gap-5 polli:text-gray-950",
                className,
            )}
        >
            <section className="polli:flex polli:flex-col polli:gap-1">
                <h1 className="polli-playground-title polli:m-0 polli:font-heading polli:text-4xl polli:leading-none">
                    {title}
                </h1>
                <p className="polli-playground-subtitle polli:m-0 polli:max-w-3xl polli:text-base">
                    {subtitle}
                </p>
            </section>

            {catalogError && (
                <Alert intent="danger">
                    Model catalog failed to load: {catalogError.message}
                </Alert>
            )}

            <div className="polli-playground-main-grid">
                <div className="polli:flex polli:flex-col polli:gap-4">
                    <Surface
                        theme={activeTheme}
                        variant="panel"
                        className="polli:flex polli:flex-col polli:gap-4 polli:p-4"
                    >
                        <div className="polli-playground-control-bar">
                            <ModalityTabs
                                activeCategory={activeCategory}
                                onCategoryChange={selectCategory}
                            />
                            <ModelSelector
                                models={catalog.models}
                                category={activeCategory}
                                value={selectedModel}
                                isLoading={isLoading || !isHydrated}
                                onChange={setSelectedModel}
                            />
                        </div>
                    </Surface>

                    <Surface
                        theme={activeTheme}
                        variant="panel"
                        className="polli:flex polli:flex-col polli:gap-4 polli:p-4"
                    >
                        <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                            <Field.Label className="polli:text-sm polli:font-semibold polli:text-gray-950">
                                Prompt
                            </Field.Label>
                            <Textarea
                                value={prompt}
                                rows={7}
                                onChange={(event) =>
                                    setPrompt(event.target.value)
                                }
                                placeholder={promptPlaceholder(
                                    currentModel?.category ?? activeCategory,
                                )}
                                className="polli-playground-textarea polli:min-h-44"
                            />
                        </Field.Root>

                        {supportsReferenceImages && (
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-gray-950">
                                    Reference images
                                </Field.Label>
                                <FileUpload
                                    value={referenceImages}
                                    onChange={setReferenceImages}
                                    maxFiles={4}
                                    maxSizeBytes={5 * 1024 * 1024}
                                    theme={activeTheme}
                                    onReject={(rejected) => {
                                        const reason = rejected[0]?.reason;
                                        if (reason === "size") {
                                            setError(
                                                "Images must be under 5 MB each.",
                                            );
                                        } else if (reason === "count") {
                                            setError(
                                                "Use up to 4 reference images.",
                                            );
                                        } else if (reason === "type") {
                                            setError(
                                                "Only image files are allowed.",
                                            );
                                        }
                                    }}
                                />
                            </Field.Root>
                        )}

                        {(currentModel?.category === "image" ||
                            currentModel?.category === "video") && (
                            <div className="polli-playground-settings-grid">
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-gray-950">
                                        Width
                                    </Field.Label>
                                    <Input
                                        type="number"
                                        min={256}
                                        max={2048}
                                        step={64}
                                        value={width}
                                        onChange={(event) =>
                                            setWidth(Number(event.target.value))
                                        }
                                        hideNumberSteppers
                                    />
                                </Field.Root>
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-gray-950">
                                        Height
                                    </Field.Label>
                                    <Input
                                        type="number"
                                        min={256}
                                        max={2048}
                                        step={64}
                                        value={height}
                                        onChange={(event) =>
                                            setHeight(
                                                Number(event.target.value),
                                            )
                                        }
                                        hideNumberSteppers
                                    />
                                </Field.Root>
                                <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                    <Field.Label className="polli:text-sm polli:font-semibold polli:text-gray-950">
                                        Seed
                                    </Field.Label>
                                    <Input
                                        type="number"
                                        value={seed}
                                        onChange={(event) =>
                                            setSeed(Number(event.target.value))
                                        }
                                        hideNumberSteppers
                                    />
                                </Field.Root>
                            </div>
                        )}

                        {currentModel && currentModel.voices.length > 0 && (
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-gray-950">
                                    Voice
                                </Field.Label>
                                <ButtonGroup aria-label="Voice">
                                    {currentModel.voices.map((voice) => (
                                        <TabButton
                                            key={voice}
                                            active={selectedVoice === voice}
                                            theme={modalityTheme("audio")}
                                            size="sm"
                                            onClick={() =>
                                                setSelectedVoice(voice)
                                            }
                                        >
                                            {voice}
                                        </TabButton>
                                    ))}
                                </ButtonGroup>
                            </Field.Root>
                        )}

                        {error && <Alert intent="danger">{error}</Alert>}

                        <Button
                            type="button"
                            theme={activeTheme}
                            size="lg"
                            disabled={
                                isGenerating ||
                                !apiKey ||
                                !prompt.trim() ||
                                !selectedModelAllowed
                            }
                            onClick={generate}
                            className="polli:w-full polli:self-auto"
                        >
                            {isGenerating
                                ? "Generating..."
                                : currentModel?.category === "video"
                                  ? "Generate video"
                                  : currentModel?.category === "audio"
                                    ? "Generate audio"
                                    : currentModel?.category === "text"
                                      ? "Generate text"
                                      : "Generate image"}
                        </Button>
                    </Surface>
                </div>

                <ResultPanel
                    result={result}
                    isLoading={isGenerating}
                    activeCategory={currentModel?.category ?? activeCategory}
                    className="polli-playground-output-panel"
                />
            </div>
        </div>
    );
}
