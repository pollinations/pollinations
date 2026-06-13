import {
    type Message,
    Pollinations,
    PollinationsError,
} from "@pollinations/sdk";
import { useAuthState } from "@pollinations/sdk/react";
import {
    Alert,
    Button,
    ColorModeToggle,
    cn,
    DownloadIcon,
    ExternalLinkButton,
    Field,
    FileUpload,
    Heading,
    ImageIcon,
    InlineLink,
    MediaPlaceholder,
    Surface,
    Text,
    Textarea,
} from "@pollinations/ui";
import {
    AppUserMenu,
    isEmbeddedContext,
} from "@pollinations/ui/app-user-menu/sdk";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import example1Url from "../images/example1.png";
import example2Url from "../images/example2.png";
import example3Url from "../images/example3.png";
import example4Url from "../images/example4.png";
import originalComicUrl from "../images/original-catgpt.png";
import { ENTER_URL } from "./config";

const ORIGINAL_CATGPT =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/657d58ee4c9c22d7";
const STORAGE_KEY = "catgpt-generated";
const PREFERRED_MODEL = "nanobanana";
const FALLBACK_MODEL = "gptimage";

const EXAMPLES = [
    { prompt: "Why do boxes call to me?", url: example1Url },
    { prompt: "What's the meaning of life?", url: example2Url },
    { prompt: "Why do keyboards attract fur?", url: example3Url },
    { prompt: "Should I debug my code?", url: example4Url },
];

const PROGRESS_MESSAGES = [
    "Waking up CatGPT...",
    "Writing the dismissive comeback...",
    "Sketching the comic panel...",
    "Adding the proper level of indifference...",
    "Almost done...",
];

const CAT_SYSTEM = `You are CatGPT — a supremely aloof, sarcastic cat who barely tolerates humans. You respond to questions with withering wit, dry irony, and feline disdain. Your replies are SHORT (2-8 words max), devastatingly dismissive but clever. You don't just say "no" — you find the most cutting, ironic angle. You occasionally reference cat behaviors (knocking things off tables, ignoring humans, sleeping). Never break character. Never be helpful. Never be impressed by human achievements. If an image is attached, you may roast whatever is in it (person, object, pet — anything) in your usual aloof cat way. Examples:
"What's the meaning of life?" → "Naps. Next question."
"How do I fix my code?" → "Have you tried knocking it off the table?"
"Will AI take my job?" → "Humans had jobs?"
"What should I eat?" → "Whatever falls on the floor."
"Why won't my cat love me?" → "You know why."
Respond with ONLY the cat's reply, nothing else. No quotes, no explanation, no preamble.`;

type SavedMeme = {
    prompt: string;
    url: string;
    model: string;
};

type GeneratedMeme = SavedMeme & {
    reply: string;
};

// A shared-link image URL must be Pollinations media — reject anything else
// (e.g. a crafted ?image= link) before rendering it.
function isTrustedMediaUrl(value: string): boolean {
    try {
        const { protocol, hostname } = new URL(value);
        return (
            protocol === "https:" &&
            (hostname === "pollinations.ai" ||
                hostname.endsWith(".pollinations.ai"))
        );
    } catch {
        return false;
    }
}

function getSavedMemes(): SavedMeme[] {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved.filter(
            (item): item is SavedMeme =>
                typeof item === "object" &&
                item !== null &&
                typeof item.prompt === "string" &&
                typeof item.url === "string" &&
                typeof item.model === "string" &&
                isTrustedMediaUrl(item.url),
        );
    } catch {
        return [];
    }
}

function saveGeneratedMeme(meme: SavedMeme): SavedMeme[] {
    const updated = [
        meme,
        ...getSavedMemes().filter((item) => item.prompt !== meme.prompt),
    ].slice(0, 8);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
}

