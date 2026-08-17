import { createListCollection } from "@ark-ui/react/collection";
import { Combobox } from "@ark-ui/react/combobox";
import { Portal } from "@ark-ui/react/portal";
import { useMemo } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Input, type InputProps } from "../primitives/Input.tsx";
import { ScrollArea } from "../primitives/ScrollArea.tsx";

export type EditableComboboxProps = Omit<InputProps, "onChange" | "value"> & {
    value: string;
    options: string[];
    onChange: (value: string) => void;
    emptyMessage?: string;
    align?: "start" | "end";
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function EditableCombobox({
    value,
    options,
    onChange,
    emptyMessage = "No options match.",
    align = "start",
    open,
    onOpenChange,
    className,
    disabled,
    name,
    placeholder,
    required,
    ...inputProps
}: EditableComboboxProps) {
    const visibleOptions = useMemo(() => {
        const query = value.trim().toLowerCase();
        return query === ""
            ? options
            : options.filter((option) => option.toLowerCase().includes(query));
    }, [options, value]);
    const collection = useMemo(
        () =>
            createListCollection({
                items: visibleOptions,
                itemToString: (item) => item,
                itemToValue: (item) => item,
            }),
        [visibleOptions],
    );
    const hasOptions = options.length > 0;

    return (
        <Combobox.Root
            collection={collection}
            inputValue={value}
            allowCustomValue
            openOnClick={hasOptions}
            openOnChange={() => hasOptions}
            open={open}
            disabled={disabled}
            name={name}
            required={required}
            positioning={{
                placement: align === "end" ? "bottom-end" : "bottom-start",
                sameWidth: true,
            }}
            onInputValueChange={(details) => onChange(details.inputValue)}
            onOpenChange={(details) => onOpenChange?.(details.open)}
        >
            <Combobox.Control className="polli:relative polli:w-full">
                <Combobox.Input asChild>
                    <Input
                        {...inputProps}
                        name={name}
                        placeholder={placeholder}
                        className={cn("polli:w-full polli:pr-10", className)}
                    />
                </Combobox.Input>
                {hasOptions && (
                    <Combobox.Trigger
                        aria-label="Show options"
                        className="polli-control polli:absolute polli:right-0 polli:top-0 polli:flex polli:h-full polli:w-10 polli:cursor-pointer polli:items-center polli:justify-center polli:rounded-r-lg polli:text-theme-text-muted polli:hover:text-theme-text-strong"
                    >
                        <Combobox.Context>
                            {(context) => (
                                <ChevronIcon
                                    expanded={context.open}
                                    className="polli:h-4 polli:w-4 polli:transition-transform"
                                />
                            )}
                        </Combobox.Context>
                    </Combobox.Trigger>
                )}
            </Combobox.Control>
            <Portal>
                <Combobox.Positioner>
                    <Combobox.Content className="polli:z-[120] polli:overflow-hidden polli:rounded-lg polli:bg-theme-bg-pale polli:p-1 polli:shadow-lg polli:focus:outline-none">
                        <ScrollArea className="polli:max-h-64">
                            <Combobox.List className="polli:flex polli:flex-col">
                                {visibleOptions.map((option) => (
                                    <Combobox.Item
                                        key={option}
                                        item={option}
                                        className={cn(
                                            "polli-control polli:flex polli:w-full polli:cursor-pointer polli:items-center polli:rounded-lg polli:bg-transparent polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:text-theme-text-base polli:transition-colors polli:hover:bg-theme-bg-hover polli:data-[highlighted]:bg-theme-bg-hover",
                                            value === option &&
                                                "polli:bg-theme-bg-active polli:text-theme-text-strong",
                                        )}
                                    >
                                        <Combobox.ItemText className="polli:truncate polli:font-mono">
                                            {option}
                                        </Combobox.ItemText>
                                    </Combobox.Item>
                                ))}
                                {visibleOptions.length === 0 && (
                                    <Combobox.Empty className="polli:m-0 polli:px-2 polli:py-2 polli:text-sm polli:text-theme-text-soft">
                                        {emptyMessage}
                                    </Combobox.Empty>
                                )}
                            </Combobox.List>
                        </ScrollArea>
                    </Combobox.Content>
                </Combobox.Positioner>
            </Portal>
        </Combobox.Root>
    );
}
