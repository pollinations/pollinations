import process from "process";
import { getIPFSState } from '../../network/ipfsState.js';
import { stringCID, ipfsGet, ipfsResolve, subscribeGenerator } from "../../network/ipfsConnector.js";
import { join } from "path";
import { noop } from '../../network/utils.js';
import Debug from 'debug';
import eventit from "event-iterator"
import { promises as fsPromises } from "fs";

import { dirname } from "path";
import { writeFileSync } from 'fs';

const { stream } = eventit;
const { writeFile, mkdir } = fsPromises;

const debug = Debug("ipfs/receiver");

export const receive = async function ({ ipns, once, path: rootPath }) {

  // subscribe to content id updates either via IPNS or stdin
  const [cidStream, unsubscribe] = ipns ?
    await subscribeGenerator(null, "/input")
    : [stream.call(process.stdin), noop];

  let remoteCID = null;
  for await (remoteCID of await cidStream) {
    debug("received CID",remoteCID);
    remoteCID = stringCID(remoteCID);
    debug("remoteCID", remoteCID);
    if (remoteCID.startsWith("/ipns/"))
      remoteCID = await ipfsResolve(remoteCID);
    await processRemoteCID(stringCID(remoteCID), rootPath);
    if (once) {
      unsubscribe();
      break;
    }
  };
  return remoteCID;
};



let _lastContentID = null;
const isSameContentID = cid => {
  if (_lastContentID === cid) {
    debug("contentid was the same. probably skipping");
    return true;
  }
  _lastContentID = cid;
  return false;
};

export const writeFileAndCreateFolder = async (path, content) => {
    debug("creating folder if it does not exist", dirname(path));
    await mkdir(dirname(path), { recursive: true });
    debug("writing file of length", content.size, "to folder", path);
    writeFileSync(path, content);
    return path;
  };
  

async function processRemoteCID(contentID, rootPath) {
  if (isSameContentID(stringCID(contentID)))
    return;
  debug("Processing remote CID", contentID);
  debug("got remote state", (await getIPFSState(contentID, file => processFile(file, rootPath))));
}


async function processFile({ path, cid }, rootPath) {
  const _debug = debug.extend(`processFile(${path})`);
  _debug("started");
  const destPath = join(rootPath, path);
  _debug("writeFile", destPath, cid, "queued");

  // queue.add(async () => {
  const content = await ipfsGet(cid, { stream: true });
  _debug("writefile content", content.length);
  await writeFileAndCreateFolder(destPath, content);
  _debug("done");
  // });
  return destPath;
}

