import { AbortController } from 'native-abort-controller';

import awaitSleep from 'await-sleep';
import Debug from 'debug';
import { getClient } from './ipfsConnector';
import { Channel } from 'queueable';

const debug = Debug('ipfs:pubsub');


// frequency at which to send heartbeats vis pubsub
const HEARTBEAT_FREQUENCY = 15;


// create a publisher that sends periodic heartbeats as well as contentid updates
export function publisher(nodeID, suffix = "/output") {

    debug("Creating publisher for", nodeID, suffix);

    const _publish = async cid => {
        const client = await getClient();
        await publish(client, nodeID, cid, suffix, nodeID);
    };

    const handle = setInterval(async () => {
        const client = await getClient();
        publishHeartbeat(client, suffix, nodeID);
    }, HEARTBEAT_FREQUENCY * 1000);

    const close = () => {
        clearInterval(handle);
    };

    return { 
        publish:_publish, 
        close 
    };
}

async function publishHeartbeat(client, suffix, nodeID) {

    if (nodeID === "ipns") 
        return;
    
    debug("publishing heartbeat to", nodeID, suffix);

    await client.pubsub.publish(nodeID + suffix, "HEARTBEAT");
}

async function publish(client, nodeID, rootCID, suffix = "/output") {

    debug("publish pubsub", nodeID+suffix, rootCID);

    if (nodeID === "ipns")
        await experimentalIPNSPublish(client, rootCID);
    else
        await client.pubsub.publish(nodeID + suffix, rootCID)
}


let abortPublish = null;

async function experimentalIPNSPublish(client, rootCID) {
    debug("publishing to ipns...", rootCID);
    if (abortPublish)
        abortPublish.abort();
    abortPublish = new AbortController();
    await client.name.publish(rootCID, { signal: abortPublish.signal, allowOffline: false })
        .then(() => {
            debug("published...", rootCID);
            abortPublish = null;
        })
        .catch(e => {
            debug("exception on publish.", e);
        });
}

// Generate an async iterable by subscribing to CIDs from a specific node id and suffix
export function subscribeGenerator(nodeID, suffix = "/input") {

    const channel = new Channel();
   
    debug("Subscribing to pubsub events from", nodeID, suffix);

    const unsubscribe = subscribeCID(nodeID,suffix,
        cid => channel.push(cid)
    );
    return [channel, unsubscribe];
}


// Subscribe to a content ids from a nodeID and suffix. Callback is called with the content ids
// Also receives and logs heartbeats received from the publisher
export function subscribeCID(nodeID, suffix = "", callback) {
    let lastHeartbeatTime = new Date().getTime();

    return subscribeCallback(nodeID+suffix, message => {
        if (message === "HEARTBEAT") {
            const time = new Date().getTime();
            debug("Heartbeat from pubsub. Time since last:", (time - lastHeartbeatTime) / 1000);
            lastHeartbeatTime = time;
        } else {
            callback(message);
        }
    });
};

// Subscribe to an ipfs topic with some rather ugly code to handle errors that probably don't even occur
function subscribeCallback(topic, callback) {
    const abort = new AbortController();
    (async () => {
        const onError = async (...errorArgs) => {
            debug("onError", ...errorArgs, "aborting");
            abort.abort();
            await awaitSleep(300);
            debug("resubscribing")
            await doSub();
        };

        const handler = ({ data }) => {
            const message = new TextDecoder().decode(data)
            callback(message);
        }

        const doSub = async () => {
            const client = await getClient();
            try {
                abort.abort();
                debug("Executing subscribe", topic);
                await client.pubsub.subscribe(topic, (...args) => handler(...args), { onError, signal: abort.signal, timeout: "1h" });
            } catch (e) {
                debug("subscribe error", e, e.name);
                if (e.name === "DOMException") {
                    debug("subscription was aborted. returning");
                    return;
                }

                if (e.message?.startsWith("Already subscribed"))
                    return;
                await awaitSleep(300);
                await doSub();
            }
        };
        doSub();
    })();

    return () => {
        debug("subscribe abort was called");
        abort.abort();
    };
}


// Skips repeated calls to the same function with the same arguments
const skipRepeatCalls = f => {
    let lastValue = null;
    return (value) => {
        if (lastValue !== value) {
            f(value);
            lastValue = value;
        };  
    }
}