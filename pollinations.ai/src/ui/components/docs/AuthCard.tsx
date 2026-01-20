import { DOCS_PAGE } from "../../../copy/content/docs";
import { usePageCopy } from "../../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../../assets/ExternalLinkIcon";
import { Heading } from "../ui/typography";

/**
 * Authentication Card Component
 * Displays API key types and usage examples for the Docs page
 */
export function AuthCard() {
    const { copy } = usePageCopy(DOCS_PAGE);

    return (
        <div>
            <Heading variant="section" spacing="comfortable">
                {copy.authenticationTitle}
            </Heading>

            {/* Intro */}
            <p className="text-sm text-text-body-secondary mb-6">
                {copy.authIntro}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Publishable Key Section */}
                <div className="bg-surface-card p-5 flex flex-col">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-xl font-black text-text-highlight">
                            pk_
                        </span>
                        <span className="font-headline text-sm font-black text-text-body-main uppercase">
                            {copy.publishableLabel}
                        </span>
                    </div>

                    <ul className="text-xs text-text-body-secondary space-y-1 flex-grow">
                        <li>{copy.publishableFeature1}</li>
                        <li>{copy.publishableFeature2}</li>
                    </ul>

                    {/* Beta Warning */}
                    <div className="mt-4 bg-yellow/10 border-l-2 border-yellow px-3 py-2">
                        <p className="text-xs text-yellow">
                            {copy.publishableBetaWarning}
                        </p>
                    </div>
                </div>

                {/* Secret Key Section */}
                <div className="bg-surface-card p-5 flex flex-col">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-xl font-black text-text-brand">
                            sk_
                        </span>
                        <span className="font-headline text-sm font-black text-text-body-main uppercase">
                            {copy.secretLabel}
                        </span>
                    </div>

                    <ul className="text-xs text-text-body-secondary space-y-1 flex-grow">
                        <li>{copy.secretFeature1}</li>
                        <li>{copy.secretFeature2}</li>
                    </ul>

                    {/* Security Warning */}
                    <div className="mt-4 bg-pink/10 border-l-2 border-pink px-3 py-2">
                        <p className="text-xs text-pink">
                            {copy.secretWarning}
                        </p>
                    </div>
                </div>
            </div>

            {/* Model Scoping Highlight */}
            <div className="mt-6 flex items-start gap-3 bg-gradient-to-r from-surface-card to-transparent border-l-4 border-text-highlight p-3">
                <span className="font-headline text-sm font-black text-text-highlight whitespace-nowrap">
                    {copy.modelScopingLabel}
                </span>
                <span className="text-xs text-text-body-secondary">
                    {copy.modelScopingDescription}
                </span>
            </div>

            {/* BYOP Highlight */}
            <div className="mt-4 flex items-start gap-3 bg-gradient-to-r from-surface-card to-transparent border-l-4 border-pink p-3">
                <span className="font-headline text-xs font-black text-pink uppercase tracking-wider whitespace-nowrap">
                    NEW
                </span>
                <a
                    href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-headline text-sm font-black text-pink whitespace-nowrap hover:underline"
                >
                    Bring Your Own Pollen 🌸
                </a>
                <span className="text-xs text-text-body-secondary">
                    Building an app? Let users pay for their own AI usage — you
                    pay €0. No backend needed.
                </span>
            </div>

            {/* Call to Action */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-button-primary-bg/10 p-4">
                <div>
                    <p className="font-headline text-sm font-black text-text-brand">
                        {copy.ctaLabel}
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <a
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-button-primary-bg border-r-4 border-b-4 border-border-highlight shadow-shadow-highlight-md px-5 py-2 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-shadow-highlight-sm transition-all"
                    >
                        <span className="font-headline text-xs font-black uppercase tracking-wider text-text-on-color">
                            {copy.getYourKeyLabel}
                        </span>
                        <ExternalLinkIcon className="w-3 h-3 text-text-on-color/70" />
                    </a>
                    <a
                        href="https://github.com/pollinations/pollinations/blob/main/APIDOCS.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-surface-card border-r-4 border-b-4 border-border-main px-5 py-2 hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                        <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                            {copy.ctaDocsLabel}
                        </span>
                        <ExternalLinkIcon className="w-3 h-3 text-text-body-secondary" />
                    </a>
                    <a
                        href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-surface-card border-r-4 border-b-4 border-border-main px-5 py-2 hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                        <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                            BYOP 🌸
                        </span>
                        <ExternalLinkIcon className="w-3 h-3 text-text-body-secondary" />
                    </a>
                </div>
            </div>
        </div>
    );
}
