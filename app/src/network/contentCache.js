import CID from "cids";
import { stringCID } from "./ipfsConnector.js";

import Debug from "debug";
import debounce from "debounce";
// import {writeFile} from "fs/promises";
// import {readFileSync, existsSync} from "fs";

const debug = Debug("contentCache");

const STATE_PATH = '/tmp/ipfsState.json';

// const load = () => { 
//     if (existsSync(STATE_PATH)) {
//         debug("Found existing content cache", STATE_PATH);
//         const result = JSON.parse(readFileSync(STATE_PATH));
//         debug("Loaded", result.length, "cached blocks.");
//         return result;
//     }
//     debug("No existing content cache found at ", STATE_PATH);
//     return [];
// }


// let _contentCache = new Map(load());

// let _inverseContentCache = new Map([..._contentCache].map(([cid,path]) => [path,cid]));

// // process.exit(1)
// const persist = debounce(() => {
//     const contentCacheJSON = [..._contentCache];
//     debug("Persisting", contentCacheJSON.length,"cached blocks.");
//     writeFile(STATE_PATH, JSON.stringify(contentCacheJSON), 'utf-8'); 
// }, 50);

// const set = (cid, content) => {
//     persist();
//     _contentCache.set(cid,content);
//     // TODO: only save paths
//     if (content instanceof String)
//         _inverseContentCache.set(content, cid);
// }

// const get = (cid,inverse=false) => {
//     if (inverse) {
//         return cid instanceof String && _inverseContentCache.get(cid);
//     }
//    return _contentCache.get(cid);
// }

// const has = (cid,inverse=false) => {
//     if (inverse) {
        
//         const result = _inverseContentCache.has(cid);
//         debug("Inverse: checking if exists",cid,":",result);
//         return result;
//     }
//     return _contentCache.has(cid);
// }

export function cacheOutput(funcThatFetchesCID) {
    return funcThatFetchesCID;
    // const cachingFunc = async (cidOrFile, ...args) => {
    //         const cid = stringCID(cidOrFile);
    //         debug("cacheOutput, checking if cache contains:",cid,"arguments:",...args);
    //         if (has(cid)) {
    //             debug("cacheOutput. Cache HIT.");
    //             return get(cid);
    //         }
    //         debug("Cache MISS. Running function...",funcThatFetchesCID.name,"with cid", cidOrFile, "and args", ...args);
    //         const result = await Promise.resolve(funcThatFetchesCID(cidOrFile, ...args));
    //         set(cid, result);
    //         return result
    // };
    // return cleanCIDs(cachingFunc);
}

export default function cacheInput(funcThatGeneratesCID) {
    return funcThatGeneratesCID;
    // const cachingFunc = async (content, ...args) => {
    //         if (has(content, true)) {
    //             debug("Cache HIT (content add). Returning cached CID");
    //             return get(content, true);
    //         }
    //         const cid = stringCID(await Promise.resolve(funcThatGeneratesCID(content, ...args)));
    //         debug("Adding", cid, "to cache.");
    //         set(cid, content);
    //         return cid;
    // };
    // return cleanCIDs(cachingFunc);
}

export const cleanCIDs = cidFunc => async (cidOrFile, ...args) => {
    const cidOrFileCleaned = CID.isCID(cidOrFile) ? cidOrFile.toString() : cidOrFile;
    const result = await cidFunc(cidOrFileCleaned, ...args);
    return CID.isCID(result) ? result.toString() : result;
}


// setInterval(()=> {
//     debug("Cache state:",_contentCache)
// },10000);