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
        <img style={{width:"100%",height:"auto"}} src={latestMedia} />
      </div>
    );
}

export default App;
