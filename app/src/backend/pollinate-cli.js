#!/usr/bin/env node
import awaitSleep from "await-sleep"
import { spawn } from "child_process"
import Debug from "debug"
import { stream } from "event-iterator"
import { createWriteStream, mkdirSync, rmSync } from "fs"
import { AbortController } from "native-abort-controller"
import { dirname } from "path"
import process from "process"
import Readline from 'readline'
import treeKill from 'tree-kill'
import { stringCID } from "../network/ipfsConnector.js"
import { publisher, subscribeGenerator } from "../network/ipfsPubSub.js"
import { processRemoteCID, receive } from "./ipfs/receiver.js"
import { sender } from './ipfs/sender.js'
import options from "./options.js"

export const debug = Debug("pollinate")

const readline = Readline.createInterface({
  input: process.stdin,
  output: process.stdout
})


const getPublisher = (nodeid) => {
  // publisher to pollinations frontend
  const { publish: publishFrontend, close: closeFrontendPublisher } = publisher(nodeid, "/output")

  // publisher to pollen feed
  const { publish: publishPollen, close: closePollenPublisher } = publisher("processing_pollen", "")

  const publish = async (cid) => {
    await publishFrontend(cid)
    await publishPollen(cid)
  }

  const close = async () => {
    await closeFrontendPublisher()
    await closePollenPublisher()
  }

  return { publish, close }
}

debug("CLI options", options)



export const rootPath = options.path

const enableSend = !options.receive
const enableReceive = !options.send


const executeCommand = options.execute
const sleepBeforeExit = options.debounce * 2 + 10000

const execute = async (command, logfile = null, signal) =>
  new Promise((resolve, reject) => {
    debug("Executing command", command)
    const childProc = spawn(command)
    childProc.on("error", err => {
      debug("Error executing command", err)
      reject(err)
    });
    childProc.on("close", resolve)
    childProc.stdout.pipe(process.stderr)
    childProc.stderr.pipe(process.stderr)
    if (logfile) {
      debug("creating a write stream to ", logfile)
      const logout = createWriteStream(logfile, { 'flags': 'a' })
      childProc.stdout.pipe(logout)
      childProc.stderr.pipe(logout)
    }
    signal.addEventListener("abort", () => {
      debug("Abort requested. Killing child process")
      treeKill(childProc.pid)
    })
  });


if (executeCommand)
  (async () => {

    let [executeSignal, abortExecute] = [null, null]

    const [cidStream, unsubscribe] = options.ipns ?
      subscribeGenerator(options.nodeid, "/input")
      : [stream.call(process.stdin), noop];


    const {publish, close: closePublish} = getPublisher(options.nodeid)

    let close = null;

    for await (let receivedCID of await cidStream) {

      receivedCID = stringCID(receivedCID);
      debug("remoteCID", receivedCID);
   
      if (abortExecute) {
        debug("aborting previous execution")
        abortExecute()
        await close()
      }

      // empty the root path
      rmSync(options.path, { recursive: true, force: true });
      // create the root path
      mkdirSync(options.path, { recursive: true });
      mkdirSync(options.path+"/input", { recursive: true });
      mkdirSync(options.path+"/output", { recursive: true });
      
      // create folder for log file extracted from options.path
      if (options.logout)
        mkdirSync(dirname(options.logout), { recursive: true });

      await processRemoteCID(receivedCID, options.path);

      
      [executeSignal, abortExecute] = getSignal();


      const { startSending, close: closeSender } = sender({ ...options, once: false, publish })
      close = closeSender


            
      startSending()
      
      execute(executeCommand, options.logout, executeSignal)
      
    }

    await close()
    await closePublish()

    await closeFrontendPublisher()
    await closePollenPublisher()
    unsubscribe()
  })();

else {
  if (enableSend)
    (async () => {
      const {publish, close: closePublish} = getPublisher(options.nodeid)
      const { startSending } = sender({...options, publish})
      await startSending()
      debug("process should exit")
      
      // if we publish to IPNS wait a little bit before exiting
      if (options.ipns)
        await awaitSleep(sleepBeforeExit)
      await closePublish()
      process.exit(0)
    })();


  if (enableReceive) {
    (async () => {
      const receiveStream = await receive(options)
      for await (const cid of receiveStream) {
        console.log(cid)
      }
      process.exit(0)
    })();
  }
}




function getSignal() {
  const executeController = new AbortController()
  const executeSignal = executeController.signal
  return [executeSignal, () => executeController.abort()]
}


// ipfsClient.pubsub.subscribe(nodeID, async ({ data }) => {
//   const newContentID = new TextDecoder().decode(data);
//   debug("content ID from colab", newContentID);
//   onContentID(newContentID);
// });


// setInterval(() => null,5000)