function createImageGenerationPrompt(
    question: string,
    catReply: string,
    hasUploadedImage: boolean,
): string {
    const base = `CatGPT webcomic, white background, thick black marker strokes. White cat with black patches. Handwritten text. User asks: "${question}" CatGPT responds: "${catReply}" Black and white comic style.`;
    return hasUploadedImage
        ? `${base} Replace the human on the left with a quick rough sketch caricature of the uploaded image, drawn in the SAME loose hand-drawn black marker style as the cat — simple outlines only, NO shading, NO color, NO photorealism, NO detailed rendering, just a wobbly sketch with the same line weight and amateur charm as the rest of the comic. If it's a logo, mascot, or other non-person image, sketch it in the same crude marker style.`
        : `${base} Human with bob hair.`;
}

async function pickModel(client: Pollinations): Promise<string> {
    try {
        const models = await client.imageModels();
        const names = models.map((model) => model.name);
        return names.includes(PREFERRED_MODEL)
            ? PREFERRED_MODEL
            : FALLBACK_MODEL;
    } catch {
        return FALLBACK_MODEL;
    }
}

function cleanReply(value: unknown): string {
    return String(value || "Naturally, no.")
        .trim()
        .replace(/^["']|["']$/g, "");
}

async function generateCatReply(
    client: Pollinations,
    question: string,
    imageUrl: string | null,
    signal: AbortSignal,
): Promise<string> {
    const userContent: Message["content"] = imageUrl
        ? [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: imageUrl } },
          ]
        : question;
    const messages: Message[] = [
        { role: "system", content: CAT_SYSTEM },
        { role: "user", content: userContent },
    ];
    const response = await client.chat(messages, {
        model: "claude-fast",
        signal,
    });
    return cleanReply(response.choices[0]?.message.content);
}

async function downloadImage(url: string): Promise<void> {
    const blob = await (await fetch(url)).blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `catgpt-meme-${Date.now()}.png`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
}

function setUrlState(prompt: string, model: string, imageUrl?: string): void {
    const url = new URL(window.location.href);
    if (prompt) {
        url.searchParams.set("prompt", prompt);
        url.searchParams.set("model", model);
        if (imageUrl) {
            url.searchParams.set("image", imageUrl);
        } else {
            url.searchParams.delete("image");
        }
    } else {
        url.searchParams.delete("prompt");
        url.searchParams.delete("model");
        url.searchParams.delete("image");
    }
    window.history.replaceState({}, "", url);
}

