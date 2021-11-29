
 
import {useCallback, useEffect, useMemo, useReducer, useState} from "react";
import { updateInput, getWriter } from "../network/ipfsWebClient";
import {usePrevious} from 'react-use';

import Debug from "debug";
import { noop } from "../network/utils";

const debug = Debug("useIPFSWrite");

export default (ipfs, node) => {

    const { publish } = node;
  
    const [writer, setWriter] = useState(noop);




    const dispatch = useCallback(async inputState => {
          
        const cid = ipfs && ipfs[".cid"];

        debug("inputCID", cid);
        
        if (!cid)
            return;

        const writer = getWriter(ipfs);
        debug("dispatching", ipfs)
        const newContentID = await updateInput(writer, inputState);

        debug("added input", inputState, "got cid", newContentID, "to state");

        publish(newContentID);
        
        await writer.close();

        return newContentID;
        
    }, [publish, writer, ipfs]);


    return dispatch;
}