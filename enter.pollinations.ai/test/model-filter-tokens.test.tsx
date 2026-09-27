import { Dropdown, DropdownItem, type DropdownProps } from "@pollinations/ui";
import { Children, type ReactElement, type ReactNode } from "react";
import { assert, describe, expect, it, vi } from "vitest";
import { ModelFilterTokens } from "../frontend/src/components/models/model-filter-tokens.tsx";
import {
    getModelQueryFilterTokens,
    replaceModelQueryFilterToken,
} from "../frontend/src/components/models/model-query.ts";

describe("catalog filter dropdowns", () => {
    it.each([
        [
            "source:community status:all llama",
            "source",
            "official",
            "source:official status:all llama",
            ["community", "official"],
        ],
        [
            "status:healthy llama source:official",
            "source",
            "community",
            "status:healthy llama source:community",
            ["community", "official"],
        ],
        [
            "status:healthy source:community llama",
            "status",
            "all",
            "status:all source:community llama",
            ["all", "healthy"],
        ],
    ])("changes %s without editing its other tokens", (initial, key, choice, expected, values) => {
        let query = initial;
        const onEdit = vi.fn();
        const close = vi.fn();
        const content = ModelFilterTokens({
            tokens: getModelQueryFilterTokens(initial),
            onEdit,
            onChange: (token, value) => {
                query = replaceModelQueryFilterToken(
                    query,
                    token.index,
                    `${token.filter.key}:${value}`,
                );
            },
        }) as ReactElement<{ children: ReactNode }>;
        const label = key === "source" ? "Source" : "Status";
        const dropdown = Children.toArray(content.props.children)
            .filter(
                (child): child is ReactElement<DropdownProps> =>
                    typeof child === "object" &&
                    "type" in child &&
                    child.type === Dropdown,
            )
            .find(
                ({ props }) =>
                    (
                        props.trigger(false) as ReactElement<{
                            label: string;
                        }>
                    ).props.label === label,
            );
        assert(dropdown);
        const renderOptions = dropdown.props.children as (
            close: () => void,
        ) => ReactNode;
        const options = Children.toArray(renderOptions(close)) as ReactElement<{
            children: ReactNode;
            onClick: () => void;
            "aria-pressed": boolean;
        }>[];
        expect(options.every(({ type }) => type === DropdownItem)).toBe(true);
        const optionText = (children: ReactNode) =>
            Children.toArray(children)
                .filter((child) => typeof child === "string")
                .join("");
        expect(options.map(({ props }) => optionText(props.children))).toEqual(
            values,
        );
        expect(
            options.filter(({ props }) => props["aria-pressed"]),
        ).toHaveLength(1);
        const selected = options.find(
            ({ props }) => optionText(props.children) === choice,
        );
        assert(selected);
        selected.props.onClick();
        expect(query).toBe(expected);
        expect(onEdit).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledOnce();
    });
});
