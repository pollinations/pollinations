import { TERMS_PAGE } from "../../copy/content/legal";
import LegalMarkdownPage from "./LegalMarkdownPage";

function TermsPage() {
    return (
        <LegalMarkdownPage
            pageTitle={TERMS_PAGE.pageTitle}
            pageDescription={TERMS_PAGE.pageDescription}
            markdownPath="/legal/TERMS_OF_SERVICE.md"
            errorLabel="terms"
        />
    );
}

export default TermsPage;
