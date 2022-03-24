#!/usr/bin/env node
import awaitSleep from "await-sleep"
import { spawn } from "child_process"
import Debug from "debug"
import { createWriteStream } from "fs"
import { AbortController } from "native-abort-controller"
import process from "process"
import Readline from 'readline'
import treeKill from 'tree-kill'
import { receive } from "./ipfs/receiver.js"
import { sender } from './ipfs/sender.js'
import options from "./options.js"

export const debug = Debug("pollinate")

const readline = Readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

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

    // const receivedCID = await receive({...options, once: true});
    // debug("received IPFS content", receivedCID);


    const { startSending, close, stopSending } = sender({ ...options, once: false })
    const doSend = async () => {
      for await (const sentCID of startSending()) {
        debug("sent", sentCID)
        console.log(sentCID)
      }
    }

    doSend()


    let [executeSignal, abortExecute] = [null, null]

    for await (const receiveidCID of receive(options)) {
      debug("received CID", receiveidCID)
      if (abortExecute) {
        debug("aborting previous execution")
        abortExecute()
      }
      [executeSignal, abortExecute] = getSignal()
      execute(executeCommand, options.logout, executeSignal)
      debug("done executing", executeCommand, ". Waiting...")
    }

  })();

else {
  if (enableSend)
    (async () => {
      const { startSending } = sender(options)
      for await (const cid of startSending()) {
        console.log(cid)
      }
      debug("process should exit")
      
      // if we publish to IPNS wait a little bit before exiting
      if (options.ipns)
        await awaitSleep(sleepBeforeExit)
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
