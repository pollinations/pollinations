import { ClipboardIcon, CopyButton } from "@pollinations/ui";
import { useState } from "react";

const EXAMPLES = ["Portfolio", "Tool", "Notebook"] as const;
const DEPLOY_COMMAND = "polli sites deploy ./dist --name my-app";

/** A local sketch of what someone could host, never a simulated deployment. */
export function SitePreview() {
    const [example, setExample] =
        useState<(typeof EXAMPLES)[number]>("Portfolio");
    const [copyError, setCopyError] = useState(false);

    return (
        <div className="site-sketch">
            <div className="site-sketch-browser" aria-hidden="true">
                <div className="site-sketch-address">
                    <span className="site-sketch-dot" />
                    your-name.pollinations.app
                </div>
                <div className="site-sketch-canvas" data-example={example}>
                    <div className="site-sketch-portfolio">
                        <span className="site-sketch-kicker">
                            A LITTLE COLLECTION
                        </span>
                        <strong>
                            Made of
                            <br />
                            small ideas.
                        </strong>
                        <div className="site-sketch-gallery">
                            <span />
                            <span />
                            <span />
                        </div>
                    </div>
                    <div className="site-sketch-tool">
                        <span className="site-sketch-kicker">
                            A MOMENT TO FOCUS
                        </span>
                        <strong>25:00</strong>
                        <span className="site-sketch-start">
                            Take your time
                        </span>
                    </div>
                    <div className="site-sketch-notebook">
                        <span className="site-sketch-kicker">FIELD NOTES</span>
                        <strong>Room for a thought.</strong>
                        <span>A walk. A sketch. A new beginning.</span>
                        <div className="site-sketch-lines" />
                    </div>
                </div>
            </div>
            <fieldset className="site-sketch-choices">
                <legend className="sr-only">Preview an example site</legend>
                {EXAMPLES.map((name) => (
                    <button
                        key={name}
                        type="button"
                        aria-pressed={example === name}
                        onClick={() => setExample(name)}
                    >
                        {name}
                    </button>
                ))}
            </fieldset>
            <details className="site-sketch-publish">
                <summary>Publish your own with polli</summary>
                <div className="mt-2 flex flex-col gap-2">
                    <p className="text-xs text-theme-text-muted">
                        After signing in, publish your build folder. Choose your
                        own site name.
                    </p>
                    <code className="break-words font-mono text-xs text-theme-text-strong">
                        {DEPLOY_COMMAND}
                    </code>
                    <CopyButton
                        value={DEPLOY_COMMAND}
                        aria-label="Copy deploy command"
                        tooltip={null}
                        onCopied={() => setCopyError(false)}
                        onCopyError={() => setCopyError(true)}
                        className="flex min-h-11 items-center gap-2 self-start rounded-lg text-xs font-semibold text-theme-text-strong hover:underline"
                    >
                        {(copied) => (
                            <>
                                <ClipboardIcon
                                    aria-hidden="true"
                                    className="size-3.5"
                                />
                                <span role="status">
                                    {copied ? "Copied" : "Copy deploy command"}
                                </span>
                            </>
                        )}
                    </CopyButton>
                    {copyError && (
                        <p
                            role="alert"
                            className="text-xs text-theme-text-muted"
                        >
                            Couldn’t copy. Select the command above to copy it.
                        </p>
                    )}
                </div>
            </details>
        </div>
    );
}
