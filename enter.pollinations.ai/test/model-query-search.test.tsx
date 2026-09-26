import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it, vi } from "vitest";
import { BaseModelInput } from "../frontend/src/components/community-endpoints/base-model-input.tsx";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";
import { useModelQuerySearch } from "../frontend/src/components/models/use-model-query-search.tsx";

vi.hoisted(() => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubEnv("MODE", "development");
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

it("shows shared healthy defaults without clearing the saved base model", () => {
    const html = renderToStaticMarkup(
        createElement(BaseModelInput, {
            value: "owner/saved-model",
            disabled: false,
            onChange: () => {},
        }),
    );
    expect(html).toContain("Change Status filter: healthy");
    expect(html).toContain("Change Source filter: official");
    expect(html).toContain('value="owner/saved-model"');
});

it("defaults model pickers to healthy without changing their selected value", () => {
    const models: ModelPrice[] = [
        {
            name: "healthy-model",
            type: "text",
            capabilities: [],
            prices: [],
            health: { status: "healthy", requests: 50, success_rate: 100 },
        },
        {
            name: "down-model",
            type: "text",
            capabilities: [],
            prices: [],
            health: { status: "down", requests: 50, success_rate: 20 },
        },
    ];
    const onTextChange = vi.fn();
    function Picker({ value, initial }: { value: string; initial?: string }) {
        const { comboboxProps, matches } = useModelQuerySearch({
            models,
            initial,
            value,
            pickable: true,
            onTextChange,
        });
        expect(comboboxProps.value).toBe(value);
        if (value === "") {
            expect(comboboxProps.options).toContain("healthy-model");
            expect(comboboxProps.options.includes("down-model")).toBe(
                initial === "",
            );
            expect(matches(models[1])).toBe(initial === "");
        }
        return comboboxProps.startContent;
    }
    for (const value of ["", "down-model", "owner/custom-model"]) {
        const html = renderToStaticMarkup(<Picker value={value} />);
        expect(html).toContain("Change Source filter: official");
        expect(html).toContain("Change Status filter: healthy");
    }
    // Consent intentionally shows every requested model, regardless of health.
    const unfiltered = renderToStaticMarkup(<Picker value="" initial="" />);
    expect(unfiltered).not.toContain("Change Status filter");
    expect(onTextChange).not.toHaveBeenCalled();
});
