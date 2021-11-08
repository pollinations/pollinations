#!/usr/bin/env node
import PQueue from "p-queue";
import Debug from "debug";
import awaitSleep from "await-sleep";

import process from "process";
import Readline from 'readline';

import options from "./options.js";
import { sender } from './ipfs/sender.js';
import { receive } from "./ipfs/receiver.js";
import { spawn } from "child_process";
import { createWriteStream, mkdirSync } from "fs";
import { rmdir,mkdir } from "fs/promises";
import { dirname } from "path";

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
const sleepBeforeExit = options.debounce * 2+2000;

const execute = async (command, logfile=null) => 
  new Promise((resolve,reject) => {
    debug("Executing command", command);
    const childProc = spawn(command);
    childProc.on("error", err => {
      if (err) 
        reject(err);
      else 
        resolve();
    });
    childProc.on("close", resolve);
    childProc.stdout.pipe(process.stderr);
    childProc.stderr.pipe(process.stderr);
    if (logfile) {
      debug("creating a write stream to ", logfile);
      const logfileDir = dirname(logfile);
      // create logfile directory if it doesn't exist
      mkdirSync(logfileDir, { recursive: true });
      const logout = createWriteStream(logfile, { flags: "a" });
      childProc.stdout.pipe(logout);
      childProc.stderr.pipe(logout);
    }
  });


if (executeCommand) 
  (async () => {
 
    while (true) {
      const {start: startSending, processing, close} = await sender({...options, once: false });

      debug("removing ipfs data");
      await rmdir(rootPath, {recursive: true});
      await mkdir(rootPath);
      debug("receiving");
      await receive({...options, once: true, path: options.path+"/input"});

      startSending();
      // debug("sleeping 5s")
      // await awaitSleep(5000);

      debug("executing");
      const executePromise = execute(executeCommand, options.logout);
      const receivePromise = receive({...options, once: true, path: options.path+"/input"})
      await Promise.any([executePromise, receivePromise]);
      debug("done executing", executeCommand,". Waiting...");
      await close();
    
      // This waiting logic is quite hacky. Should improve it.
      await awaitSleep(sleepBeforeExit);
      debug("awaiting termination of state sync");
      await processing();
    }

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
      const { start, processing, close } = await sender(options);
      await start();
      await awaitSleep(sleepBeforeExit);
      await processing();
      await close();
      process.exit(0);
    })();


  if (enableReceive) {
    (async () => {
      await receive(options);
      process.exit(0);
    })();
  }
}
