
import {useState, useEffect, useMemo} from "react";
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

const getState = (client, contentID) => {
    debug("Getting state for CID",contentID)
    return getStateCached(contentCache,client,{ cid: contentID, type: "dir"})
}

const stateManager = (client, onState) => {
    debug("Creating stateManager");
    let state = {
        nodeID: null,
        contentID: null,
        ipfs: {}
    };

    setInterval(() => debug("state interval",state),1000)


    const mergeState = async newState => {
        debug("Merging",newState,"into",state)
        let mergedState = {
            ...state,
            ...newState
        };
        if (mergedState.contentID !== state.contentID) {
            mergedState = {
                ...mergedState,
                ipfs:  await getState(client, mergedState.contentID)
            };

        }
        debug("Triggering state change", state,"with",newState, "result", mergedState);
        state = mergedState;
        onState(state);
    }

    // mergeState({contentID:"QmZ6Yo8bps8HisxoNTCkxUwiimi2nw9zYnDWftjfW51JHL"})

    colabConnectionManager(client, nodeID => {
        debug("merging state", state,"with",nodeID)
        mergeState({nodeID});
    }, async contentID => {
        console.time("getstate");
        mergeState({contentID});
        console.timeEnd("getstate");
    });

    const dispatch = async ({inputs}) => {
        debug("Triggered dispatch. Inputs:",inputs, "state", state);
        let contentID = state.contentID;
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
        // client.pubsub.publish(state.nodeID, contentID.toString());
        if (contentID)
            mergeState({contentID});

    };

    const setContentID = contentID => {
        //mergeState({contentID});
    };
    return {dispatch, setContentID};
}

// // TODO: figure out why its rendering twice to avoid this singleton hack
// const oneStateManager = (() => {
//     let _stateManager = null;
//     let _setState = null;
//     return (client, setState) => {
//         _setState = setState;
//         if (!_stateManager) {
//             console.log("Creating new stateManager now. Previous:", _stateManager)
//             _stateManager = stateManager(client, _setState);
//         }
//         return _stateManager;
//     }
// })();

const colabConnectionManager = async (client, onNodeID, onContentID) => {
    let nodeID = null;
    let contentID = null;
    const colabChannel = new BroadcastChannel("colabconnection");
    //colabChannel.postMessage("get_nodeid");
    colabChannel.onmessage = async ({data:newNodeID}) => {

        if (newNodeID === "get_nodeid" || newNodeID === nodeID)
            return;
            
        debug("old",nodeID,"new",newNodeID,"equal",nodeID===newNodeID)        
        
        nodeID = newNodeID;
        onNodeID(nodeID);
        client.pubsub.subscribe(nodeID, async ({data}) => {
            const newContentID = new TextDecoder().decode(data);
            if (contentID !== newContentID) {
                
                contentID = newContentID;
    
                debug("contentID from colab", contentID);
                onContentID(contentID);
            }
    
        });
    }
    

    debug("My ID", await client.id());
    

    // debug(await toPromise1(client.get(inputs[0].path)));

}


const useColab = () => {
    const [hash, setHash] = useHash();
    const [state, setState] = useState({nodeID: null, contentID: hash, ipfs: {}});
    debug("useColab state", state);
    const {dispatch, setContentID} = useMemo(() => {
        const res= stateManager(client,setState);
        debug("created stateManager",res);
        return res;
    }, []);

    useEffect(() => {
        setHash(state.contentID)
    },[state]);
    useEffect(() => {
        debug("HASH",hash);
        if (hash && setContentID)
            setContentID(hash.slice(1));

    },[hash, setContentID])
    return {state,dispatch};
};



async function getCidOfPath( dirCid, path) {
    debug("getCifOfPath", dirCid, path);
    return (await toPromise(client.ls(dirCid))).find(({ name }) => name === path);
}

export default useColab;