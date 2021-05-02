import React, { useEffect, useMemo, useState } from "react";
import colabLogoImage from "./help/colab_icon.png";
import {TextField , Fab, Card, CardMedia, Container, CardContent,Typography, IconButton, CardHeader, Avatar, CardActions, Box, Paper, Divider,CardActionArea} from "@material-ui/core"
import {PlayArrow, Stop, MoreVer, Favorite, Share} from '@material-ui/icons';
import Markdown from 'markdown-to-jsx';
import Form from "@rjsf/material-ui";
import each from "async-each";


import useColab, {displayContentID} from "./network/ipfsClient"
export default React.memo(function Model({notebook}) {
    console.log("notebook",notebook)
    const {description,form} = notebook;

    const {nodeID, contentID, add:dispatchColab, publish: publishColab} = useColab();

   
    const [latestConsole, setLatestConsole] = useState({headers: {text:""}, body:"Loading..."});

    const [latestMedia, setLatestMedia] = useState({headers:{type:"image/jpeg"}});

    const [text, setText] = useState("")
    // console.log("latest",latestConsole);


    useEffect(() => setText(latestConsole.headers.text),[latestConsole.headers.text])

    const colabURL = "https://colab.research.google.com/github/voodoohop/colabasaservice/blob/master/colabs/deep-daze.ipynb";
 
    const dispatchForm = async ({formData}) => {
      for (const keyVal of Object.entries(formData)) {
        await dispatchColab(...keyVal);
      }
      await publishColab();
    }
  return <Card variant="outlined">
   
            <CardContent>
          <Markdown>{description}</Markdown>
          <a href={colabURL} target="_blank"><img src={colabLogoImage} width="70" height="auto" /> </a>
          <br/>
          NodeID: <b>{nodeID ? displayContentID(nodeID)  : "Not connected..."}</b>
         <br />
          ContentID: <b>{contentID ? displayContentID(contentID) : "Not connected..."}</b>
        </CardContent> 
        <CardContent>
          <Form schema={form} onSubmit={dispatchForm}/>
        </CardContent>      
        {/* <CardMedia component={latestMedia.headers.type.startsWith("image") ? "img" : "video"} src={latestMedia.body} title={text} style={{
        minHeight: "500px"
      }} controls /> */}

        <CardContent>
          <Typography variant="body2" color="textPrimary" style={{
            fontWeight: "bold"
          }}>
            { 
            //latestConsole.body.replace(/\].*/g, "")
            } 
          </Typography>
        </CardContent>

 
        <CardActions>
        
        
        <IconButton aria-label="add to favorites">
          <Favorite />
        </IconButton>
        <IconButton aria-label="share">
          <Share />
        </IconButton>
        </CardActions>
        </Card>;
});
  