import Debug from "debug";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { subscribeCID }  from  "@pollinations/ipfs/ipfsPubSub"

const debug = Debug("useAWSNode");



const useAWSNode = () => {

    const params = useParams()
    const { nodeID: paramsNodeID } = params
    const [nodeID, setNodeID] = useState(paramsNodeID);
    const [contentID, setContentID] = useState(null);

    // set node ID to the node ID from URL
    useEffect(() => setNodeID(paramsNodeID), [paramsNodeID])

    // subscribe to content from node
    useEffect(() => {

        if (!nodeID) return

        // Update
        debug("nodeID changed to", nodeID, ". (Re)subscribing")
        const closeSub = subscribeCID(nodeID, "/output", setContentID)

        return closeSub

    }, [nodeID])

    return { nodeID, contentID, setContentID, connected: true }

};

export default useAWSNode
