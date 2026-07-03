import { Button, Input, Text } from "@pollinations/ui";
import { useState } from "react";
import { type StageInput, useStaging } from "../lib/staging";

function nowDateTime() {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function buildFxOverrideChange({
    enteredAt = nowDateTime(),
    value,
}: {
    enteredAt?: string;
    value: number;
}): StageInput {
    return {
        datasource: "overrides",
        row: {
            entered_at: enteredAt,
            scope: "config",
            key: "fx_eur_usd",
            field: "value",
            value_num: value,
            value_str: "",
            note: "",
        },
        summary: `config fx_eur_usd -> ${value}`,
    };
}

export function FxOverrideForm() {
    const { stage } = useStaging();
    const [value, setValue] = useState("");
    const [error, setError] = useState("");

    return (
        <form
            className="flex flex-wrap items-center gap-2 border-theme-border/70 border-t pt-4"
            onSubmit={(event) => {
                event.preventDefault();
                const parsed = Number(value);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    setError("number > 0");
                    return;
                }
                stage(buildFxOverrideChange({ value: parsed }));
                setValue("");
                setError("");
            }}
        >
            <Text as="span" weight="bold">
                fx_eur_usd
            </Text>
            <Input
                type="number"
                min="0"
                step="0.0001"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="1.14"
                className="w-32"
                aria-label="fx_eur_usd"
            />
            <Button type="submit" size="sm">
                Stage FX
            </Button>
            {error && <Text className="text-intent-danger-text">{error}</Text>}
        </form>
    );
}
