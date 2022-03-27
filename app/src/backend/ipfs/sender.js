
import Debug from 'debug';
import { existsSync, mkdirSync } from 'fs';
import { AbortController } from "native-abort-controller";
import { writer } from "../../network/ipfsConnector.js";
import { publisher } from '../../network/ipfsPubSub.js';
import folderSync from "./folderSync.js";

const debug = Debug("ipfs/sender");


// Watch local path and and update IPFS incrementally.
// Optionally send updates via PubSub.
export const sender = ({ path, debounce, ipns, once, nodeid }) => {

  const ipfsWriter = writer()

  // publisher to pollinations frontend
  const { publish, close: closePublisher } = publisher(nodeid, "/output")

  // publisher to pollen feed
  const { publish: publishPollen, close: closePollenPublisher } = publisher("processing_pollen", "")

  // const { channel$: changedFiles$, close: closeFileWatcher, setPaused } = chunkedFilewatcher(watchPath, debounceTime)

  let abortController = null;
  // Close function closes both the writer and the publisher.
  // executeOnce makes sure it is called only once
  const close = async (error) => {
    debug("Closing sender", nodeid)
    if (abortController)
      abortController.abort()

    await ipfsWriter.close()
    await closePublisher()
    await closePollenPublisher()
    debug("closed all")
  };

  async function* startSending() {

    abortController = new AbortController()
    const cid$ = folderSync({ path, debounce, writer: ipfsWriter, once, signal: abortController.signal })

    debug("start consuming watched files")
    if (!existsSync(path)) {
      debug("Local: Root directory does not exist. Creating", path)
      mkdirSync(path, { recursive: true })
    }


    debug("getting cid stream")
    for await (const cid of cid$) {
      debug("publishing new cid", cid)
      await publishPollen(cid)
      await publish(cid)
      yield cid
      if (once)
        await close()
    }

    debug("closed sender")
  }

  const stopSending = () => {
    abortController.abort()
  }

  return {
    startSending,
    close,
    stopSending
  }

};
