import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom'
import ResultViewer from "./ResultViewer";

export default ({ contentID }) => {

    useNavigateToResultsWhenDone(contentID);

    return <>
        <ResultViewer contentID={contentID} />
    </>;
};


// Navigate to viewing page with hash when done
function useNavigateToResultsWhenDone(contentID) {
    const navigate = useNavigate();

    useEffect(() => {

        if (!ipfs?.output?.done)
            return;

        navigate(`/p/${contentID}`);

    }, [ipfs?.output?.done]);
}
