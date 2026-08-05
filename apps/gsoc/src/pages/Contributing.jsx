import MarkdownDocumentPage from "../components/MarkdownDocumentPage";

const Contributing = () => (
    <MarkdownDocumentPage
        documentTitle="Contributing | GSoC × pollinations.ai"
        source="/GSOC/CONTRIBUTING.md"
        fetchErrorMessage="Failed to fetch contributing guidelines"
        errorLogLabel="contributing guidelines"
    />
);

export default Contributing;
