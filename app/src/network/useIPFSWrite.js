
 
import {useCallback, useEffect, useMemo, useReducer, useState} from "react";

 
import {IPFSWebState,  updateInput, getInputWriter } from "./ipfsWebClient";

const [inputWriter, setInputWriter] = useState(null);



export default ({ipfs, publish}) => {

    const inputCID = ipfs?.input && ipfs?.input[".cid"];
    useEffect(() => {
        if (!inputCID)
            return;
        
        debug("creating input writer for", inputCID);
        let close = null;
        (async () => {
            const writer = await getInputWriter(inputCID);
            close = writer.close;
            
            // try to close the writer when window is closed
            window.onbeforeunload = () => { close(); return undefined; };

            setInputWriter(writer);
        })();
        return () => close && close();
    }, [inputCID]);

    const dispatch = useCallback(async inputState => {
        debug("dispatching", inputState)
        const newInputContentID = await updateInput(inputWriter, inputState);
        debug("added input",inputState,"got cid", newInputContentID,"to state",state.contentID)
        // setContentID(newInputContentID)
        debug("Publishing contentID to colab", newInputContentID);
        publish(newInputContentID);
    }, [publish, inputWriter]);

    return dispatch;
}