import { useEffect, useRef, useState } from "react";
import { DEFAULT_PRESET, PRESETS } from "../../../theme/presets";
import { themeToDictionary } from "../../../theme/style";
import { useTheme } from "../../contexts/ThemeContext";
import { ColorBucket } from "./components/ColorBucket";
import { FontBucket } from "./components/FontBucket";
import { OpacityBucket } from "./components/OpacityBucket";
import { RadiusBucket } from "./components/RadiusBucket";
import {
    useColorSync,
    useFontSync,
    useOpacitySync,
    useRadiusSync,
} from "./hooks/useCSSSync";
import {
    colorTokenFilter,
    fontTokenFilter,
    opacityTokenFilter,
    radiusTokenFilter,
    useDragAndDrop,
} from "./hooks/useDragAndDrop";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { PresetManager } from "./PresetManager";
import type { FontState, OpacityState, RadiusState, ThemeState } from "./types";
import {
    convertFontsToState,
    convertOpacityToState,
    convertRadiusToState,
    convertStateToThemeDictionary,
    convertToThemeState,
} from "./utils/state-converters";

export function PresetEditor() {
    const [isOpen, setIsOpen] = useState(false);
    const {
        themeDefinition,
        themePrompt,
        setTheme: setContextTheme,
    } = useTheme();

    // State
    const [theme, setTheme] = useState<ThemeState>(() =>
        convertToThemeState(themeDefinition),
    );
    const [radius, setRadius] = useState<RadiusState>(() =>
        convertRadiusToState(themeDefinition.borderRadius || {}),
    );
    const [fonts, setFonts] = useState<FontState>(() =>
        convertFontsToState(themeDefinition.fonts || {}),
    );
    const [opacity, setOpacity] = useState<OpacityState>(() =>
        convertOpacityToState(themeDefinition.opacity || {}),
    );
    const [selectedPresetId, setSelectedPresetId] = useState(
        themePrompt || DEFAULT_PRESET.id,
    );

    // Track if change is from context to avoid circular updates
    const isFromContext = useRef(false);

    // Sync with context theme when it changes
    useEffect(() => {
        isFromContext.current = true;
        setTheme(convertToThemeState(themeDefinition));
        setRadius(convertRadiusToState(themeDefinition.borderRadius || {}));
        setFonts(convertFontsToState(themeDefinition.fonts || {}));
        setOpacity(convertOpacityToState(themeDefinition.opacity || {}));
        // Reset flag after state updates are processed
        requestAnimationFrame(() => {
            isFromContext.current = false;
        });
    }, [themeDefinition]);

    // Sync local state changes back to context (so download captures changes)
    useEffect(() => {
        // Skip if this change originated from context
        if (isFromContext.current) return;

        const updatedTheme = convertStateToThemeDictionary(
            theme,
            radius,
            fonts,
            opacity,
        );
        // Only update theme definition, preserve prompt/copy/background
        setContextTheme(updatedTheme);
    }, [theme, radius, fonts, opacity, setContextTheme]);

    // Sync selectedPresetId with loaded preset from context
    useEffect(() => {
        if (themePrompt) {
            // themePrompt contains the preset ID
            setSelectedPresetId(themePrompt);
        }
    }, [themePrompt]);

    // Sync to CSS
    useColorSync(theme);
    useRadiusSync(radius);
    useFontSync(fonts);
    useOpacitySync(opacity);

    // Drag and drop
    const colorDnD = useDragAndDrop(setTheme, colorTokenFilter);
    const radiusDnD = useDragAndDrop(setRadius, radiusTokenFilter);
    const fontDnD = useDragAndDrop(setFonts, fontTokenFilter);
    const opacityDnD = useDragAndDrop(setOpacity, opacityTokenFilter);

    // Toggle on Ctrl+E
    useKeyboardShortcut("e", true, () => setIsOpen((prev) => !prev));

    // Handlers
    const handleColorChange = (bucketId: string, newColor: string) => {
        setTheme((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                color: newColor,
            },
        }));
    };

    const handleRadiusChange = (bucketId: string, newValue: string) => {
        setRadius((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                value: newValue,
            },
        }));
    };

    const handleFontChange = (bucketId: string, newValue: string) => {
        setFonts((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                value: newValue,
            },
        }));
    };

    const handleOpacityChange = (bucketId: string, newValue: string) => {
        setOpacity((prev) => ({
            ...prev,
            [bucketId]: {
                ...prev[bucketId],
                value: newValue,
            },
        }));
    };

    const handleSetAllWhite = () => {
        setTheme((prev) => {
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            return { "bucket-0": { color: "#FFFFFF", tokens: allTokens } };
        });
    };

    const handleSetAllBlack = () => {
        setTheme((prev) => {
            const allTokens = Object.values(prev).flatMap((b) => b.tokens);
            return { "bucket-0": { color: "#000000", tokens: allTokens } };
        });
    };

    const handleLoadPreset = (presetId: string) => {
        const preset = PRESETS.find((p) => p.id === presetId);
        if (preset) {
            const dict = themeToDictionary(preset.theme);
            // Update local state
            setTheme(convertToThemeState(dict));
            setRadius(convertRadiusToState(dict.borderRadius || {}));
            setFonts(convertFontsToState(dict.fonts || {}));
            setOpacity(convertOpacityToState(dict.opacity || {}));
            setSelectedPresetId(presetId);
            // Update context to sync themePrompt and background (copy is now static)
            setContextTheme(dict, preset.id, preset.backgroundHtml);
        }
    };

    return (
        <div
            className={`
                fixed top-0 left-0 h-full w-auto min-w-[200px] max-w-[200px] z-[9999] 
                bg-white/95 backdrop-blur-sm border-r border-gray-200 shadow-xl
                transition-transform duration-300 ease-in-out
                flex flex-col
                ${isOpen ? "translate-x-0" : "-translate-x-full"}
            `}
        >
            <PresetManager
                selectedPresetId={selectedPresetId}
                presets={PRESETS}
                theme={theme}
                radius={radius}
                fonts={fonts}
                onPresetChange={handleLoadPreset}
                onClose={() => setIsOpen(false)}
            />

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* Colors Section */}
                {Object.entries(theme).map(([bucketId, bucket]) => (
                    <ColorBucket
                        key={bucketId}
                        bucketId={bucketId}
                        bucket={bucket}
                        onColorChange={handleColorChange}
                        onDrop={colorDnD.handleDrop}
                        onDragOver={colorDnD.handleDragOver}
                    />
                ))}

                {/* Border Radius Section */}
                <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-2 px-2">
                        Border Radius
                    </div>
                    {Object.entries(radius).map(([bucketId, bucket]) => (
                        <RadiusBucket
                            key={bucketId}
                            bucketId={bucketId}
                            bucket={bucket}
                            onChange={handleRadiusChange}
                            onDrop={radiusDnD.handleDrop}
                            onDragOver={radiusDnD.handleDragOver}
                        />
                    ))}
                </div>

                {/* Typography Section */}
                <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-2 px-2">
                        Typography
                    </div>
                    {Object.entries(fonts).map(([bucketId, bucket]) => (
                        <FontBucket
                            key={bucketId}
                            bucketId={bucketId}
                            bucket={bucket}
                            onChange={handleFontChange}
                            onDrop={fontDnD.handleDrop}
                            onDragOver={fontDnD.handleDragOver}
                        />
                    ))}
                </div>

                {/* Opacity Section */}
                <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-2 px-2">
                        Opacity
                    </div>
                    {Object.entries(opacity).map(([bucketId, bucket]) => (
                        <OpacityBucket
                            key={bucketId}
                            bucketId={bucketId}
                            bucket={bucket}
                            onChange={handleOpacityChange}
                            onDrop={opacityDnD.handleDrop}
                            onDragOver={opacityDnD.handleDragOver}
                        />
                    ))}
                </div>

                {/* Dev Tools Section */}
                <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="text-[10px] font-mono text-gray-500 uppercase mb-2 px-2">
                        Dev Tools
                    </div>
                    <div className="flex gap-2 px-2">
                        <button
                            type="button"
                            onClick={handleSetAllWhite}
                            className="flex-1 p-2 hover:scale-105 transition-transform border border-gray-300 rounded flex items-center justify-center gap-1.5"
                            title="Set All to White"
                        >
                            <div className="w-3 h-3 bg-white border border-gray-300 rounded-sm" />
                            <span className="text-[9px] font-mono text-gray-600">
                                White
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSetAllBlack}
                            className="flex-1 p-2 hover:scale-105 transition-transform border border-gray-300 rounded flex items-center justify-center gap-1.5"
                            title="Set All to Black"
                        >
                            <div className="w-3 h-3 bg-black rounded-sm" />
                            <span className="text-[9px] font-mono text-gray-600">
                                Black
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
