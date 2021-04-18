import React, { useEffect, useMemo, useState } from 'react';
import openStomp from './network/stompClient';
import { TextField } from "@material-ui/core"


function App() {
    const [latestConsole, setLatestConsole] = useState({headers:{}});
    const [latestMedia, setLatestMedia] = useState({headers:{type:"image/jpeg"}});
    const [text, setText] = useState("Petite and futuristic")
    // console.log("latest",latestConsole);
    useMemo(() => {
      openStomp(setLatestConsole, setLatestMedia)
    },[]);
    useEffect(() => setText(latestConsole.headers.text),[latestConsole])
    
    const colabURL = "https://colab.research.google.com/github/voodoohop/colabasaservice/blob/master/colabs/deep-daze.ipynb";
    return (
      <div style={{margin:"auto", maxWidth:"800px"}}>
      <center>
        <form>
        <TextField style={{align:"center"}} id="standard-basic" label="Prompt" variant="filled"  multiline fullWidth value={text} onChange={({value}) => setText(value)}/>
        </form>
        <br />
        { latestMedia.headers.type.startsWith("image") ?
          <img style={{width:"80%", height:"auto", maxHeight:"500px", maxWidth:"500px"}} src={latestMedia.body} />
          : <video style={{width:"80%", height:"auto", maxHeight:"500px", maxWidth:"500px"}} src={latestMedia.body} autoPlay loop />
        } 
        <h3>{latestConsole.body}</h3>

     </center>
     </div>
    );
}

export default App;
