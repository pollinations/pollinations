

import { toPromise } from "./utils.js"
import {  getWebURL, ipfsMkdir, stringCID } from "./ipfsConnector.js"
import { extname } from "path";

import Debug from "debug";
import { getIPFSState } from "./ipfsState.js";
import { parse } from "json5";
import fetch from "node-fetch";

const debug = Debug("ipfsWebClient")


const fetchAndMakeURL = async ({ name, cid }) => {

    const ext = extname(name);
    const importOrURL = shouldImport(ext);
    debug("ext", ext, "extIsJSON", importOrURL);
    const webURL = getWebURL(cid, name);
    if (importOrURL) {
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

// Return IPFS state. Converts all JSON/text content to objects and binary cids to URLs.
export const IPFSState = contentID => {
    debug("Getting state for CID", contentID)
    return getIPFSState(contentID, fetchAndMakeURL);
}

export const addInput = async (inputCID, contentID) => {
    const _client = await client;
    contentID = contentID || stringCID(await _client.object.new());
    contentID =  await _client.object.patch.addLink(contentID, { Hash: inputCID, name: "input" });
    return contentID;
}; 

export const getInputContent = async inputs => {
    debug("getInputContent", inputs);
    const _client = await client;
    debug("got client", _client);
    let inputCID = stringCID(await _client.object.new({template:"unixfs-dir"}));
    debug("Triggered dispatch. Inputs:", inputs, "cid before", inputCID);
    for (const [key, val] of Object.entries(inputs)) {

        const { cid: addedCid } = await _client.add(JSON.stringify(val));
        //debug("AddedCID", addedCid, tmpInputCid)
        //debug("LsInput", await toPromise(client.ls(tmpInputCid)))
        debug("adding", inputCID, { Hash: addedCid, name: key })
        inputCID = stringCID(await _client.object.patch.addLink(inputCID, { Hash: addedCid, name: key }));
    
    };
    return inputCID;

};

export const subscribe = (nodeID, callback) => subscribeCID(nodeID+"/output", callback);

export const getCidOfPath = async (dirCid, path) => {
    debug("getCifOfPath", dirCid, path);
    try {
        return (await toPromise((await client).ls(dirCid))).find(({ name }) => name === path);
    } catch {
        debug("couldn't get cid of path", path);
        return null;
    }
}


function shouldImport(ext) {
    return ext.length === 0 || ext.toLowerCase() === ".json" || ext.toLowerCase() === ".ipynb";
}
// export default ueColab;
