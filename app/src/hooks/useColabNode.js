import { publisher, subscribeCID } from "@pollinations/ipfs/ipfsPubSub";
import Debug from "debug";
import { useCallback, useEffect, useState } from "react";
import colabConnectionManager from "../network/localColabConnection";
import useLocalStorage from "./useLocalStorage";


const debug = Debug("useColabNode");

// receive colab nodeID via broadcastchannel
// subscribe to updates and return publisher to send new inputs
const useColabNode = () => {


    const [localStorageNodeID, setLocalStorageNodeID] = useLocalStorage("nodeID", null)

    const [node, setNode] = useState({ connected: false, publish: NOOP_PUBLISH, nodeID: localStorageNodeID })

    const updateNode = useCallback(props => {
        
        if (props.nodeID && props.nodeID !== localStorageNodeID)
            setLocalStorageNodeID(props.nodeID)

        setNode(node => propsSame(node, props) ? node : ({ ...node, ...props }))
    }, [])

    useEffect(() => {
        colabConnectionManager(nodeData => {

            debug("nodeData", nodeData)

            const { nodeID, gpu } = nodeData

            if (nodeID) {
                debug("setting new nodeID", nodeID)

                // Setting connected to null means we are not sure if there is a connection yet
                updateNode({ nodeID, gpu, connected: true })
            }
        });
    }, []);

    useEffect(() => {
        let nodeID = node?.nodeID

        if (!nodeID) return

        // Publisher
        debug("nodeID change to", nodeID, "creating publisher")
        const { publish, close: closePub } = publisher(nodeID, "/input")
        updateNode({ publish, close })
        //close()

        // Update
        debug("nodeID changed to", nodeID, ". (Re)subscribing")
        const closeSub = subscribeCID(nodeID, contentID => updateNode({ contentID }))

        return () => {
            closeSub()
            closePub()
        }

    }, [node.nodeID])

    const overrideContentID = useCallback(contentID => updateNode({ contentID }), [])
    const overrideNodeID = useCallback(nodeID => updateNode({ nodeID }), [])

    return { node, overrideContentID, overrideNodeID }

};

const NOOP_PUBLISH = () => console.error("publish function not defined yet for some weird reason.")

const propsSame = (node, props) => Object.keys(props).map(key => node[key] === props[key]).every(x => x)

export default useColabNode
