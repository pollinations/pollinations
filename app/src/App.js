import React, { useEffect, useMemo, useState } from 'react';
import openStomp from './network/stompClient';
import { Button,  TextField , Fab} from "@material-ui/core"
import {PlayArrow, Stop} from '@material-ui/icons';

function App() {
    const [latestConsole, setLatestConsole] = useState({headers:{}});
    const [latestMedia, setLatestMedia] = useState({headers:{type:"image/jpeg"}});
    const [isRunning, setRunning] = useState(false);
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
        <h1>Text to Image (CLIP+SIREN)</h1>
        <form>
        <TextField style={{align:"center"}} id="standard-basic" label="Prompt" variant="filled"  multiline  value={text} disabled={isRunning}/>
        <Fab onClick={() => setRunning(value => !value)}>{isRunning ? <Stop />:<PlayArrow />}</Fab>
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
