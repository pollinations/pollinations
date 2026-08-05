import MarkdownDocumentPage from "../components/MarkdownDocumentPage";

const CodeOfConduct = () => (
    <MarkdownDocumentPage
        documentTitle="Code of Conduct | GSoC × pollinations.ai"
        source="/GSOC/CODE_OF_CONDUCT.md"
        fetchErrorMessage="Failed to fetch code of conduct"
        errorLogLabel="code of conduct"
    />
);

export default CodeOfConduct;
