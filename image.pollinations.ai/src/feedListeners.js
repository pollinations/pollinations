import { parse } from 'url';
import debug from 'debug';

const logFeed = debug('pollinations:feed');

let feedListeners = [];
let lastStates = [];

// create a server sent event stream
export const registerFeedListener = async (req, res) => {
  // Parse the URL to extract query parameters
  const { query } = parse(req.url, true);

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // add listener to feedListeners
  feedListeners = [...feedListeners, { res, nsfw: query.nsfw === 'true' }];

  // remove listener when connection closes
  req.on('close', () => {
    // remove listener from feedListeners
    feedListeners = feedListeners.filter(listener => listener.res !== res);
  });

  const pastResults = parseInt(query.past_results) || 20;
  const statesToSend = lastStates.slice(-pastResults);

  for (const lastState of statesToSend) {
    await sendToListener(res, lastState, query.nsfw === 'true');
  }
};

export const sendToFeedListeners = (data, options = {}) => {
  if (options.saveAsLastState) {
    lastStates.push(data);
  }
  feedListeners.forEach(listener => sendToListener(listener.res, data, listener.nsfw));
};

function sendToListener(listener, data, nsfw) {
  if (!nsfw && (data?.private || data?.nsfw || data?.isChild || data?.isMature || data?.maturity?.nsfw || data?.maturity?.isChild || data?.maturity?.isMature)) return;
  logFeed("data", data);
  return listener.write(`data: ${JSON.stringify(data)}\n\n`);
}
