import type { FC } from "react";
import { calculatePerPollen } from "./calculations.ts";
import { ModelRow } from "./ModelRow.tsx";
import { isPersona } from "./model-info.ts";
import type { ModelPrice } from "./types.ts";

type ModelTableProps = {
    models: ModelPrice[];
    type: "text" | "image" | "video";
};

type UnifiedModelTableProps = {
    imageModels: ModelPrice[];
    videoModels: ModelPrice[];
    textModels: ModelPrice[];
};

// Helper to convert per pollen string to numeric value for sorting
const getPerPollenNumeric = (perPollen: string): number => {
    if (perPollen === "—") return -1;

    // Remove "min" suffix for audio models
    const cleaned = perPollen.replace(" min", "");

    // Handle K/M suffixes
    if (cleaned.endsWith("K")) {
        return parseFloat(cleaned) * 1000;
    }
    if (cleaned.endsWith("M")) {
        return parseFloat(cleaned) * 1000000;
    }

    return parseFloat(cleaned) || -1;
};

const sortModels = (models: ModelPrice[]) => {
    return [...models].sort((a, b) => {
        const aPerPollen = calculatePerPollen(a);
        const bPerPollen = calculatePerPollen(b);
        const aValue = getPerPollenNumeric(aPerPollen);
        const bValue = getPerPollenNumeric(bPerPollen);
        return bValue - aValue;
    });
};

type SectionHeaderProps = {
    label: string;
    type: "text" | "image" | "video";
    isFirst?: boolean;
};

const sectionColors = {
    bg: "bg-white/50",
    text: "text-amber-800",
    subtext: "text-amber-700",
};

const SectionHeader: FC<SectionHeaderProps> = ({
    label,
    type,
    isFirst = false,
}) => (
    <>
        {!isFirst && (
            <tr>
                <td colSpan={4} className="h-6 rounded-t-lg" />
            </tr>
        )}
        <tr className={`${sectionColors.bg} overflow-hidden rounded-t-lg`}>
            <td
                className={`text-left pt-3 pb-2 px-4 text-base font-bold ${sectionColors.text} align-middle border-t border-l border-amber-200 rounded-tl-lg`}
            >
                <div className="flex items-center gap-2">
                    {label.toUpperCase()}
                    {type === "video" && (
                        <span className="relative inline-flex items-center group/alpha text-[10px] text-gray-500 bg-transparent px-1.5 py-0.5 rounded-full font-medium border border-gray-400 cursor-pointer hover:bg-gray-50">
                            alpha
                            <span className="invisible group-hover/alpha:visible absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-nowrap z-50 pointer-events-none">
                                API endpoints and parameters may change
                            </span>
                        </span>
                    )}
                </div>
            </td>
            <td
                className={`text-center text-sm font-bold ${sectionColors.text} pt-3 pb-2 px-2 whitespace-nowrap w-[90px] align-middle border-t border-amber-200`}
            >
                <div>1 pollen ≈</div>
                <div
                    className={`text-xs font-normal ${sectionColors.subtext} opacity-70 italic`}
                >
                    {type === "text"
                        ? "responses"
                        : type === "image"
                          ? "images"
                          : "videos"}
                </div>
            </td>
            <td
                className={`text-center text-sm font-bold ${sectionColors.text} pt-3 pb-2 px-2 whitespace-nowrap w-[130px] align-middle border-t border-amber-200`}
            >
                <div>Input</div>
                <div
                    className={`text-xs font-normal ${sectionColors.subtext} opacity-70 italic`}
                >
                    pollen
                </div>
            </td>
            <td
                className={`text-center text-sm font-bold ${sectionColors.text} pt-3 pb-2 px-2 whitespace-nowrap w-[90px] align-middle border-t border-r border-amber-200 rounded-tr-lg`}
            >
                <div>Output</div>
                <div
                    className={`text-xs font-normal ${sectionColors.subtext} opacity-70 italic`}
                >
                    pollen
                </div>
            </td>
        </tr>
    </>
);

