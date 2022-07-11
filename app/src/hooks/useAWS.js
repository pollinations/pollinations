import Debug from "debug";
import { useEffect, useState } from "react";
import { submitToAWS } from '@pollinations/ipfs/aws'
import {subscribeCID} from '@pollinations/ipfs/ipfsPubSub'
const debug = Debug("useAWSNode");



const useAWSNode = ({NodeID}) => {

    const [nodeID, setNodeID] = useState(NodeID || '');
    const [contentID, setContentID] = useState(null);

    // set node ID to the node ID from URL
    useEffect(() => {
        console.log(nodeID)
        setNodeID(NodeID)
    }, [nodeID])
    console.log(nodeID)
    // subscribe to content from node
    useEffect(() => {

        if (!nodeID) return
        console.log(nodeID)

        // Update
        debug("nodeID changed to", nodeID, ". (Re)subscribing")
        const closeSub = subscribeCID(nodeID, "/output", setContentID)

        return closeSub

    }, [nodeID])

    return { nodeID, contentID, setContentID, connected: true, submitToAWS, setNodeID }

};

export default useAWSNode
