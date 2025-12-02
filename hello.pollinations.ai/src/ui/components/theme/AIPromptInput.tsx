import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { generateTheme } from "../../../theme/guidelines/helpers/designer";
import { generateCopy } from "../../../theme/guidelines/helpers/copywriter";
import { ALL_COPY } from "../../../theme/copy/index";
import { dictionaryToTheme } from "../../../theme/style/theme-processor";
import { generateBackground } from "../../../theme/guidelines/helpers/animator";
import { SparklesIcon, SendIcon, DownloadIcon } from "lucide-react";
import { Button } from "../ui/button";

interface AIPromptInputProps {
    isOpen: boolean;
}

/**
 * General AI prompt input interface
 * Handles user text input for AI interactions
 * Currently used for theme generation, but designed to be reusable
 */
export function AIPromptInput({ isOpen }: AIPromptInputProps) {
    const [prompt, setPrompt] = useState("");
    const [activePrompt, setActivePrompt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const {
        setTheme,
        themeDefinition,
        themePrompt,
        presetCopy,
        backgroundHtml,
    } = useTheme();

    // Generate theme, copy, and background when activePrompt changes
    useEffect(() => {
        if (!activePrompt) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        // Check for mobile
        const isMobile = window.matchMedia("(max-width: 768px)").matches;

        // Start copy immediately (takes longest)
        const copyPromise = generateCopy(
            activePrompt,
            isMobile,
            ALL_COPY,
            "en",
            controller.signal
        );

        // Generate theme first, then background in parallel with copy
        generateTheme(activePrompt, controller.signal)
            .then((theme) => {
                if (controller.signal.aborted) return;

                // Generate background (now uses semantic tokens, no color extraction needed)
                const backgroundPromise = generateBackground(
                    activePrompt,
                    controller.signal
                );

                // Wait for copy and background to complete
                return Promise.all([
                    Promise.resolve(theme),
                    copyPromise,
                    backgroundPromise,
                ]);
            })
            .then((result) => {
                if (!result || controller.signal.aborted) return;

                const [theme, copyResult, bgHtml] = result;
                // Apply theme to context
                setTheme(theme, activePrompt, copyResult.full, bgHtml);
                setActivePrompt(null);

                console.log("✅ [PRESET READY]");
                setLoading(false);
            })
            .catch((err) => {
                if (err.name !== "AbortError" && !controller.signal.aborted) {
                    setError(err);
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [activePrompt, setTheme]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (prompt.trim() && !loading) {
            setActivePrompt(prompt);
        }
    };

    const handleDownload = () => {
        // Use current theme from context (reflects any changes from the left panel)
        const themeInSlotFormat = dictionaryToTheme(themeDefinition);

        // Generate preset file name from current theme prompt or "custom"
        const presetName = (themePrompt || "custom")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const capitalizedName = presetName
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join("");

        // Flatten presetCopy for export (extract flat values from nested structure)
        const flatCopy: Record<string, string> = {};
        const extractFlat = (obj: Record<string, unknown>, prefix = "") => {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === "string") {
                    flatCopy[prefix ? `${prefix}.${key}` : key] = value;
                } else if (typeof value === "object" && value !== null) {
                    extractFlat(
                        value as Record<string, unknown>,
                        prefix ? `${prefix}.${key}` : key
                    );
                }
            }
        };
        extractFlat(presetCopy as unknown as Record<string, unknown>);

        const fileContent = `import { LLMThemeResponse, processTheme } from "../style/theme-processor";
import type { ThemeCopy } from "../buildPrompts";

export const ${capitalizedName}Theme: LLMThemeResponse = ${JSON.stringify(
            themeInSlotFormat,
            null,
            2
        )};

export const ${capitalizedName}CssVariables = processTheme(${capitalizedName}Theme).cssVariables;

// Copy from: "${themePrompt || "custom"}"
export const ${capitalizedName}Copy = ${JSON.stringify(flatCopy, null, 2)};

// Background HTML (raw template literal)
export const ${capitalizedName}BackgroundHtml = ${
            backgroundHtml
                ? `\`${backgroundHtml.replace(/`/g, "\\`")}\``
                : "null"
        };
`;

        // Download file
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
            `✅ Downloaded ${presetName}.ts with current settings - Add to /src/theme/presets/`
        );
    };

    if (!isOpen) return null;

    return (
        <div
            className="w-full h-16 animate-in fade-in slide-in-from-top-2 duration-200 flex items-center justify-center"
            style={{
                backgroundColor: "transparent",
            }}
        >
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-4xl mx-auto flex items-center h-full px-4 md:px-8 gap-4"
            >
                <Button
                    type="button"
                    onClick={handleDownload}
                    variant="icon"
                    size={null}
                    className="w-6 h-6 md:w-8 md:h-8 text-text-body-main flex-shrink-0"
                    title="Download current theme"
                >
                    <DownloadIcon className="w-4 h-4 md:w-5 md:h-5" />
                </Button>

                <Button
                    type="submit"
                    disabled={!prompt.trim() || loading}
                    variant="icon"
                    size={null}
                    className="w-6 h-6 md:w-8 md:h-8 text-text-body-main flex-shrink-0"
                >
                    {loading ? (
                        <SparklesIcon className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                    ) : (
                        <SendIcon className="w-4 h-4 md:w-5 md:h-5" />
                    )}
                </Button>

                <div className="flex-1 relative h-full flex items-center">
                    <style>
                        {`
                            .theme-prompt-input::placeholder {
                                color: rgb(var(--text-tertiary)) !important;
                                opacity: 1 !important;
                            }
                            
                            /* Prevent white background on autocomplete */
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
                        placeholder="Describe a theme (e.g. 'Cyberpunk Neon')..."
                        className="theme-prompt-input w-full h-full bg-transparent outline-none text-base md:text-lg font-medium rounded-input"
                        style={{
                            color: "rgb(var(--input-text))",
                            caretColor: "rgb(var(--text-brand))",
                        }}
                        disabled={loading}
                        autoComplete="off"
                    />
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
