import { Heading, Label } from "../ui/typography";
import { ExternalLinkIcon } from "../../assets/ExternalLinkIcon";
import { DOCS_PAGE } from "../../../theme";

/**
 * Authentication Card Component
 * Displays API key types and usage examples for the Docs page
 */
export function AuthCard() {
    return (
        <div>
            <Heading variant="section" spacing="comfortable">
                {DOCS_PAGE.authenticationTitle.text}
            </Heading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Key Types + Get Your Key */}
                <div className="space-y-4">
                    <div>
                        <Label spacing="comfortable">
                            {DOCS_PAGE.keyTypesLabel.text}
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
                                            {DOCS_PAGE.publishableLabel.text}
                                        </p>
                                        <ul className="text-xs text-text-body-secondary space-y-1">
                                            <li>
                                                {
                                                    DOCS_PAGE
                                                        .publishableFeature1
                                                        .text
                                                }
                                            </li>
                                            <li>
                                                {
                                                    DOCS_PAGE
                                                        .publishableFeature2
                                                        .text
                                                }
                                            </li>
                                            <li className="text-text-brand font-bold">
                                                {
                                                    DOCS_PAGE
                                                        .publishableFeature3
                                                        .text
                                                }
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
                                            {DOCS_PAGE.secretLabel.text}
                                        </p>
                                        <ul className="text-xs text-text-body-secondary space-y-1">
                                            <li>
                                                {DOCS_PAGE.secretFeature1.text}
                                            </li>
                                            <li>
                                                {DOCS_PAGE.secretFeature2.text}
                                            </li>
                                            <li>
                                                {DOCS_PAGE.secretFeature3.text}
                                            </li>
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
                            {DOCS_PAGE.getYourKeyLabel.text}
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
                        {DOCS_PAGE.usageExamplesLabel.text}
                    </Label>

                    {/* Header Method */}
                    <div className="mb-4">
                        <p className="font-body text-xs text-text-body-secondary mb-2">
                            {DOCS_PAGE.serverSideDescription.text}
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
                            {DOCS_PAGE.clientSideDescription.text}
                        </p>
                        <div className="font-mono text-xs bg-button-primary-bg text-text-on-color p-4 border-r-4 border-b-4 border-border-main">
                            <div className="text-text-on-color/50">
                                {"// Add to URL"}
                            </div>
                            <div className="mt-2">
                                {"https://enter.pollinations.ai/..."}
                            </div>
                            <div className="pl-4">
                                <span className="text-text-on-color/80">
                                    {"?key="}
                                </span>
                                <span className="text-text-on-color">
                                    {"pk_..."}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
