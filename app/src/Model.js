import React, { useEffect, useMemo, useState } from "react";
import colabLogoImage from "./help/colab_icon.png";
import {Field , Fab, Card, CardMedia, Container, CardContent,Typography, IconButton, CardHeader, Avatar, CardActions, Box, Paper, Divider,CardActionArea} from "@material-ui/core"
import {PlayArrow, Stop, MoreVer, Favorite, Share} from '@material-ui/icons';
import Markdown from 'markdown-to-jsx';
import Form from "@rjsf/material-ui";
import {useHash} from 'react-use';
import ReactJson from 'react-json-view'


import useColab from "./network/ipfsClient"
import {displayContentID, noop} from "./network/utils";
import NodeStatus from "./network/NodeStatus";

import Debug from "debug";
const debug = Debug("Model");


const fillForm = (form, input) => 
  input ? {
    properties: Object.fromEntries(Object.entries(form.properties).map(
      ([formKey, prop]) => [formKey, formKey in input ? {...prop, "default": input[formKey]} : prop]
    )) 
  } 
  : 
  form;


export default React.memo(function Model({notebook}) {
  debug("notebook",notebook)
  const {description,form} = notebook;

  const {state, dispatch: dispatchState } = useColab(); // {state:{ipfs:{},contentID: null, nodeID:null}, dispatch: noop}
  
  const { ipfs } = state;

  const filledForm =  fillForm(form, ipfs.input);

  const colabURL = "https://colab.research.google.com/github/voodoohop/colabasaservice/blob/master/colabs/deep-daze.ipynb";

  useEffect(() => {
    debug("First model render. We have a problem if you see this twice.")
  },[]);
  const dispatchForm = async ({ formData }) => {
    dispatchState({...state, inputs: formData});
  }

  return <Card variant="outlined">
  
            <CardContent>
          <Markdown>{description}</Markdown>
          <a href={colabURL} target="_blank"><img src={colabLogoImage} width="70" height="auto" /> </a>
          <NodeStatus {...state} />
        </CardContent> 
        <CardContent>
          <ReactJson src={state.ipfs} name={displayContentID(state.contentID)} enableClipboard={false} displayDataTypes={false} displayObjectSize={false} />
          <Form schema={filledForm} onSubmit={dispatchForm}/>
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
  