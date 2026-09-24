import { InlineLink } from "@pollinations/ui";

export const OPEN_WEBUI_URL =
    import.meta.env.MODE === "staging"
        ? "https://openwebui-staging.elliot-b6e.workers.dev"
        : "https://openwebui.pollinations.ai";

/**
 * Open WebUI signs in with Pollinations OAuth and fetches its model list with
 * the caller's own key, so a link opens the owner's private models too. It
 * matches `?model=` against the model id exactly; an id the viewer cannot see
 * opens the model picker prefilled with it rather than erroring.
 *
 * Only text models reach that picker — Open WebUI is a chat client.
 */
export function openWebUiChatUrl(modelId: string): string {
    return `${OPEN_WEBUI_URL}/?model=${encodeURIComponent(modelId)}`;
}

/**
 * Open WebUI only speaks /v1/chat/completions. Output modality is too loose a
 * test: transcription, embedding and realtime models all emit text but cannot
 * be chatted with. A model that does not declare its endpoints is treated as
 * not chattable, so it keeps the Play link instead.
 */
export function isOpenWebUiChattable(model: {
    supportedEndpoints?: string[];
}): boolean {
    return model.supportedEndpoints?.includes("/v1/chat/completions") ?? false;
}

/** The same title link for catalog models and managed models or agents. */
export function OpenWebUiLink({
    modelId,
    title,
}: {
    modelId: string;
    title: string;
}) {
    return (
        <InlineLink
            href={openWebUiChatUrl(modelId)}
            className="inline-flex min-w-0 max-w-full items-baseline"
            aria-label={`Open ${title} in Open WebUI`}
        >
            <span className="min-w-0 truncate">{title}</span>
        </InlineLink>
    );
}
