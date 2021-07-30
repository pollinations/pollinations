#!/usr/bin/env node
import PQueue from "p-queue";
import Debug from "debug";
import awaitSleep from "await-sleep";

import process from "process";
import Readline from 'readline';

import options from "./options.js";
import { sender } from './ipfs/sender.js';
import { receive } from "./ipfs/receiver.js";


export const debug = Debug("ipfsWatch")

const readline = Readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

debug("CLI options", options);



export const rootPath = options.path;

const enableSend = !options.receive;
const enableReceive = !options.send;


const executeCommand = options.execute;


if (executeCommand) 
  (async () => {
    const receivedCID = await receive({...options, once: true});
    debug("received IPFS content", receivedCID);
    sender({...options, once: false });
    debug("executing command", executeCommand);
    await exec(executeCommand);
    debug("done executing", executeCommand,". Waiting...");
    await awaitSleep(500);
    process.exit(0);
  })();

else {
  if (enableSend)
    (async () => {
      await sender(options);
      await awaitSleep(1000);
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
