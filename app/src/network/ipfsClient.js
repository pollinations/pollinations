
import {useState, useEffect, useMemo} from "react";
import Client from 'ipfs-http-client';
import toUrlSearchParams from "ipfs-http-client/src/lib/to-url-search-params";

const connect =  (onConnect) => {
    const client = Client('http://18.157.173.110:5002')

    const colabChannel = new BroadcastChannel("colabconnection");
    let nodeID = null;
    let rootContentID = null;
    colabChannel.onmessage = ({data}) => {
        [nodeID, rootContentID] = data.split(",");

        console.warn("nodeID from colab", nodeID, "contentId", rootContentID);
        
        if (onConnect)
            onConnect(nodeID);

    }

    // sending any message will trigger a reply with the nodeID
    colabChannel.postMessage("get_nodeid");
    // client.pubsub.subscribe(nodeID, dispa)
    const add = async data => {

        // client.object.patch.addLink();
        
        const { path: contentID } = await client.add(JSON.stringify(data));
        console.log("Added contentID", contentID);
        const patchRes = await client.object.patch.addLink(rootContentID, {Hash: contentID,name:"metadata.json"});
        console.log({patchRes});
        for await (const getRes of client.ls(patchRes)) {
            console.log("file:",getRes.name);
            // for await (const content of getRes.content) 
            //     console.log("content",content.toString());
        }
        client.pubsub.publish(nodeID, patchRes.toString());
    };

    return add;
}

// connect();
const useColab= () => {
    const [nodeID, setNodeID] = useState(null);

    const add = useMemo(() => {
        return connect(setNodeID);
    }, []);
    return {nodeID, add};
};

export default useColab;