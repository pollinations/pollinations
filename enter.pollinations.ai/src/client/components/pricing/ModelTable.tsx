import type { FC } from "react";
import type { ModelPrice } from "./types.ts";
import { ModelRow } from "./ModelRow.tsx";
import { isPersona } from "./model-info.ts";

type ModelTableProps = {
    models: ModelPrice[];
    type: "text" | "image";
};

export const ModelTable: FC<ModelTableProps> = ({ models, type }) => {
    const sortedModels = [...models].sort((a, b) => {
        return a.name.localeCompare(b.name);
    });

    // For text models, separate personas
    const regularModels = type === "text" 
        ? sortedModels.filter(m => !isPersona(m.name))
        : sortedModels;
    const personaModels = type === "text"
        ? sortedModels.filter(m => isPersona(m.name))
        : [];

    const tableLabel = type === "text" ? "Text" : "Image";

    return (
        <>
        <table className="table-auto w-full">
            <thead>
                <tr>
                    <th className="text-left pt-0 pb-1 px-2 whitespace-nowrap w-48 text-sm font-bold text-pink-500 align-top">
                        <div>{tableLabel}</div>
                    </th>
                    <th className="text-center text-sm font-bold text-pink-500 pt-0 pb-1 px-2 whitespace-nowrap align-top">
                        <div>Per pollen*</div>
                        <div className="text-xs font-normal text-pink-400 opacity-70 italic">{type === "text" ? "responses" : "images"}</div>
                    </th>
                    <th className="text-center text-sm font-bold text-pink-500 pt-0 pb-1 px-2 whitespace-nowrap align-top">
                        <div>Input</div>
                        <div className="text-xs font-normal text-pink-400 opacity-70 italic">pollen / M tokens</div>
                    </th>
                    <th className="text-center text-sm font-bold text-pink-500 pt-0 pb-1 px-2 whitespace-nowrap align-top">
                        <div>Output</div>
                        <div className="text-xs font-normal text-pink-400 opacity-70 italic">pollen / M tokens</div>
                    </th>
                </tr>
            </thead>
            <tbody>
                {regularModels.map(model => (
                    <ModelRow key={model.name} model={model} />
                ))}
                {personaModels.length > 0 && (
                    <>
                        <tr>
                            <td colSpan={4} className="pt-4 pb-1 px-2">
                                <div className="text-xs font-semibold text-pink-500 opacity-60">Persona</div>
                            </td>
                        </tr>
                        {personaModels.map(model => (
                            <ModelRow key={model.name} model={model} />
                        ))}
                    </>
                )}
            </tbody>
        </table>
    </>
    );
};
