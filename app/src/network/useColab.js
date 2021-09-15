
import {useCallback, useEffect, useMemo, useReducer, useState} from "react";

 
import {IPFSState,  getInputContent, addInput } from "./ipfsWebClient";
import Debug from "debug";
import colabConnectionManager from "./localColabConnection";
import { useParams, useHistory } from "react-router-dom";
import { publisher, subscribeCID } from "./ipfsPubSub";

const debug = Debug("useColab")

// updateHashCondition function can be optionally 
// passed to only update the hash when a run has finished

const useColab = (updateHashCondition = () => true) => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const { hash, setHash } = useContentHash();
    const [ publish, setPublish ] = useState(null);

    debug("state", state); 

    const setContentID = useCallback(async contentID => {
        
        debug("setContentID", contentID);
        
        if ( typeof contentID === "function")
           throw new Error("ContentID shouldnt be a function"); 

        if (contentID === "HEARTBEAT") {
            console.error("The HEARTBEAT message should not have reached here. Check the code...");
            return;
        }
        if (contentID && contentID !== state.contentID) {
            debug("dispatching new contentID",contentID, state.contentID)
            dispatchState({ contentID, ipfs: await IPFSState( contentID)});
        }
    }, [state]);


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

    // Subscribe to updates from node when the nodeID changes
    useEffect(
        () => { 
            if (!state.nodeID)
                return;
            debug("nodeID changed to", state.nodeID,". (Re)subscribing");
            return subscribeCID(state.nodeID, setContentID);
        }
    , [state.nodeID]);

    // Create a publisher to the node when the nodeID changes
    useEffect(() => {
        if (!state.nodeID)
            return;
        debug("nodeID change to", state.nodeID, "creating publisher")
        const { publish, close } = publisher(state.nodeID, "/input");
        setPublish(() => publish);
        return close;
    }, [state.nodeID]);

    // Update the hash when the content ID changes and the updateHashCondition is met
    // We don't update the hash on each CID change to not pollute the browser history
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

    // Set the content ID from the hash provided in the URL
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
            publish(newInputContentID);
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

const stateReducer = [
    (state, newState) => {
        debug("Merging", newState, "into", state);
        let mergedState = {
            ...state,
            ...newState,
            ipfs: {...state.ipfs, ...newState.ipfs}
        };
        debug("Merging result", mergedState);
        return mergedState;
    }, {
        nodeID: null,
        contentID: null,
        ipfs: { },
        status: "disconnected"
    }];


export default useColab;


