

import Debug from "debug";
import { useCallback } from "react";
import { getWriter, updateInput } from "@pollinations/ipfs/ipfsWebClient"


const debug = Debug("useIPFSWrite");

export default (ipfs, node) => {

    const { publish } = node;

    debug("publish", publish)



    const dispatch = useCallback(async inputState => {


        const writer = getWriter();
        debug("dispatching", ipfs)
        const newContentID = await updateInput(writer, { ...ipfs.input, ...inputState })

        debug("added input", inputState, "got cid", newContentID, "to state")

        debug("publishing with publish function", publish)
        publish(newContentID)

        // await writer.close()

        return newContentID;

    }, [publish, ipfs])


    return dispatch
}