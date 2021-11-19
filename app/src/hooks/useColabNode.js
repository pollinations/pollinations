import {useCallback, useEffect, useMemo, useReducer, useState} from "react";
import colabConnectionManager from "../network/localColabConnection";
import Debug from "debug";
import { publisher, subscribeCID } from "../network/ipfsPubSub";

const debug = Debug("useColabNode");


// receive colab nodeID via broadcastchannel
// subscribe to updates and return publisher to send new inputs
const useColabNode = () => {

    const [node, setNode] = useState({connected: false, publish: NOOP_PUBLISH});

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

    useEffect(()=>{
        let nodeID = node?.nodeID

        if (!nodeID) return

        // Publisher
        debug("nodeID change to", nodeID, "creating publisher")
        const { publish, closePub } = publisher(nodeID, "/input")
        updateNode({ publish, close })
        //close()
        
        // Update
        debug("nodeID changed to", nodeID,". (Re)subscribing")
        const closeSub = subscribeCID(nodeID, "/output", contentID => setNode(node => ({...node, contentID})), heartbeat => {
            debug("hearbeat state", heartbeat);
            const connected = heartbeat && heartbeat.alive;
            updateNode({connected});
        })

        return () => {
            closeSub();
            closePub();
        }

    },[node.nodeID])

    const overrideContentID = useCallback(contentID => setNode(node => ({...node, contentID})), []);
    const overrideNodeID = useCallback(nodeID => setNode(node => ({...node, nodeID})), []);
    
    return {node, overrideContentID, overrideNodeID} ;

};

const NOOP_PUBLISH = () => console.error("publish function not defined yet for some weird reason.");

export default useColabNode;