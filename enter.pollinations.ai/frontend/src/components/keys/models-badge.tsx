import type { FC } from "react";
import { CATEGORY_LABELS } from "../models/model-categories.ts";
import type { ModelCategory } from "../models/types.ts";

export const ModelsBadge: FC<{
    permissions: Record<string, string[]> | null;
}> = ({ permissions }) => {
    const models = permissions?.models ?? null;
    const text =
        models === null
            ? "All"
            : models.length === 0
              ? "None"
              : models
                    .map(
                        (category) =>
                            CATEGORY_LABELS[category as ModelCategory] ??
                            category,
                    )
                    .join(", ");
    return (
        <span className="text-xs font-medium text-theme-text-strong">
            {text}
        </span>
    );
};
