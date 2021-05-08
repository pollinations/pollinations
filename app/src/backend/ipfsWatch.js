import watch from 'file-watch-iterator';

import Debug from "debug";

import {  toPromise1 } from "../network/utils.js";
import { sortBy,reverse } from "ramda";

import readline from 'readline-async-generator';
import {extname} from 'path';

import { getIPFSState, cacheIPFSPath } from '../network/ipfsCachedState.js';
import client, {globSource} from "../network/ipfsConnector";
const debug = Debug("ipfsWatch")

// import "debug-trace";


const watchPath = '/tmp/output';


const nodeID = "thomashmac" + Math.floor(Math.random() * 10000);

const mfsRoot = `/${nodeID}`;

debug("NodeID", nodeID, "mfsRoot", mfsRoot)

const incrementalUpdate = async (nodeID, watchPath) => {



  debug(`Creating root directory "${mfsRoot}" if it does not exist.`)
  await client.files.mkdir(mfsRoot, {parents: true});
  for await (const files of watch(".",{cwd:watchPath, awaitWriteFinish:false})) {
    //
    const changed = getSortedChangedFiles(files);
    for (const { event, file } of changed) {
      const ipfsPath = `${mfsRoot}/${file}`;
      const localPath = `${watchPath}/${file}`;

      if (event === "addDir") {
        debug("adding directory", file);
        await client.files.mkdir(ipfsPath, { parents: true });
        await cacheIPFSPath(ipfsPath, localPath);
      };

      if (event === "add") {
        debug("adding", localPath);
        const addedCID = await add(localPath);
        debug("added", addedCID, "copying to", ipfsPath);
        await client.files.cp(`/ipfs/${addedCID}`, ipfsPath, { create: true });
        await cacheIPFSPath(ipfsPath, localPath);
      }
      
      if (event === "unlink" || event === "unlinkDir") {
        debug("removing", file, event);
        //await removeCID(ipfsPath);
        await client.files.rm(ipfsPath, {recursive:true});
        
      }
      const {cid: rootCIDInner} = await client.files.stat(mfsRoot);
      debug("root CID changed to", "http://ec2-bakerman:9090/ipfs/"+rootCIDInner.toString());
    }


    const {cid: rootCID} = await client.files.stat(mfsRoot);
    console.log("http://ec2-bakerman:9090/ipfs/"+rootCID.toString())
   
  };
}

async function processRemoteCID(contentID) {
  debug("Processing remote CID",contentID);
  debug("got remote state", (await getIPFSState(contentID,  processFile)));
}


let result = null;

async function processFile({name, cid} ) {
  cid = cid.toString();
  debug("Processing remote file:",name, cid);
  const IPFS_HOST = "ec2-bakerman";
    if (extname(name).length === 0 ) {
      const {content} = await toPromise1(client.get(cid))
      const contentArray = await toPromise1(content);
      result = new TextDecoder().decode(contentArray);
  } else
      result = `http://${IPFS_HOST}:9090/ipfs/${cid}`;
  debug("Received:", result)
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


async function add(path) {
  const { cid } = await client.add(globSource(path));
  return cid.toString();
}

const _eventOrder = ["unlink", "addDir","add", "unlink", "unlinkDir"];//.reverse();
const  eventOrder = ({ event }) => _eventOrder.indexOf(event);

const order = events => sortBy(eventOrder,reverse(events));



//incrementalUpdate(nodeID, watchPath)


(async function(){
  const stdin = readline();
  for await(const remoteCID of stdin) {
     processRemoteCID(remoteCID);
  }
}
)()



client.pubsub.subscribe(nodeID, async ({ data }) => {
  const newContentID = new TextDecoder().decode(data);
  debug("content ID from colab", newContentID);
  onContentID(newContentID);
});
