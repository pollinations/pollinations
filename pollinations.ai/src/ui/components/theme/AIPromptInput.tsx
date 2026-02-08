import { BotIcon, DownloadIcon, SendIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE, DEFAULTS } from "../../../api.config";
import { AUTH_COPY } from "../../../copy/content/auth";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { generateBackground } from "../../../theme/guidelines/helpers/animator";
import { generateTheme } from "../../../theme/guidelines/helpers/designer";
import { dictionaryToTheme } from "../../../theme/style/theme-processor";
import { useTheme } from "../../contexts/ThemeContext";

interface AIPromptInputProps {
    isLoggedIn: boolean;
    onLoginRequired: () => void;
    compact?: boolean;
    apiKey?: string;
}

/**
 * AI theme prompt input.
 * compact=true: inline element for desktop header Row 2.
 * compact=false (default): full-width bar for mobile.
 * Greyed out for non-logged-in users as a login incentive.
 */
export function AIPromptInput({
    isLoggedIn,
    onLoginRequired,
    compact = false,
    apiKey,
}: AIPromptInputProps) {
    const { copy } = usePageCopy(AUTH_COPY);
    const [prompt, setPrompt] = useState("");
    const [activePrompt, setActivePrompt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [selectedModel, setSelectedModel] = useState(DEFAULTS.TEXT_MODEL);
    const [textModels, setTextModels] = useState<string[]>([]);
    const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { setTheme, themeDefinition, themePrompt, backgroundHtml } =
        useTheme();

    // Fetch available text models
    useEffect(() => {
        if (!isLoggedIn || !apiKey) return;
        fetch(`${API_BASE}/text/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        })
            .then((res) => res.json())
            .then((list) => {
                const ids: string[] = list.map(
                    (m: { id?: string; name?: string } | string) =>
                        typeof m === "string" ? m : m.id || m.name || "",
                );
                setTextModels(ids);
                // If default model isn't in the list, select the first available
                if (ids.length > 0 && !ids.includes(DEFAULTS.TEXT_MODEL)) {
                    setSelectedModel(ids[0]);
                }
            })
            .catch(() => {});
    }, [isLoggedIn, apiKey]);

    // Generate theme and background when activePrompt changes
    useEffect(() => {
        if (!activePrompt) return;

        setLoading(true);
        setError(null);

        Promise.all([
            generateTheme(activePrompt, apiKey, selectedModel),
            generateBackground(activePrompt, apiKey, selectedModel),
        ])
            .then(([theme, bgHtml]) => {
                setTheme(theme, activePrompt, bgHtml);
                setActivePrompt(null);
            })
            .catch(setError)
            .finally(() => setLoading(false));
    }, [activePrompt, setTheme, apiKey, selectedModel]);

    // Focus input on mount for logged-in users
    useEffect(() => {
        if (isLoggedIn) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isLoggedIn]);

    // Close model dropdown on outside click
    useEffect(() => {
        if (!modelDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setModelDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [modelDropdownOpen]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (prompt.trim() && !loading) {
            setActivePrompt(prompt);
        }
    };

    const handleDownload = () => {
        const themeInSlotFormat = dictionaryToTheme(themeDefinition);

        const presetName = (themePrompt || "custom")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const capitalizedName = presetName
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join("");

        const fileContent = `import { LLMThemeResponse, processTheme } from "../style/theme-processor";

export const ${capitalizedName}Theme: LLMThemeResponse = ${JSON.stringify(
            themeInSlotFormat,
            null,
            2,
        )};

export const ${capitalizedName}CssVariables = processTheme(${capitalizedName}Theme).cssVariables;

// Background HTML (raw template literal)
export const ${capitalizedName}BackgroundHtml = ${
            backgroundHtml
                ? `\`${backgroundHtml.replace(/`/g, "\\`")}\``
                : "null"
        };
`;

        const blob = new Blob([fileContent], { type: "text/typescript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${presetName}.ts`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(
            `✅ Downloaded ${presetName}.ts with current settings - Add to /src/theme/presets/`,
        );
    };

    // Not logged in: greyed-out prompt that triggers login, with hover tooltip
    if (!isLoggedIn) {
        return (
            <div
                className={
                    compact
                        ? "flex-1 min-w-0 max-w-sm relative group"
                        : "w-full h-16 flex items-center justify-center relative group"
                }
            >
                <button
                    type="button"
                    onClick={onLoginRequired}
                    className={
                        compact
                            ? "flex items-center gap-2 w-full h-8 px-3 opacity-50 cursor-pointer hover:opacity-70 transition-opacity bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-main rounded-button"
                            : "w-full max-w-4xl mx-auto flex items-center h-full px-4 md:px-8 gap-4 opacity-50 cursor-pointer hover:opacity-70 transition-opacity"
                    }
                >
                    <SparklesIcon
                        className={
                            compact
                                ? "w-4 h-4 text-text-body-main flex-shrink-0"
                                : "w-4 h-4 md:w-5 md:h-5 text-text-body-main flex-shrink-0"
                        }
                    />
                    <span
                        className={
                            compact
                                ? "text-xs font-medium text-text-body-secondary truncate"
                                : "text-base md:text-lg font-medium text-text-body-secondary"
                        }
                    >
                        {copy.themeLoginPrompt}
                    </span>
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-charcoal text-text-body-main text-xs rounded-input shadow-lg border border-border-main opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {copy.themeLoginTooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                </div>
            </div>
        );
    }

    // Logged in: functional theme input
    return (
        <div
            className={
                compact
                    ? "flex-1 min-w-0 max-w-sm relative"
                    : "w-full h-16 flex items-center justify-center"
            }
            style={{ backgroundColor: "transparent" }}
        >
            <form
                onSubmit={handleSubmit}
                className={
                    compact
                        ? "flex items-center gap-2 w-full h-8 px-3 bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-main rounded-button"
                        : "w-full max-w-4xl mx-auto flex items-center h-full px-4 md:px-8 gap-4"
                }
            >
                <div className="flex-1 relative min-w-0 flex items-center">
                    <style>
                        {`
                            .theme-prompt-input::placeholder {
                                color: rgb(var(--text-tertiary)) !important;
                                opacity: 1 !important;
                            }

                            .theme-prompt-input:-webkit-autofill,
                            .theme-prompt-input:-webkit-autofill:hover,
                            .theme-prompt-input:-webkit-autofill:focus,
                            .theme-prompt-input:-webkit-autofill:active {
                                -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
                                -webkit-text-fill-color: rgb(var(--input-text)) !important;
                                caret-color: rgb(var(--text-brand)) !important;
                            }
                        `}
                    </style>
                    <input
                        ref={inputRef}
                        id="theme-prompt"
                        name="theme-prompt"
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={copy.themePromptPlaceholder}
                        className={
                            compact
                                ? "theme-prompt-input w-full bg-transparent outline-none text-xs font-medium rounded-input"
                                : "theme-prompt-input w-full h-full bg-transparent outline-none text-base md:text-lg font-medium rounded-input"
                        }
                        style={{
                            color: "rgb(var(--input-text))",
                            caretColor: "rgb(var(--text-brand))",
                        }}
                        disabled={loading}
                        autoComplete="off"
                    />
                </div>

                <div
                    className={
                        compact
                            ? "flex items-center gap-2 flex-shrink-0"
                            : "flex items-center gap-3 flex-shrink-0"
                    }
                >
                    {textModels.length > 0 && (
                        <div ref={dropdownRef} className="relative">
                            <button
                                type="button"
                                onClick={() =>
                                    setModelDropdownOpen(!modelDropdownOpen)
                                }
                                disabled={loading}
                                className="flex items-center text-text-body-secondary cursor-pointer bg-transparent border-none p-0 outline-none hover:text-text-body-main transition-colors"
                                title={selectedModel}
                            >
                                <BotIcon
                                    className={
                                        compact ? "w-3.5 h-3.5" : "w-4 h-4"
                                    }
                                />
                            </button>
                            {modelDropdownOpen && (
                                <div className="absolute top-full right-0 mt-1 bg-surface-base border-r-4 border-b-4 border-border-main rounded-button py-1 z-50 shadow-lg max-h-48 overflow-y-auto min-w-[140px] theme-model-dropdown">
                                    <style>
                                        {`
                                            .theme-model-dropdown::-webkit-scrollbar {
                                                width: 6px;
                                            }
                                            .theme-model-dropdown::-webkit-scrollbar-track {
                                                background: transparent;
                                            }
                                            .theme-model-dropdown::-webkit-scrollbar-thumb {
                                                background: rgb(var(--border-main));
                                                border-radius: 3px;
                                            }
                                            .theme-model-dropdown::-webkit-scrollbar-thumb:hover {
                                                background: rgb(var(--text-body-secondary));
                                            }
                                            .theme-model-dropdown {
                                                scrollbar-width: thin;
                                                scrollbar-color: rgb(var(--border-main)) transparent;
                                            }
                                        `}
                                    </style>
                                    {textModels.map((id) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedModel(id);
                                                setModelDropdownOpen(false);
                                            }}
                                            className={`w-full text-left px-3 py-1.5 text-xs font-mono cursor-pointer border-none outline-none transition-colors flex items-center gap-2 ${
                                                id === selectedModel
                                                    ? "bg-button-secondary-bg text-text-body-main font-bold"
                                                    : "bg-transparent text-text-body-secondary hover:bg-input-background hover:text-text-body-main"
                                            }`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${id === selectedModel ? "bg-text-brand" : "bg-transparent"}`}
                                            />
                                            {id}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!prompt.trim() || loading}
                        className="flex items-center justify-center text-text-body-main bg-transparent border-none p-0 outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:text-text-brand transition-colors"
                    >
                        {loading ? (
                            <SparklesIcon
                                className={
                                    compact
                                        ? "w-3.5 h-3.5 animate-spin"
                                        : "w-4 h-4 animate-spin"
                                }
                            />
                        ) : (
                            <SendIcon
                                className={compact ? "w-3.5 h-3.5" : "w-4 h-4"}
                            />
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={handleDownload}
                        className="flex items-center justify-center text-text-body-main bg-transparent border-none p-0 outline-none cursor-pointer hover:text-text-brand transition-colors"
                        title="Download current theme"
                    >
                        <DownloadIcon
                            className={compact ? "w-3.5 h-3.5" : "w-4 h-4"}
                        />
                    </button>
                </div>
            </form>
            {error && (
                <div className="absolute top-full left-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 text-center">
                    {error && typeof error === "object" && "message" in error
                        ? (error as Error).message
                        : String(error)}
                </div>
            )}
        </div>
    );
}
