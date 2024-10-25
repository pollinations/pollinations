let feedListeners = [];
let lastStates = [];

// create a server sent event stream
export const registerFeedListener = async (req, res) => {
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
  feedListeners = [...feedListeners, { res, nsfw: req.query.nsfw === 'true' }];

  // remove listener when connection closes
  req.on('close', () => {
    // remove listener from feedListeners
    feedListeners = feedListeners.filter(listener => listener.res !== res);
  });

  for (const lastState of lastStates) {
    await sendToListener(res, lastState, req.query.nsfw === 'true');
  }

};

export const sendToFeedListeners = (data, options = {}) => {
  if (options.saveAsLastState) {
    lastStates.push(data);
    lastStates = lastStates.slice(-20);
  }
  feedListeners.forEach(listener => sendToListener(listener.res, data, listener.nsfw));
};

function sendToListener(listener, data, nsfw) {
  if (!nsfw && data?.nsfw) return;
  console.log("data", data);
  return listener.write(`data: ${JSON.stringify(data)}\n\n`);
}

