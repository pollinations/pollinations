
import {useEffect, useReducer} from "react";

 
import {IPFSState, stateReducer, addInputContent, publish, subscribe } from "./ipfsClient";
import Debug from "debug";
import colabConnectionManager from "./localColabConnection";
import { useLocation } from "react-use";
import { createBrowserHistory } from "history";


const debug = Debug("useColab")

const history = createBrowserHistory();

const useColab = () => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const { hash, setHash } = useContentHash();

    debug("state", state); 

    const setContentID = async contentID => {
        debug("setContentID", contentID);
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
        });
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


function useContentHash() {
    const { pathname } = useLocation();
    debug("location pathname", pathname)
    const hash = pathname.split("/p/")[1] || null;
    const setHash = h => history.push(`/p/${h}`);
    return { hash, setHash };
}


export default useColab;
