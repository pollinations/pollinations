import { COPY_CONSTANTS } from "../../../copy/constants";
import { DOCS_PAGE } from "../../../copy/content/docs";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../../assets/ExternalLinkIcon";
import { Heading, Label } from "../ui/typography";

/**
 * Authentication Card Component
 * Displays API key types and usage examples for the Docs page
 */
export function AuthCard() {
    // Get translated copy
    const { copy } = usePageCopy(DOCS_PAGE);

    return (
        <div>
            <Heading variant="section" spacing="comfortable">
                {copy.authenticationTitle}
            </Heading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Key Types + Get Your Key */}
                <div className="space-y-4">
                    <div>
                        <Label spacing="comfortable">
                            {copy.keyTypesLabel}
                        </Label>
                        <div className="space-y-3">
                            {/* Publishable Key */}
                            <div className="bg-surface-card p-4">
                                <div className="flex items-start gap-3">
                                    <span className="font-mono text-lg font-black text-text-highlight">
                                        pk_
                                    </span>
                                    <div>
                                        <p className="font-headline text-xs font-black text-text-body-main uppercase mb-2">
                                            {copy.publishableLabel}
                                        </p>
                                        <p className="text-xs text-amber-600 font-bold mb-2">
                                            {copy.publishableAlphaWarning}
                                        </p>
                                        <ul className="text-xs text-text-body-secondary space-y-1">
                                            <li>{copy.publishableFeature1}</li>
                                            <li>{copy.publishableFeature2}</li>
                                            <li className="text-text-brand font-bold">
                                                {copy.publishableFeature3}
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Secret Key */}
                            <div className="bg-surface-card p-4">
                                <div className="flex items-start gap-3">
                                    <span className="font-mono text-lg font-black text-text-brand">
                                        sk_
                                    </span>
                                    <div>
                                        <p className="font-headline text-xs font-black text-text-body-main uppercase mb-2">
                                            {copy.secretLabel}
                                        </p>
                                        <ul className="text-xs text-text-body-secondary space-y-1">
                                            <li>{copy.secretFeature1}</li>
                                            <li>{copy.secretFeature2}</li>
                                            <li>{copy.secretFeature3}</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <a
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-button-primary-bg border-r-4 border-b-4 border-border-highlight shadow-shadow-highlight-md px-6 py-4 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-shadow-highlight-sm transition-all"
                    >
                        <p className="font-headline text-xs font-black uppercase tracking-wider text-text-on-color mb-2">
                            {copy.getYourKeyLabel}
                        </p>
                        <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-black text-text-on-color/70">
                                enter.pollinations.ai
                            </p>
                            <ExternalLinkIcon className="w-4 h-4 text-text-on-color/70" />
                        </div>
                    </a>
                </div>

                {/* Right: Usage Examples */}
                <div>
                    <Label spacing="comfortable">
                        {copy.usageExamplesLabel}
                    </Label>

                    {/* Header Method */}
                    <div className="mb-4">
                        <p className="font-body text-xs text-text-body-secondary mb-2">
                            {copy.serverSideDescription}
                        </p>
                        <div className="font-mono text-xs bg-button-primary-bg text-text-on-color p-4 border-r-4 border-b-4 border-border-main">
                            <div className="text-text-on-color/50">
                                {"// Example with fetch"}
                            </div>
                            <div className="mt-2">{"fetch(url, {"}</div>
                            <div className="pl-4">{"  headers: {"}</div>
                            <div className="pl-8">
                                <span className="text-text-on-color/80">
                                    {'"Authorization"'}
                                </span>
                                :{" "}
                                <span className="text-text-on-color">
                                    {'"Bearer sk_..."'}
                                </span>
                            </div>
                            <div className="pl-4">{"  }"}</div>
                            <div className="pl-4">{"});"}</div>
                        </div>
                    </div>

                    {/* Query Method */}
                    <div>
                        <p className="font-body text-xs text-text-body-secondary mb-2">
                            {copy.clientSideDescription}
                        </p>
                        <div className="font-mono text-xs bg-button-primary-bg text-text-on-color p-4 border-r-4 border-b-4 border-border-main">
                            <div className="text-text-on-color/50">
                                {"// Add to URL"}
                            </div>
                            <div className="mt-2">
                                {`https://${COPY_CONSTANTS.apiBaseUrl}/...`}
                            </div>
                            <div className="pl-4">
                                <span className="text-text-on-color/80">
                                    {"?key="}
                                </span>
                                <span className="text-text-on-color">
                                    {"pk_... "}
                                </span>
                                <span className="text-text-on-color/50">
                                    {"or"}
                                </span>
                                <span className="text-text-on-color">
                                    {" sk_..."}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
