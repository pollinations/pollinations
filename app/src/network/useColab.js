
import {useCallback, useEffect, useMemo, useReducer} from "react";

 
import {IPFSState, stateReducer, addInputContent, publish, subscribe, setStatusName, resolve } from "./ipfsClient";
import Debug from "debug";
import colabConnectionManager from "./localColabConnection";
import { useParams, useHistory } from "react-router-dom";


const debug = Debug("useColab")

const EMPTYCID = "QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn";

const useColab = () => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const { hash, setHash } = useContentHash();

    debug("state", state); 

    const setContentID = useCallback(async contentID => {
        debug("setContentID", contentID);
        if (contentID && contentID !== state.contentID) {
            debug("dispatching new contentID",contentID, state.contentID)
            dispatchState({ contentID, ipfs: await IPFSState( contentID)});
        }
    }, [state]);

    const setNodeID = useCallback(async nodeID => {
        debug("setNodeID", nodeID);
        if (nodeID && nodeID !== state.nodeID) {
            debug("setting new nodeID",nodeID);
            dispatchState({ nodeID, status: "ready" });
        }
    }, [state]);

    useEffect(() => {
        colabConnectionManager(setNodeID);
    },[]);

    useEffect(
        () => { 
            if (!state.nodeID)
                return;
            debug("nodeID changed to", state.nodeID,". (Re)subscribing");
            // resolve(state.nodeID).then(cid => { 
            //     debug("resolved IPNS to cid",cid);
            //     if (cid !== EMPTYCID) {
            //         setContentID(cid);
            //     } else {
            //         debug("Skipping since empty.");
            //     }
            // });
            return subscribe(state.nodeID, setContentID);
        }
    , [state.nodeID]);


    useEffect(() => {
        if (state.contentID && state.contentID !== hash) {
            debug("contentID changed to", state.contentID,"updating hash")
            setHash(state.contentID);
        }
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
        // ,
        // setStatus: async name => {
        //     const newContentID = await setStatusName(state.contentID, name);
        //     setContentID(newContentID);
        //     publish(state.nodeID, newContentID);
        // }
    };
};


function useContentHash() {
    const params  = useParams()
    const history = useHistory()

    debug("location pathname", params);

    const hash = params?.hash;
    const setHash = h => history.push(`/p/${h}`);
    
    return { hash, setHash };
}


export default useColab;
