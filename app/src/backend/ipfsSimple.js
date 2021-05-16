


import { asyncTap, tap } from "iter-tools";
import {client, ipfsGlobSource} from "../network/ipfsConnector.js";

async function run() {
    const file = await client.add(asyncTap(({path}) => console.log("tap",path),ipfsGlobSource('/Users/thomash/ipfs', { recursive: true })))
    console.log(file)
};

run();
