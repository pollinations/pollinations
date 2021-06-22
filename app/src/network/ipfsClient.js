

import { toPromise, toPromise1, noop, zip, useHash } from "./utils"
import { client, getWebURL, stringCID, subscribeCIDCallback } from "./ipfsConnector.js"
import { extname } from "path";

import Debug from "debug";
import { getIPFSState } from "./ipfsState";
import { parse } from "json5";
import fetch from "node-fetch";

const debug = Debug("ipfsClient")


// const contentCache = new Map();

// const getIPFSStateCached = async (contentCache, client, { cid, type, name }) => {
//     if (contentCache.has(cid))
//         return contentCache.get(cid);
//     let result = null;

//     if (type === "dir") {
//         const files = await toPromise(client.ls(cid));
//         const filenames = files.map(({ name }) => name);
//         const fileContents = await Promise.all(files.map(file => getIPFSStateCached(contentCache, client, file)));
//         result = Object.fromEntries(zip(filenames, fileContents));
//     }

//     if (type === "file") {
//         if (extname(name).length === 0) {
//             const { content } = await toPromise1(client.get(cid))
//             const contentArray = await toPromise1(content);
//             result = new TextDecoder().decode(contentArray);
//         } else
//             result = getWebURL(cid);
//     }

//     if (result === null)
//         throw "Unknown IPFS entry";

//     contentCache.set(cid, result);
//     return result;
// }

const fetchAndMakeURL = async ({ name, cid }) => {

    const ext = extname(name);
    const extIsJSON = ext.length === 0 || ext.toLowerCase() === ".json" || ext.toLowerCase() === ".ipynb";
    debug("ext", ext, "extIsJSON", extIsJSON);
    const webURL = getWebURL(cid, name);
    if (extIsJSON) {
        const response = await fetch(webURL);
        const textContent = await response.text();

        // const { content } = await toPromise1((await client).get(cid))
        // const contentArrays = await toPromise(content);

        // if (!contentArrays || !contentArrays[0])
        //     return null;        

        // // TODO: use typedarrays for more performance
        // const contentArray = contentArrays.reduce((acc, c) => [...acc, ...c], []);
        // const textContent = new TextDecoder().decode(new Uint8Array(contentArray));
        // debug("got json chunks", contentArrays.length, "concatenated length", contentArray.length,"textcontent length", textContent.length);

        debug("textContent",textContent)
        
        try {
            return parse(textContent);
        } catch (_e) {
            debug("result was not json. returning raw.")
            return textContent;
        }

    } else {
        return webURL;
    }
}

export const IPFSState = contentID => {
    debug("Getting state for CID", contentID)
    return getIPFSState(contentID, fetchAndMakeURL);
}


export const stateReducer = [
    (state, newState) => {
        debug("Merging", newState, "into", state);
        let mergedState = {
            ...state,
            ...newState,
            ipfs: {...state.ipfs, ...newState.ipfs}
        };
        debug("Merging result", mergedState);
        return mergedState;
    }, {
        nodeID: null,
        contentID: null,
        ipfs: { },
        status: "disconnected"
    }];

export const setStatusName = async (contentID, name) => {
    const _client = await client;
    const statusCID = await getCidOfPath(contentID, "status");
    let newStatusCID;
    if (!statusCID) {
        newStatusCID = stringCID(await _client.add({content: JSON.stringify(name), path: "name"}, {wrapWithDirectory: true}));
    } else {
        const { cid: addedCid } = await _client.add(JSON.stringify(name));
        newStatusCID = stringCID(await _client.object.patch.addLink(statusCID.cid, { Hash: addedCid, name: "name" }));
        contentID = await _client.object.patch.rmLink(contentID, { name: "status" });
    }
    debug("addLink",contentID, { Hash: newStatusCID, name: "status" })
    contentID = stringCID(await _client.object.patch.addLink(contentID, { Hash: newStatusCID, name: "status" }));
    return contentID;
}

export const addInputContent = async (contentID, { inputs }) => {
    const _client = await client;

    debug("Triggered dispatch. Inputs:", inputs, "cid before", contentID);
    for (const [key, val] of Object.entries(inputs)) {

        const inputPath = await getCidOfPath(contentID, "input");
        
        let newInputCid;

        if (!inputPath) {
            newInputCid = stringCID(await _client.add({content: JSON.stringify(val),path: key}, {wrapWithDirectory: true,}));
        } else {
            const { cid: addedCid } = await _client.add(JSON.stringify(val));
            //debug("AddedCID", addedCid, tmpInputCid)
            //debug("LsInput", await toPromise(client.ls(tmpInputCid)))
            debug("adding", contentID, { Hash: addedCid, name: key })
            newInputCid = await _client.object.patch.addLink(inputPath.cid, { Hash: addedCid, name: key });
            contentID = stringCID(await _client.object.patch.rmLink(contentID, { name: "input" }));
        }
      
        debug("addlink2", contentID, { Hash: newInputCid, name: "input" })
        contentID = stringCID(await _client.object.patch.addLink(contentID, { Hash: newInputCid, name: "input" }));
    };
    return contentID;

};

//TODO: use ipfsConnector's publish
export const publish = async (nodeID, newContentID) => {
    (await client).pubsub.publish(nodeID, newContentID)
}

export const subscribe = subscribeCIDCallback;

export const getCidOfPath = async (dirCid, path) => {
    debug("getCifOfPath", dirCid, path);
    try {
        return (await toPromise((await client).ls(dirCid))).find(({ name }) => name === path);
    } catch {
        debug("couldn't get cid of path", path);
        return null;
    }
}

// export default ueColab;
