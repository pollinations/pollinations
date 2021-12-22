#!/usr/bin/env node
import awaitSleep from "await-sleep"
import { spawn } from "child_process"
import Debug from "debug"
import { createWriteStream, mkdirSync } from "fs"
import { emptyDirSync } from "fs-extra"
import { join } from "path"
import process from "process"
import Readline from 'readline'
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

const execute = async (command, logfile = null) =>
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
  });


if (executeCommand)
  (async () => {

    // const receivedCID = await receive({...options, once: true});
    // debug("received IPFS content", receivedCID);


    const { startSending, close, stopSending } = sender({ ...options, once: false })

    while (true) {
      emptyDirSync(rootPath)
      mkdirSync(join(rootPath, "/input"))
      mkdirSync(join(rootPath, "/output"))


      await receive({ ...options, once: true })


      const doSend = async () => {
        for await (const sentCID of startSending()) {
          debug("sent", sentCID)
          console.log(sentCID)
        }
      }

      const doExecute = async () => {
        await execute(executeCommand, options.logout)
        debug("done executing", executeCommand, ". Waiting...")
        await awaitSleep(2000)
        stopSending()
      }


      await Promise.all([doSend(), doExecute()])

      debug("finished. Starting again")

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
      process.exit(0)
    })();


  if (enableReceive) {
    (async () => {
      await receive(options)
      process.exit(0)
    })();
  }
}



// ipfsClient.pubsub.subscribe(nodeID, async ({ data }) => {
//   const newContentID = new TextDecoder().decode(data);
//   debug("content ID from colab", newContentID);
//   onContentID(newContentID);
// });


// setInterval(() => null,5000)
