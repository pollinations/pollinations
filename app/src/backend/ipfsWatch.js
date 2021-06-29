#!/usr/bin/env node
import watch from 'file-watch-iterator';
import PQueue from "p-queue";
import Debug from "debug";
import awaitSleep from "await-sleep";
import { sortBy, reverse } from "ramda";
import process from "process";
import Readline from 'readline';
import eventit from "event-iterator"

import { getIPFSState } from '../network/ipfsState.js';
import { stringCID, ipfsMkdir, ipfsGet, ipfsAddFile, contentID, ipfsRm, ipfsAdd, publish, ipfsResolve, subscribeCID } from "../network/ipfsConnector.js";

import { promises as fsPromises } from "fs";

import { dirname, join } from "path";
import { existsSync, fstat, mkdirSync, writeFileSync } from 'fs';
import options from "./options.js";

const { stream } = eventit;
const { writeFile, mkdir } = fsPromises;
const debug = Debug("ipfsWatch")
const readline = Readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

debug("CLI options", options);


const watchPath = options.path;

const enableSend = !options.receive;
const enableReceive = !options.send;

let _lastContentID = null;

const isSameContentID = cid => {
  if (_lastContentID === cid) {
    debug("contentid was the same. probably skipping")
    return true;
  }
  _lastContentID = cid;
  return false;
}

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
    awaitWriteFinish: false,
  }, { debounce: options.debounce });

  for await (const files of watch$) {

    const changed = getSortedChangedFiles(files);
    await Promise.all(changed.map(async ({ event, file }) => {
      const localPath = join(watchPath, file);
      const ipfsPath = file;

      if (event === "addDir") {
        await ipfsMkdir(ipfsPath);
      }

      if (event === "add") {
        await ipfsAddFile(ipfsPath, localPath);
      }

      if (event === "unlink" || event === "unlinkDir") {
        debug("removing", file, event);
        await ipfsRm(ipfsPath);
      }

      if (event === "change") {
        debug("changing", file);
        await ipfsAddFile(ipfsPath, localPath)
      }
    }));
    // for (const { event, file } of changed) {

    // }
    // console.error("PUBLISHIIING")
    const newContentID = await contentID("/");
    console.log(newContentID);
    if (options.ipns) {
      debug("publish", newContentID)
      if (!isSameContentID(stringCID(newContentID)))
        await publish(newContentID);
    }

    if (options.once) {
      break;
    }
  }
  //TODO:
  await awaitSleep(500);
  process.exit(0);
}


async function processRemoteCID(contentID) {
  if (isSameContentID(stringCID(contentID)))
    return;
  debug("Processing remote CID", contentID);
  debug("got remote state", (await getIPFSState(contentID, processFile)));
}

// const queue = new PQueue({ concurrency: 5 });


async function processFile({ path, cid }) {
  const _debug = debug.extend(`processFile(${path})`);
  _debug("started")
  const destPath = join(watchPath, path);
  _debug("writeFile", destPath, cid, "queued");

  // queue.add(async () => {
    const content = await ipfsGet(cid, { stream: true });
    _debug("writefile content", content.length)
    await writeFileAndCreateFolder(destPath, content);
    _debug("done")
  // });
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

if (enableReceive) {
  (async function () {
    if (options.ipns) {
      debug("IPNS activated. subscring to CIDs")
      for await (let remoteCID of await subscribeCID()) {
        debug("remoteCID from pubsub", remoteCID);
        await processRemoteCID(stringCID(remoteCID));
        if (options.once)
          break;
      };
    } else {
      // for await (let remoteCID of Right eadline) {
      for await (let remoteCID of stream.call(process.stdin)) {
        remoteCID = remoteCID.toString();
        if (remoteCID.startsWith("/ipns/"))
          remoteCID = await ipfsResolve(remoteCID);
        await processRemoteCID(remoteCID);
        console.log(remoteCID);
        if (options.once)
          break;
      }
    }
    process.exit(0);
  }
  )();
}



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
