import { Heading, Label } from "../ui/typography";
import { ExternalLinkIcon } from "../../icons/ExternalLinkIcon";
import { Colors } from "../../config/colors";
import { TextGenerator } from "../TextGenerator";
import { DOCS_PAGE } from "../../config/content";

/**
 * Authentication Card Component
 * Displays API key types and usage examples for the Docs page
 */
export function AuthCard() {
    return (
        <div>
            <Heading variant="section" spacing="comfortable">
                <TextGenerator content={DOCS_PAGE.authenticationTitle} />
            </Heading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Key Types + Get Your Key */}
                <div className="space-y-4">
                    <div>
                        <Label spacing="comfortable">
                            <TextGenerator content={DOCS_PAGE.keyTypesLabel} />
                        </Label>
                        <div className="space-y-3">
                            {/* Publishable Key */}
                            <div className="bg-gray-medium p-4">
                                <div className="flex items-start gap-3">
                                    <span className="font-mono text-lg font-black text-yellow">
                                        pk_
                                    </span>
                                    <div>
                                        <p className="font-headline text-xs font-black text-charcoal uppercase mb-2">
                                            <TextGenerator
                                                content={
                                                    DOCS_PAGE.publishableLabel
                                                }
                                            />
                                        </p>
                                        <ul className="text-xs text-gray-dark space-y-1">
                                            <li>
                                                <TextGenerator
                                                    content={
                                                        DOCS_PAGE.publishableFeature1
                                                    }
                                                />
                                            </li>
                                            <li>
                                                <TextGenerator
                                                    content={
                                                        DOCS_PAGE.publishableFeature2
                                                    }
                                                />
                                            </li>
                                            <li className="text-pink font-bold">
                                                <TextGenerator
                                                    content={
                                                        DOCS_PAGE.publishableFeature3
                                                    }
                                                />
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Secret Key */}
                            <div className="bg-gray-medium p-4">
                                <div className="flex items-start gap-3">
                                    <span className="font-mono text-lg font-black text-pink">
                                        sk_
                                    </span>
                                    <div>
                                        <p className="font-headline text-xs font-black text-charcoal uppercase mb-2">
                                            <TextGenerator
                                                content={DOCS_PAGE.secretLabel}
                                            />
                                        </p>
                                        <ul className="text-xs text-gray-dark space-y-1">
                                            <li>
                                                <TextGenerator
                                                    content={
                                                        DOCS_PAGE.secretFeature1
                                                    }
                                                />
                                            </li>
                                            <li>
                                                <TextGenerator
                                                    content={
                                                        DOCS_PAGE.secretFeature2
                                                    }
                                                />
                                            </li>
                                            <li>
                                                <TextGenerator
                                                    content={
                                                        DOCS_PAGE.secretFeature3
                                                    }
                                                />
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
                        className="inline-block bg-charcoal border-r-4 border-b-4 border-yellow shadow-lime-md px-6 py-4 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm transition-all"
                    >
                        <p className="font-headline text-xs uppercase tracking-wider font-black text-white mb-2">
                            <TextGenerator
                                content={DOCS_PAGE.getYourKeyLabel}
                            />
                        </p>
                        <div className="flex items-center gap-2">
                            <p className="font-mono text-sm font-black text-yellow">
                                enter.pollinations.ai
                            </p>
                            <ExternalLinkIcon
                                className="w-3 h-3"
                                stroke={Colors.yellow}
                            />
                        </div>
                    </a>
                </div>

                {/* Right: Usage Examples */}
                <div>
                    <Label spacing="comfortable">
                        <TextGenerator content={DOCS_PAGE.usageExamplesLabel} />
                    </Label>

                    {/* Header Method */}
                    <div className="mb-4">
                        <p className="font-body text-xs text-gray-dark mb-2">
                            <TextGenerator
                                content={DOCS_PAGE.serverSideDescription}
                            />
                        </p>
                        <div className="font-mono text-xs bg-charcoal text-light-gray p-4 border-r-4 border-b-4 border-gray">
                            <div className="text-yellow">
                                {"// Example with fetch"}
                            </div>
                            <div className="mt-2">{"fetch(url, {"}</div>
                            <div className="pl-4">{"  headers: {"}</div>
                            <div className="pl-8">
                                <span className="text-pink">
                                    {'"Authorization"'}
                                </span>
                                :{" "}
                                <span className="text-yellow">
                                    {'"Bearer sk_..."'}
                                </span>
                            </div>
                            <div className="pl-4">{"  }"}</div>
                            <div className="pl-4">{"});"}</div>
                        </div>
                    </div>

                    {/* Query Method */}
                    <div>
                        <p className="font-body text-xs text-gray-dark mb-2">
                            <TextGenerator
                                content={DOCS_PAGE.clientSideDescription}
                            />
                        </p>
                        <div className="font-mono text-xs bg-charcoal text-light-gray p-4 border-r-4 border-b-4 border-gray">
                            <div className="text-yellow">{"// Add to URL"}</div>
                            <div className="mt-2">
                                {"https://enter.pollinations.ai/..."}
                            </div>
                            <div className="pl-4">
                                <span className="text-pink">{"?key="}</span>
                                <span className="text-yellow">{"pk_..."}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
