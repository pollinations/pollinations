import Debug from "debug";
import { useCallback, useEffect, useState } from "react";
import { publisher, subscribeCID } from "../network/ipfsPubSub";
import colabConnectionManager from "../network/localColabConnection";

const debug = Debug("useColabNode");


// receive colab nodeID via broadcastchannel
// subscribe to updates and return publisher to send new inputs
const useColabNode = () => {

    const [node, setNode] = useState({ connected: false, publish: NOOP_PUBLISH })

    const updateNode = useCallback(props => {
        if (!propsSame(node, props))
            setNode({ ...node, ...props })
    }, [node])

    useEffect(() => {
        colabConnectionManager(nodeData => {

            debug("nodeData", nodeData)

            const { nodeID, gpu } = nodeData

            if (nodeID) {
                debug("setting new nodeID", nodeID)

                // Setting connected to null means we are not sure if there is a connection yet
                updateNode({ nodeID, gpu, connected: null })
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
        const closeSub = subscribeCID(nodeID, "/output", contentID => updateNode({ contentID }), heartbeat => {
            debug("hearbeat state", heartbeat)
            const connected = heartbeat && heartbeat.alive
            updateNode({ connected })
        })

        return () => {
            closeSub();
            closePub();
        }

    }, [node.nodeID])

    const overrideContentID = useCallback(contentID => updateNode({ contentID }), [])
    const overrideNodeID = useCallback(nodeID => updateNode({ nodeID }), [])

    return { node, overrideContentID, overrideNodeID }

};

const NOOP_PUBLISH = () => console.error("publish function not defined yet for some weird reason.")

const propsSame = (node, props) => Object.keys(props).map(key => node[key] === props[key]).every(x => x)

export default useColabNode