
import {useState, useEffect, useMemo} from "react";
import Client from 'ipfs-http-client';
import {toPromise, toPromise1, noop, zip} from "./utils"

import {extname} from "path";

export const displayContentID = contentID => contentID.toString().slice(-4);

const IPFS_HOST = "18.157.173.110";

const contentCache = new Map();

const getStateCached = async (contentCache, client, {cid, type, name}) => {
    if (contentCache.has(cid))
        return contentCache.get(cid);
    let result = null;

    if (type === "dir") {
        const files = await toPromise(client.ls(cid));
        const filenames = files.map(({name}) => name);
        const fileContents = await Promise.all(files.map(file => getStateCached(contentCache, client, file)));
        result = Object.fromEntries(zip(filenames, fileContents));
    }

    if (type === "file") {
        if (extname(name).length === 0 ) {
            const {content} = await toPromise1(client.get(cid))
            const contentArray = await toPromise1(content);
            result = new TextDecoder().decode(contentArray);
        } else
            result = `http://${IPFS_HOST}:9090/ipfs/${cid}`;
    }
    
    if (result === null)
        throw "Unknown IPFS entry";

    contentCache.set(cid, result);
    return result;
}

const getState = (...args) => getStateCached(contentCache,...args)

const stateManager = (client, onState) => {

    let contentCache = new Map();

    let state = {
        nodeID: null,
        contentID: null,
        ipfs: null
    };
    
    colabConnectionManager(client, nodeID => {
        state = {...state, nodeID}
        onState(state);
    }, async contentID => {
        state = {...state, contentID};
        console.time("getstate");
        console.log(await getState(client, {cid: contentID, type: "dir"}));     
        console.timeEnd("getstate");
        onState(state);
    });

}

const colabConnectionManager = async (client, onNodeID, onContentID) => {
    let nodeID = null;
    let contentID = null;
    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.onmessage = async ({data:newNodeID}) => {

        if (newNodeID === "get_nodeid")
            return;
            
        console.log("old",nodeID,"new",newNodeID,"equal",nodeID===newNodeID)        
        
        nodeID = newNodeID;
        onNodeID(nodeID);
        client.pubsub.subscribe(nodeID, async ({data}) => {
            const newContentID = new TextDecoder().decode(data);
    
            if (true || contentID !== newContentID) {
                
                contentID = newContentID;
    
                console.log("contentID from colab", contentID);
                onContentID(contentID);
            }
    
        });
    }
    

    console.log("My ID", await client.id());
    
    colabChannel.postMessage("get_nodeid");
    // console.log(await toPromise1(client.get(inputs[0].path)));

}

console.log("Connecting to IPFS and creating BroadcastChannel...");
const client = Client(`http://${IPFS_HOST}:5002`)

stateManager(client, state => console.log("New State", state));

const connect =  (onState=noop) => {



    return {add:noop, publish:noop};
  
}

const useColab= () => {
    const [ids, setIds] = useState({nodeID: null, contentID: null});

    const {add,publish} = useMemo(() => {
        return connect(setIds);
    }, []);
    return {...ids, add, publish};
};

export default useColab;