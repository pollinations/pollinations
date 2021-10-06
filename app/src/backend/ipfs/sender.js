
import { writer } from "../../network/ipfsConnector.js";
import { publisher } from "../../network/ipfsPubSub.js";
import { join } from "path";
import { existsSync, mkdirSync } from 'fs';
import Debug from 'debug';
import { sortBy, reverse } from "ramda";
import chokidar from "chokidar";
import { Channel } from "queueable";
import { debounce, throttle } from "throttle-debounce";

const debug = Debug("ipfs/sender");

// Watch local path and and update IPFS incrementally.
// Optionally send updates via PubSub.
export const sender = async ({ path: watchPath, debounce:debounceTime, ipns, once, nodeid }) => {
  
  let processing = Promise.resolve(true);
  
  const { addFile, mkDir, rm, cid, close: closeWriter } = await writer();
  const { publish, close: closePublisher } = publisher(nodeid,"/output");

  // Close function closes both the writer and the publisher.
  // executeOnce makes sure it is called only once
  const close = executeOnce(async () => {
    await closeWriter();
    await closePublisher();
  });

  async function start() {

    if (!existsSync(watchPath)) {
      debug("Local: Root directory does not exist. Creating", watchPath);
      mkdirSync(watchPath, { recursive: true });
    }

    const changedFiles$ = chunkedFilewatcher(watchPath, debounceTime);
    

    for await (const changed of changedFiles$) {
      
      let done=null;

      processing = new Promise(resolve => done = resolve);
      debug("Changed files", changed);
      for (const  { event, path: file } of changed) {
      // Using sequential loop for now just in case parallel is dangerous with Promise.ALL
        debug("Local:", event, file);
        const localPath = join(watchPath, file);
        const ipfsPath = file;

        if (event === "addDir") {
          await mkDir(ipfsPath);
        }

        if (event === "add" || event === "change") {
          await addFile(ipfsPath, localPath);
        }

        if (event === "unlink" || event === "unlinkDir") {
          debug("removing", file, event);
          await rm(ipfsPath);
    
        }
      }
      // await Promise.all(changed.map(async ({ event, file }) => {
     
      const newContentID = await cid();
      console.log(newContentID);
      if (ipns) {
        debug("publish", newContentID);
        // if (!isSameContentID(stringCID(newContentID)))
        await publish(newContentID);
      }
      // }));
  
      done();

      if (once) {
        break;
      }
    
    }
    
    await close();
  }

  return {
      start, 
      processing: () => processing, 
      close
  };

};



const chunkedFilewatcher = (watchPath, debounceTime) => {
  debug("Local: Watching", watchPath);
  const channel$ = new Channel();
  
  let changeQueue = [];

  const watcher = chokidar.watch(watchPath, { 
    awaitWriteFinish: true, 
    ignored: /(^|[\/\\])\../,
    cwd: watchPath,
  });

  const sendQueuedFiles =  debounce(debounceTime, false, async () => {
    const files = changeQueue;
    changeQueue = [];
    channel$.push(files);
  });

  watcher.on("all", async (event, path) => {
    if (path !== '') {
      changeQueue.push({ event, path });
      sendQueuedFiles();
    }
  });

  return channel$;
}


const executeOnce = f => {
  let executed = false;
  return async () => {
    if (!executed) {
      executed = true;
      await f();
    }
  }
}