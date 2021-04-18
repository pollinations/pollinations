import React, { useMemo, useState } from 'react';
import openStomp from './network/stompClient';



function App() {
  const [latestConsole, setLatestConsole] = useState("");
  const [latestMedia, setLatestMedia] = useState([]);

  useMemo(() => {
    openStomp(setLatestConsole, setLatestMedia)
  },[]);
    const colabURL = "https://colab.research.google.com/github/voodoohop/colabasaservice/blob/master/colabs/deep-daze.ipynb";
    return (
      <div>
        <h1>{latestConsole}</h1>
        <img style={{width:"100%","maxWidth":"768px", height:"auto"}} src={latestMedia} />
        <iframe src={colabURL}></iframe>
     </div>
    );
}

export default App;
