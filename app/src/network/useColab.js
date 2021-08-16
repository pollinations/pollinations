
import {useCallback, useEffect, useMemo, useReducer} from "react";

 
import {IPFSState, stateReducer, getInputContent, publish, subscribe, setStatusName, resolve, combineInputOutput, addInput } from "./ipfsClient";
import Debug from "debug";
import colabConnectionManager from "./localColabConnection";
import { useParams, useHistory } from "react-router-dom";

const debug = Debug("useColab")

const useColab = () => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const { hash, setHash } = useContentHash();

    debug("state", state); 

    const setContentID = useCallback(async contentID => {
        debug("setContentID", contentID);
        if ( typeof contentID === "function")
           throw new Error("ContentID shouldnt be a function"); 
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
            const newInputContentID = await getInputContent(inputState);
            debug("adding input",inputState,"got cid", newInputContentID,"to state",state.contentID)
            const newContentID = await addInput(newInputContentID, state.contentID);
            debug("determined new contentID", newContentID)
            setContentID(newContentID)
            debug("Publishing contentID to colab", newContentID);
            publish(state.nodeID, newInputContentID);
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
    const setHash = h => history.push(`/p/#${h}`);
    
    return { hash, setHash };
}


export default useColab;
