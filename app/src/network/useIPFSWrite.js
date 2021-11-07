
 
import {useCallback, useEffect, useMemo, useReducer, useState} from "react";
import {IPFSWebState,  updateInput, getInputWriter } from "./ipfsWebClient";

import Debug from "debug";

const debug = Debug("useIPFSWrite");

export default (ipfs, publish) => {

    const [inputWriter, setInputWriter] = useState(null);


    const inputCID = ipfs?.input && ipfs?.input[".cid"];
    debug("inputCID", inputCID, "inputWriter",inputWriter);
    useEffect(() => {
        if (!inputCID)
            return;
        
        debug("creating input writer for", inputCID);
        let close = null;
        (async () => {
            const writer = await getInputWriter(ipfs?.input);
            close = writer.close;
            
            setInputWriter(writer);
        })();
        return () => close && close();
    }, [inputCID]);

    const dispatch = useCallback(async inputState => {
        debug("dispatching", inputState, inputWriter)
        const newInputContentID = await updateInput(inputWriter, inputState);
        debug("added input",inputState,"got cid", newInputContentID,"to state")
        publish(newInputContentID);
    }, [publish, inputWriter]);

    return dispatch;
}