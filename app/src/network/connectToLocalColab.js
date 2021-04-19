const b = new BroadcastChannel("colabservice")
b.postMessage("hello from incognito")
b.onmessage = (...args) => console.error(...args)

