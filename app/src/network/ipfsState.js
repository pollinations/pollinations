

import  { stringCID, ipfsLs } from "./ipfsConnector.js";
import Debug from "debug";
import { toPromise } from "./utils.js";
import { zip } from "ramda";
import { cacheOutput } from "./contentCache.js";
import { join } from "path";
import {PromiseAllProgress} from "../utils/logProgressToConsole.js";

//import concatLimit from 'async/concatLimit.js';
const debug = Debug("ipfsState");
// const map = parallelMap(30);
export const getIPFSState = (contentID, callback, rootName="root") => {
    debug("Getting state for CID", contentID)
    return _getIPFSState({ cid: contentID, name: rootName, type: "dir", path: "/", rootCID: contentID}, callback)
}

const _getIPFSState = cacheOutput(async ({ cid, type, name, path, rootCID }, processFile) => {
    cid = stringCID(cid);
    const _debug = debug.extend(`_getIPFSState(${path})`);
    _debug("Getting state for", type, name, cid);
    if (type === "dir") {
        const files = await ipfsLs(cid);
        _debug("Got files for", name, cid, files);
        const filenames = files.map(({ name }) => name);
        const contents = await PromiseAllProgress(path, files.map(
            file => _getIPFSState({...file, path:join(path,file.name), rootCID}, processFile)
            ));

        const contentResult = Object.fromEntries(zip(filenames, contents));
        _debug("contents",contentResult);
        return contentResult;
    }
     

    if (type === "file") {
        const fileResult = await processFile({ cid, path, name, rootCID });
        _debug("got result of processFile length", fileResult?.length);
        return fileResult;
    }

    throw `Unknown file type "${type}" encountered. Path: "${path}", CID: "${cid}".`;
});


