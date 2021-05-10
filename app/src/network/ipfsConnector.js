
import Client from "ipfs-http-client";
import { toPromise, callLogger, toPromise1 } from "./utils.js";
import CID from "cids";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";
import concat from 'it-concat';
import all from "it-all";
import Debug from "debug";
import sleep from "await-sleep";
import {concat as uint8ArrayConcat} from 'uint8arrays';
import fetch from 'node-fetch';

import Progress from "node-fetch-progress";
import ProgressBar from "progress";
import memoryUsage from "../utils/memoryUsage.js";

const debug=Debug("ipfsConnector")

export const nodeID = "thomashmac" + Math.floor(Math.random() * 10000);

debug("NodeID", nodeID)

const IPFS_HOST = "18.157.173.110";

export const ipfsPeerURL = `http://${IPFS_HOST}:5002`;


debug("Connecting to IPFS", ipfsPeerURL);

export const client = Client(ipfsPeerURL);

export default client;
export const globSource = Client.globSource;
export const files = client.files;

export async function getCID(ipfsPath = "/") {
    const cid = stringCID(await client.files.stat(ipfsPath));
    debug("Got CID", cid, "for path", ipfsPath);
    return cid;
}

export const getWebURL = cid => `https://pollinations.ai/ipfs/${cid}`;;

export const stringCID = file => file instanceof Object && "cid" in file ? file.cid.toString() : (CID.isCID(file) ? file.toString() : file);

const _ipfsLs = async cid => await toPromise(client.ls(stringCID(cid)));

export const ipfsLs = callLogger(cacheOutput(_ipfsLs),"ipfsls");


export const ipfsAdd = cacheInput(async (content, ipfsPath = null) => {
    const cid = stringCID(await client.add(content));
    debug("added", cid, "size", content.length);

    if (ipfsPath) {
        debug("copying to", ipfsPath);
        await client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });
    } else {
        debug("No destination given. Not copying to MFS.");
    }
    return cid;
});

export const ipfsGet = cleanCIDs((async (cid, onlyLink = false) => {
    const _debug = debug.extend(`ipfsGet(${cid})`);


    if (onlyLink)
        return getWebURL(cid);

    const url = getWebURL(cid);
    _debug("Downloading remote file from:",url);
    const response = await fetch(url);
    
    const chunks = [];
    try {
        for await (const chunk of response.body) {
            chunks.push(chunk);
            if (chunks.length % 10 === 0) {
                _debug("Chunk",chunks.length);
                memoryUsage();
            }
        }
    } catch (err) {
        console.error(err.stack);
    }

    _debug("Got all chunks. Total:", chunks.length);

    const contentArray = Buffer.concat(chunks);

    // const contentArray = Buffer.concat(await toPromise(client.get(cid)));
    _debug("Received content length:", contentArray.size);
    // debug("Content type",contentArray)
    return contentArray;
}));

export const ipfsAddFile = async (localPath, ipfsPath = null) =>
    ipfsAdd(globSource(localPath), ipfsPath);


export async function ipfsMkdir(path="/") {
    debug("Creating folder", path);
    await client.files.mkdir(path, { parents: true });
    return path;
}

export async function ipfsRm(ipfsPath) {
    debug("Deleting",ipfsPath);
    await client.files.rm(ipfsPath,{force:true})
}

export async function contentID(mfsPath="/") {
    return stringCID(await client.files.stat(mfsPath));
}


const logFetchProgress = response => {
    const progress = new Progress(response, { throttle: 200 });
    let progressBar = null;
    progress.on('progress', ({total, progress}) => {
        //debug("fetch progress",p)
        if (!progressBar)
            progressBar = new ProgressBar('  downloading [:bar] :rate/kbps :percent :etas', {
                complete: '=',
                incomplete: ' ',
                width: 20,
                total: total / 1000
              });
        progressBar.update(progress);
    });
}
    
//   console.log(
//     p.total,
//     p.done,
//     p.totalh,
//     p.doneh,
//     p.startedAt,
//     p.elapsed,
//     p.rate,
//     p.rateh,
//     p.estimated,
//     p.progress,
//     p.eta,
//     p.etah,
//     p.etaDate
//   )

