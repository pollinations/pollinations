const b = new BroadcastChannel("colabconnection")
b.onmessage = (...args) => console.warn("FROM COLAB",...args)

