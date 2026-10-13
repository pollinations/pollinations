import { useMemo, useRef } from "react";
import type {
    PollinationsTransportOptions,
    TransportChunk,
    TransportMessage,
} from "./chat-transport.js";
import {
    DEFAULT_GENERATION_URL,
    pollinationsTransport,
} from "./chat-transport.js";
import { useRequiredAuth } from "./hooks.js";

export type {
    PollinationsTransportOptions,
    TransportChunk,
    TransportMessage,
} from "./chat-transport.js";

/**
 * Build a `ChatTransport` backed by `/v1/responses`, scoped to the signed-in
 * user. The key is resolved per request, so rotation just works.
 *
 * ```tsx
 * const transport = usePollinationsTransport();
 * const chat = useChat({ transport });
 * ```
 */
export function usePollinationsTransport(
    options: Omit<PollinationsTransportOptions, "apiKey"> = {},
) {
    const { apiKey } = useRequiredAuth();
    const apiKeyRef = useRef(apiKey);
    apiKeyRef.current = apiKey;
    const optionsRef = useRef(options);
    optionsRef.current = options;

    return useMemo(
        () =>
            pollinationsTransport({
                baseUrl: DEFAULT_GENERATION_URL,
                model: options.model,
                fetch: options.fetch,
                headers: () => {
                    const h = optionsRef.current.headers;
                    return typeof h === "function" ? h() : (h ?? {});
                },
                apiKey: () => apiKeyRef.current ?? "",
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
}
