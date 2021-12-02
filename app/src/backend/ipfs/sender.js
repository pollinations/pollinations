
import chokidar from "chokidar";
import Debug from 'debug';
import { existsSync, mkdirSync } from 'fs';
import { join } from "path";
import { Channel } from "queueable";
import { last } from "ramda";
import { debounce } from "throttle-debounce";
import { getClient, writer } from "../../network/ipfsConnector.js";
import { publisher } from "../../network/ipfsPubSub.js";

const debug = Debug("ipfs/sender");


// Watch local path and and update IPFS incrementally.
// Optionally send updates via PubSub.
export const sender = ({ path: watchPath, debounce: debounceTime, ipns, once, nodeid }) => {

  let processing = Promise.resolve(true)

  const { addFile, mkDir, rm, cid, close: closeWriter } = writer()

  // publisher to pollinations frontend
  const { publish, close: closePublisher } = publisher(nodeid, "/output")

  // publisher to pollen feed
  const { publish: publishPollen, close: closePollenPublisher } = publisher("pollen", "")


  // Close function closes both the writer and the publisher.
  // executeOnce makes sure it is called only once
  const close = executeOnce(async (error) => {
    await closeWriter()
    await closePublisher()
    await closePollenPublisher()
  });

  async function start() {

    if (!existsSync(watchPath)) {
      debug("Local: Root directory does not exist. Creating", watchPath)
      mkdirSync(watchPath, { recursive: true })
    }

    const changedFiles$ = chunkedFilewatcher(watchPath, debounceTime)


    let done = null


    for await (const changed of changedFiles$) {

      debug("Changed files", changed)
      processing = new Promise(resolve => done = resolve)

      const lastChanged = deduplicateChangedFiles(changed)
      await Promise.all(lastChanged.map(async ({ event, path: file }) => {

        // Using sequential loop for now just in case parallel is dangerous with Promise.ALL
        debug("Local:", event, file);
        const localPath = join(watchPath, file)
        const ipfsPath = file

        if (event === "addDir") {
          await mkDir(ipfsPath)
        }

        if (event === "add" || event === "change") {
          await addFile(ipfsPath, localPath)
        }

        if (event === "unlink" || event === "unlinkDir") {
          debug("removing", file, event)
          await rm(ipfsPath)

        }
      }
      ))


      const newContentID = await cid();
      // currentContentID = newContentID;
      console.log(newContentID);

      if (ipns) {
        debug("publish", newContentID);
        // publish to frontend
        await publish(newContentID);
        // publish to feed
        await publishPollen(newContentID);
      }




      if (once) {
        break;
      }
      done();
    }


    // await close();
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
    awaitWriteFinish: {
      stabilityThreshold: debounceTime,
      pollInterval: debounceTime / 2
    },
    ignored: /(^|[\/\\])\../,
    cwd: watchPath,
    interval: debounceTime,
  })

  const sendQueuedFiles = debounce(debounceTime, false, async () => {
    const files = changeQueue
    changeQueue = []
    channel$.push(files)
  })

  watcher.on("all", async (event, path) => {
    if (path !== '') {

      const lastChanged = last(changeQueue)

      // add to queue only if it is not a repetition of the last change
      if (lastChanged && lastChanged.path == path && lastChanged.event == event) {
        debug(`Last change "${event}" for "${path}" was duplicate. Ignoring.`)
      } else {
        changeQueue.push({ event, path });
        sendQueuedFiles();
      }
    }
  })

  return channel$;
}

// publishes a message that pollinating is done which triggers pinning on the server
const publishDonePollinate = async cid => {
  const client = await getClient();
  debug("Publishing done pollinate", cid);
  await client.pubsub.publish("done_pollination", cid);
};



const executeOnce = f => {
  let executed = false
  return async (...args) => {
    if (!executed) {
      executed = true
      await f(...args)
    }
  }
}

const deduplicateChangedFiles = (changed) =>
  Object.entries(changed.reduce((lastChange, { event, path }) => ({ ...lastChange, [path]: event }), {}))
    .map(([path, event]) => ({ event, path }))

