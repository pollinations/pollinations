import type * as ReactModule from "react";

type ReactGlobal = typeof ReactModule;

function getReact(): ReactGlobal {
    const React = (globalThis as typeof globalThis & { React?: ReactGlobal })
        .React;

    if (!React) {
        throw new Error(
            "@pollinations/ui browser bundle requires globalThis.React. Load React before @pollinations/ui.",
        );
    }

    return React;
}

const React = getReact();

export default React;
export const {
    Children,
    Component,
    Fragment,
    Profiler,
    PureComponent,
    StrictMode,
    Suspense,
    cache,
    cloneElement,
    createContext,
    createElement,
    createRef,
    forwardRef,
    isValidElement,
    lazy,
    memo,
    startTransition,
    use,
    useActionState,
    useCallback,
    useContext,
    useDebugValue,
    useDeferredValue,
    useEffect,
    useEffectEvent,
    useId,
    useImperativeHandle,
    useInsertionEffect,
    useLayoutEffect,
    useMemo,
    useOptimistic,
    useReducer,
    useRef,
    useState,
    useSyncExternalStore,
    useTransition,
    version,
} = React;
