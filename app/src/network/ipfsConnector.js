
import Client from "ipfs-http-client";
import { toPromise, callLogger, toPromise1 } from "./utils.js";
import CID from "cids";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";

import all from "it-all";

import Debug from "debug";

import LimitConcurrency from "p-limit";

import {promises as fsPromises} from "fs";

import fetch from 'node-fetch';

import logProgress, {logProgressAsync} from "../utils/logProgressToConsole.js";


import { last } from "ramda";


const concurrencyLimiter = LimitConcurrency(2);

const limit = f => (...args) => concurrencyLimiter(() => f(...args));

const { stat }  = fsPromises;

const debug=Debug("ipfsConnector")

export const nodeID = "thomashmac" + Math.floor(Math.random() * 10000);

debug("NodeID", nodeID)

const IPFS_HOST = "18.157.173.110";

export const ipfsPeerURL = `http://${IPFS_HOST}:5001`;


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


export const getWebURL = cid => `https://pollinations.ai/3/${cid}`;;

const stripSlashIPFS = cidString => cidString.replace("/ipfs/","");

export const stringCID = file => stripSlashIPFS(file instanceof Object && "cid" in file ? file.cid.toString() : (CID.isCID(file) ? file.toString() : file));

const _ipfsLs = async cid => (await toPromise(client.ls(stringCID(cid)))).filter(({type}) => type !== "unknown");

export const ipfsLs = callLogger(cacheOutput(_ipfsLs),"ipfsls");

export const ipfsAdd = cacheInput(limit(async (content, ipfsPath = null, options={}) => {

    const cid = stringCID(await client.add(content, options));
    debug("added", cid, "size", content);

    if (ipfsPath) {
        debug("copying to", ipfsPath);
        await client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });
    } else {
        debug("No destination given. Not copying to MFS.");
    }
    return cid;
}));

export const ipfsGet = limit(cleanCIDs((async (cid, {onlyLink = false}) => {
    
    const _debug = debug.extend(`ipfsGet(${cid})`);


    if (onlyLink)
        return getWebURL(cid);

    const url = getWebURL(cid);
    _debug("Downloading remote file from:",url);
    // const response = await fetch(url);
    // const length = response.headers.get('Content-Length');

    
    // const chunks = await all(logProgressAsync(response.body, length));
    const chunks = await all(client.cat(cid))

    _debug("Got all chunks. Total:", chunks.length);

    const contentArray = Buffer.concat(chunks);

    // const contentArray = Buffer.concat(await toPromise(client.get(cid)));
    _debug("Received content length:", contentArray.length);
    // debug("Content type",contentArray)
    return contentArray;
})));

export const ipfsAddFile = async (localPath, ipfsPath = null, options={size: null}) => {
    
    const contentSize = (await stat(localPath)).size;

    const progress = contentSize > 10000 ? logProgress(contentSize, localPath) : debug.extend(localPath)("addFile progress"); 
    
    await ipfsAdd(globSource(localPath,{preserveMtime: true, preserveMode: true}), ipfsPath, {progress});
}

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


export async function publish(rootCID) {
    debug("publish", rootCID);
    debug("publishResponse", await client.name.publish(`/ipfs/${rootCID}`));
}

export async function ipfsResolve(path) {
    return stringCID(last(await toPromise(client.name.resolve(path))));
}


