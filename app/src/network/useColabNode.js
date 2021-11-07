import {useCallback, useEffect, useMemo, useReducer, useState} from "react";
import colabConnectionManager from "./localColabConnection";
import Debug from "debug";
import { publisher, subscribeCID } from "./ipfsPubSub";

const debug = Debug("useColabNode");

const useColabNode = () => {

    const [node, setNode] = useState(null);
    const [publish, setPublish ] = useState(null);
    const [contentID, setContentID] = useState(null);

    useEffect(() => {
        colabConnectionManager(nodeData => {
            
            debug("nodeData", nodeData);
            
            const {nodeID, gpu} = nodeData;
    
            if (nodeID) {
                debug("setting new nodeID", nodeID);
                setNode({ nodeID, gpu });
            }
        });
    },[]);

    // Subscribe to updates from node when the nodeID changes
    useEffect(
        () => { 
            if (!node?.nodeID)
                return;
            debug("nodeID changed to", node.nodeID,". (Re)subscribing");
            return subscribeCID(node.nodeID, "/output", setContentID, heartbeat => {
                debug("hearbeat state", heartbeat);
                setNode({...node, heartbeat })
            });
        }
    , [node?.nodeID]);

    // Create a publisher to the node when the nodeID changes
    useEffect(() => {
        if (!node?.nodeID)
            return;
        debug("nodeID change to", node?.nodeID, "creating publisher")
        const { publish, close } = publisher(node?.nodeID, "/input");
        setPublish(() => publish);
        return close;
    }, [node?.nodeID]);

    return { publish, node, contentID };

};

export default useColabNode;