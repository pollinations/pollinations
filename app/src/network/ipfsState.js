

import  { stringCID, reader, getWebURL } from "./ipfsConnector.js";
import Debug from "debug";
import { toPromise } from "./utils.js";
import { zip } from "ramda";

import { extname, join } from "path";
import {PromiseAllProgress} from "../utils/logProgressToConsole.js";
import { parse } from "json5";

//import concatLimit from 'async/concatLimit.js';
const debug = Debug("ipfsState");

export const getIPFSState = async (contentID, callback, rootName="root") => {
    const ipfsReader = await reader();
    debug("Getting state for CID", contentID)
    const isFolder = (await ipfsReader.ls(contentID)).length > 0;
    if (isFolder) 
        return await _getIPFSState(ipfsReader, { cid: contentID, name: rootName, type: "dir", path: "/", rootCID: contentID}, callback);
    else
        return await _getIPFSState(ipfsReader, { cid: contentID, name: rootName, type: "file", path: "/", rootCID: contentID}, callback);
}


const _getIPFSState = async (ipfsReader, { cid, type, name, path, rootCID }, processFile = null) => {
    if (!processFile)
        processFile = lazyFetch;
        
    const {ls, get} = ipfsReader;
    cid = stringCID(cid);
    const _debug = debug.extend(`_getIPFSState(${path})`);
    _debug("Getting state for", type, name, cid);
    if (type === "dir") {
        const files = await ls(cid);
        _debug("Got files for", name, cid, files);
        const filenames = files.map(({ name }) => name);
        const contents = await PromiseAllProgress(path, files.map(
            file => _getIPFSState(ipfsReader, {...file, path:join(path,file.name), rootCID}, processFile)
            ));

        const contentResult = Object.fromEntries(zip(filenames, contents));
        _debug("contents",contentResult);
        return contentResult;
    }
     

    if (type === "file") {
        const fileResult = await processFile({ cid, path, name, rootCID }, ipfsReader);
        _debug("got result of processFile length", fileResult?.length);
        return fileResult;
    }

    throw `Unknown file type "${type}" encountered. Path: "${path}", CID: "${cid}".`;
};

// Provide functions similar to http response for getting contents of a file on IPFS
const lazyFetch = ({cid, name},{get}) => (
    { cid, 
      name, 
      json: async () => parse((await get(cid)).toString()),
      text: async () => (await get(cid)).toString(),
      buffer: async () => await get(cid)
    })
