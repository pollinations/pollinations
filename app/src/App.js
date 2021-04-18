import React, { useEffect, useMemo, useState } from 'react';
import openStomp from './network/stompClient';
import { Button,  TextField , Fab, Card, CardMedia, Container, CardContent,Typography, IconButton, CardHeader, Avatar, CardActions, Box, Paper, Divider,CardActionArea} from "@material-ui/core"
import {PlayArrow, Stop, MoreVer, Favorite, Share} from '@material-ui/icons';

function App() {
    const [latestConsole, setLatestConsole] = useState({headers: {text:"Connecting..."}, body:"Loading..."});
    const [latestMedia, setLatestMedia] = useState({headers:{type:"image/jpeg"}});
    const [isRunning, setRunning] = useState(false);
    const [text, setText] = useState("Petite and futuristic")
    // console.log("latest",latestConsole);
    useMemo(() => {
      openStomp(setLatestConsole, setLatestMedia)
    },[]);
    useEffect(() => setText(latestConsole.headers.text),[latestConsole.headers.text])
    
    const colabURL = "https://colab.research.google.com/github/voodoohop/colabasaservice/blob/master/colabs/deep-daze.ipynb";
    return (
      <Container maxWidth="sm">

        <Card variant="outlined">
        <CardActionArea>
        <CardHeader 
        action={
          <Box marginTop="25px" marginRight="0px" paddingRight="0px" marginBottom="0px" paddingBottom="0px">
          <TextField 
            style={{align:"center"}} 
            label="Prompt"  
            multiline  
            value={text} 
            disabled={isRunning}
            onChange={({target}) => setText(target.value)} /> 
          <IconButton onClick={() => setRunning(value => !value)}>{isRunning ? <Stop />:<PlayArrow />}</IconButton>
          </Box>
        }
        title="Text to Image "
        subheader="(CLIP+SIREN)"
      /> 
      

        <CardMedia
          component={latestMedia.headers.type.startsWith("image") ? "img":"video"}
          src={latestMedia.body}
          title={text}
          style={{minHeight:"500px"}}
        />

        <CardContent>
        <Typography variant="body2" color="textPrimary" component="p" style={{fontWeight:"bold"}}>
          {latestConsole.body.replace(/\].*/g,"")}
        </Typography>
        </CardContent>
        </CardActionArea>
        <CardActions>
        
        
        <IconButton aria-label="add to favorites">
          <Favorite />
        </IconButton>
        <IconButton aria-label="share">
          <Share />
        </IconButton>
        </CardActions>
        </Card>
        </Container>
    );
}

export default App;
