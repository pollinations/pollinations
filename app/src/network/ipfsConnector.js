
import {create, globSource} from "ipfs-http-client";
import { toPromise, callLogger, toPromise1 } from "./utils.js";
import CID from "cids";
import cacheInput, { cacheOutput, cleanCIDs } from "./contentCache.js";

import all from "it-all";

import Debug from "debug";
import Asyncify from 'callback-to-async-iterator';

import {promises as fsPromises} from "fs";

import logProgress, {logProgressAsync} from "../utils/logProgressToConsole.js";

import { last } from "ramda";

import limit from "../utils/concurrency.js";
import { join } from "path";


const asyncify = Asyncify.default;

export const ipfsGlobSource = globSource;

const debug=Debug("ipfsConnector")


const IPFS_HOST = "ipfs.pollinations.ai";


export const mfsRoot = ``;

export const ipfsPeerURL = process.env.IPFS_API || `http://${IPFS_HOST}:5001`;


debug("Connecting to IPFS", ipfsPeerURL);

export const client = create(ipfsPeerURL);

export const files = client.files;


export const nodeID = client.id();

debug("NodeID", nodeID)

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

const _ipfsLs = async cid => (await toPromise(client.ls(stringCID(cid))))
                                        .filter(({type, name}) => type !== "unknown" && name !== undefined)
                                        .map(_normalizeIPFS);
                            

export const ipfsLs = callLogger(
    // cacheOutput
    (_ipfsLs),"ipfsls");

export const ipfsAdd = cacheInput(limit(async (ipfsPath, content, options={}) => {
    ipfsPath = join(mfsRoot, ipfsPath);
    const cid = stringCID(await client.add(content, options));
    debug("added", cid, "size", content);

    debug("copying to", ipfsPath);
    await client.files.cp(`/ipfs/${cid}`, ipfsPath, { create: true });

    return cid;
}));

export const ipfsGet = limit(cleanCIDs((async (cid, {onlyLink = false}) => {
    
    const _debug = debug.extend(`ipfsGet(${cid})`);


    if (onlyLink)
        return getWebURL(cid);
    
    const chunks = await all(client.cat(cid))

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
    await client.files.mkdir(withMfsRoot, { parents: true });
    return path;
}

export async function ipfsRm(ipfsPath) {
    ipfsPath = join(mfsRoot, ipfsPath);
    debug("Deleting",ipfsPath);
    await client.files.rm(ipfsPath,{force:true})
}

export async function contentID(mfsPath="/") {
    mfsPath = join(mfsRoot, mfsPath);
    return stringCID(await client.files.stat(mfsPath));
}


export async function publish(rootCID) {
    debug("publish", rootCID);
    await client.pubsub.publish(await nodeID, rootCID)
    debug("publishResponse", await client.name.publish(`/ipfs/${rootCID}`));
}


export const subscribeCID = async () =>
 asyncify(async handler => await client.pubsub.subscribe(await nodeID, handler));


export const ipfsResolve = async path =>
    stringCID(last(await toPromise(client.name.resolve(path))));




