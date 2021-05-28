
import {useState, useEffect, useMemo, useReducer} from "react";
import {toPromise, toPromise1, noop, zip, useHash} from "./utils"
 
import {IPFSState, stateReducer, addInputContent, publish, subscribe } from "./ipfsClient";
import Debug from "debug";
import colabConnectionManager from "./localColabConnection";
const debug = Debug("useColab")


const useColab = () => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const [hash, setHash] = useHash();
    debug("state", state); 

    const setContentID = async contentID => {
        debug("setContentID",contentID);
        if (contentID && contentID !== state.contentID) {
            debug("dispatching new contentID",contentID)
            dispatchState({ contentID, ipfs: await IPFSState( contentID)});
        }
    };

    useEffect(() => {
        colabConnectionManager(async nodeID => {
            dispatchState({ nodeID });
            const subscribeResult = await subscribe(nodeID, setContentID);
            debug("subscribeResult", subscribeResult);
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
            publish(newContentID,state.nodeID);
        }
    };
};

export default useColab;