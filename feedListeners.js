let feedListeners = [];
let lastState = null;
// create a server sent event stream
export const registerFeedListener = (req, res) => {
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

  if (lastState) {
   sendToListener(res, lastState);
    // sendToListener(res, lastState);
  }
  
};

export const sendToFeedListeners = (data, options={}) => {
  if (options.saveAsLastState)
    lastState = data;
  feedListeners.forEach(listener => sendToListener(listener, data));
};

function sendToListener(listener, data) {
  return listener.write(`data: ${JSON.stringify(data)}\n\n`);
}

