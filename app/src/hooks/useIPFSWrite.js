
 
import {useCallback, useEffect, useMemo, useReducer, useState} from "react";
import { updateInput, getInputWriter } from "../network/ipfsWebClient";

import Debug from "debug";

const debug = Debug("useIPFSWrite");

export default (ipfs, publish) => {

    const inputCID = ipfs?.input && ipfs?.input[".cid"];
    const inputWriter = useMemo(() => {
        if (!inputCID)
            return;
        return getInputWriter(ipfs.input);
    }, [inputCID]);

    debug("inputCID", inputCID, inputWriter);

    const dispatch = useCallback(async inputState => {
        debug("dispatching", inputState, inputWriter)
        const newInputContentID = await updateInput(await inputWriter, inputState);
        debug("added input",inputState,"got cid", newInputContentID,"to state")
        publish(newInputContentID);
    }, [publish, inputWriter]);

    return dispatch;
}