import { ExternalLinkIcon, Tooltip } from "@pollinations/ui";

export const OPEN_WEBUI_URL = "https://openwebui.pollinations.ai";

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

type OpenWebUiLinkProps = {
    modelId: string;
    /** icon: sits inline beside a model name. text: a standalone row action. */
    variant?: "icon" | "text";
};

export function OpenWebUiLink({
    modelId,
    variant = "icon",
}: OpenWebUiLinkProps) {
    const href = openWebUiChatUrl(modelId);

    if (variant === "text") {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-theme-text-muted underline underline-offset-2 transition-colors hover:text-theme-text-strong"
            >
                Test in Open WebUI
                <ExternalLinkIcon className="h-3 w-3" />
            </a>
        );
    }

    return (
        <Tooltip
            content="Test in Open WebUI"
            ariaLabel={`Test ${modelId} in Open WebUI`}
            tapEnabled
            displayContents
        >
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 text-theme-text-muted transition-colors hover:text-theme-text-soft"
            >
                {/* ChatIcon and BotIcon already mean "text modality" and
                    "agent" in a model row (see model-icons.tsx), so a launcher
                    has to be something else. */}
                <ExternalLinkIcon className="h-4 w-4" />
            </a>
        </Tooltip>
    );
}
