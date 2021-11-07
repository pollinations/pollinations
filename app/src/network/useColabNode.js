import {useCallback, useEffect, useMemo, useReducer, useState} from "react";
import colabConnectionManager from "./localColabConnection";
import Debug from "debug";
import { publisher, subscribeCID } from "./ipfsPubSub";

const debug = Debug("useColabNode");

const useColabNode = () => {

    const [node, setNode] = useState({connected: false});

    const updateNode = props => setNode(node => ({...node, ...props}));

    useEffect(() => {
        colabConnectionManager(nodeData => {
            
            debug("nodeData", nodeData);
            
            const {nodeID, gpu} = nodeData;
    
            if (nodeID) {
                debug("setting new nodeID", nodeID);
                updateNode({ nodeID, gpu });
            }
        });
    },[]);

    // Subscribe to updates from node when the nodeID changes
    useEffect(
        () => { 
            if (!node?.nodeID)
                return;
            debug("nodeID changed to", node.nodeID,". (Re)subscribing");
            return subscribeCID(node.nodeID, "/output", contentID => setNode(node => ({...node, contentID})), heartbeat => {
                debug("hearbeat state", heartbeat);
                const connected = heartbeat && heartbeat.alive;
                updateNode({connected});
            });
        }
    , [node?.nodeID]);

    // Create a publisher to the node when the nodeID changes
    useEffect(() => {
        if (!node?.nodeID)
            return;
        debug("nodeID change to", node?.nodeID, "creating publisher")
        const { publish, close } = publisher(node?.nodeID, "/input");
        updateNode({publish});
        return close;
    }, [node?.nodeID]);

    return node ;

};

export default useColabNode;