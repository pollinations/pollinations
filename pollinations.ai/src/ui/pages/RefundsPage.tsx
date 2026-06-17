import { REFUNDS_PAGE } from "../../copy/content/legal";
import LegalMarkdownPage from "./LegalMarkdownPage";

function RefundsPage() {
    return (
        <LegalMarkdownPage
            pageTitle={REFUNDS_PAGE.pageTitle}
            pageDescription={REFUNDS_PAGE.pageDescription}
            markdownPath="/legal/REFUNDS_AND_CANCELLATIONS.md"
            errorLabel="refunds and cancellations"
        />
    );
}

export default RefundsPage;
