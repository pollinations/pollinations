import { PRIVACY_PAGE } from "../../copy/content/legal";
import LegalMarkdownPage from "./LegalMarkdownPage";

function PrivacyPage() {
    return (
        <LegalMarkdownPage
            pageTitle={PRIVACY_PAGE.pageTitle}
            pageDescription={PRIVACY_PAGE.pageDescription}
            markdownPath="/legal/PRIVACY_POLICY.md"
            errorLabel="privacy policy"
        />
    );
}

export default PrivacyPage;
