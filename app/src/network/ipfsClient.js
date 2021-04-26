
import {useState, useEffect, useMemo} from "react";
import Client from 'ipfs-http-client';
import toUrlSearchParams from "ipfs-http-client/src/lib/to-url-search-params";

const connect =  (onConnect) => {
    const client = Client('http://18.157.173.110:5002')

    const colabChannel = new BroadcastChannel("colabconnection");
    let nodeID = null;
    let contentID = null;
    colabChannel.onmessage = ({data}) => {
        [nodeID, contentID] = data.split(",");

        console.warn("nodeID from colab", nodeID, "contentId", contentID);
        
        if (onConnect)
            onConnect({nodeID,contentID});

    }

    // sending any message will trigger a reply with the nodeID
    colabChannel.postMessage("get_nodeid");
    // client.pubsub.subscribe(nodeID, dispa)
    const add = async data => {

        // client.object.patch.addLink();
        
        const { path: contentID } = await client.add(JSON.stringify(data));
        console.log("Added contentID", contentID);
        const patchRes = await client.object.patch.addLink(contentID, {Hash: contentID,name: "metadata.json"});
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
    const [ids, setIds] = useState({nodeID:null, contentID:null});

    const add = useMemo(() => {
        return connect(setIds);
    }, []);
    return {...ids, add};
};

export default useColab;