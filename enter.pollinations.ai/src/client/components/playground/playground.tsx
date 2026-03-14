import { useEffect, useMemo, useState } from "react";
import { config } from "../../config.ts";
import { Button } from "../button.tsx";

/** Create/playground always uses production gen API. */
const API_BASE = "https://gen.pollinations.ai";

type ModelType = "image" | "text" | "audio" | "video";

type PlaygroundModel = {
    id: string;
    name: string;
    description?: string;
    type: ModelType;
    paid_only?: boolean;
};

function normalizeImageModel(m: { name: string; description?: string; paid_only?: boolean; output_modalities?: string[] }): PlaygroundModel {
    const hasVideo = m.output_modalities?.includes("video");
    return {
        id: m.name,
        name: m.description?.split(" - ")[0] || m.name,
        description: m.description,
        type: hasVideo ? "video" : "image",
        paid_only: m.paid_only,
    };
}

function normalizeTextModel(m: { name: string; description?: string; paid_only?: boolean; output_modalities?: string[] }): PlaygroundModel {
    const hasAudio = m.output_modalities?.includes("audio");
    return {
        id: m.name,
        name: m.description?.split(" - ")[0] || m.name,
        description: m.description,
        type: hasAudio ? "audio" : "text",
        paid_only: m.paid_only,
    };
}

const CATEGORIES: { key: ModelType; label: string }[] = [
    { key: "image", label: "Image" },
    { key: "text", label: "Text" },
    { key: "audio", label: "Audio" },
    { key: "video", label: "Video" },
];

type PlaygroundProps = {
    apiKey: string;
    setApiKey: (key: string) => void;
    githubUsername: string;
    githubId?: number | null;
    totalPollen: number;
    onCreateKeyClick?: () => void;
};

