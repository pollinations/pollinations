
import awaitSleep from "await-sleep";
import chokidar from "chokidar";
import Debug from 'debug';
import { existsSync, mkdirSync } from 'fs';
import { join } from "path";
import { Channel } from "queueable";
import { uniqBy } from "ramda";
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
  const { publish: publishPollen, close: closePollenPublisher } = publisher("processing_pollen", "")

  const { channel$: changedFiles$, close: closeFileWatcher, setPaused } = chunkedFilewatcher(watchPath, debounceTime)

  // Close function closes both the writer and the publisher.
  // executeOnce makes sure it is called only once
  const close = executeOnce(async (error) => {
    debug("Closing sender", nodeid)
    await closeWriter()
    await closePublisher()
    await closePollenPublisher()
    if (closeFileWatcher)
      await closeFileWatcher()
  });

  async function start() {

    debug("start consuming watched files")
    if (!existsSync(watchPath)) {
      debug("Local: Root directory does not exist. Creating", watchPath)
      mkdirSync(watchPath, { recursive: true })
    }

    let done = null
    setPaused(false)

    for await (const changed of changedFiles$) {

      debug("Changed files", changed)
      processing = new Promise(resolve => done = resolve)

      const lastChanged = changed; // deduplicateChangedFiles(changed)
      for (const { event, path: file } of lastChanged) {
        //await Promise.all(lastChanged.map(async ({ event, path: file }) => {

        // Using sequential loop for now just in case parallel is dangerous with Promise.ALL
        debug("Local:", event, file);
        const localPath = join(watchPath, file)
        const ipfsPath = file

        if (event === "addDir") {
          await mkDir(ipfsPath)
        }

        if (event === "add" || event === "change") {
          debug("adding", ipfsPath, localPath)
          await addFile(ipfsPath, localPath)
        }

        if (event === "unlink" || event === "unlinkDir") {
          debug("removing", file, event)
          await rm(ipfsPath)

        }
      }

      debug("synched all changes")

      const newContentID = await cid();
      // currentContentID = newContentID;
      console.log(newContentID);

      if (ipns) {
        debug("publish", newContentID)
        // publish to frontend
        await publish(newContentID)
        await awaitSleep(1000)
        // publish to feed
        await publishPollen(newContentID);
      }



      done()
      if (once) {
        debug("Only sending once. break")

        break;
      }

    }
    await close()
    debug("closed sender")
  }

  return {
    start,
    processing: () => processing,
    close,
    setPaused
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

  let paused = true;
  // rewrite the above
  async function transmitQueue() {
    while (true) {
      if (!paused) {
        const files = changeQueue
        changeQueue = []
        if (files.length > 0) {
          const deduplicatedFiles = deduplicateChangedFiles(files)
          debug("Pushing to channel:", deduplicatedFiles)
          await channel$.push(deduplicatedFiles)
        }
      }
      // the use of debounce is not quite right here. Will change later
      // debug("Sleeping", debounceTime)
      await awaitSleep(debounceTime)
    }
  }

  transmitQueue()

  debug("registering watcher for path", watchPath)
  watcher.on("all", async (event, path) => {

    debug("got watcher event", event, path);

    if (path !== '') {

      changeQueue.push({ event, path });
      debug("Queue", changeQueue)
    }
  })

  const setPaused = (_paused) => {
    debug("setting paused to", _paused)
    paused = _paused
  }

  return { channel$, close: () => watcher.close(), setPaused };
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
  uniqBy(({ event, path }) => `${event}-${path}`, changed)
