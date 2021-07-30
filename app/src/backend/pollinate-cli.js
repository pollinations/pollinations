#!/usr/bin/env node
import PQueue from "p-queue";
import Debug from "debug";
import awaitSleep from "await-sleep";

import process from "process";
import Readline from 'readline';

import options from "./options.js";
import { sender } from './ipfs/sender.js';
import { receive } from "./ipfs/receiver.js";
import { exec } from "child_process";

export const debug = Debug("pollinate")

const readline = Readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

debug("CLI options", options);



export const rootPath = options.path;

const enableSend = !options.receive;
const enableReceive = !options.send;


const executeCommand = options.execute;
const sleepBeforeExit = options.debounce * 2;

const execute = async command => 
  new Promise((resolve,reject) => {
    debug("Executing command", command);
    const childProc = exec(command, err => {
      if (err) 
        reject(err);
      else 
        resolve();
    });
    childProc.stdout.pipe(process.stdout);
    childProc.stderr.pipe(process.stderr);
  });


if (executeCommand) 
  (async () => {
    
    const receivedCID = await receive({...options, once: true});
    debug("received IPFS content", receivedCID);
    
    const {start, processing} = sender({...options, once: false });
    
    start();
    
    await execute(executeCommand);
    debug("done executing", executeCommand,". Waiting...");

    await awaitSleep(sleepBeforeExit);
    debug("awaiting termination of state sync");
    await processing(); 
    
    debug("state sync done. exiting");
    process.exit(0);
  })();

else {
  if (enableSend)
    (async () => {
      const { start, processing } = await sender(options);
      await start();
      await awaitSleep(sleepBeforeExit);
      await processing();
      process.exit(0);
    })();


  if (enableReceive) {
    (async () => {
      await receive(options);
      process.exit(0);
    })();
  }
}



// ipfsClient.pubsub.subscribe(nodeID, async ({ data }) => {
//   const newContentID = new TextDecoder().decode(data);
//   debug("content ID from colab", newContentID);
//   onContentID(newContentID);
// });


// setInterval(() => null,5000)
