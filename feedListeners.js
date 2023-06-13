let feedListeners = [];
let lastStates = [];
// create a server sent event stream
export const registerFeedListener = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // add listener to feedListeners
  feedListeners = [...feedListeners, res];

  // remove listener when connection closes
  req.on('close', () => {
    // remove listener from feedListeners
    feedListeners = feedListeners.filter(listener => listener !== res);
  });

  for (const lastState of lastStates) {
    await sendToListener(res, lastState);
  }
  
};

export const sendToFeedListeners = (data, options={}) => {
  if (options.saveAsLastState) {
    lastStates.push(data);
    lastStates = lastStates.slice(-20);
  }
  feedListeners.forEach(listener => sendToListener(listener, data));
};

function sendToListener(listener, data) {
  return listener.write(`data: ${JSON.stringify(data)}\n\n`);
}

