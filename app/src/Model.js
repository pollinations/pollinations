import React, { useEffect, useMemo, useState } from "react";
import colabLogoImage from "./help/colab_icon.png";
import {Field , Fab, Card, CardMedia, Container, CardContent,Typography, IconButton, CardHeader, Avatar, CardActions, Box, Paper, Divider,CardActionArea, GridList, GridListTile} from "@material-ui/core"
import {PlayArrow, Stop, MoreVer, Favorite, Share} from '@material-ui/icons';
import Markdown from 'markdown-to-jsx';
import Form from "@rjsf/material-ui";
import {useHash} from 'react-use';
import ReactJson from 'react-json-view'
import {any, identity, last} from 'ramda';

import useColab from "./network/useColab"
import {displayContentID, noop} from "./network/utils";
import NodeStatus from "./network/NodeStatus";
import {parse} from "json5";
import Debug from "debug";
const debug = Debug("Model");

const getType = help => help.includes("@param") ? parse(help.replace("@param","")).type: "string";

const fillForm = ({"parameters.json": parameters, input, ...rest}) => {
  debug("parameers", parameters, "input", input);
  if (!parameters)
    return null;
  const properties = Object.fromEntries(
    Object.values(parameters)
      .map(({name, default: defaultVal, help}) => 
        [ name,
          {
          title: name,
          "default": parse(defaultVal),
          description: help,
          type: getType(help)
        }])
  );
  
  const form = {properties,name:"Form"};
        debug("prefilledForm", form);

  return input ? {
    properties: Object.fromEntries(Object.entries(form.properties).map(
      ([formKey, prop]) => [formKey, formKey in input ? {...prop, "default": input[formKey]} : prop]
    )) 
  } 
  : 
  form;
};

export default React.memo(function Model({notebook}) {
  debug("notebook",notebook)
  const {description} = notebook;
  const {state, dispatch: dispatchState } = useColab(); // {state:{ipfs:{},contentID: null, nodeID:null}, dispatch: noop}
  
  const { ipfs, nodeID } = state;

  const filledForm =  fillForm(ipfs);

  const colabURL = "https://colab.research.google.com/github/voodoohop/pollinations/blob/master/colabs/pollinator.ipynb";

  const extensions = [".jpg",".png",".mp4"];
  
  const filterByExtensions = filename => any(identity, extensions.map(ext => filename.endsWith(ext)));

  const imageFilenames = ipfs.output ? Object.keys(ipfs.output)
                      .filter(filterByExtensions) : [];

  const images = imageFilenames.map(filename => [filename, ipfs.output[filename]]);
  debug("images", images)
  useEffect(() => {
    debug("First model render. We have a problem if you see this twice.")
  },[]);
  const dispatchForm = async ({ formData }) => {
    dispatchState({...state, inputs: formData});
  }

  return <Card variant="outlined">
            {/* <Markdown>{description}</Markdown> */}
        {
        !nodeID ? <CardContent>
          <a href={colabURL} target="_blank"><img src={colabLogoImage} width="70" height="auto" /> </a>
        </CardContent> : null
        }
        { filledForm ? 
        <CardContent>
          <Form schema={filledForm} onSubmit={dispatchForm}/>
        </CardContent> : null
        }
              {/* <CardMedia component={latestMedia.headers.type.startsWith("image") ? "img" : "video"} src={latestMedia.body} title={text} style={{
        minHeight: "500px"
      }} controls /> */}
      <CardContent>
                <Typography variant="body2" color="textPrimary" component="pre" style={{
            fontWeight: "bold"
          }}>
            { 
            ipfs.output && ipfs.output.log ? ipfs.output.log.replace(/\].*/g, ""):"Loading..."
            } 
          </Typography>
          {
            images.length > 0 ? <center><img src={last(images)[1]} /></center> : null
          }
<GridList cellHeight={160} cols={4}>
  {images.slice().reverse().map(([filename, url]) => (
    <GridListTile key={filename} cols={1}>
      <img src={url} alt={filename} />
    </GridListTile>
  ))}
</GridList>
</CardContent> 
        <CardContent>
          <NodeStatus {...state} />
          <ReactJson src={state.ipfs} name={displayContentID(state.contentID)} enableClipboard={false} displayDataTypes={false} displayObjectSize={false} collapsed={true} />

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
  