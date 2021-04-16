import React, { useMemo, useState } from 'react';
import openStomp from './network/stompClient';



function App() {
  const [latestConsole, setLatestConsole] = useState("");
  const [latestMedia, setLatestMedia] = useState([]);

  useMemo(() => {
    openStomp(setLatestConsole, setLatestMedia)
  },[]);
    return (
      <div>
        <h1>{latestConsole}</h1>
        <img src={latestMedia} />
      </div>
    );
}

export default App;