export function Playground({
    apiKey,
    setApiKey,
    githubUsername,
    githubId,
    totalPollen,
    onCreateKeyClick,
}: PlaygroundProps) {
    const [ppkgFetched, setPpkgFetched] = useState(false);
    const [showAllModels, setShowAllModels] = useState(false);
    const [selectedModel, setSelectedModel] = useState("flux");
    const [prompt, setPrompt] = useState("");
    const [activeCategory, setActiveCategory] = useState<ModelType>("image");
    const [imageModels, setImageModels] = useState<PlaygroundModel[]>([]);
    const [textModels, setTextModels] = useState<PlaygroundModel[]>([]);
    const [audioModels, setAudioModels] = useState<PlaygroundModel[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [allowedImageIds, setAllowedImageIds] = useState<Set<string>>(new Set());
    const [allowedTextIds, setAllowedTextIds] = useState<Set<string>>(new Set());
    const [allowedAudioIds, setAllowedAudioIds] = useState<Set<string>>(new Set());

    const [width, setWidth] = useState(1024);
    const [height, setHeight] = useState(1024);
    const [seed, setSeed] = useState(0);
    const [enhance, setEnhance] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [resultType, setResultType] = useState<"image" | "video" | "audio" | "text" | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ppkgFetched || !githubId || apiKey) return;
        setPpkgFetched(true);
        fetch(`${config.baseUrl}/api/ppkg?user_id=${githubId}`, {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { key?: string } | null) => {
                if (d?.key) setApiKey(d.key);
            })
            .catch(() => {});
    }, [githubId, apiKey, ppkgFetched, setApiKey]);

    useEffect(() => {
        if (!apiKey) {
            setImageModels([]);
            setTextModels([]);
            setAudioModels([]);
            setAllowedImageIds(new Set());
            setAllowedTextIds(new Set());
            setAllowedAudioIds(new Set());
            return;
        }
        const ac = new AbortController();
        setModelsLoading(true);
        const headers = { Authorization: `Bearer ${apiKey}` };
        Promise.all([
            fetch(`${API_BASE}/image/models`, { headers, signal: ac.signal }).then((r) => r.json()).catch(() => []),
            fetch(`${API_BASE}/text/models`, { headers, signal: ac.signal }).then((r) => r.json()).catch(() => []),
            fetch(`${API_BASE}/audio/models`, { headers, signal: ac.signal }).then((r) => r.json()).catch(() => []),
        ]).then(([imgList, textList, audioList]) => {
            if (ac.signal.aborted) return;
            const img = (Array.isArray(imgList) ? imgList : []).map(normalizeImageModel);
            const text = (Array.isArray(textList) ? textList : []).map(normalizeTextModel);
            const audio = (Array.isArray(audioList) ? audioList : []).map(normalizeTextModel);
            setImageModels(img);
            setTextModels(text);
            setAudioModels(audio);
            setAllowedImageIds(new Set(img.map((m) => m.id)));
            setAllowedTextIds(new Set(text.map((m) => m.id)));
            setAllowedAudioIds(new Set(audio.map((m) => m.id)));
        }).finally(() => {
            if (!ac.signal.aborted) setModelsLoading(false);
        });
        return () => ac.abort();
    }, [apiKey]);

    const allModels = useMemo(() => {
        const typeOrder: Record<ModelType, number> = { image: 0, video: 1, text: 2, audio: 3 };
        const list: PlaygroundModel[] = [
            ...imageModels.filter((m) => m.type === "image" || m.type === "video"),
            ...textModels.filter((m) => m.type === "text"),
            ...audioModels.filter((m) => m.type === "audio"),
        ];
        return list.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
    }, [imageModels, textModels, audioModels]);

    const filteredModels = useMemo(
        () => allModels.filter((m) => m.type === activeCategory),
        [allModels, activeCategory],
    );

    const currentModel = allModels.find((m) => m.id === selectedModel);
    const isImageModel = currentModel?.type === "image" || currentModel?.type === "video";
    const isAudioModel = currentModel?.type === "audio";
    const allowedSet = isImageModel ? allowedImageIds : isAudioModel ? allowedAudioIds : allowedTextIds;
    const isAllowed = allowedSet.has(selectedModel);

    useEffect(() => {
        setShowAllModels(false);
    }, [activeCategory]);

    const promptPlaceholder = isImageModel
        ? "Describe the image you want..."
        : isAudioModel
          ? "Enter the text to speak..."
          : "Enter your question or prompt...";

    async function handleGenerate() {
        if (!apiKey || !prompt.trim() || isGenerating || !isAllowed) return;
        setIsGenerating(true);
        setError(null);
        setResult(null);
        setResultType(null);
        try {
            if (isImageModel) {
                const params = new URLSearchParams({
                    model: selectedModel,
                    width: String(width),
                    height: String(height),
                    seed: String(seed),
                    enhance: String(enhance),
                    key: apiKey,
                });
                const res = await fetch(
                    `${API_BASE}/image/${encodeURIComponent(prompt.trim())}?${params}`,
                    {
                        credentials: "include",
                        headers: { Authorization: `Bearer ${apiKey}` },
                    },
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as { error?: { message?: string } })?.error?.message || res.statusText);
                }
                const blob = await res.blob();
                setResult(URL.createObjectURL(blob));
                setResultType(currentModel?.type === "video" ? "video" : "image");
            } else if (isAudioModel) {
                const res = await fetch(`${API_BASE}/v1/chat/completions`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: selectedModel,
                        modalities: ["text", "audio"],
                        audio: { voice: "alloy", format: "wav" },
                        messages: [{ role: "user", content: prompt.trim() }],
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as { error?: { message?: string } })?.error?.message || res.statusText);
                }
                const data = await res.json();
                const b64 = data.choices?.[0]?.message?.audio?.data;
                if (!b64) throw new Error("No audio in response");
                const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const blob = new Blob([bytes], { type: "audio/wav" });
                setResult(URL.createObjectURL(blob));
                setResultType("audio");
            } else {
                const res = await fetch(`${API_BASE}/v1/chat/completions`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: selectedModel,
                        messages: [{ role: "user", content: prompt.trim() }],
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as { error?: { message?: string } })?.error?.message || res.statusText);
                }
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content ?? "No response";
                setResult(text);
                setResultType("text");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong");
        } finally {
            setIsGenerating(false);
        }
    }

    useEffect(() => {
        return () => {
            if (result?.startsWith("blob:")) URL.revokeObjectURL(result);
        };
    }, [result]);

    const VISIBLE_MODELS = 10;
    const modelsToShow = showAllModels
        ? filteredModels
        : filteredModels.slice(0, VISIBLE_MODELS);
    const hasMoreModels = filteredModels.length > VISIBLE_MODELS;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="font-medium text-green-950">{githubUsername || "You"}</span>
                    <span className="font-mono">{totalPollen.toFixed(1)} pollen</span>
                </div>
                <a
                    href="https://enter.pollinations.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-green-800 hover:underline"
                >
                    See pricing
                </a>
            </div>
            <p className="text-sm text-gray-600">
                🧪 Try any model — demo playground to explore. 🎨
            </p>

            {!apiKey ? (
                githubId ? (
                    <p className="text-sm text-gray-500">Loading playground key…</p>
                ) : (
                    <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-medium mb-2">Paste an API key to use the playground</p>
                        <p className="text-gray-600 mb-3">
                            Create a secret key below, copy it, then paste it here. Your key is never stored on our servers.
                        </p>
                        <input
                            type="password"
                            placeholder="sk_..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                        />
                        {onCreateKeyClick && (
                            <button
                                type="button"
                                onClick={onCreateKeyClick}
                                className="mt-2 text-green-700 font-medium hover:underline"
                            >
                                Create API key →
                            </button>
                        )}
                    </div>
                )
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map(({ key, label }) => (
                            <Button
                                key={key}
                                as="button"
                                type="button"
                                onClick={() => setActiveCategory(key)}
                                weight="light"
                                color={activeCategory === key ? "green" : "amber"}
                                className="text-sm"
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {modelsLoading
                            ? [1, 2, 3, 4].map((i) => (
                                  <div key={i} className="h-9 w-24 rounded bg-gray-200 animate-pulse" />
                              ))
                            : modelsToShow.map((m) => {
                                  const allowed = (activeCategory === "image" || activeCategory === "video"
                                      ? allowedImageIds
                                      : activeCategory === "audio"
                                        ? allowedAudioIds
                                        : allowedTextIds
                                  ).has(m.id);
                                  return (
                                      <div key={m.id} className="relative group">
                                          <Button
                                              as="button"
                                              type="button"
                                              onClick={() => allowed && setSelectedModel(m.id)}
                                              color="green"
                                              weight="light"
                                              className={`border-2 text-sm transition-colors ${
                                                  !allowed
                                                      ? "bg-gray-200 text-gray-500 border-gray-300 hover:bg-gray-300 hover:border-gray-400 cursor-not-allowed"
                                                      : ""
                                              } ${selectedModel === m.id ? "ring-2 ring-green-700 ring-offset-1" : ""}`}
                                          >
                                              {m.name}
                                              {m.paid_only && <span className="ml-1">💎</span>}
                                          </Button>
                                          {!allowed && (
                                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                                                  Top up your pollen balance to unlock this model · enter.pollinations.ai
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                        {hasMoreModels && (
                            <button
                                type="button"
                                onClick={() => setShowAllModels((v) => !v)}
                                className="px-3 py-1.5 text-sm text-green-700 hover:bg-green-100 rounded border border-green-200"
                            >
                                {showAllModels ? "see less" : "… see more"}
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={promptPlaceholder}
                            className="min-h-[100px] p-3 border-2 border-green-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none font-medium"
                        />
                    </div>

                    {isImageModel && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
                                <input
                                    type="number"
                                    value={width}
                                    onChange={(e) => setWidth(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
                                <input
                                    type="number"
                                    value={height}
                                    onChange={(e) => setHeight(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1" title="Same seed + same prompt = same image">
                                    Seed
                                </label>
                                <input
                                    type="number"
                                    value={seed}
                                    onChange={(e) => setSeed(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1" title="AI improves your prompt for better results">
                                    Enhance
                                </label>
                                <label className="flex items-center h-[42px]">
                                    <input
                                        type="checkbox"
                                        checked={enhance}
                                        onChange={(e) => setEnhance(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-green-600"
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    <div>
                        <Button
                            as="button"
                            type="button"
                            onClick={handleGenerate}
                            disabled={!prompt.trim() || isGenerating || !isAllowed}
                            color="green"
                            className="min-w-[160px]"
                        >
                            {isGenerating
                                ? "Generating..."
                                : isImageModel
                                  ? "Generate Image"
                                  : isAudioModel
                                    ? "Generate Audio"
                                    : "Generate Text"}
                        </Button>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                            {error}
                        </div>
                    )}

                    {result && resultType && !error && (
                        <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                            {resultType === "image" && <img src={result} alt="Generated" className="w-full h-auto" />}
                            {resultType === "video" && (
                                <video src={result} controls autoPlay loop muted className="w-full h-auto" />
                            )}
                            {resultType === "audio" && <audio src={result} controls autoPlay className="w-full" />}
                            {resultType === "text" && (
                                <pre className="p-4 text-sm text-gray-800 whitespace-pre-wrap font-sans">{result}</pre>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