export function App() {
    const { apiKey, isLoggedIn, isHydrated } = useAuthState();
    const isEmbedded = isEmbeddedContext();
    const [prompt, setPrompt] = useState("");
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    // Auto-picked (preferred if available, else free); generation falls back
    // to the free model on a 402. There is no manual selector.
    const [activeModel, setActiveModel] = useState(FALLBACK_MODEL);
    const [savedMemes, setSavedMemes] = useState<SavedMeme[]>(() =>
        getSavedMemes(),
    );
    const [generatedMeme, setGeneratedMeme] = useState<GeneratedMeme | null>(
        null,
    );
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressIndex, setProgressIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [abortController, setAbortController] =
        useState<AbortController | null>(null);

    const client = useMemo(
        () => (apiKey ? new Pollinations({ apiKey }) : null),
        [apiKey],
    );

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlPrompt = params.get("prompt");
        const urlImage = params.get("image");
        if (urlPrompt) setPrompt(urlPrompt);
        // Restore a shared result so the recipient sees the exact meme. Only
        // trust Pollinations media URLs (blocks crafted share links).
        if (urlPrompt && urlImage && isTrustedMediaUrl(urlImage)) {
            setGeneratedMeme({
                prompt: urlPrompt,
                url: urlImage,
                model: params.get("model") || FALLBACK_MODEL,
                reply: "",
            });
        }
    }, []);

    useEffect(() => {
        if (!client || !isLoggedIn) return;
        pickModel(client)
            .then(setActiveModel)
            .catch(() => {});
    }, [client, isLoggedIn]);

    useEffect(() => {
        if (!isGenerating) return;
        const timer = window.setInterval(() => {
            setProgressIndex((index) =>
                Math.min(index + 1, PROGRESS_MESSAGES.length - 1),
            );
        }, 2200);
        return () => window.clearInterval(timer);
    }, [isGenerating]);

    async function generateMeme() {
        if (isGenerating) {
            abortController?.abort();
            setIsGenerating(false);
            setAbortController(null);
            return;
        }

        if (!apiKey || !client) {
            setError("Authorize CatGPT before generating.");
            return;
        }

        const question = prompt.trim();
        if (!question) {
            setError("Ask CatGPT something first.");
            return;
        }

        const controller = new AbortController();
        setAbortController(controller);
        setIsGenerating(true);
        setProgressIndex(0);
        setError(null);
        setNotice(null);
        setGeneratedMeme(null);
        setUrlState(question, activeModel);

        try {
            const uploadedImageUrl = imageFiles[0]
                ? (
                      await client.upload(imageFiles[0], {
                          name: imageFiles[0].name,
                          contentType: imageFiles[0].type || undefined,
                          signal: controller.signal,
                      })
                  ).url
                : null;

            const catReply = await generateCatReply(
                client,
                question,
                uploadedImageUrl,
                controller.signal,
            );
            const imagePrompt = createImageGenerationPrompt(
                question,
                catReply,
                !!uploadedImageUrl,
            );
            const imageOptions = {
                width: 1024,
                height: 1024,
                referenceImage: uploadedImageUrl
                    ? [uploadedImageUrl, SELFIE_CATGPT]
                    : ORIGINAL_CATGPT,
                signal: controller.signal,
            };

            // Try the chosen model; if it's a paid model the account can't
            // afford (402), fall back to the free model so generation succeeds
            // instead of hard-failing.
            let usedModel = activeModel;
            const response = await client
                .image(imagePrompt, { model: usedModel, ...imageOptions })
                .catch((err: unknown) => {
                    if (
                        usedModel === FALLBACK_MODEL ||
                        !(err instanceof PollinationsError) ||
                        err.status !== 402
                    ) {
                        throw err;
                    }
                    usedModel = FALLBACK_MODEL;
                    return client.image(imagePrompt, {
                        model: usedModel,
                        ...imageOptions,
                    });
                });

            if (usedModel !== activeModel) {
                setNotice(
                    `Not enough pollen for ${activeModel} — generated with ${usedModel} instead.`,
                );
            }
            const meme = {
                prompt: question,
                reply: catReply,
                url: response.url,
                model: usedModel,
            };
            setGeneratedMeme(meme);
            setSavedMemes(saveGeneratedMeme(meme));
            setUrlState(question, usedModel, response.url);
        } catch (err) {
            if (controller.signal.aborted) {
                setError(null);
                return;
            }
            setError(
                err instanceof Error
                    ? err.message
                    : "CatGPT could not be bothered. Try again.",
            );
        } finally {
            setIsGenerating(false);
            setAbortController(null);
        }
    }

    async function shareCurrentMeme() {
        if (!generatedMeme) return;
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError(
                "Could not copy the share link. Copy it from the address bar.",
            );
        }
    }

    async function handleDownload() {
        if (!generatedMeme) return;
        try {
            await downloadImage(generatedMeme.url);
        } catch {
            setError("Could not download the image. Try again.");
        }
    }

    return (
        <div
            data-theme="accent"
            className="catgpt-app relative flex min-h-dvh flex-col bg-app-bg font-body text-theme-text-base"
        >
            {!isEmbedded && (
                <div className="fixed top-4 right-4 left-4 z-40 flex items-center justify-end gap-2">
                    <ColorModeToggle />
                    <AppUserMenu dashboardHref={ENTER_URL} hiddenWhenEmbedded />
                </div>
            )}

            <main
                className={cn(
                    "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-6 sm:px-6",
                    isEmbedded ? "pt-6" : "pt-16",
                )}
            >
                <section className="flex flex-wrap items-end justify-between gap-5">
                    <div className="flex min-w-0 flex-1 basis-64 flex-col gap-3">
                        <Heading
                            as="h1"
                            size="title"
                            className="m-0 text-theme-text-strong sm:text-5xl"
                        >
                            CatGPT
                        </Heading>
                        <p className="max-w-2xl text-base text-theme-text-base">
                            Ask a question. Get a cat response.
                        </p>
                        <p className="max-w-2xl text-sm text-theme-text-muted">
                            Original comic by{" "}
                            <InlineLink
                                href="https://www.instagram.com/missfitcomics/"
                                className="text-sm"
                            >
                                @missfitcomics
                            </InlineLink>{" "}
                            (Tanika Godbole).
                        </p>
                    </div>
                    <a
                        href="https://www.instagram.com/missfitcomics/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full max-w-52 shrink-0 overflow-hidden rounded-lg bg-surface-opaque shadow-well"
                    >
                        <img
                            src={originalComicUrl}
                            alt="Original CatGPT comic by @missfitcomics"
                            className="aspect-square w-full rounded-lg object-cover"
                        />
                    </a>
                </section>

                {!isHydrated && (
                    <Surface variant="panel">Loading CatGPT...</Surface>
                )}

                {isHydrated && (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
                        <Surface
                            variant="panel"
                            className="flex flex-col gap-4"
                        >
                            <Field.Root className="flex flex-col gap-2">
                                <Field.Label className="text-sm font-semibold text-theme-text-strong">
                                    What do you want to ask CatGPT?
                                </Field.Label>
                                <Textarea
                                    value={prompt}
                                    rows={5}
                                    onChange={(event) =>
                                        setPrompt(event.target.value)
                                    }
                                    placeholder="What's the meaning of life?"
                                />
                            </Field.Root>

                            <Field.Root className="flex flex-col gap-2">
                                <Field.Label className="text-sm font-semibold text-theme-text-strong">
                                    Upload selfie
                                    <span className="font-normal text-theme-text-soft">
                                        {" "}
                                        optional
                                    </span>
                                </Field.Label>
                                <FileUpload
                                    value={imageFiles}
                                    onChange={(files) =>
                                        setImageFiles(files.slice(0, 1))
                                    }
                                    maxFiles={1}
                                    maxSizeBytes={5 * 1024 * 1024}
                                    onReject={() =>
                                        setError("Use one image under 5 MB.")
                                    }
                                />
                            </Field.Root>

                            {error && <Alert intent="danger">{error}</Alert>}
                            {notice && <Alert intent="warning">{notice}</Alert>}

                            <Button
                                type="button"
                                size="lg"
                                disabled={
                                    !isLoggedIn ||
                                    (!prompt.trim() && !isGenerating)
                                }
                                onClick={generateMeme}
                                className="w-full self-auto"
                            >
                                {isGenerating
                                    ? `${PROGRESS_MESSAGES[progressIndex]} Cancel?`
                                    : "Generate Meme"}
                            </Button>
                        </Surface>

                        <Surface
                            variant="panel"
                            className="flex min-h-[32rem] flex-col gap-4"
                        >
                            <Text
                                as="h2"
                                size="sm"
                                tone="strong"
                                weight="semibold"
                            >
                                Result
                            </Text>
                            {isGenerating ? (
                                <MediaPlaceholder
                                    label="Generating..."
                                    detail={PROGRESS_MESSAGES[progressIndex]}
                                    className="flex-1"
                                />
                            ) : !generatedMeme ? (
                                <MediaPlaceholder
                                    icon={<ImageIcon className="h-5 w-5" />}
                                    label="No meme yet"
                                    detail="CatGPT will ignore you here."
                                    className="flex-1"
                                />
                            ) : (
                                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-surface-opaque p-3 shadow-well">
                                    <img
                                        src={generatedMeme.url}
                                        alt={generatedMeme.prompt}
                                        className="max-h-full w-full rounded-lg object-contain"
                                    />
                                </div>
                            )}

                            {generatedMeme && (
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleDownload}
                                    >
                                        <DownloadIcon className="mr-1 h-4 w-4" />
                                        Download
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={shareCurrentMeme}
                                    >
                                        {copied ? "Copied!" : "Share"}
                                    </Button>
                                </div>
                            )}
                        </Surface>
                    </div>
                )}

                <Surface variant="panel" className="flex flex-col gap-5">
                    <SavedMemeGrid title="Your Memes" memes={savedMemes} />
                    <ExampleMemeGrid title="Examples" />
                </Surface>

                <footer className="flex flex-col gap-2 border-t border-divider pt-5 text-sm text-theme-text-muted sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Original CatGPT by{" "}
                        <InlineLink href="https://www.instagram.com/missfitcomics/">
                            @missfitcomics
                        </InlineLink>
                    </span>
                    <ExternalLinkButton
                        href="https://github.com/pollinations/pollinations/tree/main/apps/catgpt"
                        size="sm"
                    >
                        GitHub
                    </ExternalLinkButton>
                </footer>
            </main>
        </div>
    );
}

