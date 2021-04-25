
import {useState, useEffect, useMemo} from "react";

import Client from 'ipfs-http-client';




const connect =  (onConnect) => {
    const client = Client('http://18.157.173.110:5002')

    const colabChannel = new BroadcastChannel("colabconnection");
    let nodeID = null;
    colabChannel.onmessage = ({data}) => {
        nodeID = data;

        console.warn("nodeID from colab", nodeID);
        
        if (onConnect)
            onConnect(nodeID);

    }

    // sending any message will trigger a reply with the nodeID
    colabChannel.postMessage("get_nodeid");
    // client.pubsub.subscribe(nodeID, dispa)
    const dispatch = data => {
        client.pubsub.publish(nodeID, JSON.stringify(data));
    };

    return dispatch;
}

// connect();
const useColab= () => {
    const [nodeID, setNodeID] = useState(null);

    const dispatch = useMemo(() => {
        return connect(setNodeID);
    }, []);
    return {nodeID, dispatch};
};

export default useColab;