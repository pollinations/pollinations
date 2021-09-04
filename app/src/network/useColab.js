
import {useCallback, useEffect, useMemo, useReducer} from "react";

 
import {IPFSState, stateReducer, getInputContent, publish, subscribe, setStatusName, resolve, combineInputOutput, addInput } from "./ipfsClient";
import Debug from "debug";
import colabConnectionManager from "./localColabConnection";
import { useParams, useHistory } from "react-router-dom";
import { nodeID } from "./ipfsConnector";

const debug = Debug("useColab")

// updateHashCondition function can be optionally 
// passed to only update the hash when a run has finished

const useColab = (updateHashCondition = () => true) => {
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
    }, [state]);;


    useEffect(() => {
        colabConnectionManager(nodeData => {
            
            debug("nodeData", nodeData);
            
            const {nodeID, gpu} = nodeData;
    
            if (nodeID) {
                debug("setting new nodeID",nodeID);
                dispatchState({ nodeID, gpu, status: "ready" });
            }
        });
    },[]);

    useEffect(
        () => { 
            if (!state.nodeID)
                return;
            debug("nodeID changed to", state.nodeID,". (Re)subscribing");
            return subscribe(state.nodeID, setContentID);
        }
    , [state.nodeID]);


    useEffect(() => {
        if (state.contentID && state.contentID !== hash) {
            if (updateHashCondition(state)) {
                debug("contentID changed to", state.contentID,"updating hash")
                setHash(state.contentID);
            } else {
                debug("ContentID changed but not updating hash");
            }
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
            debug("dispatching", inputState)
            const newInputContentID = await getInputContent(inputState);
            debug("adding input",inputState,"got cid", newInputContentID,"to state",state.contentID)
            const newContentID = await addInput(newInputContentID, state.contentID);
            debug("determined new contentID", newContentID)
            setContentID(newContentID)
            debug("Publishing contentID to colab", newContentID);
            publish(state.nodeID, newInputContentID);
        }
    };
};

function useContentHash() {
    const params  = useParams()
    const history = useHistory()

    debug("location pathname", params);

    const hash = params?.hash;

    const setHash = (newHash, replace=true) => replace ? history.replace(`/p/${newHash}`) : history.push(`/p/${newHash}`);
    
    return { hash, setHash };
}

export default useColab;
