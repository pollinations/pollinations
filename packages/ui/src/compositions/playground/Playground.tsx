import {
    fetchModelCatalog,
    type ModelCatalog,
    type ModelCatalogCategory,
    type ModelCatalogItem,
    Pollinations,
} from "@pollinations/sdk/client";
import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/cn.ts";
import {
    getModalityColors,
    type ModalityColorSet,
} from "../../modules/modality/colors.ts";
import { Alert } from "../../primitives/Alert.tsx";
import { Button } from "../../primitives/Button.tsx";
import { Chip } from "../../primitives/Chip.tsx";
import { Field } from "../../primitives/Field.tsx";
import { FileUpload } from "../../primitives/FileUpload.tsx";
import { Input } from "../../primitives/Input.tsx";
import {
    BeakerIcon,
    DownloadIcon,
    ImageIcon,
} from "../../primitives/icons/index.tsx";
import { Slider } from "../../primitives/Slider.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { Switch } from "../../primitives/Switch.tsx";
import { Textarea } from "../../primitives/Textarea.tsx";
import type { ThemeName } from "../../theme.ts";

const EMPTY_CATALOG: ModelCatalog = {
    models: [],
    allowedModelIds: new Set(),
    allowedImageModelIds: new Set(),
    allowedTextModelIds: new Set(),
    allowedAudioModelIds: new Set(),
};

const CATEGORY_LABELS: Record<ModelCatalogCategory, string> = {
    image: "Image",
    video: "Video",
    text: "Text",
    audio: "Audio",
};

const CATEGORY_ORDER: ModelCatalogCategory[] = [
    "image",
    "video",
    "text",
    "audio",
];
const MODEL_SKELETON_KEYS = [
    "model-skeleton-1",
    "model-skeleton-2",
    "model-skeleton-3",
    "model-skeleton-4",
    "model-skeleton-5",
    "model-skeleton-6",
    "model-skeleton-7",
    "model-skeleton-8",
];

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

function displayModelName(model: ModelCatalogItem): string {
    return model.description?.split(" - ")[0] || model.name || model.id;
}

function promptPlaceholder(category: ModelCatalogCategory): string {
    if (category === "image")
        return "A luminous greenhouse full of tiny AI tools";
    if (category === "video")
        return "A slow cinematic orbit around a glass workshop";
    if (category === "audio")
        return "A calm voice introducing a new creative tool";
    return "Explain how to build a tiny AI app with Pollinations";
}

function modalityColors(category: ModelCatalogCategory): ModalityColorSet {
    const colors = getModalityColors(category) ?? getModalityColors("text");
    if (!colors) {
        throw new Error(`Missing modality colors for ${category}`);
    }
    return colors;
}

function modalityTheme(category: ModelCatalogCategory): ThemeName {
    return modalityColors(category).theme;
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

function base64ToObjectUrl(data: string, contentType: string): string {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytesToObjectUrl(bytes.buffer, contentType);
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || "Something went wrong");
}

function ModelPicker({
    models,
    activeCategory,
    selectedModel,
    allowedModelIds,
    isLoggedIn,
    isLoading,
    onCategoryChange,
    onModelChange,
}: {
    models: ModelCatalogItem[];
    activeCategory: ModelCatalogCategory;
    selectedModel: string;
    allowedModelIds: Set<string>;
    isLoggedIn: boolean;
    isLoading: boolean;
    onCategoryChange: (category: ModelCatalogCategory) => void;
    onModelChange: (modelId: string) => void;
}) {
    const filteredModels = models.filter(
        (model) => model.category === activeCategory,
    );
    const activeColors = modalityColors(activeCategory);

    return (
        <Surface
            theme={activeColors.theme}
            variant="panel"
            className="polli:flex polli:flex-col polli:gap-4 polli:p-4"
        >
            <div className="polli:flex polli:items-center polli:justify-between polli:gap-3">
                <div>
                    <h2 className="polli:m-0 polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                        Models
                    </h2>
                    <p className="polli:m-0 polli:text-sm polli:text-theme-text-soft">
                        {filteredModels.length} in{" "}
                        {CATEGORY_LABELS[activeCategory].toLowerCase()}
                    </p>
                </div>
                <BeakerIcon className="polli:h-5 polli:w-5 polli:text-theme-text-soft" />
            </div>

            <div className="polli:grid polli:grid-cols-2 polli:gap-2">
                {CATEGORY_ORDER.map((category) => (
                    <Button
                        key={category}
                        type="button"
                        theme={modalityTheme(category)}
                        size="small"
                        className={cn(
                            "polli:w-full polli:self-auto polli:rounded-lg",
                            activeCategory === category
                                ? modalityColors(category).filled
                                : cn(
                                      "polli:bg-gray-100 polli:text-gray-600",
                                      modalityColors(category).hover,
                                  ),
                        )}
                        onClick={() => onCategoryChange(category)}
                    >
                        {CATEGORY_LABELS[category]}
                    </Button>
                ))}
            </div>

            <div className="polli:flex polli:max-h-[42dvh] polli:flex-col polli:gap-2 polli:overflow-y-auto polli:pr-1">
                {isLoading
                    ? MODEL_SKELETON_KEYS.map((key) => (
                          <div
                              key={key}
                              className="polli:h-12 polli:rounded-xl polli:bg-theme-bg-pale polli:animate-pulse"
                          />
                      ))
                    : filteredModels.map((model) => {
                          const colors = modalityColors(model.category);
                          const isAllowed =
                              isLoggedIn && allowedModelIds.has(model.id);
                          const isActive = selectedModel === model.id;
                          return (
                              <button
                                  key={model.id}
                                  type="button"
                                  disabled={!isAllowed}
                                  title={model.description || model.id}
                                  onClick={() => onModelChange(model.id)}
                                  className={cn(
                                      "polli:flex polli:w-full polli:items-start polli:justify-between polli:gap-3 polli:rounded-xl polli:px-3 polli:py-2 polli:text-left polli:transition",
                                      isActive
                                          ? colors.filled
                                          : "polli:bg-gray-100 polli:text-gray-600",
                                      isAllowed
                                          ? cn(
                                                "polli:cursor-pointer",
                                                !isActive && colors.hover,
                                            )
                                          : "polli:cursor-not-allowed polli:opacity-45",
                                  )}
                              >
                                  <span className="polli:min-w-0">
                                      <span className="polli:block polli:truncate polli:text-sm polli:font-semibold">
                                          {displayModelName(model)}
                                      </span>
                                      <span className="polli:block polli:truncate polli:text-xs polli:opacity-70">
                                          {model.id}
                                      </span>
                                  </span>
                                  {model.paidOnly && (
                                      <Chip className="polli:shrink-0">
                                          paid
                                      </Chip>
                                  )}
                              </button>
                          );
                      })}
            </div>
        </Surface>
    );
}

