import { useState, useEffect } from "react";
import fetch from "node-fetch";
import memoize from "lodash.memoize";
import { mapObjIndexed } from "ramda";

export default function useModelsMetadata() {
    const [metadata, setMetadata] = useState(null);
    useEffect(() => {
        loadMetadata().then(setMetadata);
    },[])
    return metadata;
}

const loadMetadata = memoize(async () => {
    console.log("called fetchmodelsmetadata");
    const response = await fetch('https://raw.githubusercontent.com/pollinations/model-index/main/metadata.json');
    const metadataFromServer = await response.json();
    const metadata = mapObjIndexed(({openapi, meta}) => ({...openapi , ...meta}), metadataFromServer);
    return metadata;
})
