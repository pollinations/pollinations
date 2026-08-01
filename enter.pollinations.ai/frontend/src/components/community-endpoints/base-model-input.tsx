import {
    ChevronIcon,
    Dropdown,
    DropdownItem,
    Input,
    ScrollArea,
} from "@pollinations/ui";
import { useEffect, useState } from "react";
import {
    fetchModelCatalog,
    getCatalogCategory,
    getCatalogModelId,
} from "../models/model-catalog.ts";

export function BaseModelInput({
    value,
    disabled,
    onChange,
}: {
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const [modelOptions, setModelOptions] = useState<string[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchModelCatalog()
            .then((models) => {
                if (cancelled) return;
                setModelOptions(
                    models
                        .filter((model) => getCatalogCategory(model) === "text")
                        .map(getCatalogModelId)
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b)),
                );
            })
            .catch(() => {
                if (!cancelled) setModelOptions([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const query = value.trim().toLowerCase();
    const visibleOptions =
        query === ""
            ? modelOptions
            : modelOptions.filter((model) =>
                  model.toLowerCase().includes(query),
              );

    return (
        <Dropdown
            align="end"
            open={menuOpen && modelOptions.length > 0}
            onOpenChange={(open) =>
                setMenuOpen(open && modelOptions.length > 0)
            }
            className="w-[var(--reference-width)] min-w-0 p-1"
            trigger={(open) => (
                <div className="relative w-full">
                    <Input
                        name="prompt-agent-base-model"
                        value={value}
                        placeholder="openai"
                        className="w-full pr-10"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={disabled}
                        onChange={(event) => {
                            onChange(event.target.value);
                            if (modelOptions.length > 0) setMenuOpen(true);
                        }}
                    />
                    {modelOptions.length > 0 && (
                        <ChevronIcon
                            expanded={open}
                            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-theme-text-muted transition-transform"
                        />
                    )}
                </div>
            )}
        >
            {(close) =>
                visibleOptions.length > 0 ? (
                    <ScrollArea className="max-h-64">
                        <div className="flex flex-col">
                            {visibleOptions.map((model) => (
                                <DropdownItem
                                    key={model}
                                    className={
                                        value === model
                                            ? "bg-theme-bg-active font-medium text-theme-text-strong"
                                            : undefined
                                    }
                                    onClick={() => {
                                        onChange(model);
                                        close();
                                    }}
                                >
                                    <span className="truncate font-mono">
                                        {model}
                                    </span>
                                </DropdownItem>
                            ))}
                        </div>
                    </ScrollArea>
                ) : (
                    <p className="m-0 px-2 py-2 text-sm text-theme-text-soft">
                        No models match. You can still type any model ID.
                    </p>
                )
            }
        </Dropdown>
    );
}