export const UnifiedModelTable: FC<UnifiedModelTableProps> = ({
    imageModels,
    videoModels,
    textModels,
}) => {
    const sortedImageModels = sortModels(imageModels);
    const sortedVideoModels = sortModels(videoModels);
    const sortedTextModels = sortModels(textModels);

    const regularTextModels = sortedTextModels.filter(
        (m) => !isPersona(m.name),
    );
    const personaModels = sortedTextModels.filter((m) => isPersona(m.name));

    return (
        <table className="w-full">
            <tbody>
                {/* Image Section */}
                <SectionHeader label="Image" type="image" isFirst />
                {sortedImageModels.map((model, index) => (
                    <ModelRow
                        key={model.name}
                        model={model}
                        isLast={index === sortedImageModels.length - 1}
                    />
                ))}

                {/* Video Section */}
                <SectionHeader label="Video" type="video" />
                {sortedVideoModels.map((model, index) => (
                    <ModelRow
                        key={model.name}
                        model={model}
                        isLast={index === sortedVideoModels.length - 1}
                    />
                ))}

                {/* Text Section */}
                <SectionHeader label="Text" type="text" />
                {regularTextModels.map((model, index) => (
                    <ModelRow
                        key={model.name}
                        model={model}
                        isLast={
                            personaModels.length === 0 &&
                            index === regularTextModels.length - 1
                        }
                    />
                ))}
                {personaModels.length > 0 && (
                    <>
                        <tr>
                            <td colSpan={4} className="pt-4 pb-1 px-2">
                                <div className="text-xs font-semibold text-pink-500 opacity-60">
                                    Persona
                                </div>
                            </td>
                        </tr>
                        {personaModels.map((model, index) => (
                            <ModelRow
                                key={model.name}
                                model={model}
                                isLast={index === personaModels.length - 1}
                            />
                        ))}
                    </>
                )}
            </tbody>
        </table>
    );
};

export const ModelTable: FC<ModelTableProps> = ({ models, type }) => {
    const sortedModels = sortModels(models);

    const regularModels =
        type === "text"
            ? sortedModels.filter((m) => !isPersona(m.name))
            : sortedModels;
    const personaModels =
        type === "text" ? sortedModels.filter((m) => isPersona(m.name)) : [];

    const tableLabel =
        type === "text" ? "Text" : type === "image" ? "Image" : "Video";

    return (
        <table className="w-full">
            <thead>
                <tr className={sectionColors.bg}>
                    <th
                        className={`text-left pt-2 pb-1 px-2 text-sm font-bold ${sectionColors.text} align-top rounded-tl-lg`}
                    >
                        <div className="flex items-center gap-2">
                            {tableLabel}
                            {type === "video" && (
                                <>
                                    <span className="text-[10px] text-gray-500 bg-transparent px-1.5 py-0.5 rounded-full font-medium border border-gray-400">
                                        alpha 🧪
                                    </span>
                                    <span className="relative inline-flex items-center group/alpha">
                                        <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-pink-100 border border-pink-300 text-pink-500 hover:bg-pink-200 hover:border-pink-400 transition-colors text-[10px] font-bold cursor-pointer">
                                            i
                                        </span>
                                        <span className="invisible group-hover/alpha:visible absolute left-0 top-full mt-1 px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-nowrap z-50 pointer-events-none">
                                            API endpoints and parameters may
                                            change
                                        </span>
                                    </span>
                                </>
                            )}
                        </div>
                    </th>
                    <th
                        className={`text-center text-sm font-bold ${sectionColors.text} pt-2 pb-1 px-2 whitespace-nowrap w-[90px] align-top`}
                    >
                        <div>1 pollen ≈</div>
                        <div
                            className={`text-xs font-normal ${sectionColors.subtext} opacity-70 italic`}
                        >
                            {type === "text"
                                ? "responses"
                                : type === "image"
                                  ? "images"
                                  : "videos"}
                        </div>
                    </th>
                    <th
                        className={`text-center text-sm font-bold ${sectionColors.text} pt-2 pb-1 px-2 whitespace-nowrap w-[130px] align-top`}
                    >
                        <div>Input</div>
                        <div
                            className={`text-xs font-normal ${sectionColors.subtext} opacity-70 italic`}
                        >
                            pollen
                        </div>
                    </th>
                    <th
                        className={`text-center text-sm font-bold ${sectionColors.text} pt-2 pb-1 px-2 whitespace-nowrap w-[90px] align-top rounded-tr-lg`}
                    >
                        <div>Output</div>
                        <div
                            className={`text-xs font-normal ${sectionColors.subtext} opacity-70 italic`}
                        >
                            pollen
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
                {regularModels.map((model, index) => (
                    <ModelRow
                        key={model.name}
                        model={model}
                        isLast={
                            personaModels.length === 0 &&
                            index === regularModels.length - 1
                        }
                    />
                ))}
                {personaModels.length > 0 && (
                    <>
                        <tr>
                            <td colSpan={4} className="pt-4 pb-1 px-2">
                                <div className="text-xs font-semibold text-pink-500 opacity-60">
                                    Persona
                                </div>
                            </td>
                        </tr>
                        {personaModels.map((model, index) => (
                            <ModelRow
                                key={model.name}
                                model={model}
                                isLast={index === personaModels.length - 1}
                            />
                        ))}
                    </>
                )}
            </tbody>
        </table>
    );
};
