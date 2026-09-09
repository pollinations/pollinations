import { createElement, Fragment } from "./react-global.ts";

type PropsWithKey = Record<string, unknown> | null | undefined;
const createElementFromRuntime = createElement as (
    type: unknown,
    props?: Record<string, unknown> | null,
) => unknown;

export function jsx(type: unknown, props: PropsWithKey, key?: unknown) {
    const nextProps =
        key === undefined ? props : { ...(props ?? {}), key: String(key) };

    return createElementFromRuntime(type, nextProps);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
export { Fragment };