function ResultPanel({
    result,
    isLoading,
    activeCategory,
}: {
    result: PlaygroundResult | null;
    isLoading: boolean;
    activeCategory: ModelCatalogCategory;
}) {
    return (
        <Surface
            theme={modalityTheme(activeCategory)}
            variant="panel"
            className="polli:flex polli:min-h-[420px] polli:flex-col polli:gap-4 polli:p-4"
        >
            <div className="polli:flex polli:items-center polli:justify-between polli:gap-3">
                <h2 className="polli:m-0 polli:font-subheading polli:text-xl polli:text-theme-text-strong">
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
                        size="small"
                    >
                        <DownloadIcon className="polli:mr-1 polli:h-4 polli:w-4" />
                        Save
                    </Button>
                )}
            </div>

            <div className="polli:flex polli:min-h-0 polli:flex-1 polli:items-center polli:justify-center polli:overflow-hidden polli:rounded-xl polli:bg-surface-white polli:p-3">
                {isLoading && (
                    <div className="polli:flex polli:items-center polli:gap-2 polli:text-sm polli:text-theme-text-soft">
                        <span className="polli:h-2 polli:w-2 polli:animate-bounce polli:rounded-full polli:bg-theme-text-soft" />
                        <span className="polli:h-2 polli:w-2 polli:animate-bounce polli:rounded-full polli:bg-theme-text-soft [animation-delay:120ms]" />
                        <span className="polli:h-2 polli:w-2 polli:animate-bounce polli:rounded-full polli:bg-theme-text-soft [animation-delay:240ms]" />
                    </div>
                )}

                {!isLoading && !result && (
                    <div className="polli:flex polli:flex-col polli:items-center polli:gap-2 polli:text-center polli:text-sm polli:text-theme-text-soft">
                        <ImageIcon className="polli:h-8 polli:w-8" />
                        <span>Generated results appear here.</span>
                    </div>
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
                    <p className="polli:m-0 polli:w-full polli:whitespace-pre-wrap polli:text-sm polli:leading-6 polli:text-theme-text-base">
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
    const { login } = useAuthActions();
    const {
        catalog,
        isLoading,
        error: catalogError,
    } = usePlaygroundCatalog(apiKey);
    const [activeCategory, setActiveCategory] =
        useState<ModelCatalogCategory>("image");
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [seed, setSeed] = useState(0);
    const [enhance, setEnhance] = useState(false);
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

    async function generate() {
        if (!apiKey) {
            login();
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
                    enhance,
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
                if (currentModel.source === "text") {
                    const response = await client.chat(
                        [{ role: "user", content: prompt.trim() }],
                        {
                            model: currentModel.id,
                            modalities: ["text", "audio"],
                            audio: {
                                voice: selectedVoice || "alloy",
                                format: "wav",
                            },
                        },
                    );
                    const audio = response.choices[0]?.message.audio?.data;
                    if (!audio) throw new Error("No audio response");
                    setResult({
                        type: "audio",
                        url: base64ToObjectUrl(audio, "audio/wav"),
                        contentType: "audio/wav",
                    });
                    return;
                }

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
                "polli:flex polli:w-full polli:flex-col polli:gap-5 polli:text-theme-text-base",
                className,
            )}
        >
            <section className="polli:flex polli:flex-col polli:gap-2">
                <h1 className="polli:m-0 polli:font-heading polli:text-4xl polli:text-theme-text-strong sm:polli:text-5xl">
                    {title}
                </h1>
                <p className="polli:m-0 polli:max-w-3xl polli:text-base polli:text-theme-text-soft">
                    {subtitle}
                </p>
            </section>

            {catalogError && (
                <Alert intent="danger">
                    Model catalog failed to load: {catalogError.message}
                </Alert>
            )}

            <div className="polli:grid polli:gap-4 xl:polli:grid-cols-[280px_minmax(0,1fr)_360px]">
                <ModelPicker
                    models={catalog.models}
                    activeCategory={activeCategory}
                    selectedModel={selectedModel}
                    allowedModelIds={catalog.allowedModelIds}
                    isLoggedIn={isLoggedIn}
                    isLoading={isLoading || !isHydrated}
                    onCategoryChange={setActiveCategory}
                    onModelChange={setSelectedModel}
                />

                <Surface
                    theme={activeTheme}
                    variant="panel"
                    className="polli:flex polli:flex-col polli:gap-5 polli:p-4"
                >
                    <div className="polli:flex polli:flex-wrap polli:items-center polli:justify-between polli:gap-3">
                        <div>
                            <h2 className="polli:m-0 polli:font-subheading polli:text-xl polli:text-theme-text-strong">
                                Prompt
                            </h2>
                            {currentModel && (
                                <p className="polli:m-0 polli:text-sm polli:text-theme-text-soft">
                                    {displayModelName(currentModel)}
                                </p>
                            )}
                        </div>
                        {currentModel && (
                            <Chip>
                                {CATEGORY_LABELS[currentModel.category]}
                            </Chip>
                        )}
                    </div>

                    <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                        <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                            Prompt
                        </Field.Label>
                        <Textarea
                            value={prompt}
                            rows={8}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder={promptPlaceholder(
                                currentModel?.category ?? activeCategory,
                            )}
                        />
                    </Field.Root>

                    {supportsReferenceImages && (
                        <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                            <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
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
                        <div className="polli:grid polli:gap-4 md:polli:grid-cols-2">
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
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
                                <Slider
                                    min={256}
                                    max={2048}
                                    step={64}
                                    value={width}
                                    onChange={(event) =>
                                        setWidth(Number(event.target.value))
                                    }
                                />
                            </Field.Root>
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                    Height
                                </Field.Label>
                                <Input
                                    type="number"
                                    min={256}
                                    max={2048}
                                    step={64}
                                    value={height}
                                    onChange={(event) =>
                                        setHeight(Number(event.target.value))
                                    }
                                    hideNumberSteppers
                                />
                                <Slider
                                    min={256}
                                    max={2048}
                                    step={64}
                                    value={height}
                                    onChange={(event) =>
                                        setHeight(Number(event.target.value))
                                    }
                                />
                            </Field.Root>
                            <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                                <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
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
                            <div className="polli:flex polli:items-end polli:justify-between polli:gap-3 polli:rounded-xl polli:bg-surface-white polli:p-3">
                                <div>
                                    <div className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                        Enhance
                                    </div>
                                    <div className="polli:text-xs polli:text-theme-text-muted">
                                        Refine the prompt before generation
                                    </div>
                                </div>
                                <Switch
                                    checked={enhance}
                                    onChange={setEnhance}
                                    ariaLabel="Enhance prompt"
                                />
                            </div>
                        </div>
                    )}

                    {currentModel && currentModel.voices.length > 0 && (
                        <Field.Root className="polli:flex polli:flex-col polli:gap-2">
                            <Field.Label className="polli:text-sm polli:font-semibold polli:text-theme-text-strong">
                                Voice
                            </Field.Label>
                            <div className="polli:flex polli:flex-wrap polli:gap-2">
                                {currentModel.voices.map((voice) => (
                                    <Button
                                        key={voice}
                                        type="button"
                                        theme={modalityTheme("audio")}
                                        size="small"
                                        className={cn(
                                            "polli:self-auto polli:rounded-lg",
                                            selectedVoice === voice &&
                                                modalityColors("audio").filled,
                                        )}
                                        onClick={() => setSelectedVoice(voice)}
                                    >
                                        {voice}
                                    </Button>
                                ))}
                            </div>
                        </Field.Root>
                    )}

                    {error && <Alert intent="danger">{error}</Alert>}

                    <Button
                        type="button"
                        theme={activeTheme}
                        size="large"
                        disabled={
                            isGenerating ||
                            (!!apiKey &&
                                (!prompt.trim() || !selectedModelAllowed))
                        }
                        onClick={generate}
                        className="polli:w-full polli:self-auto"
                    >
                        {!apiKey
                            ? "Login to generate"
                            : isGenerating
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

                <div className="polli:flex polli:flex-col polli:gap-4">
                    <ResultPanel
                        result={result}
                        isLoading={isGenerating}
                        activeCategory={
                            currentModel?.category ?? activeCategory
                        }
                    />
                </div>
            </div>
        </div>
    );
}
