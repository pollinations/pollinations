import type { FC } from "react";
import type { ModelPrice } from "./types.ts";
import { ModelRow } from "./ModelRow.tsx";
import { isPersona } from "./model-info.ts";
import { calculatePerPollen } from "./calculations.ts";

type ModelTableProps = {
    models: ModelPrice[];
    type: "text" | "image" | "video";
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

export const ModelTable: FC<ModelTableProps> = ({ models, type }) => {
    // Sort by per pollen value (descending - higher counts first)
    const sortedModels = [...models].sort((a, b) => {
        const aPerPollen = calculatePerPollen(a);
        const bPerPollen = calculatePerPollen(b);

        const aValue = getPerPollenNumeric(aPerPollen);
        const bValue = getPerPollenNumeric(bPerPollen);

        // Sort descending (higher values first)
        return bValue - aValue;
    });

    // For text models, separate personas
    const regularModels =
        type === "text"
            ? sortedModels.filter((m) => !isPersona(m.name))
            : sortedModels;
    const personaModels =
        type === "text" ? sortedModels.filter((m) => isPersona(m.name)) : [];

    const tableLabel =
        type === "text" ? "Text" : type === "image" ? "Image" : "Video";

    return (
        <table className="table-fixed w-full min-w-[700px]">
            <thead>
                <tr>
                    <th className="text-left pt-0 pb-1 px-2 whitespace-nowrap w-[220px] text-sm font-bold text-pink-500 align-top">
                        <div className="flex items-center gap-2">
                            {tableLabel}
                            {type === "video" && (
                                <>
                                    <span className="text-[10px] text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full font-medium">
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
                    <th className="text-center text-sm font-bold text-pink-500 pt-0 pb-1 px-2 whitespace-nowrap w-[120px] align-top">
                        <div>1 pollen ≈</div>
                        <div className="text-xs font-normal text-pink-400 opacity-70 italic">
                            {type === "text"
                                ? "responses"
                                : type === "image"
                                  ? "images"
                                  : "seconds"}
                        </div>
                    </th>
                    <th className="text-center text-sm font-bold text-pink-500 pt-0 pb-1 px-2 whitespace-nowrap w-[190px] align-top">
                        <div>Input</div>
                        <div className="text-xs font-normal text-pink-400 opacity-70 italic">
                            pollen
                        </div>
                    </th>
                    <th className="text-center text-sm font-bold text-pink-500 pt-0 pb-1 px-2 whitespace-nowrap align-top">
                        <div>Output</div>
                        <div className="text-xs font-normal text-pink-400 opacity-70 italic">
                            pollen
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
                {regularModels.map((model) => (
                    <ModelRow key={model.name} model={model} />
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
                        {personaModels.map((model) => (
                            <ModelRow key={model.name} model={model} />
                        ))}
                    </>
                )}
            </tbody>
        </table>
    );
};
