
import {useState, useEffect, useMemo, useReducer} from "react";
import Client from 'ipfs-http-client';
import {toPromise, toPromise1, noop, zip} from "./utils"

import {extname} from "path";


import { useHash } from "react-use";

import Debug from "debug";
const debug = Debug("ipfsClient")

const IPFS_HOST = "18.157.173.110";

const contentCache = new Map();

debug("Connecting to IPFS and creating BroadcastChannel...");
const client = Client(`http://${IPFS_HOST}:5002`)



const useColab = () => {
    const [state, dispatchState] = useReducer(...stateReducer);
    const [hash, setHash] = useHash();
    const hashContentID = hash ? hash.slice(1) : null;
    debug("useColab state", state);

    const setContentID = async contentID => {
        debug("setContentID",contentID);
        if (contentID && contentID !== state.contentID) 
            dispatchState({ contentID, ipfs: await getIPFSState(client, contentID)});
    };

    useEffect(() => {
        colabConnectionManager(client, nodeID => {
            dispatchState({ nodeID });
        }, setContentID);
    },[]);


    useEffect(() => {
        if (state.contentID && state.contentID !== hashContentID)
            setHash(state.contentID)
    },[state]);

    useEffect(() => {
        debug("HASH",hash);
        if (hashContentID && hashContentID !== state.contentID)
            setContentID(hashContentID);

    },[hash]);

    return {
        state, 
        dispatch: async inputState => {
            client.pubsub.publish(state.nodeID, state.contentID);
            setContentID(await addInputContent(state.contentID, inputState));
        }
    };
};




const getIPFSStateCached = async (contentCache, client, {cid, type, name}) => {
    if (contentCache.has(cid))
        return contentCache.get(cid);
    let result = null;

    if (type === "dir") {
        const files = await toPromise(client.ls(cid));
        const filenames = files.map(({name}) => name);
        const fileContents = await Promise.all(files.map(file => getIPFSStateCached(contentCache, client, file)));
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

const getIPFSState = (client, contentID) => {
    debug("Getting state for CID",contentID)
    return getIPFSStateCached(contentCache,client,{ cid: contentID, type: "dir"})
}

const stateReducer = [
    (state, newState) => {
        debug("Merging",newState,"into",state)
        let mergedState = {
            ...state,
            ...newState
        };
        debug("Merging result", mergedState);
        return mergedState;
    }, {
        nodeID: null,
        contentID: null,
        ipfs: {}
    }];

const colabConnectionManager = async (client, onNodeID, onContentID) => {
    debug("Initializing Connection Manager");
    let nodeID = null;
    const colabChannel = new BroadcastChannel("colabconnection");
    colabChannel.postMessage("get_nodeid");
    colabChannel.onmessage = async ({data:newNodeID}) => {

        if (newNodeID === "get_nodeid" || newNodeID === nodeID)
            return;
            
        debug("old",nodeID,"new",newNodeID,"equal",nodeID===newNodeID)        
        
        nodeID = newNodeID;
        onNodeID(nodeID);
        client.pubsub.subscribe(nodeID, async ({data}) => {
            const newContentID = new TextDecoder().decode(data);
            debug("content ID from colab", newContentID);
            onContentID(newContentID);
        });
    }
    

    debug("My ID", await client.id());
    

    // debug(await toPromise1(client.get(inputs[0].path)));

}

const addInputContent = async (contentID, {inputs}) => {
    debug("Triggered dispatch. Inputs:",inputs, "cid before", contentID);
    for (const [key,val] of Object.entries(inputs)) {

        //debug(`${state.contentID}/input`, key);
       
        // debug(await client.files.cp(`/ipfs/${state.contentID}`,"/"));
        // const {cid:mfsCid} = await client.files.stat("/");
        // debug("mfscid",mfsCid);
        // state = {...state, contentID: mfsCid};
        // onState(state);
        
        const {cid: inputCid} = await getCidOfPath(contentID, "input");
        // const {cid: valueCid} = await getCidOfPath(inputCid, key);
        const  tmpInputCid  = await client.object.patch.rmLink(inputCid, { name: key });
        debug({tmpInputCid})
        const { cid: addedCid } = await client.add(val);
        //debug("AddedCID", addedCid, tmpInputCid)
        //debug("LsInput", await toPromise(client.ls(tmpInputCid)))
        debug("adding", contentID, { Hash: addedCid, name: key})
        const newInputCid = await client.object.patch.addLink(tmpInputCid, { Hash: addedCid, name: key});

        const removedInputCid = await client.object.patch.rmLink(contentID,{ name:"input"} );
        debug("addlink2", removedInputCid, {Hash: newInputCid, name:"input" })
        const newContentID = await client.object.patch.addLink(removedInputCid, {Hash: newInputCid, name:"input" });
        // debug("newIpfs",await getState(client,  { cid: newInputCid, type: "dir"}))
        contentID = newContentID.toString();   
    };
    return contentID;

};




async function getCidOfPath( dirCid, path) {
    debug("getCifOfPath", dirCid, path);
    return (await toPromise(client.ls(dirCid))).find(({ name }) => name === path);
}

export default useColab;