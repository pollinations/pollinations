import watch from 'file-watch-iterator';

import Debug from "debug";

import {  callLogger, toPromise1 } from "../network/utils.js";
import { sortBy,reverse } from "ramda";

import readline from 'readline-async-generator';

import { getIPFSState } from '../network/ipfsState.js';
import { getWebURL , nodeID, stringCID, ipfsMkdir, ipfsGet, ipfsAddFile, contentID, ipfsRm, ipfsAdd} from "../network/ipfsConnector.js";
import { writeFile , mkdir} from 'fs/promises';
import { dirname, join } from "path";
import { program } from "commander";
import { existsSync, fstat, mkdirSync } from 'fs';

const debug = Debug("ipfsWatch")

program
  .option('-r, --root <root>', 'local folder to synchronize', '/tmp/ipfs');

program.parse(process.argv);

const options = program.opts();
debug("CLI options", options);


const mfsRoot = `/${nodeID}`;



const watchPath = options.root;

debug("Local: Watching", watchPath);

if (!existsSync(watchPath)) {
  debug("Local: Root directory does not exist. Creating", watchPath)
  mkdirSync(watchPath, {recursive: true});
}

const incrementalUpdate = async (mfsRoot, watchPath) => {

  await ipfsMkdir(mfsRoot);
  debug("IPFS: Created root IPFS path (if it did not exist)", mfsRoot);

  for await (const files of watch(".",{cwd:watchPath, awaitWriteFinish:false})) {
    
    const changed = getSortedChangedFiles(files);
    for (const { event, file } of changed) {
      const localPath = join(watchPath, file);
      const ipfsPath = join(mfsRoot, file);

      if (event === "addDir") {
        await ipfsMkdir(ipfsPath);
      }

      if (event === "add") {
        await ipfsAddFile(localPath, ipfsPath);
      }

      if (event === "unlink" || event === "unlinkDir") {
        debug("removing", file, event);
        await ipfsRm(ipfsPath);
      }

      if (event === "change") {
        debug("changing", file);
        debug("remove",ipfsPath);
        await ipfsRm(ipfsPath);
        debug("add");
        await ipfsAddFile(localPath, ipfsPath)
      }
    }

    console.log(await contentID(mfsRoot));
  };
}

async function processRemoteCID(contentID) {
  debug("Processing remote CID",contentID);
  debug("got remote state", (await getIPFSState(contentID,  processFile)));
}

async function processFile({ path, cid} ) {
  const destPath = join(watchPath, path);
  debug("writeFile", destPath, cid);
  const content = await ipfsGet(cid);
  debug("writefile content",content)
  await writeFileAndCreateFolder(destPath, content);
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



incrementalUpdate(mfsRoot, watchPath);


(async function(){
  const stdin = readline();
  for await(const remoteCID of stdin) {
     processRemoteCID(remoteCID);
  }
}
)()



// ipfsClient.pubsub.subscribe(nodeID, async ({ data }) => {
//   const newContentID = new TextDecoder().decode(data);
//   debug("content ID from colab", newContentID);
//   onContentID(newContentID);
// });

const writeFileAndCreateFolder = async (path, content) => {
  debug("creating folder if it does not exist", path);
  await mkdir(dirname(path), {recursive: true});
  debug("writing file of length",content.length,"to folder", path);
  await writeFile(path,content);
  return path;
};