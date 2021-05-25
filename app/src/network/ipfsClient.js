

import { toPromise, toPromise1, noop, zip, useHash } from "./utils"
import { client, getWebURL } from "./ipfsConnector.js"
import { extname } from "path";


import Debug from "debug";
import { getIPFSState } from "./ipfsState";
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
    const extIsJSON = ext.toLowerCase() === ".json";
    debug("ext", ext, "extIsJSON", extIsJSON);
    if (ext.length === 0 || extIsJSON) {
        const { content } = await toPromise1((await client).get(cid))
        const contentArray = await toPromise1(content);
        const textContent = new TextDecoder().decode(contentArray);
        debug("textContent",textContent)
        try {
            return JSON.parse(textContent);
        } catch (_e) {
            debug("result was not json. returning raw.")
            return textContent;
        }

    } else {
        return getWebURL(cid);
    }
}

export const IPFSState = contentID => {
    debug("Getting state for CID", contentID)
    return getIPFSState(contentID, fetchAndMakeURL);
}


export const stateReducer = [
    (state, newState) => {
        debug("Merging", newState, "into", state)
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

export const addInputContent = async (contentID, { inputs }) => {
    const _client = await client;
    debug("Triggered dispatch. Inputs:", inputs, "cid before", contentID);
    for (const [key, val] of Object.entries(inputs)) {

        //debug(`${state.contentID}/input`, key);

        // debug(await client.files.cp(`/ipfs/${state.contentID}`,"/"));
        // const {cid:mfsCid} = await client.files.stat("/");
        // debug("mfscid",mfsCid);
        // state = {...state, contentID: mfsCid};
        // onState(state);

        const { cid: inputCid } = await getCidOfPath(contentID, "input");
        // const {cid: valueCid} = await getCidOfPath(inputCid, key);
        // const tmpInputCid = await client.object.patch.rmLink(inputCid, { name: key });
        const tmpInputCid = inputCid;
        debug({ tmpInputCid })
        const { cid: addedCid } = await _client.add(JSON.stringify(val));
        //debug("AddedCID", addedCid, tmpInputCid)
        //debug("LsInput", await toPromise(client.ls(tmpInputCid)))
        debug("adding", contentID, { Hash: addedCid, name: key })
        const newInputCid = await _client.object.patch.addLink(tmpInputCid, { Hash: addedCid, name: key });

        const removedInputCid = await _client.object.patch.rmLink(contentID, { name: "input" });
        debug("addlink2", removedInputCid, { Hash: newInputCid, name: "input" })
        const newContentID = await _client.object.patch.addLink(removedInputCid, { Hash: newInputCid, name: "input" });
        // debug("newIpfs",await getState(client,  { cid: newInputCid, type: "dir"}))
        contentID = newContentID.toString();
    };
    return contentID;

};


export const publish = async (nodeID, newContentID) => {
    (await client).pubsub.publish(nodeID, newContentID)
}


export const getCidOfPath = async (dirCid, path) => {
    debug("getCifOfPath", dirCid, path);
    return (await toPromise((await client).ls(dirCid))).find(({ name }) => name === path);
}

// export default useColab;
