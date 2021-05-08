import watch from 'file-watch-iterator';

import Debug from "debug";

import {  toPromise1 } from "../network/utils.js";
import { sortBy,reverse } from "ramda";

import readline from 'readline-async-generator';
import {extname} from 'path';

import { getIPFSState } from '../network/ipfsState.js';
import ipfsClient, { getWebURL , nodeID, stringCID, ipfsMkdir, ipfsGet} from "../network/ipfsConnector.js";
const debug = Debug("ipfsWatch")

const mfsRoot = `/${nodeID}`;

const watchPath = './output';

const incrementalUpdate = async (nodeID, watchPath) => {

  debug(`Creating root directory if it does not exist.`);
  
  await ipfsMkdir();
  debug("Absolute root IPFS path",);

  for await (const files of watch(".",{cwd:watchPath, awaitWriteFinish:false})) {
    //
    const changed = getSortedChangedFiles(files);
    for (const { event, file } of changed) {
      const localPath = `${watchPath}/${file}`;

      if (event === "addDir") {
        debug("adding directory", file);
        await ipfsMkdir(file);
        await cacheIPFSPath(ipfsPath, localPath);
      };

      if (event === "add") {
        
      }
      
      if (event === "unlink" || event === "unlinkDir") {
        debug("removing", file, event);
        //await removeCID(ipfsPath);
        await ipfsClient.files.rm(ipfsPath, {recursive:true});
        
      }
      const {cid: rootCIDInner} = await ipfsClient.files.stat(mfsRoot);
      debug("root CID changed to", getWebURL(rootCIDInner.toString()));
    }


    const {cid: rootCID} = await ipfsClient.files.stat(mfsRoot);
    console.log(getWebURL(rootCid));
  };
}

async function processRemoteCID(contentID) {
  debug("Processing remote CID",contentID);
  debug("got remote state", (await getIPFSState(contentID,  processFile)));
}


async function processFile({name, cid} ) {
  debug("processFile", name,cid)
  cid = stringCID(cid);
  const result = await ipfsGet(cid, true);
  //console.log("ipfsGetResult",result)
  return result;
}

function getSortedChangedFiles(files) {
  const changed = files.toArray()
    .filter(({ changed, file }) => changed && file.length > 0)
    .map(({ changed, ...rest }) => rest);
  const changedOrdered = order(changed);
  debug("Changed files", changedOrdered);
  return changedOrdered;
}



const _eventOrder = ["unlink", "addDir","add", "unlink", "unlinkDir"];//.reverse();
const  eventOrder = ({ event }) => _eventOrder.indexOf(event);

const order = events => sortBy(eventOrder,reverse(events));



// incrementalUpdate(nodeID, watchPath)


(async function(){
  const stdin = readline();
  for await(const remoteCID of stdin) {
     processRemoteCID(remoteCID);
  }
}
)()



ipfsClient.pubsub.subscribe(nodeID, async ({ data }) => {
  const newContentID = new TextDecoder().decode(data);
  debug("content ID from colab", newContentID);
  onContentID(newContentID);
});
