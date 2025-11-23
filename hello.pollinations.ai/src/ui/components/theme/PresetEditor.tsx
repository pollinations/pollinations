import { useEffect, useState } from "react";
import { themeToDictionary } from "../../../content/theme";
import { PRESETS, DEFAULT_PRESET } from "../../../content/presets";
import { useTheme } from "../../contexts/ThemeContext";
import type { ThemeState, RadiusState, FontState } from "./types";
import {
    convertToThemeState,
    convertRadiusToState,
    convertFontsToState,
} from "./utils/state-converters";
import { useKeyboardShortcut } from "./hooks/useKeyboardShortcut";
import { useColorSync, useRadiusSync, useFontSync } from "./hooks/useCSSSync";
import {
    useDragAndDrop,
    colorTokenFilter,
    radiusTokenFilter,
    fontTokenFilter,
} from "./hooks/useDragAndDrop";
import { ColorBucket } from "./components/ColorBucket";
import { RadiusBucket } from "./components/RadiusBucket";
import { FontBucket } from "./components/FontBucket";
import { PresetManager } from "./PresetManager";

export function PresetEditor() {
    const [isOpen, setIsOpen] = useState(false);
    const {
        themeDefinition,
        themePrompt,
        setTheme: setContextTheme,
    } = useTheme();

    // State
    const [theme, setTheme] = useState<ThemeState>(() =>
        convertToThemeState(themeDefinition)
    );
    const [radius, setRadius] = useState<RadiusState>(() =>
        convertRadiusToState(themeDefinition.borderRadius || {})
    );
    const [fonts, setFonts] = useState<FontState>(() =>
        convertFontsToState(themeDefinition.fonts || {})
    );
    const [selectedPresetId, setSelectedPresetId] = useState(
        themePrompt || DEFAULT_PRESET.id
    );

    // Sync with context theme when it changes
    useEffect(() => {
        setTheme(convertToThemeState(themeDefinition));
        setRadius(convertRadiusToState(themeDefinition.borderRadius || {}));
        setFonts(convertFontsToState(themeDefinition.fonts || {}));
    }, [themeDefinition]);

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

    // Drag and drop
    const colorDnD = useDragAndDrop(setTheme, colorTokenFilter);
    const radiusDnD = useDragAndDrop(setRadius, radiusTokenFilter);
    const fontDnD = useDragAndDrop(setFonts, fontTokenFilter);

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
            setSelectedPresetId(presetId);
            // Update context to sync themePrompt
            setContextTheme(dict, preset.id, preset.copy);
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
