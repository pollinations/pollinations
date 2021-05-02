
import {useState, useEffect, useMemo} from "react";
import Client from 'ipfs-http-client';
import {toPromise, toPromise1, noop} from "./utils"

export const displayContentID = contentID => contentID.toString().slice(-4);

const stateManager = (client) => {
    
}

const colabConnectionManager = (onNodeID) => {
    let nodeID = null;
    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.onmessage = async ({data:newNodeID}) => {
        newNodeID = newNodeID.toString();

        if (!newNodeID || newNodeID === "get_nodeid" || nodeID === newNodeID)
            return;
        console.log("old",nodeID,"new",newNodeID,"equal",nodeID===newNodeID)        
        
        nodeID = newNodeID;
        onNodeID(nodeID);
    }
    colabChannel.postMessage("get_nodeid");
}

colabConnectionManager(nodeID => console.log("Got nodeID",nodeID));

const connect =  (onConnect, onState=noop) => {
    console.log("Connecting to IPFS and creating BroadcastChannel...");
    const client = Client('http://18.157.173.110:5002')
    window.client = client;
    const colabChannel = new BroadcastChannel("colabconnection");
    let nodeID = null;
    let contentID = null;

    return {add:noop, publish:noop};
    colabChannel.onmessage = async ({data:newNodeID}) => {
        
        newNodeID = newNodeID.toString();

        if (!newNodeID || newNodeID === "get_nodeid" || nodeID === newNodeID)
            return;
        console.log("old",nodeID,"new",newNodeID,"equal",nodeID===newNodeID)        
        
        nodeID = newNodeID;
        return;
        
        console.log("Set nodeID to newNodeID",nodeID)
        let myID = await client.id();
        console.log("My IPFS ID:", myID);
                 

        if (onConnect)
            onConnect(nodeID);
            
        console.log("new nodeID from colab", nodeID);



        client.pubsub.subscribe(nodeID, async ({data:newContentID}) => {
            newContentID = newContentID.toString();

            if (contentID !== newContentID) {
                
                contentID = newContentID;

                console.log("contentID from colab", contentID);
                
                let inputs = await Promise.all(
                    (await toPromise(client.ls(`${contentID}/input`)))
                    // .map(async ({path}) => toPromise1(await client.get(path)))
                );
                
                console.log(inputs);
            }

        });
        // console.log(await toPromise1(client.get(inputs[0].path)));
    }
    
    // sending any message will trigger a reply with the nodeID
    colabChannel.postMessage("get_nodeid");

    
    const add = async (name, data) => {
        
        console.log("Getting /input");
        let inputs = await Promise.all(
            (await toPromise(client.ls(`${contentID}/input`)))
           // .map(async ({path}) => toPromise1(await client.get(path)))
        );

        console.log(inputs);
        console.log(await toPromise1(client.get(inputs[0].path)));
        // console.log("adding",name,data,"to", `${contentID}/input`)
        
        // const { path: addContentID } = await client.add(JSON.stringify(data));
        // console.log("Added contentID", addContentID);
        // const patchRes = await client.object.patch.addLink(contentID, {Hash: addContentID, name});
        // console.log("Patched CID", patchRes.toString());
        // contentID = patchRes;
        // console.log("added files", await toPromise(client.ls(patchRes)));
        
    };
    const publish = async () => {
        await client.pubsub.publish(nodeID, contentID.toString());
    }

    
    
    return { add, publish };
}

// connect();
const useColab= () => {
    const [ids, setIds] = useState({nodeID: null, contentID: null});

    const {add,publish} = useMemo(() => {
        return connect(setIds);
    }, []);
    return {...ids, add, publish};
};

export default useColab;