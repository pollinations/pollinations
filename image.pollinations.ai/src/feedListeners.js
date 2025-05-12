import { parse } from 'url';
import debug from 'debug';
import { isMature } from './utils/mature.js';
import 'dotenv/config';

const logFeed = debug('pollinations:feed');
const logAuth = debug('pollinations:auth');

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

  // Check if the password query parameter matches the FEED_PASSWORD
  const isAuthenticated = query.password === process.env.FEED_PASSWORD;

  if (isAuthenticated) {
    logAuth('Authenticated feed access granted');
  }

  // add listener to feedListeners with authentication status
  feedListeners = [...feedListeners, { res, isAuthenticated }];

  // remove listener when connection closes
  req.on('close', () => {
    // remove listener from feedListeners
    feedListeners = feedListeners.filter(listener => listener.res !== res);
  });

  const pastResults = parseInt(query.past_results) || 20;
  const statesToSend = lastStates.slice(-pastResults);

  for (const lastState of statesToSend) {
    await sendToListener(res, lastState, isAuthenticated);
  }
};

export const sendToFeedListeners = (data, options = {}) => {
  // Check if prompt contains mature content and flag it
  if (data?.prompt && !data?.isMature) {
    data.isMature = isMature(data.prompt);
  }

  if (options.saveAsLastState) {
    lastStates.push(data);
  }
  feedListeners.forEach(listener => sendToListener(listener.res, data, listener.isAuthenticated));
};

function sendToListener(listener, data, isAuthenticated = false) {
  // If authenticated with the correct password, send all data without filtering
  if (!isAuthenticated) {
    // Filter out mature content for non-authenticated users
    if (
      data?.private ||
      data?.nsfw ||
      data?.isChild ||
      data?.isMature ||
      data?.maturity?.nsfw ||
      data?.maturity?.isChild ||
      data?.maturity?.isMature ||
      (data?.prompt && isMature(data?.prompt))
    ) return;
  }

  logFeed("data", isAuthenticated ? "[authenticated]" : "", data);
  return listener.write(`data: ${JSON.stringify(data)}\n\n`);
}
