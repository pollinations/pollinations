import { useEffect, useState } from "react";
import { config } from "../config.ts";
import {
    isSocialProvider,
    SOCIAL_PROVIDER_LABELS,
    type SocialProviderConfig,
} from "../lib/social-providers.ts";

type ProviderResponse = {
    providers?: Array<{
        id?: unknown;
        label?: unknown;
    }>;
};

type SocialProviderState = {
    providers: ReadonlyArray<SocialProviderConfig>;
    isLoading: boolean;
    error: string | null;
};

function normalizeProviders(data: ProviderResponse): SocialProviderConfig[] {
    const providers = Array.isArray(data.providers) ? data.providers : [];
    return providers.flatMap((provider) => {
        if (!isSocialProvider(provider.id)) return [];
        return [
            {
                id: provider.id,
                label:
                    typeof provider.label === "string" && provider.label
                        ? provider.label
                        : SOCIAL_PROVIDER_LABELS[provider.id],
            },
        ];
    });
}

export function useSocialProviders(): SocialProviderState {
    const [state, setState] = useState<SocialProviderState>({
        providers: [],
        isLoading: true,
        error: null,
    });

    useEffect(() => {
        const controller = new AbortController();

        async function loadProviders() {
            try {
                const res = await fetch(`${config.apiBaseUrl}/auth-providers`, {
                    headers: { Accept: "application/json" },
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error("provider request failed");
                const data = (await res.json()) as ProviderResponse;
                setState({
                    providers: normalizeProviders(data),
                    isLoading: false,
                    error: null,
                });
            } catch {
                if (controller.signal.aborted) return;
                setState({
                    providers: [],
                    isLoading: false,
                    error: "Sign in is unavailable. Please try again later.",
                });
            }
        }

        void loadProviders();
        return () => controller.abort();
    }, []);

    return state;
}
