import Debug from 'debug';
import { stream } from "event-iterator";
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from "path";
import { stringCID } from "../../network/ipfsConnector.js";
import { subscribeGenerator } from "../../network/ipfsPubSub.js";
import { getIPFSState } from '../../network/ipfsState.js';
import { noop } from '../../network/utils.js';


const debug = Debug("ipfs/receiver");

// Receives a stream of updates from IPFS pubsub or stdin and writes them to disk
export const receive = async function* ({ ipns, nodeid, once, path: rootPath }, process=processRemoteCID, suffix="/input") {
  // subscribe to content id updates either via IPNS or stdin
  const [cidStream, unsubscribe] = ipns ?
    subscribeGenerator(nodeid, suffix)
    : [stream.call(process.stdin), noop];

  let remoteCID = null;
  for await (remoteCID of await cidStream) {
    debug("received CID",remoteCID);
    remoteCID = stringCID(remoteCID);
    debug("remoteCID", remoteCID);
    await process(stringCID(remoteCID), rootPath);
    yield remoteCID
    if (once) {
      unsubscribe();
      break;
    }
  };
  return remoteCID;
};


// Easy way to skip duplicate content updates
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
    mkdirSync(dirname(path), { recursive: true });
    debug("writing file of length", content.size, "to folder", path);
    writeFileSync(path, content);
    return path;
  };
  

// Fetch the IPFS state and write to disk  
async function processRemoteCID(contentID, rootPath) {
  // if (isSameContentID(stringCID(contentID)))
  //   return;
  debug("Processing remote CID", contentID);
  const ipfsState = (await getIPFSState(contentID, (file, reader) => processFile(file, rootPath, reader), true));
  debug("got remote state", ipfsState);
}

// Writes all files to disk coming from the IPFS state
async function processFile({ path, cid }, rootPath, { get }) {
  const _debug = debug.extend(`processFile(${path})`);
  _debug("started");
  const destPath = join(rootPath, path);
  _debug("writeFile", destPath, cid, "queued");

  // queue.add(async () => {
  const content = await get(cid, { stream: true });
  _debug("writefile content", content.length);
  await writeFileAndCreateFolder(destPath, content);
  _debug("done");
  // });
  return destPath;
}

