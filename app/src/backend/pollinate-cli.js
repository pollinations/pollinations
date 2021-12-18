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


    const { start: startSending, processing, close, setPaused: pauseSending } = sender({ ...options, once: false })


    let startedSending = false;
    while (true) {
      pauseSending(true)
      emptyDirSync(rootPath)
      mkdirSync(join(rootPath, "/input"))
      mkdirSync(join(rootPath, "/output"))

      await receive({ ...options, once: true })

      if (!startedSending) {
        startedSending = true;
        startSending()
      }

      pauseSending(false)

      await execute(executeCommand, options.logout)
      debug("done executing", executeCommand, ". Waiting...")

      // This waiting logic is quite hacky. Should improve it.
      debug("awaiting termination of state sync")
      await processing()
      await awaitSleep(sleepBeforeExit)
      await processing()

    }
    await close();

    await awaitSleep(sleepBeforeExit);
    debug("awaiting termination of state sync");
    await processing();

    // not sure if this is the right order
    debug("calling sender's close function.")
    await close();

    debug("state sync done. exiting");
    process.exit(0);

  })();

else {
  if (enableSend)
    (async () => {
      const { start, processing, close } = sender(options)
      await start()
      await awaitSleep(sleepBeforeExit)
      await processing()
      await close()
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
