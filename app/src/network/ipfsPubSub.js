import awaitSleep from 'await-sleep';
import Debug from 'debug';
import { AbortController } from 'native-abort-controller';
import { Channel } from 'queueable';
import { getClient } from './ipfsConnector';
import { noop, retryException } from './utils';


const debug = Debug('ipfs:pubsub');


// frequency at which to send heartbeats vis pubsub
const HEARTBEAT_FREQUENCY = 12;


// create a publisher that sends periodic heartbeats as well as contentid updates
export function publisher(nodeID, suffix = "/output") {

    debug("Creating publisher for", nodeID, suffix);

    let lastPublishCID = null;

    const _publish = async cid => {
        const client = await getClient()
        await publish(client, nodeID, cid, suffix, nodeID)

        // for some reason publishing twice in a row causes a socket error. sleep just in case
        await awaitSleep(100)
        lastPublishCID = cid;
    };

    // const interval = setInterval(() => {
    //     if (lastPublishCID)
    //         _publish(lastPublishCID);
    // }, 5000);

    const sendHeartbeat = async () => {
        const client = await getClient();
        publishHeartbeat(client, suffix, nodeID);
    };

    const handle = setInterval(sendHeartbeat, HEARTBEAT_FREQUENCY * 1000);

    sendHeartbeat();

    const close = () => {
        debug("Closing publisher", handle);
        clearInterval(handle);
        // clearInterval(interval);
    };

    return {
        publish: _publish,
        close
    };
}

const publishHeartbeat = async (client, suffix, nodeID) => {

    if (nodeID === "ipns")
        return;

    try {
        // debug("publishing heartbeat to", nodeID, suffix);
        await client.pubsub.publish(nodeID + suffix, "HEARTBEAT");
    } catch (e) {
        debug("Exception. Couldn't publish heartbeat. Ignoring...", e.name)
    }
}

async function publish(client, nodeID, rootCID, suffix = "/output") {
    const retryPublish = retryException(client.pubsub.publish)
    debug("publish pubsub", nodeID + suffix, rootCID);

    try {
        if (nodeID === "ipns")
            await experimentalIPNSPublish(client, rootCID);
        else
            await retryPublish(nodeID + suffix, rootCID)
    } catch (e) {
        debug("Exception. Couldn't publish to", nodeID, suffix, "exception:", e.name);
    }
}


let abortPublish = null;

async function experimentalIPNSPublish(client, rootCID) {
    debug("publishing to ipns...", rootCID);
    if (abortPublish)
        abortPublish.abort();
    abortPublish = new AbortController();
    await client.name.publish(rootCID, { signal: abortPublish.signal, allowOffline: true })
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

    const unsubscribe = subscribeCID(nodeID, suffix,
        cid => channel.push(cid)
    );
    return [channel, unsubscribe];
}


// Subscribe to a content ids from a nodeID and suffix. Callback is called with the content ids
// Also receives and logs heartbeats received from the publisher
export function subscribeCID(nodeID, suffix = "", callback, heartbeatDeadCallback = noop) {

    const { gotHeartbeat, closeHeartbeat } = heartbeatChecker(heartbeatDeadCallback);

    let unsubscribe = null
    let aborted = false
    const handleMessage = message => {
        if (message === "HEARTBEAT") {
            gotHeartbeat();
        } else {
            callback(message);
        }
    }

    (async () => {
        while (!aborted) {
            unsubscribe = subscribeCallback(nodeID + suffix, handleMessage)
            // resubscribe every 5 minutes
            await awaitSleep(5*60*1000)
            unsubscribe()
        }
    })()

    return () => {
        debug("Unsubscribing from pubsub events from", nodeID, suffix)
        unsubscribe()
        closeHeartbeat()
        aborted = true
    }
};

// if we don't receive a heartbeat from the publisher in 2 x HEARTBEAT_FREQUENCY seconds, 
// we assume the publisher is dead and call heartbeatDeadCallback
function heartbeatChecker(heartbeatStateCallback) {

    let lastHeartbeat = new Date().getTime();
    let heartbeatTimeout = null;

    function setHeartbeatTimeout() {
        heartbeatTimeout = setTimeout(() => {
            const timeSinceLastHeartbeat = (new Date().getTime() - lastHeartbeat) / 1000;
            debug("Heartbeat timeout. Time since last:", timeSinceLastHeartbeat);
            heartbeatStateCallback({ lastHeartbeat, alive: false });
        }, HEARTBEAT_FREQUENCY * 1.5 * 1000);
        // debug("Set heartbeat timeout. Waiting ", HEARTBEAT_FREQUENCY * 1.5, " seconds until next heartbeat");
    }

    const gotHeartbeat = () => {
        const time = new Date().getTime();
        debug("Heartbeat from pubsub. Time since last:", (time - lastHeartbeat) / 1000);
        lastHeartbeat = time;
        if (heartbeatTimeout)
            clearTimeout(heartbeatTimeout);
        heartbeatStateCallback({ alive: true });
        setHeartbeatTimeout();
    };

    const closeHeartbeat = () => {
        if (heartbeatTimeout)
            clearTimeout(heartbeatTimeout);
    };

    setHeartbeatTimeout();

    return { gotHeartbeat, closeHeartbeat }


}


// Subscribe to an ipfs topic with some rather ugly code to handle errors that probably don't even occur
function subscribeCallback(topic, callback) {
    let abort = new AbortController();

    (async () => {
        const onError = async (...errorArgs) => {
            debug("onError", ...errorArgs, "aborting")

            if (abort.signal.aborted)
                return;

            abort.abort()
            await awaitSleep(300)
            debug("resubscribing")
            await doSub();
        };

        const handler = ({ data }) => {

            if (abort.signal.aborted) {
                console.error("Subscription to", topic, "was aborted. Shouldn't receive any more messages.");
            } else {
                const message = new TextDecoder().decode(data)
                callback(message);
            }
        }

        const doSub = async () => {
            const client = await getClient()
            try {
                abort.abort();
                abort = new AbortController()
                debug("Executing subscribe", topic);
                await client.pubsub.subscribe(topic, (...args) => handler(...args), { onError, signal: abort.signal, timeout: "4h" });
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