
import {create, globSource} from "ipfs-http-client";
import { toPromise, callLogger, toPromise1 } from "./utils.js";
import CID from "cids";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";
import reachable from "is-port-reachable";

import all from "it-all";

import Debug from "debug";
import Asyncify from 'callback-to-async-iterator';

import { last } from "ramda";

import limit from "../utils/concurrency.js";
import { join } from "path";

import options from "../backend/options.js";

import { Channel } from 'queueable';

const asyncify = typeof Asyncify === "function" ? Asyncify: Asyncify.default;

export const ipfsGlobSource = globSource;

const debug=Debug("ipfsConnector")


const IPFS_HOST = "ipfs.pollinations.ai";

export const mfsRoot = `/`;


const getIPFSDaemonURL = async () => {
    if (await reachable(5001)) {
        debug("Localhost:5001 is reachable. Connecting...");
        return "http://localhost:5001";
    }
    debug("Localhost:5001 is not reachable. Connecting to",IPFS_HOST);
    return `http://${IPFS_HOST}:5001`;
}


const ipfsDaemonURL = getIPFSDaemonURL();

export const client = ipfsDaemonURL.then(create);

export const nodeID = client.then(async client => options.nodeid || (await client.id()).id);

(async () =>
debug("NodeID", nodeID))();

export async function getCID(ipfsPath = "/") {
    ipfsPath = join(mfsRoot, ipfsPath);
    const cid = stringCID(await client.files.stat(ipfsPath));
    debug("Got CID", cid, "for path", ipfsPath);
    return cid;
}


export const getWebURL = cid => `https://pollinations.ai/ipfs/${cid}`;;

const stripSlashIPFS = cidString => cidString.replace("/ipfs/","");

export const stringCID = file => stripSlashIPFS(file instanceof Object && "cid" in file ? file.cid.toString() : (CID.isCID(file) ? file.toString() : file));

const _normalizeIPFS = ({name, path, cid, type}) => ({name, path, cid: stringCID(cid), type});

const _ipfsLs = async cid => (await toPromise((await client).ls(stringCID(cid))))
                                        .filter(({type, name}) => type !== "unknown" && name !== undefined)
                                        .map(_normalizeIPFS);
                            

export const ipfsLs = callLogger(
    // cacheOutput
    (_ipfsLs),"ipfsls");

export const ipfsAdd = cacheInput(limit(async (ipfsPath, content, options={}) => {
    const _client = await client;
    ipfsPath = join(mfsRoot, ipfsPath);
    const cid = stringCID(await _client.add(content, options));
    debug("added", cid, "size", content);


    try {
        debug("Trying to delete", ipfsPath);
        await _client.files.rm(ipfsPath, { recursive: true });
    } catch {
        debug("Could not delete. Probably did not exist.")
    };
    debug("copying to", ipfsPath);
    await _client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });
   
    return cid;
}));

export const ipfsGet = limit(cleanCIDs((async (cid, {onlyLink = false}) => {
    
    const _debug = debug.extend(`ipfsGet(${cid})`);


    if (onlyLink)
        return getWebURL(cid);
    
    const chunks = await all((await client).cat(cid))

    _debug("Got all chunks. Total:", chunks.length);

    const contentArray = Buffer.concat(chunks);

    // const contentArray = Buffer.concat(await toPromise(client.get(cid)));
    _debug("Received content length:", contentArray.length);
    // debug("Content type",contentArray)
    return contentArray;
})));

export const ipfsAddFile = async (ipfsPath, localPath, options={size: null}) => {

    await ipfsAdd(ipfsPath, globSource(localPath,{preserveMtime: true, preserveMode: true}));
}

export async function ipfsMkdir(path="/") {
    const withMfsRoot = join(mfsRoot, path);
    debug("Creating folder", path, "mfsRoot",withMfsRoot);
    (await client).files.mkdir(withMfsRoot, { parents: true });
    return path;
}

export async function ipfsRm(ipfsPath) {
    ipfsPath = join(mfsRoot, ipfsPath);
    debug("Deleting",ipfsPath);
    await client.files.rm(ipfsPath,{force:true})
}

export async function contentID(mfsPath="/") {
    const _client = await client;
    mfsPath = join(mfsRoot, mfsPath);
    return stringCID(await _client.files.stat(mfsPath));
}


export async function publish(rootCID) {
    const _client = await client;
    debug("publish pubsub", await nodeID, rootCID);
    await _client.pubsub.publish(await nodeID, rootCID)
    // dont await since this hangs sadly
    //await _client.name.publish(`/ipfs/${rootCID}`,{ allowOffline: true });
    //debug("published ipns");
}


export async function subscribeCID(_nodeID=null) {
  const channel = new Channel();
  if (_nodeID===null)
    _nodeID = await nodeID;
  debug("Subscribing to pubsub events from", await _nodeID);
  const handler = ({data}) => channel.push(new TextDecoder().decode(data));
  await (await client).pubsub.subscribe(await _nodeID, handler);
  return channel;  
}


export const ipfsResolve = async path =>
    stringCID(last(await toPromise((await client).name.resolve(path))));