function SavedMemeGrid({
    title,
    memes,
}: {
    title: string;
    memes: Array<{ prompt: string; url: string }>;
}) {
    return (
        <MemeGridShell title={title} isEmpty={memes.length === 0}>
            {memes.map((meme) => (
                <MemeCard
                    key={`${meme.prompt}-${meme.url}`}
                    prompt={meme.prompt}
                >
                    <RemoteMemeImage url={meme.url} prompt={meme.prompt} />
                </MemeCard>
            ))}
        </MemeGridShell>
    );
}

function ExampleMemeGrid({ title }: { title: string }) {
    return (
        <MemeGridShell title={title} isEmpty={EXAMPLES.length === 0}>
            {EXAMPLES.map((meme) => (
                <MemeCard
                    key={`${meme.prompt}-${meme.url}`}
                    prompt={meme.prompt}
                >
                    <img
                        src={meme.url}
                        alt={meme.prompt}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                    />
                </MemeCard>
            ))}
        </MemeGridShell>
    );
}

function MemeGridShell({
    title,
    isEmpty,
    children,
}: {
    title: string;
    isEmpty: boolean;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-3">
            <Text as="h2" size="sm" tone="strong" weight="semibold">
                {title}
            </Text>
            {isEmpty ? (
                <Text
                    as="p"
                    size="sm"
                    tone="soft"
                    className="rounded-xl bg-surface-opaque p-4 text-center"
                >
                    No memes yet. Generate one to see it here.
                </Text>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {children}
                </div>
            )}
        </section>
    );
}

