import {
    Button,
    FieldStack,
    IconButton,
    Input,
    PlusIcon,
    XIcon,
} from "@pollinations/ui";

export function DecisionCriteriaFields({
    type,
    values,
    onChange,
}: {
    type: "score" | "choice";
    values: string[];
    onChange: (values: string[]) => void;
}) {
    const isScale = type === "score";
    const item = isScale ? "level" : "choice";

    return (
        <FieldStack
            orientation="inline"
            className="[&>div:first-child]:self-start [&>div:first-child]:pt-2"
            label={
                isScale ? (
                    <>
                        Scale{" "}
                        <span className="text-xs font-normal text-theme-text-muted">
                            (low to high)
                        </span>
                    </>
                ) : (
                    "Choices"
                )
            }
        >
            <div className="flex min-w-0 flex-col items-start gap-2">
                {values.map((value, index) => {
                    // Each input represents an editable slot in the ordered list.
                    const label = `${isScale ? "Scale level" : "Choice"} ${index + 1}`;
                    return (
                        <div
                            key={label}
                            className="flex w-full min-w-0 items-center gap-2"
                        >
                            <Input
                                aria-label={label}
                                className="min-w-0 flex-1"
                                value={value}
                                onChange={(event) => {
                                    const next = [...values];
                                    next[index] = event.target.value;
                                    onChange(next);
                                }}
                            />
                            {values.length > 2 && (
                                <IconButton
                                    variant="ghost"
                                    aria-label={`Remove ${item} ${index + 1}`}
                                    onClick={() =>
                                        onChange(
                                            values.filter(
                                                (_, i) => i !== index,
                                            ),
                                        )
                                    }
                                >
                                    <XIcon />
                                </IconButton>
                            )}
                        </div>
                    );
                })}
                <Button
                    size="sm"
                    intent="neutral"
                    icon={<PlusIcon />}
                    onClick={() => onChange([...values, ""])}
                >
                    Add {item}
                </Button>
            </div>
        </FieldStack>
    );
}
