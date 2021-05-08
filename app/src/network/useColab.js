
import {useState, useEffect, useMemo, useReducer} from "react";
import {toPromise, toPromise1, noop, zip, useHash} from "./utils"
 
import {getIPFSState, stateReducer, addInputContent, colabConnectionManager, publish } from "./ipfsClient";
import Debug from "debug";
const debug = Debug("useColab")


const useColab = () => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const [hash, setHash] = useHash();
    debug("state", state); 

    const setContentID = async contentID => {
        debug("setContentID",contentID);
        if (contentID && contentID !== state.contentID) {
            debug("dispatching new contentID",contentID)
            dispatchState({ contentID, ipfs: await getIPFSState( contentID)});
        }
    };

    useEffect(() => {
        colabConnectionManager(nodeID => {
            dispatchState({ nodeID });
        }, setContentID);
    },[]);


    useEffect(() => {
        if (state.contentID && state.contentID !== hash)
            setHash(state.contentID)
    },[state]);

    useEffect(() => {
        debug("HASH",hash);
        if (hash && hash !== state.contentID)
            setContentID(hash);

    },[hash]);

    return {
        state, 
        dispatch: async inputState => {
            const newContentID = await addInputContent(state.contentID, inputState);
            setContentID(newContentID)
            debug("Publishing contentID to colab", newContentID);
            publish(state.nodeID, newContentID);
        }
    };
};

export default useColab;