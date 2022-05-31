

import Debug from "debug";
import { parse } from "json5";
import { join } from "path";
import { zip } from "ramda";
import { PromiseAllProgress } from "../utils/logProgressToConsole.js";
import { reader, stringCID } from "./ipfsConnector.js";


const debug = Debug("ipfsState");


// Recursively get the IPFS content and transform it into a JS object.
// The callback is called for each file in the directories which can fetch or process them further
export const getIPFSState = async (contentID, callback=f=>f, skipCache=false) => {
    
    const ipfsReader = await reader();
    debug("Getting state for CID", contentID);
    try {
    return await cachedIPFSState(ipfsReader, { cid: contentID, name: "root", type: "dir", path: "/", rootCID: contentID}, callback, skipCache);
    } catch (e) { console.log(e)}

}


// Caching

const cache = {};
const cachedIPFSState = (ipfsReader, {cid, ...rest}, processFile, skipCache ) => {
    const key = `${cid} - ${processFile.toString()}`;
    if (!cache[key] || skipCache) {
        debug("cache miss",cid);
        cache[key] = _getIPFSState(ipfsReader, {cid, ...rest}, processFile, skipCache);
    } else
        debug("cache hit",cid);
    return cache[key];
}

// Do the actual work
const _getIPFSState = async (ipfsReader, { cid, type, name, path, rootCID }, processFile, skipCache) => {
    debug("ipfs state getter callback name",processFile.toString())
    const {ls, get} = ipfsReader;
    cid = stringCID(cid);
    const _debug = debug.extend(`_getIPFSState(${path})`);
    _debug("Getting state for", type, name, cid);
    if (type === "dir") {
        const files = await ls(cid);
        _debug("Got files for", name, cid, files);
        const filenames = files.map(({ name }) => name);
        const contents = await PromiseAllProgress(path, files.map(
            file => cachedIPFSState(ipfsReader, {...file, path:join(path,file.name), rootCID}, processFile, skipCache)
            ));

        const contentResult = Object.fromEntries(zip(filenames, contents));
        _debug("contents",contentResult);
        // Add non-enumerable property .cid to each "folder" in object
        Object.defineProperty(contentResult, ".cid", { value: cid });
        return contentResult;
    }
     

    if (type === "file") {
        const fileResult = await processFile({ 
            cid, 
            path, 
            name, 
            rootCID, 
            ...dataFetchers(cid, ipfsReader)
        }, ipfsReader);
        //_debug("got result of processFile length", fileResult?.length);
        return fileResult;
    }

    throw `Unknown file type "${type}" encountered. Path: "${path}", CID: "${cid}".`;
};

// Provide functions similar to http response for getting contents of a file on IPFS
const dataFetchers = (cid,{get}) => {
    debug("creating data fetchers for cid",cid);
    return{
      json: async () => parse((await get(cid)).toString()),
      text: async () => (await get(cid)).toString(),
      buffer: async () => await get(cid)
    };
};
