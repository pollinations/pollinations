import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom'
import ResultViewer from "./ResultViewer";

export default ({ contentID }) => {

    // TODO: we shouldn't be calling useIPFS twice (here and in ResultViewer.js)
    const ipfs = useIPFS(contentID);

    useNavigateToResultsWhenDone(contentID, ipfs);

    return <>
        <ResultViewer contentID={contentID} />
    </>;
};


// Navigate to viewing page with hash when done
function useNavigateToResultsWhenDone(contentID, ipfs) {
    const navigate = useNavigate();

    useEffect(() => {

        if (!ipfs?.output?.done)
            return;

        navigate(`/p/${contentID}`);

    }, [ipfs?.output?.done]);
}
