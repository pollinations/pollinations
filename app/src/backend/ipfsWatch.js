#!/usr/bin/env node
import watch from 'file-watch-iterator';
import PQueue from "p-queue";
import Debug from "debug";

import { callLogger, toPromise1 } from "../network/utils.js";
import { sortBy, reverse } from "ramda";
import process from "process";
import Readline from 'readline';

import { getIPFSState } from '../network/ipfsState.js';
import {getWebURL, stringCID, ipfsMkdir, ipfsGet, ipfsAddFile, contentID, ipfsRm, ipfsAdd, publish, ipfsResolve } from "../network/ipfsConnector.js";

import {promises as fsPromises} from "fs";

import { dirname, join } from "path";
import { program } from "commander";
import { existsSync, fstat, mkdirSync, writeFileSync } from 'fs';
import awaitSleep from 'await-sleep';
import {asyncFlatMap, asyncMap, asyncWrap, wrapEntries} from "iter-tools"

const { writeFile, mkdir }  = fsPromises;
const debug = Debug("ipfsWatch")
const readline = Readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

program
  .option('-p, --path <path>', 'local folder to synchronize', '/tmp/ipfs')
  .option('-r, --receive', 'only receive state', false)
  .option('-s, --send', 'only send state', false)
  .option('-o, --once', 'run once and exit', false)
  .option('-i, --ipns', 'publish to /ipns/pollinations.ai', false);

program.parse(process.argv);

const options = program.opts();
debug("CLI options", options);





const watchPath = options.path;

const enableSend = !options.receive;
const enableReceive = !options.send;

if (!existsSync(watchPath)) {
  debug("Local: Root directory does not exist. Creating", watchPath)
  mkdirSync(watchPath, { recursive: true });
}

const incrementalUpdate = async (watchPath) => {

  await ipfsMkdir("/");
  debug("IPFS: Created root IPFS path (if it did not exist)");
  debug("Local: Watching", watchPath);
  const watch$ = watch(".", {
    ignored: /(^|[\/\\])\../,
    cwd: watchPath,
    awaitWriteFinish: true,
  },{debounce: 500});

  const added$ = asyncFlatMap(async (added) =>  asyncWrap(Object.entries(added.files)))(watch$);

  for await (const added of added$) {
    console.log("added", added)
    // for (const file of added)
    //   console.log("added", added);
  
  }

  // for await (const files of) {

  //   const changed = getSortedChangedFiles(files);
  //   await Promise.all(changed.map(async ({ event, file}) => {
  //     const localPath = join(watchPath, file);
  //     const ipfsPath = file;

  //     if (event === "addDir") {
  //       await ipfsMkdir(ipfsPath);
  //     }

  //     if (event === "add") {
  //       await ipfsAddFile(ipfsPath, localPath);
  //     }

  //     if (event === "unlink" || event === "unlinkDir") {
  //       debug("removing", file, event);
  //       await ipfsRm(ipfsPath);
  //     }

  //     if (event === "change") {
  //       debug("changing", file);
  //       await ipfsAddFile(ipfsPath, localPath)
  //     }
  //   }));
  //   // for (const { event, file } of changed) {
     
  //   // }
  //   // console.error("PUBLISHIIING")
  //   const newContentID = await contentID("/");
  //   console.log(newContentID);
  //   if (options.ipns) {
  //     debug("publish", newContentID)
  //     await publish(newContentID);
  //   }

  //   if (options.once) {
  //     break;
  //   }
  // }
  // //TODO:
  // await awaitSleep(100);
  // process.exit(0); 
}

async function processRemoteCID(contentID) {
  debug("Processing remote CID", contentID);
  debug("got remote state", (await getIPFSState(contentID, processFile)));
}

const queue = new PQueue({concurrency: 5});


async function processFile({ path, cid }) {
  const _debug = debug.extend(`processFile(${path})`);
  _debug("started")
  const destPath = join(watchPath, path);
  _debug("writeFile", destPath, cid,"queued");
  
  queue.add(async () => {
    const content = await ipfsGet(cid,{stream: true});
    _debug("writefile content", content.length)
    await writeFileAndCreateFolder(destPath, content);
    _debug("done")
  });
  return destPath;
}

function getSortedChangedFiles(files) {
  const changed = files.toArray()
    .filter(({ changed, file }) => changed && file.length > 0)
    .map(({ changed, ...rest }) => rest);
  const changedOrdered = order(changed);
  debug("Changed files", changedOrdered);
  return changedOrdered;
}



const _eventOrder = ["unlink", "addDir", "add", "unlink", "unlinkDir"];//.reverse();
const eventOrder = ({ event }) => _eventOrder.indexOf(event);

const order = events => sortBy(eventOrder, reverse(events));

if (enableSend)
  incrementalUpdate(watchPath);

if (enableReceive)
  (async function () {

    for await (let remoteCID of readline) {
      if (remoteCID.startsWith("/ipns/"))
        remoteCID = await ipfsResolve(remoteCID);
      await processRemoteCID(remoteCID);
      console.log(remoteCID);
      if (options.once)
        break;
    }

  }
  )();



// ipfsClient.pubsub.subscribe(nodeID, async ({ data }) => {
//   const newContentID = new TextDecoder().decode(data);
//   debug("content ID from colab", newContentID);
//   onContentID(newContentID);
// });

const writeFileAndCreateFolder = async (path, content) => {
  debug("creating folder if it does not exist", dirname(path));
  await mkdir(dirname(path), { recursive: true });
  debug("writing file of length", content.size, "to folder", path);
  writeFileSync(path, content);
  return path;
};


// setInterval(() => null,5000)
