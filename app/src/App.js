import React, { useMemo, useState } from 'react';
import openStomp from './network/stompClient';



function App() {
  const [latestMessage, setLatestMessage] = useState("");
  useMemo(() => {
    openStomp(setLatestMessage)
  },[]);
    return (
      <h1>{JSON.stringify(latestMessage)}</h1>
    );
}

export default App;