function MemeCard({
    prompt,
    children,
}: {
    prompt: string;
    children: ReactNode;
}) {
    return (
        <article className="overflow-hidden rounded-xl bg-surface-opaque shadow-well">
            {children}
            <Text as="p" size="sm" className="p-3">
                "{prompt}"
            </Text>
        </article>
    );
}

function RemoteMemeImage({ url, prompt }: { url: string; prompt: string }) {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!isTrustedMediaUrl(url)) {
            setObjectUrl(null);
            return;
        }

        let cancelled = false;
        let nextObjectUrl: string | null = null;

        async function loadImage() {
            try {
                const response = await fetch(url);
                const contentType = response.headers.get("content-type") || "";
                if (!response.ok || !contentType.startsWith("image/")) {
                    throw new Error("Expected an image response.");
                }
                const blob = await response.blob();
                if (cancelled) return;
                nextObjectUrl = URL.createObjectURL(blob);
                setObjectUrl(nextObjectUrl);
            } catch {
                if (!cancelled) setObjectUrl(null);
            }
        }

        void loadImage();

        return () => {
            cancelled = true;
            if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
        };
    }, [url]);

    if (!objectUrl) {
        return (
            <MediaPlaceholder
                label="Preview unavailable"
                detail="CatGPT misplaced this one."
                className="aspect-square min-h-0 rounded-none border-0"
            />
        );
    }

    return (
        <img
            src={objectUrl}
            alt={prompt}
            loading="lazy"
            className="aspect-square w-full object-cover"
        />
    );
}
